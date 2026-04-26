// plugins/dev_tools/SystemScratchpadTool.ts
// ============================================================================
// Sous-Agent Isolé (Scratchpad Pattern) via le SubAgentEngine universel
// ============================================================================

import { SubAgentEngine } from '../../../services/agentic/SubAgentEngine.js';

export default {
    name: 'system_scratchpad',
    description: 'Brouillon système isolé. Permet d\'exécuter une série complexe d\'outils de lecture (grep, list_dir, read_file, search) en arrière-plan sans polluer ta mémoire principale.',
    version: '2.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'run_scratchpad',
                description: 'Invoque un processus "Scratchpad" isolé pour effectuer des recherches ou des lectures complexes. Il travaille en arrière-plan et renvoie un résumé. Utilise-le quand tu dois chercher à travers beaucoup de fichiers ou exécuter plusieurs commandes de lecture pour comprendre un système complexe.',
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
        if (toolName !== 'run_scratchpad') return null;

        const { instructions } = args;

        const scratchpadEngine = new SubAgentEngine({
            name: 'SystemScratchpad',
            systemPrompt: `Tu es un processus de recherche système isolé (Scratchpad) pour HIVE-MIND.
RÈGLES STRICTES:
- Tu as accès UNIQUEMENT à des outils de LECTURE (pas d'écriture, pas de bash destructeur).
- Explore le système et les fichiers, utilise tes outils. Quand tu as trouvé la réponse, donne un résumé TRÈS DÉTAILLÉ et TECHNIQUE.
- Ton rapport final doit être exploitable par l'Agent Principal sans avoir besoin de relire les fichiers.`,
            allowedTools: ['list_directory', 'grep_search', 'read_file', 'duckduck_search'],
            maxIterations: 5, // Limite basse pour éviter de consommer trop de tokens
            category: 'AGENTIC' // ou FAST_CHAT selon la rapidité voulue
        });

        const result = await scratchpadEngine.run(instructions, context);
        
        return {
            success: result.success,
            message: result.message
        };
    }
};
