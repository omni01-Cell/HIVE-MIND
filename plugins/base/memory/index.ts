// plugins/memory/index.js
// Plugin de mémorisation de faits persistants (Option C)
// Permet à l'IA de mémoriser, rappeler et lister des informations sur les utilisateurs

import { factsMemory, workspaceMemory } from '../../../services/memory.js';

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
        },
        {
            type: 'function',
            function: {
                name: 'workspace_write',
                description: 'Sauvegarde ou met à jour un document dans ton espace de travail actif (Epistemic Memory). Utilise-le pour planifier, résumer ou maintenir un état persistant.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Identifiant unique du document (ex: "plan_migration", "user_profile")' },
                        content: { type: 'string', description: 'Le contenu complet du document (texte ou JSON)' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags pour filtrage optionnel (ex: ["plan", "urgent"])' }
                    },
                    required: ['key', 'content']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_read',
                description: 'Lit le contenu complet d\'un document spécifique depuis ton espace de travail actif.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Identifiant unique du document à lire' }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_search',
                description: 'Recherche sémantiquement dans tous tes documents de travail (Epistemic Memory) pour trouver des concepts similaires.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'La question ou le concept à rechercher' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Filtrer par tags spécifiques (optionnel)' }
                    },
                    required: ['query']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_delete',
                description: 'Supprime un document obsolète de ton espace de travail.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Identifiant unique du document à supprimer' }
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

            case 'workspace_write':
                return await this._workspaceWrite(factsChatId, args.key, args.content, args.tags);

            case 'workspace_read':
                return await this._workspaceRead(factsChatId, args.key);

            case 'workspace_search':
                return await this._workspaceSearch(factsChatId, args.query, args.tags);

            case 'workspace_delete':
                return await this._workspaceDelete(factsChatId, args.key);

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
    },

    /**
     * Workspace Write
     */
    async _workspaceWrite(chatId: any, key: any, content: any, tags: any) {
        try {
            const success = await workspaceMemory.write(chatId, key, content, tags || []);
            if (success) {
                return { success: true, message: `WORKSPACE_WRITTEN: Document "${key}" sauvegardé avec succès.` };
            }
            return { success: false, message: `Erreur lors de la sauvegarde du document "${key}".` };
        } catch (error: any) {
            return { success: false, message: `Erreur interne: ${error.message}` };
        }
    },

    /**
     * Workspace Read
     */
    async _workspaceRead(chatId: any, key: any) {
        try {
            const doc = await workspaceMemory.read(chatId, key);
            if (doc) {
                return { success: true, message: `WORKSPACE_DOC [${key}]:\n${doc.content}\n\nTags: ${(doc.tags || []).join(', ')}` };
            }
            return { success: false, message: `WORKSPACE_NOT_FOUND: Le document "${key}" n'existe pas.` };
        } catch (error: any) {
            return { success: false, message: `Erreur interne: ${error.message}` };
        }
    },

    /**
     * Workspace Search
     */
    async _workspaceSearch(chatId: any, query: any, tags: any) {
        try {
            const results = await workspaceMemory.search(chatId, query, tags || []);
            if (results && results.length > 0) {
                const formatted = results.map((r: any) => `- [${r.key}] (Score: ${Math.round(r.similarity*100)}%): ${r.content.substring(0, 200)}...`).join('\n');
                return { success: true, message: `WORKSPACE_SEARCH_RESULTS:\n${formatted}` };
            }
            return { success: true, message: `WORKSPACE_NO_MATCH: Aucun document trouvé pour "${query}".` };
        } catch (error: any) {
            return { success: false, message: `Erreur interne: ${error.message}` };
        }
    },

    /**
     * Workspace Delete
     */
    async _workspaceDelete(chatId: any, key: any) {
        try {
            const success = await workspaceMemory.delete(chatId, key);
            if (success) {
                return { success: true, message: `WORKSPACE_DELETED: Document "${key}" supprimé.` };
            }
            return { success: false, message: `Erreur lors de la suppression de "${key}".` };
        } catch (error: any) {
            return { success: false, message: `Erreur interne: ${error.message}` };
        }
    }
};
