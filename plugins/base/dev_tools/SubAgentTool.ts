// plugins/dev_tools/SubAgentTool.ts
// ============================================================================
// Sous-Agent Isolé (Scratchpad Pattern)
// Inspiré de Claude Code AgentTool : lance une boucle ReAct isolée
// avec uniquement des outils READ-ONLY pour explorer sans polluer
// le contexte de l'agent principal.
// ============================================================================

import { providerRouter } from '../../../providers/index.js';
import { pluginLoader } from '../../loader.js';

/** Outils auxquels le sous-agent a accès (lecture seule) */
const ALLOWED_TOOLS = [
    'list_directory',
    'grep_search',
    'read_file',
    'duckduck_search',
] as const;

/** Nombre maximum d'itérations pour éviter les boucles infinies */
const MAX_ITERATIONS = 5;

export default {
    name: 'sub_agent_tool',
    description: 'Délègue une sous-tâche exploratoire complexe (ex: recherche, lecture de code multiple) à un sous-agent sans polluer ta propre mémoire.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'delegate_task',
                description: 'Invoque un sous-agent "Scratchpad" pour effectuer des recherches ou des lectures complexes. Il travaille en arrière-plan et renvoie un résumé. Utilise-le quand tu dois chercher à travers beaucoup de fichiers ou exécuter plusieurs commandes pour comprendre un système.',
                parameters: {
                    type: 'object',
                    properties: {
                        instructions: {
                            type: 'string',
                            description: 'Les instructions strictes et détaillées pour le sous-agent (ce qu\'il doit chercher/analyser).'
                        }
                    },
                    required: ['instructions']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'delegate_task') return null;

        const { instructions } = args;
        console.log(`[SubAgent] 🕵️ Lancement pour : "${instructions.substring(0, 60)}..."`);

        // Filtrer les outils disponibles vers READ-ONLY uniquement
        const allToolDefs = pluginLoader.getToolDefinitions();
        const allowedTools = allToolDefs.filter((t: any) =>
            ALLOWED_TOOLS.includes(t.function?.name)
        );

        if (allowedTools.length === 0) {
            console.warn('[SubAgent] ⚠️ Aucun outil read-only disponible');
        }

        // Historique isolé (Scratchpad) — ne pollue PAS l'historique principal
        const subAgentHistory: any[] = [
            {
                role: 'system',
                content: `Tu es un Sous-Agent de recherche pour HIVE-MIND.
Ta mission: ${instructions}
RÈGLES STRICTES:
- Tu as accès UNIQUEMENT à des outils de LECTURE (pas d'écriture, pas de bash).
- Explore, utilise tes outils. Quand tu as trouvé la réponse, donne un résumé TRÈS DÉTAILLÉ et TECHNIQUE.
- Ne dépasse PAS ${MAX_ITERATIONS} itérations d'outils.
- Ton rapport final doit être exploitable par l'Agent Principal sans avoir besoin de relire les fichiers.`
            }
        ];

        let iterations = 0;
        let finalReport = '';

        // Boucle ReAct miniature isolée
        while (iterations < MAX_ITERATIONS) {
            iterations++;

            try {
                const response = await providerRouter.chat(subAgentHistory, {
                    tools: allowedTools
                });

                // Construire le message assistant
                const assistantMsg: any = {
                    role: 'assistant',
                    content: response.content || null,
                };
                if (response.toolCalls && response.toolCalls.length > 0) {
                    assistantMsg.tool_calls = response.toolCalls;
                }
                subAgentHistory.push(assistantMsg);

                // Si pas de tool calls → l'agent a terminé sa réflexion
                if (!response.toolCalls || response.toolCalls.length === 0) {
                    finalReport = response.content;
                    break;
                }

                // Exécuter chaque tool call
                for (const call of response.toolCalls) {
                    let toolArgs: any;
                    try {
                        toolArgs = typeof call.function.arguments === 'string'
                            ? JSON.parse(call.function.arguments)
                            : call.function.arguments;
                    } catch {
                        toolArgs = {};
                    }

                    // Sécurité : vérifier que l'outil est dans la whitelist
                    if (!ALLOWED_TOOLS.includes(call.function.name as any)) {
                        subAgentHistory.push({
                            role: 'tool',
                            tool_call_id: call.id,
                            name: call.function.name,
                            content: JSON.stringify({ error: `Outil "${call.function.name}" interdit pour le sous-agent.` })
                        });
                        continue;
                    }

                    const result = await pluginLoader.execute(call.function.name, toolArgs, context);

                    subAgentHistory.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        name: call.function.name,
                        content: typeof result === 'string' ? result : JSON.stringify(result)
                    });
                }
            } catch (e: any) {
                console.error(`[SubAgent] ❌ Erreur itération ${iterations}:`, e.message);
                return {
                    success: false,
                    message: `Le sous-agent a échoué à l'itération ${iterations} : ${e.message}`
                };
            }
        }

        const report = finalReport || 'Recherche terminée mais aucun rapport généré.';
        console.log(`[SubAgent] ✅ Rapport généré (${iterations} itération(s), ${report.length} chars)`);

        return {
            success: true,
            message: `[RAPPORT DU SOUS-AGENT (${iterations} itérations)] :\n${report}`
        };
    }
};
