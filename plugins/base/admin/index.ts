// @ts-nocheck
// plugins/admin/index.js
// Admin Plugin - User management (soft delete, restore, etc.)
// Reserved for global admins

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lazy loaded services
const getServices = async () => {
    const [{ userService }, { adminService }, { workingMemory }] = await Promise.all([
        import('../../../services/userService.js'),
        import('../../../services/adminService.js'),
        import('../../../services/workingMemory.js')
    ]);
    return { userService, adminService, workingMemory };
};
export default {
    name: 'admin',
    description: 'Administration tools reserved for super-admins: banned user management.',
    version: '1.0.0',
    enabled: true,

    // Tool definitions for the AI
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'admin_soft_delete',
                description: 'Logically deletes a user (soft delete). The account is marked as inactive but not erased. SUPER ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'User JID' },
                        reason: { type: 'string', description: 'Reason for deletion' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_restore',
                description: 'Restores a previously soft-deleted user. SUPER ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID of the user to restore' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_list_deleted',
                description: 'Lists soft-deleted users. SUPER ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'integer', description: 'Max number of results (default: 20)' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'admin_check_deleted',
                description: 'Checks if a user is in soft-deleted state. SUPER ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'User JID' }
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
                description: 'Enables or disables anti-delete for a group. When enabled, deleted messages are automatically reposted. ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['on', 'off', 'status'],
                            description: 'Action: on (enable), off (disable), status (check state)'
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
                description: 'Displays recently deleted messages in the group. ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: { type: 'integer', description: 'Number of messages to display (default: 10)' }
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
            extractArgs: (match: any) => ({ mode: match[1].toLowerCase() })
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
            extractArgs: (match: any) => ({ action: match[1].toLowerCase() })
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
            extractArgs: (match: any) => ({ action: match[1].toLowerCase() })
        }
    ],

    /**
     * Executes an admin command
     */
    async execute(args: any, context: any, toolName: any) {
        // Déstructuration défensive du contexte
        const { sender, chatId, isGroup } = context || {};

        if (!sender) {
            return { success: false, message: 'CONTEXT_ERROR: sender is required for admin operations.' };
        }

        const { adminService } = await getServices();

        // Verify that the user is a global admin
        const isGlobalAdmin = await adminService.isGlobalAdmin(sender);
        if (!isGlobalAdmin) {
            return {
                success: false,
                message: 'DENIED: Command reserved for super-administrators.'
            };
        }

        // Dispatch based on command
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
                return await this._setAudioPermission(args.permission, chatId, isGroup);

            case 'admin_antidelete':
                return await this._toggleAntiDelete(args.action, chatId);

            case 'admin_show_deleted':
                return await this._showDeletedMessages(chatId);

            case 'admin_pv_audio':
                return await this._setPvAudio(args.action, sender);

            default:
                return { success: false, message: `Unknown command: ${toolName}` };
        }
    },

    /**
     * Soft delete a user
     */
    async _softDelete(userJid: any, reason: any) {
        try {
            const { userService } = await getServices();
            const success = await userService.softDelete(userJid, reason);
            if (success) {
                return {
                    success: true,
                    message: `✅ User ${userJid.split('@')[0]} soft deleted.\nReason: ${reason || 'Not specified'}`
                };
            } else {
                return {
                    success: false,
                    message: `❌ User not found or already deleted.`
                };
            }
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Restores a user
     */
    async _restore(userJid: any) {
        try {
            const success = await userService.restore(userJid);
            if (success) {
                return {
                    success: true,
                    message: `✅ User ${userJid.split('@')[0]} successfully restored.`
                };
            } else {
                return {
                    success: false,
                    message: `❌ User not found or was not deleted.`
                };
            }
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Lists deleted users
     */
    async _listDeleted(limit: any) {
        try {
            const deletedUsers = await userService.listDeleted(limit);

            if (deletedUsers.length === 0) {
                return {
                    success: true,
                    message: '📋 No deleted users.'
                };
            }

            const list = deletedUsers.map((u: any, i: any) =>
                `${i + 1}. ${u.jid?.split('@')[0] || 'unknown'} - ${u.deleted_at ? new Date(u.deleted_at).toLocaleDateString('en-US') : '?'}`
            ).join('\n');

            return {
                success: true,
                message: `📋 **Deleted Users** (${deletedUsers.length}):\n\n${list}`
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Checks if a user is deleted
     */
    async _checkDeleted(userJid: any) {
        try {
            const isDeleted = await userService.isDeleted(userJid);
            const status = isDeleted ? '🔴 DELETED' : '🟢 ACTIVE';
            return {
                success: true,
                message: `Status for ${userJid.split('@')[0]}: ${status}`
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Changes the voice transcription mode
     */
    async _setVoiceMode(mode: any) {
        try {
            const configPath = join(__dirname, '..', '..', 'config', 'config.json');
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));

            // If "status", just return the current mode
            if (mode === 'status') {
                const currentMode = config.voice_transcription?.mode || 'restricted';
                return {
                    success: true,
                    message: `🎤 Current transcription mode: **${currentMode.toUpperCase()}**\n\n` +
                        `• *restricted*: Transcribes only voice notes replying to the bot\n` +
                        `• *full*: Transcribes all voice notes (checks for bot name)`
                };
            }

            // Validate mode
            if (!['restricted', 'full'].includes(mode)) {
                return {
                    success: false,
                    message: `Invalid mode. Use: .voice restricted | .voice full | .voice status`
                };
            }

            // Update config
            if (!config.voice_transcription) {
                config.voice_transcription = {};
            }
            config.voice_transcription.mode = mode;

            writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');

            return {
                success: true,
                message: `✅ Transcription mode changed: **${mode.toUpperCase()}**\n` +
                    (mode === 'restricted'
                        ? `Voice notes will be transcribed only if they reply to the bot.`
                        : `All voice notes will be transcribed (if the bot name is mentioned).`)
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Changes audio permissions for a group
     * @param {string} permission - 'all' | 'admins_only' | 'none' | 'status'
     * @param {string} groupJid - Group JID
     * @param {boolean} isGroup - Is it a group?
     */
    async _setAudioPermission(permission: any, groupJid: any, isGroup: any) {
        try {
            // CHECK: This command only works in groups
            if (!isGroup) {
                return {
                    success: false,
                    message: `❌ This command only works in **groups**.\n\n` +
                        `To manage private chat audio, use:\n` +
                        `• \`.pv.audio.status\` - View status\n` +
                        `• \`.pv.audio.off\` - Disable (Global Admin)\n` +
                        `• \`.pv.audio.on\` - Enable (Global Admin)`
                };
            }

            // If it's a status request
            if (permission === 'status') {
                const currentPerm = await workingMemory.getAudioPermission(groupJid);
                const permLabels = {
                    'all': '🟢 Everyone can send voice notes',
                    'admins_only': '🟡 Only admins can send voice notes',
                    'none': '🔴 No one can send voice notes'
                };
                return {
                    success: true,
                    message: `🔊 **Audio Permissions (Group)**\n\n${permLabels[currentPerm] || permLabels['all']}\n\n` +
                        `Commands:\n` +
                        `• \`.mute.audio_for_none\` - Block non-admins\n` +
                        `• \`.mute.audio_for_all\` - Block everyone\n` +
                        `• \`.allow.audio_for_all\` - Allow everyone`
                };
            }

            // Apply permission
            await workingMemory.setAudioPermission(groupJid, permission);

            const permLabels = {
                'all': '🟢 Everyone can now send voice notes',
                'admins_only': '🟡 Only admins can now send transcribed voice notes',
                'none': '🔴 No one can send voice notes anymore (transcription disabled)'
            };

            return {
                success: true,
                message: `✅ Audio permission updated\n\n${permLabels[permission]}`
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Manages private chat audio (Global Admin Only)
     * @param {string} action - 'on' | 'off' | 'status'
     * @param {string} senderJid - Sender JID
     */
    async _setPvAudio(action: any, senderJid: any) {
        try {
            // Vérifier que c'est un Global Admin
            const isGlobalAdmin = await adminService.isGlobalAdmin(senderJid);

            if (action === 'status') {
                // Status is accessible to everyone
                const isDisabled = await workingMemory.isPvAudioDisabled();
                return {
                    success: true,
                    message: `🎤 **Private Chat Voice Notes**\n\n` +
                        `Status: ${isDisabled ? '🔴 DISABLED globally' : '🟢 ENABLED'}\n\n` +
                        `In private chats, voice notes are transcribed directly without mode restrictions.\n` +
                        (isGlobalAdmin
                            ? `\nGlobal Admin Commands:\n• \`.pv.audio.off\` - Disable\n• \`.pv.audio.on\` - Enable`
                            : `\n_(Only Global Admins can modify this setting)_`)
                };
            }

            // For on/off, must be Global Admin
            if (!isGlobalAdmin) {
                return {
                    success: false,
                    message: `❌ **Access denied**\n\nOnly **Global Admins** can enable/disable private chat voice notes.`
                };
            }

            const disable = action === 'off';
            await workingMemory.setPvAudioDisabled(disable);

            return {
                success: true,
                message: disable
                    ? `🔴 **Private Chat Voice Notes DISABLED**\n\nVoice notes in private messages will no longer be transcribed.`
                    : `🟢 **Private Chat Voice Notes ENABLED**\n\nVoice notes in private messages will be transcribed again.`
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Enables/disables anti-delete for a group
     * @param {string} action - 'on' | 'off' | 'status'
     * @param {string} chatId - Group JID
     */
    async _toggleAntiDelete(action: any, chatId: any) {
        try {
            if (action === 'status') {
                const isEnabled = await workingMemory.isAntiDeleteEnabled(chatId);
                return {
                    success: true,
                    message: `🗑️ **Anti-Delete**\n\n` +
                        `Status: ${isEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}\n\n` +
                        `When enabled, deleted messages are automatically reposted.\n\n` +
                        `• \`.antidelete on\` - Enable\n` +
                        `• \`.antidelete off\` - Disable\n` +
                        `• \`.deleted\` - View deleted messages`
                };
            }

            const enable = action === 'on';
            await workingMemory.setAntiDeleteEnabled(chatId, enable);

            return {
                success: true,
                message: enable
                    ? `✅ **Anti-Delete ENABLED**\n\nDeleted messages will be automatically reposted.`
                    : `✅ **Anti-Delete DISABLED**\n\nDeleted messages will no longer be reposted.`
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Displays recently deleted messages
     * @param {string} chatId - Group JID
     */
    async _showDeletedMessages(chatId: any) {
        try {
            const deletedMessages = await workingMemory.getDeletedMessages(chatId, 10);

            if (deletedMessages.length === 0) {
                return {
                    success: true,
                    message: `📋 No deleted messages recorded for this group.`
                };
            }

            const list = deletedMessages.map((m: any, i: any) => {
                const time = new Date(m.deletedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const text = m.text.length > 50 ? m.text.substring(0, 50) + '...' : m.text;
                return `${i + 1}. *${m.senderName}* (${time}):\n   "${text}"`;
            }).join('\n\n');

            return {
                success: true,
                message: `🗑️ **Recently Deleted Messages**\n\n${list}`
            };
        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    }
};
