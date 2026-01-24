import { container } from '../../core/container.js';
import { scraper } from './scraper.js';

/**
 * ShoppingAgent
 * Agent spécialisé pour le shopping comparatif.
 */
export class ShoppingAgent {
    constructor(userId, chatId) {
        this.userId = userId;
        this.chatId = chatId;
        this.maxIterations = 10; // Moins profond que deep research, on veut du résultat rapide
        this.providerRouter = container.get('providerRouter');
        this.transport = container.get('transport');
        this.history = [];
    }

    async start(request) {
        console.log(`[ShoppingAgent] 🛍️ Démarrage pour: "${request}"`);

        // SYSTEM PROMPT SPÉCIALISÉ COMMERCE
        const systemPrompt = `<role>
You are an Expert Personal Shopper Assistant.
Your mission: find the BEST products for the user through objective, data-driven comparison.
You sell nothing, you advise objectively based on real data.
</role>

<context>
This is a shopping assistance session where accuracy and value matter.
Users trust your recommendations to make informed purchasing decisions.
</context>

<golden_rules>
1. PRICE VERIFICATION: Always use \`inspect_product\` tool to verify real prices from websites. Never quote prices from memory.
2. COMPARISON: Find at least 3 options when possible for fair comparison.
3. DIRECT LINKS: Always provide direct links to product pages.
4. STOCK STATUS: Check availability through scraping when possible.
</golden_rules>

<available_tools>
- \`search_products(query)\`: Search on Google (e.g., "PC Gamer Jumia CI", "iPhone 15 Amazon FR")
- \`inspect_product(url)\`: Visit product page to extract REAL price and stock status
</available_tools>

<thinking_process>
Use <thought> tags before each action to plan your strategy.
</thinking_process>

<output_format>
Structure your final response as clear "Product Cards":
- Product Name
- Price (verified)
- Link
- Stock status
- Why it's recommended (key features)

Use Markdown formatting for readability.
</output_format>
`;

        this.history = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Ma demande : "${request}". Trouve-moi ça !` }
        ];

        // Outils pour l'IA
        const { pluginLoader } = await import('../loader.js');
        const webSearchPlugin = pluginLoader.get('duckduck_search'); // On réutilise le plugin de base

        const tools = [
            {
                type: 'function',
                function: {
                    name: 'search_products',
                    description: 'Recherche des produits sur le web.',
                    parameters: {
                        type: 'object',
                        properties: { query: { type: 'string' } },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'inspect_product',
                    description: 'Visite une URL produit pour extraire le prix, le titre et le stock.',
                    parameters: {
                        type: 'object',
                        properties: { url: { type: 'string' } },
                        required: ['url']
                    }
                }
            }
        ];

        let iterations = 0;
        let finalResponse = null;

        while (!finalResponse && iterations < this.maxIterations) {
            iterations++;

            // Notification intermédiaire
            if (iterations % 2 === 0) await this.transport.sendText(this.chatId, `🛍️ Je compare les offres... (Étape ${iterations})`);

            try {
                const response = await this.providerRouter.chat(this.history, {
                    family: 'openai', // OpenAI ou Kimi sont bons pour ça
                    tools: tools,
                    temperature: 0.5 // Un peu de créativité pour l'argumentaire
                });

                this.history.push({
                    role: 'assistant',
                    content: response.content || null,
                    tool_calls: response.toolCalls
                });

                if (response.toolCalls && response.toolCalls.length > 0) {
                    for (const toolCall of response.toolCalls) {
                        const args = JSON.parse(toolCall.function.arguments);

                        if (toolCall.function.name === 'search_products') {
                            console.log(`[Shopping] 🔍 Recherche: ${args.query}`);
                            // On utilise le duckduck_search normal
                            const res = await webSearchPlugin.execute(args, { transport: this.transport, chatId: this.chatId });
                            this.history.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'search_products',
                                content: typeof res.message === 'string' ? res.message : JSON.stringify(res)
                            });
                        }

                        else if (toolCall.function.name === 'inspect_product') {
                            console.log(`[Shopping] 🕵️ Inspecte: ${args.url}`);
                            const res = await scraper.scrapeProductPage(args.url);
                            this.history.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'inspect_product',
                                content: JSON.stringify(res)
                            });
                        }
                    }
                } else {
                    // Fin de la boucle
                    finalResponse = response.content;
                }

            } catch (err) {
                console.error('[ShoppingAgent] Loop Error:', err);
                break;
            }
        }

        return finalResponse || "Désolé, je n'ai pas pu finaliser ma sélection shopping.";
    }
}
