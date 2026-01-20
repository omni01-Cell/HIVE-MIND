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
        const systemPrompt = `
Tu es "Kimi Deep Search", un agent d'élite spécialisé dans l'investigation exhaustive.
TON OBJECTIF : Produire un rapport détaillé (équivalent 8-15 pages) sur le sujet demandé, en ne te basant QUE sur des faits vérifiés.

### RÈGLES CRITIQUES :
1. **DOUTE SYSTÉMATIQUE** : Ne réponds jamais de mémoire immédiate. Vérifie tout.
2. **ITÉRATION** : Ta méthode est : Penser -> Chercher -> Lire -> Penser -> Chercher -> ...
3. **CROISEMENT** : Ne valide une info que si tu as 3 sources distinctes.
4. **FORMAT** : Tu dois produire du Markdown riche (Titres, Listes, Tableaux).

### MODÈLE DE PENSÉE (Thinking Process)
Avant chaque action, utilise la balise <thought> pour planifier :
<thought>
- Ce que je sais déjà : [Résumé]
- Ce qu'il me manque : [Lacunes]
- Stratégie : [Prochaine recherche spécifique]
</thought>
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
        const { pluginLoader } = await import('../../core/loader.js');
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
        finalReport = finalReport.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();

        return finalReport;
    }
}
