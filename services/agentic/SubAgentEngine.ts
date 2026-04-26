// services/agentic/SubAgentEngine.ts
// ============================================================================
// Moteur Universel de Sous-Agents (Swarm Architecture)
// Gère une boucle ReAct isolée avec un Persona et des outils restreints.
// ============================================================================

import { providerRouter } from '../../providers/index.js';
import { pluginLoader } from '../../plugins/loader.js';

export interface SubAgentConfig {
    name: string;
    systemPrompt: string;
    allowedTools: string[];
    maxIterations?: number;
    category?: string; // ex: 'AGENTIC'
}

export class SubAgentEngine {
    private config: SubAgentConfig;

    constructor(config: SubAgentConfig) {
        this.config = {
            maxIterations: 10,
            category: 'AGENTIC', // Par défaut on veut un bon modèle de raisonnement
            ...config
        };
    }

    /**
     * Exécute la mission de manière autonome
     * @param task - La mission à accomplir
     * @param context - Le contexte global de la requête (chatId, etc.)
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async run(task: string, context: any): Promise<{success: boolean, message: string}> {
        console.log(`[SubAgentEngine:${this.config.name}] 🚀 Lancement de la mission: "${task.substring(0, 50)}..."`);

        // 1. Filtrer les outils disponibles pour ne garder que la whitelist
        const allToolDefs = pluginLoader.getToolDefinitions();
        const allowedToolsDefs = allToolDefs.filter((t: any) =>
            this.config.allowedTools.includes(t.function?.name)
        );

        if (allowedToolsDefs.length === 0 && this.config.allowedTools.length > 0) {
            console.warn(`[SubAgentEngine:${this.config.name}] ⚠️ Aucun outil autorisé trouvé dans la liste des plugins.`);
        }

        // 2. Initialiser le Scratchpad (historique isolé)
        const subAgentHistory: any[] = [
            {
                role: 'system',
                content: `${this.config.systemPrompt}\n\nRÈGLES STRICTES:\n- Explore tes outils pour trouver ou construire la réponse.\n- Ta mission est de répondre à l'instruction de l'utilisateur de manière la plus détaillée possible.\n- Ne dépasse pas ${this.config.maxIterations} itérations.\n- Ton rapport final doit être riche et actionnable directement par l'agent principal.`
            },
            {
                role: 'user',
                content: `Mission: ${task}`
            }
        ];

        let iterations = 0;
        let finalReport = '';
        const START_TIME = Date.now();
        const MAX_DURATION_MS = 120000; // 2 minutes hard limit

        // 3. Boucle ReAct Miniature
        while (iterations < this.config.maxIterations!) {
            iterations++;

            // Sécurité Timeout
            if (Date.now() - START_TIME > MAX_DURATION_MS) {
                console.warn(`[SubAgentEngine:${this.config.name}] ⏱️ Timeout forcé après 2 minutes.`);
                finalReport = "La recherche a été interrompue car elle prenait trop de temps. Voici les informations partielles collectées.";
                break;
            }

            try {
                // Feedback silencieux
                console.log(`[SubAgentEngine:${this.config.name}] 🔄 Itération ${iterations}/${this.config.maxIterations}`);

                const response = await providerRouter.chat(subAgentHistory, {
                    category: this.config.category,
                    tools: allowedToolsDefs.length > 0 ? allowedToolsDefs : undefined
                });

                // Enregistrer la réponse de l'assistant
                const assistantMsg: any = {
                    role: 'assistant',
                    content: response.content || null,
                };
                
                if (response.toolCalls && response.toolCalls.length > 0) {
                    assistantMsg.tool_calls = response.toolCalls;
                }
                
                subAgentHistory.push(assistantMsg);

                // Si pas d'outil demandé, l'agent a terminé sa réflexion
                if (!response.toolCalls || response.toolCalls.length === 0) {
                    finalReport = response.content || '';
                    break;
                }

                // Si c'est la dernière itération mais qu'il demande encore des outils
                if (iterations >= this.config.maxIterations!) {
                    console.warn(`[SubAgentEngine:${this.config.name}] ⚠️ Max itérations atteint, forçage d'une conclusion.`);
                    subAgentHistory.push({
                        role: 'user',
                        content: 'Tu as atteint ta limite d\'actions. Fais un rapport final très complet avec ce que tu as appris jusqu\'ici.'
                    });
                    
                    const forcedConclusion = await providerRouter.chat(subAgentHistory, {
                        category: this.config.category
                    });
                    finalReport = forcedConclusion.content || '';
                    break;
                }

                // 4. Exécuter les appels d'outils
                for (const call of response.toolCalls) {
                    let toolArgs: any;
                    try {
                        toolArgs = typeof call.function.arguments === 'string'
                            ? JSON.parse(call.function.arguments)
                            : call.function.arguments;
                    } catch {
                        toolArgs = {};
                    }

                    // Vérifier la sécurité (Whitelist)
                    if (!this.config.allowedTools.includes(call.function.name)) {
                        subAgentHistory.push({
                            role: 'tool',
                            tool_call_id: call.id,
                            name: call.function.name,
                            content: JSON.stringify({ error: `Outil "${call.function.name}" non autorisé pour cet agent.` })
                        });
                        continue;
                    }

                    // Exécution réelle via le PluginLoader
                    const result = await pluginLoader.execute(call.function.name, toolArgs, context);

                    subAgentHistory.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        name: call.function.name,
                        content: typeof result === 'string' ? result : JSON.stringify(result)
                    });
                }
            } catch (e: any) {
                console.error(`[SubAgentEngine:${this.config.name}] ❌ Erreur à l'itération ${iterations}:`, e.message);
                return {
                    success: false,
                    message: `[ERREUR SOUS-AGENT] Impossible de terminer la tâche: ${e.message}`
                };
            }
        }

        const report = finalReport || 'Opération terminée mais aucun rapport textuel n\'a été généré.';
        console.log(`[SubAgentEngine:${this.config.name}] ✅ Fin (${iterations} itérations). Rapport généré.`);

        // Nettoyage des balises <think> (si le modèle est de type reasoning et a fuité dans le output final)
        const cleanedReport = report.replace(/<(think|thought|thinking)>[\s\S]*?<\/\1>/gi, '').trim();

        return {
            success: true,
            message: `[Rapport de ${this.config.name}] :\n${cleanedReport}`
        };
    }
}
