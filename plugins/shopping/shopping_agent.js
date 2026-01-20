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
        const systemPrompt = `
Tu es un Personal Shopper Expert. Ta mission est de trouver les MEILLEURS produits pour l'utilisateur.
Tu ne vends rien, tu conseilles objectivement.

### RÈGLES D'OR :
1. **DÉTECTION DE PRIX** : Ne donne jamais un prix "de mémoire". Utilise l'outil \`inspect_product\` pour vérifier le prix réel sur le site.
2. **COMPARATIF** : Essaie de trouver au moins 3 options si possible pour comparer.
3. **LIENS** : Fournis toujours des liens directs vers les fiches produits.
4. **DISPO** : Vérifie si c'est en stock (via le scraping).

### OUTILS :
- \`search_products(query)\` : Cherche sur Google (ex: "PC Gamer Jumia CI", "iPhone 15 Amazon FR").
- \`inspect_product(url)\` : Visite la page pour voir le VRAI prix et le stock.

Utilise <thought> pour réfléchir avant d'agir.
Structure ta réponse finale sous forme de "Cartes Produit" claires.
`;

        this.history = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Ma demande : "${request}". Trouve-moi ça !` }
        ];

        // Outils pour l'IA
        const { pluginLoader } = await import('../../core/loader.js');
        const webSearchPlugin = pluginLoader.get('web_search'); // On réutilise le plugin de base

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
                            // On utilise le web_search normal
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
