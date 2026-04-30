// plugins/dev_tools/SpawnSubAgentTool.ts
// ============================================================================
// Outil Créateur de Sous-Agents (Swarm Orchestration)
// Permet à HIVE-MIND d'instancier dynamiquement des sous-agents spécialisés
// via le SubAgentEngine universel.
// ============================================================================

import { SubAgentEngine } from '../../../services/agentic/SubAgentEngine.js';
import { pluginLoader } from '../../loader.js';

export default {
    name: 'spawn_sub_agent',
    description: 'Instancie et exécute dynamiquement un sous-agent spécialisé pour accomplir une tâche complexe en arrière-plan.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'spawn_sub_agent',
                description: 'Crée un sous-agent autonome (Swarm) avec un rôle spécifique et des outils précis pour accomplir une mission complexe en arrière-plan. Utilise-le pour déléguer les tâches longues ou nécessitant une spécialisation pointue (ex: vérifier des faits, analyser du code, générer un rapport de recherche complexe).',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Le nom du sous-agent (ex: "FactChecker", "MathGenius", "CodeReviewer").'
                        },
                        persona: {
                            type: 'string',
                            description: 'The complete system prompt that defines the personality, role, and strict rules of the sub-agent (e.g. "You are a cybersecurity expert. Your mission is...").'
                        },
                        tools: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'La liste exacte des outils que ce sous-agent a le droit d\'utiliser (ex: ["duckduck_search", "read_file", "list_directory"]). ATTENTION: ne donne que les outils strictement nécessaires !'
                        },
                        mission: {
                            type: 'string',
                            description: 'Les instructions exactes et la tâche que le sous-agent doit accomplir.'
                        }
                    },
                    required: ['name', 'persona', 'tools', 'mission']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'spawn_sub_agent') return null;

        const { name, persona, tools, mission } = args;
        
        console.log(`[Swarm Orchestration] 🧬 Création dynamique du sous-agent: ${name}`);
        console.log(`[Swarm Orchestration] 🛠️ Outils alloués: ${tools.join(', ')}`);

        // Validation des outils demandés pour des questions de sécurité
        // On empêche la délégation d'outils critiques comme bash_eval sauf si explicitement vérifié
        const safeTools = tools.filter((tool: string) => tool !== 'bash_eval');

        if (safeTools.length !== tools.length) {
            console.warn(`[Swarm Orchestration] ⚠️ L'outil bash_eval a été retiré pour des raisons de sécurité.`);
        }

        const dynamicEngine = new SubAgentEngine({
            name: name,
            systemPrompt: persona,
            allowedTools: safeTools,
            maxIterations: 10, // Limite raisonnable pour un agent dynamique
            category: 'AGENTIC' // Force l'usage d'un modèle de raisonnement
        });

        const result = await dynamicEngine.run(mission, context);
        
        return {
            success: result.success,
            message: result.message
        };
    }
};
