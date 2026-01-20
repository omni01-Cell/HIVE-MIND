// plugins/goals/index.js
// Plugin pour la gestion des objectifs autonomes

import { goalsService } from '../../services/goalsService.js';

export default {
    name: 'goals',
    description: 'Autonomous goal management',
    version: '1.0.0',

    tools: [
        {
            type: 'function',
            function: {
                name: 'create_goal',
                description: 'Crée un objectif autonome pour une action future (recherche, rappel, tâche planifiée). Utile pour se rappeler de faire quelque chose plus tard.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Titre court et descriptif de l\'objectif'
                        },
                        description: {
                            type: 'string',
                            description: 'Description détaillée de ce qui doit être fait'
                        },
                        executeIn: {
                            type: 'string',
                            description: 'Quand exécuter cet objectif. Exemples: "2h", "1d", "30min", "tomorrow"',
                            default: '1h'
                        }
                    },
                    required: ['title', 'description']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_goals',
                description: 'Liste les objectifs autonomes actifs pour ce chat.',
                parameters: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            description: 'Filtrer par statut (pending, in_progress, completed)',
                            enum: ['pending', 'in_progress', 'completed', 'all']
                        }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'cancel_goal',
                description: 'Annule un objectif autonome.',
                parameters: {
                    type: 'object',
                    properties: {
                        goalId: {
                            type: 'string',
                            description: 'ID de l\'objectif à annuler'
                        }
                    },
                    required: ['goalId']
                }
            }
        }
    ],

    async execute(toolName, args, context) {
        const { chatId } = context;

        switch (toolName) {
            case 'create_goal': {
                const { title, description, executeIn = '1h' } = args;

                // Parse la durée
                const executeAt = goalsService.parseDuration(executeIn);

                // Créer l'objectif
                const goal = await goalsService.createGoal({
                    title,
                    description,
                    executeAt,
                    targetChatId: chatId,
                    origin: 'self'
                });

                return {
                    success: true,
                    message: `✅ Objectif créé: "${title}"\nExécution prévue: ${executeAt.toLocaleString('fr-FR')}\nID: ${goal.id}`
                };
            }

            case 'list_goals': {
                const { status = 'all' } = args;
                const allGoals = await goalsService.getChatGoals(chatId);

                const filtered = status === 'all'
                    ? allGoals
                    : allGoals.filter(g => g.status === status);

                if (filtered.length === 0) {
                    return {
                        success: true,
                        message: 'Aucun objectif trouvé.'
                    };
                }

                const list = filtered.map(g =>
                    `- [${g.status}] ${g.title}\n  Exécution: ${new Date(g.execute_at).toLocaleString('fr-FR')}\n  ID: ${g.id}`
                ).join('\n\n');

                return {
                    success: true,
                    message: `📋 Objectifs (${filtered.length}):\n\n${list}`
                };
            }

            case 'cancel_goal': {
                const { goalId } = args;
                await goalsService.cancelGoal(goalId);

                return {
                    success: true,
                    message: `❌ Objectif ${goalId} annulé.`
                };
            }

            default:
                return {
                    success: false,
                    message: 'Outil inconnu.'
                };
        }
    }
};
