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
                            description: 'Pour un rappel temporel: Quand exécuter cet objectif. Exemples: "2h", "1d", "tomorrow". Ignoré si waitForUser/Keyword est défini.',
                            default: '1h'
                        },
                        waitForUser: {
                            type: 'string',
                            description: 'Optionnel: Attendre un message de cet utilisateur spécifique (Nom ou JID) avant de déclencher l\'objectif.'
                        },
                        waitForKeyword: {
                            type: 'string',
                            description: 'Optionnel: Attendre un message contenant ce mot-clé avant de déclencher l\'objectif.'
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
                name: 'complete_goal',
                description: 'Marque un objectif autonome comme terminé. À utiliser IMPÉRATIVEMENT à la fin de l\'exécution d\'un goal.',
                parameters: {
                    type: 'object',
                    properties: {
                        goalId: {
                            type: 'string',
                            description: 'ID de l\'objectif complété'
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
                const { title, description, executeIn = '1h', waitForUser, waitForKeyword } = args;

                // Déterminer le type de trigger
                let triggerType = 'TIME';
                let triggerEvent = null;
                let triggerCondition = {};
                let executeAt = null;

                if (waitForUser || waitForKeyword) {
                    triggerType = 'EVENT';
                    triggerEvent = 'WAIT_FOR_MESSAGE';
                    triggerCondition = {};
                    if (waitForUser) triggerCondition.from_user = waitForUser;
                    if (waitForKeyword) triggerCondition.contains = waitForKeyword;

                    // Pas de date pour les événements, ou une date limite lointaine (à gérer plus tard)
                    // Pour l'instant on met null ou `now` ? Le service attend une date pour le insert.
                    // Si on regarde le schema, execute_at peut être null ?
                    // SUPPOSITION: On met une date lointaine (2099) pour ne pas déclencher le Time Scheduler
                    executeAt = new Date('2099-12-31T23:59:59Z');
                } else {
                    // Time based
                    executeAt = goalsService.parseDuration(executeIn);
                }

                // Créer l'objectif
                const goal = await goalsService.createGoal({
                    title,
                    description,
                    executeAt,
                    targetChatId: chatId,
                    origin: 'self',
                    triggerType,
                    triggerEvent,
                    triggerCondition
                });

                let validMsg = '';
                if (triggerType === 'EVENT') {
                    validMsg = `Exécution à l'événement: ${waitForUser ? `De "${waitForUser}"` : ''} ${waitForKeyword ? `Contenant "${waitForKeyword}"` : ''}`;
                } else {
                    validMsg = `Exécution prévue: ${executeAt.toLocaleString('fr-FR')}`;
                }

                return {
                    success: true,
                    message: `✅ Objectif créé: "${title}"\n${validMsg}\nID: ${goal.id}`
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

            case 'complete_goal': {
                const { goalId, result } = args;
                await goalsService.completeGoal(goalId, result);

                return {
                    success: true,
                    message: `✅ Objectif ${goalId} marqué comme COMPLÉTÉ.`
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
