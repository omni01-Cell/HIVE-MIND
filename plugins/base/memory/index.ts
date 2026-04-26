// plugins/memory/index.js
// Plugin de mémorisation de faits persistants (Option C)
// Permet à l'IA de mémoriser, rappeler et lister des informations sur les utilisateurs

import { factsMemory } from '../../../services/memory.js';

export default {
    name: 'memory',
    description: 'Gestion de la mémoire persistante - mémoriser, rappeler et lister les faits sur les utilisateurs',
    version: '1.0.0',
    enabled: true,

    // Définitions multiples pour function calling
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'remember_fact',
                description: 'Mémorise un fait important sur l\'utilisateur pour s\'en souvenir plus tard. Utilise cette fonction quand l\'utilisateur te demande de te rappeler quelque chose ou quand il partage une information personnelle importante.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Catégorie du fait (ex: "nom", "ville", "métier", "anniversaire", "préférence_musique", "animal_préféré")'
                        },
                        value: {
                            type: 'string',
                            description: 'La valeur à mémoriser (ex: "Jean", "Paris", "Développeur", "15 mars")'
                        }
                    },
                    required: ['key', 'value']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'recall_fact',
                description: 'Rappelle un fait spécifique mémorisé sur l\'utilisateur. Utilise cette fonction quand l\'utilisateur demande si tu te souviens de quelque chose.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Catégorie du fait à rappeler (ex: "nom", "ville", "métier")'
                        }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_facts',
                description: 'Liste tous les faits connus sur l\'utilisateur. Utilise cette fonction quand l\'utilisateur demande ce que tu sais sur lui.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'forget_fact',
                description: 'Oublie un fait spécifique sur l\'utilisateur. Utilise cette fonction quand l\'utilisateur demande d\'oublier une information.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Catégorie du fait à oublier'
                        }
                    },
                    required: ['key']
                }
            }
        }
    ],

    /**
     * Exécute l'outil de mémoire
     * @param {Object} args - Arguments de l'outil
     * @param {Object} context - Contexte (transport, message, chatId, sender)
     * @param {string} toolName - Nom de l'outil appelé
     */
    async execute(args: any, context: any, toolName: any) {
        const { chatId, sender } = context;

        // Utiliser le JID de l'utilisateur comme identifiant de chat pour les faits personnels
        // En groupe, on peut distinguer par sender, en privé c'est le même
        const factsChatId = sender || chatId;

        switch (toolName) {
            case 'remember_fact':
                return await this._rememberFact(factsChatId, args.key, args.value);

            case 'recall_fact':
                return await this._recallFact(factsChatId, args.key);

            case 'list_facts':
                return await this._listFacts(factsChatId);

            case 'forget_fact':
                return await this._forgetFact(factsChatId, args.key);

            default:
                return { success: false, message: `Outil inconnu: ${toolName}` };
        }
    },

    /**
     * Mémorise un fait
     */
    async _rememberFact(chatId: any, key: any, value: any) {
        try {
            // Normaliser la clé (minuscules, underscores)
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');

            await factsMemory.remember(chatId, normalizedKey, value);

            return {
                success: true,
                message: `FAIT_MÉMORISÉ: J'ai noté "${normalizedKey}" = "${value}". Je m'en souviendrai ! 📝`
            };
        } catch (error: any) {
            console.error('[Memory Plugin] Erreur remember:', error);
            return {
                success: false,
                message: `Erreur de mémorisation: ${error.message}`
            };
        }
    },

    /**
     * Rappelle un fait
     */
    async _recallFact(chatId: any, key: any) {
        try {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
            const value = await factsMemory.get(chatId, normalizedKey);

            if (value) {
                return {
                    success: true,
                    message: `FAIT_TROUVÉ: ${normalizedKey} = "${value}"`
                };
            } else {
                return {
                    success: false,
                    message: `FAIT_INCONNU: Je n'ai aucune information sur "${key}" pour cet utilisateur.`
                };
            }
        } catch (error: any) {
            console.error('[Memory Plugin] Erreur recall:', error);
            return {
                success: false,
                message: `Erreur de rappel: ${error.message}`
            };
        }
    },

    /**
     * Liste tous les faits
     */
    async _listFacts(chatId: any) {
        try {
            const facts = await factsMemory.getAll(chatId);
            const entries = Object.entries(facts);

            if (entries.length === 0) {
                return {
                    success: true,
                    message: `AUCUN_FAIT: Je n'ai encore mémorisé aucune information sur cet utilisateur.`
                };
            }

            const formatted = entries
                .map(([key, value]) => `• ${key}: ${value}`)
                .join('\n');

            return {
                success: true,
                message: `FAITS_CONNUS (${entries.length}):\n${formatted}`
            };
        } catch (error: any) {
            console.error('[Memory Plugin] Erreur list:', error);
            return {
                success: false,
                message: `Erreur de listing: ${error.message}`
            };
        }
    },

    /**
     * Oublie un fait
     */
    async _forgetFact(chatId: any, key: any) {
        try {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');

            // Vérifier si le fait existe
            const existing = await factsMemory.get(chatId, normalizedKey);
            if (!existing) {
                return {
                    success: false,
                    message: `FAIT_INEXISTANT: Je n'avais pas d'information sur "${key}" à oublier.`
                };
            }

            await factsMemory.forget(chatId, normalizedKey);

            return {
                success: true,
                message: `FAIT_OUBLIÉ: J'ai oublié "${normalizedKey}". Cette information a été supprimée. 🗑️`
            };
        } catch (error: any) {
            console.error('[Memory Plugin] Erreur forget:', error);
            return {
                success: false,
                message: `Erreur d'oubli: ${error.message}`
            };
        }
    }
};
