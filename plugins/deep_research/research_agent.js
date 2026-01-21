import { container } from '../../core/container.js';

/**
 * DeepResearchAgent
 * Un agent autonome spécialisé dans la recherche approfondie itérative.
 * Inspiré par la méthodologie "Kimi Deep Search".
 */
export class DeepResearchAgent {
    constructor(userId, chatId) {
        this.userId = userId;
        this.chatId = chatId;
        this.maxIterations = 15; // Profondeur max
        this.providerRouter = container.get('providerRouter');
        this.transport = container.get('transport');

        // Historique de recherche dédié (isolé du chat principal)
        this.history = [];
    }

    /**
     * Lance une session de recherche approfondie
     * @param {string} query - La requête initiale de l'utilisateur
     */
    async start(query) {
        console.log(`[DeepResearch] 🚀 Démarrage session pour: "${query}"`);

        // 1. Initialiser le System Prompt spécialisé
        const systemPrompt = `<role>
You are "Kimi Deep Search", an elite investigative research agent.
Your goal: produce a detailed report (equivalent to 8-15 pages) on the requested subject, based ONLY on verified facts.
</role>

<context>
This is a deep research session where thoroughness beats speed.
Users expect comprehensive, multi-sourced, factual reports with proper citations.
</context>

<critical_rules>
1. SYSTEMATIC VERIFICATION: Always verify information through searches. Use your search tool for every claim.
2. ITERATIVE METHOD: Think → Search → Read → Think → Search → Repeat
3. CROSS-REFERENCING: Validate each fact with 3 distinct sources minimum
4. OUTPUT FORMAT: Rich Markdown (Headings, Lists, Tables, Citations)
</critical_rules>

<thinking_process>
Before each action, use <thought> tags to plan:
<thought>
- What I know so far: [Summary]
- What I'm missing: [Gaps]
- Strategy: [Next specific search]
</thought>
</thinking_process>

<output_constraints>
- Length: Comprehensive report (8-15 pages equivalent)
- Format: Markdown with proper structure
- Sources: Cite every major claim
- Style: Factual, objective, academic tone
</output_constraints>
`;

        this.history = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Sujet de recherche : "${query}". Commence l'investigation.` }
        ];

        let iterations = 0;
        let finalReport = null;
        let keepSearching = true;

        // Outils disponibles pour cet agent (Web Search uniquement pour l'instant)
        // On récupère l'outil web_search du plugin web_search
        const { pluginLoader } = await import('../loader.js');
        const webSearchPlugin = pluginLoader.get('web_search');

        // On construit la définition de l'outil pour l'IA
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'search_web',
                    description: 'Effectue une recherche Google/Bing pour trouver des faits précis.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Mots-clés optimisés pour le moteur de recherche' }
                        },
                        required: ['query']
                    }
                }
            }
        ];

        // Boucle Itérative (The Loop)
        while (keepSearching && iterations < this.maxIterations) {
            iterations++;
            console.log(`[DeepResearch] 🔄 Itération ${iterations}/${this.maxIterations}`);

            // Feedback utilisateur toutes les 3 itérations pour ne pas sembler mort
            if (iterations % 3 === 0) {
                await this.transport.sendText(this.chatId, `🔎 Recherche en cours... (Étape ${iterations}/${this.maxIterations})`);
            }

            try {
                // Appel LLM (Famille Kimi ou Reasoning préférée)
                const response = await this.providerRouter.chat(this.history, {
                    family: 'kimi', // Force Kimi si dispo, ou fallback smart
                    tools: tools,
                    temperature: 0.4 // Plus factuel
                });

                // Ajouter la réponse de l'assistant à l'historique
                this.history.push({
                    role: 'assistant',
                    content: response.content || null,
                    tool_calls: response.toolCalls
                });

                // Gérer les appels d'outils
                if (response.toolCalls && response.toolCalls.length > 0) {
                    for (const toolCall of response.toolCalls) {
                        if (toolCall.function.name === 'search_web') {
                            const args = JSON.parse(toolCall.function.arguments);
                            console.log(`[DeepResearch] 🌍 Recherche: ${args.query}`);

                            // Exécution réelle via le plugin web_search existant
                            // web_search attend (args, context)
                            const searchResult = await webSearchPlugin.execute(args, {
                                transport: this.transport,
                                chatId: this.chatId
                            });

                            // On extrait juste le texte pertinent pour l'IA
                            const content = typeof searchResult.message === 'string'
                                ? searchResult.message
                                : JSON.stringify(searchResult);

                            this.history.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: 'search_web',
                                content: content
                            });
                        }
                    }
                    // On continue la boucle pour laisser l'IA analyser les résultats
                } else {
                    // Si l'IA ne demande plus d'outils, elle a fini ou abandonne
                    // On vérifie si elle a produit le rapport final
                    if (response.content && response.content.length > 500) {
                        console.log('[DeepResearch] ✅ Rapport final généré putatif.');
                        finalReport = response.content;
                        keepSearching = false;
                    } else {
                        // Elle a peut-être juste fait un commentaire ? On force la continuation si pas assez de contenu
                        this.history.push({
                            role: 'user',
                            content: "Continue tes recherches. Il faut plus de détails et de sources. Si tu as fini, génère le RAPPORT FINAL maintenant."
                        });
                    }
                }

            } catch (error) {
                console.error('[DeepResearch] ❌ Erreur boucle:', error);
                break;
            }
        }

        if (!finalReport) {
            return "Désolé, la recherche approfondie n'a pas abouti (Trop d'erreurs ou limite atteinte).";
        }

        // Nettoyage des balises <thought> du rapport final
        const thoughtRegex = /<(think|thought|thinking)>[\s\S]*?<\/\1>/gi;
        finalReport = finalReport.replace(thoughtRegex, '').trim();

        return finalReport;
    }
}
