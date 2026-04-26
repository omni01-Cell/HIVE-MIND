// @ts-nocheck
import { container } from '../../../core/container.js';

/**
 * DeepResearchAgent
 * Un agent autonome spécialisé dans la recherche approfondie itérative.
 * Inspiré par la méthodologie "Kimi Deep Search".
 */
export class DeepResearchAgent {
    userId: any;
    chatId: any;
    maxIterations: any;
    providerRouter: any;
    transport: any;
    history: any;

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
    async start(query: any) {
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
        let finalReport: any = null;
        let keepSearching = true;

        // TIMEOUT & CONVERGENCE CONFIG
        const MAX_DURATION_MS = 120000; // 2 minutes max (deep research peut être long mais pas infini)
        const START_TIME = Date.now();
        const FEEDBACK_INTERVAL = 3; // Feedback toutes les 3 itérations

        // Outils disponibles pour cet agent (Web Search uniquement pour l'instant)
        // On récupère l'outil duckduck_search du plugin duckduck_search
        const { pluginLoader } = await import('../../loader.js');
        const webSearchPlugin = pluginLoader.get('duckduck_search');

        // On construit la définition de l'outil pour l'IA
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'duckduck_search',
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

            // 🛡️ CHECK 1: Timeout global
            const elapsed = Date.now() - START_TIME;
            if (elapsed > MAX_DURATION_MS) {
                console.warn(`[DeepResearch] ⏱️ Timeout après ${Math.round(elapsed/1000)}s, forçage de complétion`);
                await this.transport.sendText(this.chatId, `⏱️ Temps écoulé. Génération du rapport final avec les données collectées...`);
                
                // Forcer la génération du rapport final
                keepSearching = false;
                
                // On demande à l'IA de produire un rapport final avec ce qu'elle a
                this.history.push({
                    role: 'user',
                    content: `Temps limite atteint. Génère maintenant un rapport final complet basé sur les ${iterations} recherches effectuées. Utilise toutes les informations collectées.`
                });
                break;
            }

            // 🛡️ CHECK 2: Convergence après 60s
            if (iterations > 5 && elapsed > 60000) {
                // Vérifier si on a assez de contenu (heuristique simple)
                const totalContent = this.history
                    .filter((m: any) => m.role === 'assistant' && m.content)
                    .map((m: any) => m.content)
                    .join(' ');
                
                const minContentLength = 1000; // Au moins 1000 caractères de contenu
                if (totalContent.length < minContentLength) {
                    console.warn(`[DeepResearch] ⚠️ Pas de convergence après 60s (${totalContent.length} chars), forçage`);
                    await this.transport.sendText(this.chatId, `⚠️ Recherche difficile. Compilation des résultats...`);
                    keepSearching = false;
                }
            }

            // Feedback utilisateur toutes les FEEDBACK_INTERVAL itérations
            if (iterations % FEEDBACK_INTERVAL === 0) {
                const remainingTime = Math.round((MAX_DURATION_MS - elapsed) / 1000);
                await this.transport.sendText(
                    this.chatId, 
                    `🔎 Recherche en cours... (Étape ${iterations}/${this.maxIterations}, ~${remainingTime}s restantes)`
                );
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
                        if (toolCall.function.name === 'duckduck_search') {
                            const args = JSON.parse(toolCall.function.arguments);
                            console.log(`[DeepResearch] 🌍 Recherche: ${args.query}`);

                            // Exécution réelle via le plugin duckduck_search existant
                            // duckduck_search attend (args, context)
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
                                name: 'duckduck_search',
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

            } catch (error: any) {
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
