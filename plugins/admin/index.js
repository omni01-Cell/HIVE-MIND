// plugins/admin/index.js
// Plugin Admin - Gestion des utilisateurs (soft delete, restore, etc.)
// Réservé aux global admins

import { userService } from '../../services/userService.js';
import { adminService } from '../../services/adminService.js';
import { workingMemory } from '../../services/workingMemory.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export default {
    name: 'admin',
    description: 'Outils d\'administration réservés aux super-admins : gestion des utilisateurs bannis.',
    version: '1.0.0',
    enabled: true,

    // Définitions des outils pour l'IA
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'admin_soft_delete',
                description: 'Supprime logiquement un utilisateur (soft delete). Le compte est marqué comme inactif mais pas effacé. SUPER ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' },
                        reason: { type: 'string', description: 'Raison de la suppression' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_restore',
                description: 'Restaure un utilisateur précédemment supprimé (soft delete). SUPER ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur à restaurer' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_list_deleted',
                description: 'Liste les utilisateurs supprimés (soft deleted). SUPER ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'integer', description: 'Nombre max de résultats (défaut: 20)' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_check_deleted',
                description: 'Vérifie si un utilisateur est dans l\'état supprimé. SUPER ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' }
                    },
                    required: ['user_jid']
                }
            }
        },
        // Anti-Delete Tools
        {
            type: 'function',
            function: {
                name: 'admin_antidelete',
                description: 'Active ou désactive l\'anti-delete pour un groupe. Quand activé, les messages supprimés sont automatiquement repostés. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['on', 'off', 'status'],
                            description: 'Action: on (activer), off (désactiver), status (voir l\'état)'
                        }
                    },
                    required: ['action']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_show_deleted',
                description: 'Affiche les messages récemment supprimés dans le groupe. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'integer', description: 'Nombre de messages à afficher (défaut: 10)' }
                    }
                }
            }
        }
    ],

    // Commandes textuelles WhatsApp
    textMatchers: [
        {
            pattern: /^\.voice\s+(restricted|full|status)$/i,
            name: 'admin_voice_mode',
            extractArgs: (match) => ({ mode: match[1].toLowerCase() })
        },
        {
            pattern: /^\.mute\.audio_for_none$/i,
            name: 'admin_audio_perm',
            extractArgs: () => ({ permission: 'admins_only' })
        },
        {
            pattern: /^\.allow\.audio_for_none$/i,
            name: 'admin_audio_perm',
            extractArgs: () => ({ permission: 'all' })
        },
        {
            pattern: /^\.mute\.audio_for_all$/i,
            name: 'admin_audio_perm',
            extractArgs: () => ({ permission: 'none' })
        },
        {
            pattern: /^\.allow\.audio_for_all$/i,
            name: 'admin_audio_perm',
            extractArgs: () => ({ permission: 'all' })
        },
        {
            pattern: /^\.audio\.status$/i,
            name: 'admin_audio_perm',
            extractArgs: () => ({ permission: 'status' })
        },
        // Anti-Delete commands
        {
            pattern: /^\.antidelete\s+(on|off|status)$/i,
            name: 'admin_antidelete',
            extractArgs: (match) => ({ action: match[1].toLowerCase() })
        },
        {
            pattern: /^\.deleted$/i,
            name: 'admin_show_deleted',
            extractArgs: () => ({})
        },
        // PV Audio Control (Global Admin Only)
        {
            pattern: /^\.pv\.audio\.(on|off|status)$/i,
            name: 'admin_pv_audio',
            extractArgs: (match) => ({ action: match[1].toLowerCase() })
        }
    ],

    /**
     * Exécute une commande admin
     */
    async execute(args, context, toolName) {
        const { sender, message } = context;

        // Vérifier que l'utilisateur est un global admin
        const isGlobalAdmin = await adminService.isGlobalAdmin(sender);
        if (!isGlobalAdmin) {
            return {
                success: false,
                message: 'REFUSÉ: Commande réservée aux super-administrateurs.'
            };
        }

        // Dispatcher selon la commande
        switch (toolName) {
            case 'admin_soft_delete':
                return await this._softDelete(args.user_jid, args.reason);

            case 'admin_restore':
                return await this._restore(args.user_jid);

            case 'admin_list_deleted':
                return await this._listDeleted(args.limit || 20);

            case 'admin_check_deleted':
                return await this._checkDeleted(args.user_jid);

            case 'admin_voice_mode':
                return await this._setVoiceMode(args.mode);

            case 'admin_audio_perm':
                return await this._setAudioPermission(args.permission, context.chatId, context.isGroup);

            case 'admin_antidelete':
                return await this._toggleAntiDelete(args.action, context.chatId);

            case 'admin_show_deleted':
                return await this._showDeletedMessages(context.chatId);

            case 'admin_pv_audio':
                return await this._setPvAudio(args.action, sender);

            default:
                return { success: false, message: `Commande inconnue: ${toolName}` };
        }
    },

    /**
     * Soft delete un utilisateur
     */
    async _softDelete(userJid, reason) {
        try {
            const success = await userService.softDelete(userJid, reason);
            if (success) {
                return {
                    success: true,
                    message: `✅ Utilisateur ${userJid.split('@')[0]} supprimé (soft delete).\nRaison: ${reason || 'Non spécifiée'}`
                };
            } else {
                return {
                    success: false,
                    message: `❌ Utilisateur non trouvé ou déjà supprimé.`
                };
            }
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Restaure un utilisateur
     */
    async _restore(userJid) {
        try {
            const success = await userService.restore(userJid);
            if (success) {
                return {
                    success: true,
                    message: `✅ Utilisateur ${userJid.split('@')[0]} restauré avec succès.`
                };
            } else {
                return {
                    success: false,
                    message: `❌ Utilisateur non trouvé ou n'était pas supprimé.`
                };
            }
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Liste les utilisateurs supprimés
     */
    async _listDeleted(limit) {
        try {
            const deletedUsers = await userService.listDeleted(limit);

            if (deletedUsers.length === 0) {
                return {
                    success: true,
                    message: '📋 Aucun utilisateur supprimé.'
                };
            }

            const list = deletedUsers.map((u, i) =>
                `${i + 1}. ${u.jid?.split('@')[0] || 'inconnu'} - ${u.deleted_at ? new Date(u.deleted_at).toLocaleDateString('fr-FR') : '?'}`
            ).join('\n');

            return {
                success: true,
                message: `📋 **Utilisateurs supprimés** (${deletedUsers.length}):\n\n${list}`
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Vérifie si un utilisateur est supprimé
     */
    async _checkDeleted(userJid) {
        try {
            const isDeleted = await userService.isDeleted(userJid);
            const status = isDeleted ? '🔴 SUPPRIMÉ' : '🟢 ACTIF';
            return {
                success: true,
                message: `Statut de ${userJid.split('@')[0]}: ${status}`
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Change le mode de transcription vocale
     */
    async _setVoiceMode(mode) {
        try {
            const configPath = join(__dirname, '..', '..', 'config', 'config.json');
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));

            // Si "status", juste retourner le mode actuel
            if (mode === 'status') {
                const currentMode = config.voice_transcription?.mode || 'restricted';
                return {
                    success: true,
                    message: `🎤 Mode transcription actuel: **${currentMode.toUpperCase()}**\n\n` +
                        `• *restricted*: Transcrit seulement les vocaux qui répondent au bot\n` +
                        `• *full*: Transcrit tous les vocaux (vérifie le nom du bot)`
                };
            }

            // Valider le mode
            if (!['restricted', 'full'].includes(mode)) {
                return {
                    success: false,
                    message: `Mode invalide. Utilisez: .voice restricted | .voice full | .voice status`
                };
            }

            // Mettre à jour la config
            if (!config.voice_transcription) {
                config.voice_transcription = {};
            }
            config.voice_transcription.mode = mode;

            writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');

            return {
                success: true,
                message: `✅ Mode transcription changé: **${mode.toUpperCase()}**\n` +
                    (mode === 'restricted'
                        ? `Les vocaux seront transcrits uniquement s'ils répondent au bot.`
                        : `Tous les vocaux seront transcrits (si le nom du bot est mentionné).`)
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Change les permissions audio pour un groupe
     * @param {string} permission - 'all' | 'admins_only' | 'none' | 'status'
     * @param {string} groupJid - JID du groupe
     * @param {boolean} isGroup - Est-ce un groupe ?
     */
    async _setAudioPermission(permission, groupJid, isGroup) {
        try {
            // VÉRIFICATION: Cette commande ne fonctionne qu'en groupe
            if (!isGroup) {
                return {
                    success: false,
                    message: `❌ Cette commande ne fonctionne qu'en **groupe**.\n\n` +
                        `Pour gérer les vocaux en PV, utilisez:\n` +
                        `• \`.pv.audio.status\` - Voir le statut\n` +
                        `• \`.pv.audio.off\` - Désactiver (Global Admin)\n` +
                        `• \`.pv.audio.on\` - Réactiver (Global Admin)`
                };
            }

            // Si c'est une demande de status
            if (permission === 'status') {
                const currentPerm = await workingMemory.getAudioPermission(groupJid);
                const permLabels = {
                    'all': '🟢 Tout le monde peut envoyer des vocaux',
                    'admins_only': '🟡 Seuls les admins peuvent envoyer des vocaux',
                    'none': '🔴 Personne ne peut envoyer de vocaux'
                };
                return {
                    success: true,
                    message: `🔊 **Permissions Audio (Groupe)**\n\n${permLabels[currentPerm] || permLabels['all']}\n\n` +
                        `Commandes:\n` +
                        `• \`.mute.audio_for_none\` - Bloque les non-admins\n` +
                        `• \`.mute.audio_for_all\` - Bloque tout le monde\n` +
                        `• \`.allow.audio_for_all\` - Autorise tout le monde`
                };
            }

            // Appliquer la permission
            await workingMemory.setAudioPermission(groupJid, permission);

            const permLabels = {
                'all': '🟢 Tout le monde peut maintenant envoyer des vocaux',
                'admins_only': '🟡 Seuls les admins peuvent maintenant envoyer des vocaux transcrits',
                'none': '🔴 Plus personne ne peut envoyer de vocaux (transcription désactivée)'
            };

            return {
                success: true,
                message: `✅ Permission audio mise à jour\n\n${permLabels[permission]}`
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Gère les vocaux en PV (Global Admin Only)
     * @param {string} action - 'on' | 'off' | 'status'
     * @param {string} senderJid - JID de l'expéditeur
     */
    async _setPvAudio(action, senderJid) {
        try {
            // Vérifier que c'est un Global Admin
            const isGlobalAdmin = await adminService.isGlobalAdmin(senderJid);

            if (action === 'status') {
                // Le status est accessible à tout le monde
                const isDisabled = await workingMemory.isPvAudioDisabled();
                return {
                    success: true,
                    message: `🎤 **Vocaux en PV**\n\n` +
                        `Statut: ${isDisabled ? '🔴 DÉSACTIVÉS globalement' : '🟢 ACTIVÉS'}\n\n` +
                        `En PV, les vocaux sont transcrits directement sans restriction de mode.\n` +
                        (isGlobalAdmin
                            ? `\nCommandes Global Admin:\n• \`.pv.audio.off\` - Désactiver\n• \`.pv.audio.on\` - Réactiver`
                            : `\n_(Seuls les Global Admins peuvent modifier ce paramètre)_`)
                };
            }

            // Pour on/off, il faut être Global Admin
            if (!isGlobalAdmin) {
                return {
                    success: false,
                    message: `❌ **Accès refusé**\n\nSeuls les **Global Admins** peuvent activer/désactiver les vocaux en PV.`
                };
            }

            const disable = action === 'off';
            await workingMemory.setPvAudioDisabled(disable);

            return {
                success: true,
                message: disable
                    ? `🔴 **Vocaux PV DÉSACTIVÉS**\n\nLes vocaux en messages privés ne seront plus transcrits.`
                    : `🟢 **Vocaux PV ACTIVÉS**\n\nLes vocaux en messages privés seront à nouveau transcrits.`
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Active/désactive l'anti-delete pour un groupe
     * @param {string} action - 'on' | 'off' | 'status'
     * @param {string} chatId - JID du groupe
     */
    async _toggleAntiDelete(action, chatId) {
        try {
            if (action === 'status') {
                const isEnabled = await workingMemory.isAntiDeleteEnabled(chatId);
                return {
                    success: true,
                    message: `🗑️ **Anti-Delete**\n\n` +
                        `Statut: ${isEnabled ? '🟢 ACTIVÉ' : '🔴 DÉSACTIVÉ'}\n\n` +
                        `Quand activé, les messages supprimés sont automatiquement repostés.\n\n` +
                        `• \`.antidelete on\` - Activer\n` +
                        `• \`.antidelete off\` - Désactiver\n` +
                        `• \`.deleted\` - Voir les messages supprimés`
                };
            }

            const enable = action === 'on';
            await workingMemory.setAntiDeleteEnabled(chatId, enable);

            return {
                success: true,
                message: enable
                    ? `✅ **Anti-Delete ACTIVÉ**\n\nLes messages supprimés seront automatiquement repostés.`
                    : `✅ **Anti-Delete DÉSACTIVÉ**\n\nLes messages supprimés ne seront plus repostés.`
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Affiche les messages récemment supprimés
     * @param {string} chatId - JID du groupe
     */
    async _showDeletedMessages(chatId) {
        try {
            const deletedMessages = await workingMemory.getDeletedMessages(chatId, 10);

            if (deletedMessages.length === 0) {
                return {
                    success: true,
                    message: `📋 Aucun message supprimé enregistré pour ce groupe.`
                };
            }

            const list = deletedMessages.map((m, i) => {
                const time = new Date(m.deletedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const text = m.text.length > 50 ? m.text.substring(0, 50) + '...' : m.text;
                return `${i + 1}. *${m.senderName}* (${time}):\n   "${text}"`;
            }).join('\n\n');

            return {
                success: true,
                message: `🗑️ **Messages supprimés récents**\n\n${list}`
            };
        } catch (error) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    }
};
