// @ts-nocheck
// plugins/group_manager/index.js
// Plugin Group Manager - Point d'entrée et commandes admin

import { filterDB, whitelistDB, warningsDB, configDB } from './database.js';
import { filterProcessor } from './processor.js';
import { providerRouter } from '../../../providers/index.js';
import { workingMemory } from '../../../services/workingMemory.js';
import { extractNumericId, jidMatch, formatForDisplay } from '../../../utils/jidHelper.js';

export default {
    name: 'group_manager',
    description: 'Gestion avancée des groupes : filtrage, warnings, bans automatiques.',
    version: '1.0.0',
    enabled: true,

    // Expose le processeur pour l'intégration dans le core
    processor: filterProcessor,

    // ========================================================================
    // TEXT MATCHERS : Patterns regex pour fallback textuel (découplage core)
    // ========================================================================
    textMatchers: [
        {
            // Pattern BAN: [ban:@xxx], ban @xxx, **ban**, etc.
            pattern: /\bban\b/i,
            handler: 'gm_ban_user',
            description: 'Bannir un utilisateur mentionné',
            extractArgs: (match, message, text) => {
                // On a besoin des mentions du message original
                const mentionedJids = message.mentionedJids || [];
                if (mentionedJids.length === 0) return null;

                // Filtrer les JIDs qui ne sont pas le bot
                const botId = message.botJid?.split(':')[0]?.split('@')[0];
                const targetJids = mentionedJids.filter((jid: any) => {
                    const id = jid.split('@')[0];
                    return id !== botId;
                });

                if (targetJids.length === 0) return null;
                return { user_jid: targetJids[0] };
            }
        },
        {
            // Pattern TAGALL: tagall, tag all, [tagall], tag:all
            pattern: /\[?tag[:\s_-]*all\]?/i,
            handler: 'gm_tagall',
            description: 'Taguer tous les membres du groupe',
            extractArgs: (match, message, text) => {
                // Extraire la raison après "tagall"
                const reasonMatch = text.match(/tag[:\s_-]*all[:\s]+(.+)/i);
                return { reason: reasonMatch?.[1]?.trim() || '' };
            }
        },
        {
            // Pattern ADD: [add:123456789]
            pattern: /\[add[:\s]+(\d+)\]/i,
            handler: 'gm_add_user',
            description: 'Ajouter un utilisateur par numéro de téléphone',
            extractArgs: (match: any) => {
                return { phone_number: match[1] };
            }
        }
    ],

    // Définitions des outils pour l'IA
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'gm_filter_add',
                description: 'Ajoute un filtre de mot-clé au groupe. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        keyword: {
                            type: 'string',
                            description: 'Le mot-clé à filtrer'
                        },
                        rule: {
                            type: 'string',
                            description: 'Règle de contexte (ex: "ban si sérieux, ok si humour")'
                        },
                        severity: {
                            type: 'string',
                            enum: ['warn', 'ban', 'kick', 'mute'],
                            description: 'Sévérité par défaut'
                        }
                    },
                    required: ['keyword']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_filter_list',
                description: 'Liste les filtres actifs du groupe.',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_filter_remove',
                description: 'Supprime un filtre par son numéro. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        filter_id: { type: 'integer', description: 'ID du filtre' }
                    },
                    required: ['filter_id']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_whitelist_add',
                description: 'Ajoute un utilisateur à la whitelist (exempté du filtrage). ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_config',
                description: 'Configure les paramètres du groupe (warnings, auto-ban). ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['enable', 'disable', 'set_warnings', 'auto_ban_on', 'auto_ban_off'],
                            description: 'Action de configuration'
                        },
                        value: {
                            type: 'integer',
                            description: 'Valeur (pour set_warnings)'
                        }
                    },
                    required: ['action']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_warnings_reset',
                description: 'Réinitialise les warnings d\'un utilisateur. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' }
                    },
                    required: ['user_jid']
                }
            }
        },
        // --- Merge de MODERATION ---
        {
            type: 'function',
            function: {
                name: 'gm_tagall',
                description: 'Mentionne tous les membres du groupe. BOT ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: { reason: { type: 'string', description: 'Raison (annonce, etc.)' } }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_ban_user',
                description: 'Bannit un utilisateur. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' },
                        reason: { type: 'string', description: 'Raison' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_add_user',
                description: 'Génère un lien d\'invitation pour ajouter un membre (Contournement limitation WhatsApp).',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_mute_user',
                description: 'Mute temporairement un utilisateur (le bot ignorera ses messages pendant X minutes). ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur à mute' },
                        duration: { type: 'integer', description: 'Durée en minutes (défaut: 30)' }
                    },
                    required: ['user_jid']
                }
            }
        },
        // --- INTÉGRATION groupService (Phase 2) ---
        {
            type: 'function',
            function: {
                name: 'gm_mission',
                description: 'Affiche la mission du bot dans ce groupe.',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_setmission',
                description: 'Définit la mission du bot dans ce groupe. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Titre de la mission (ex: Gestion communauté)' },
                        description: { type: 'string', description: 'Description détaillée de la mission du bot' }
                    },
                    required: ['title', 'description']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_mygroups',
                description: 'Liste tous les groupes où tu es admin.',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_groupstats',
                description: 'Affiche les statistiques du groupe actuel.',
                parameters: { type: 'object', properties: {} }
            }
        },
        // --- COMMANDES MANQUANTES (Ajoutées) ---
        {
            type: 'function',
            function: {
                name: 'gm_unmute_user',
                description: 'Retire le mute d\'un utilisateur. ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur à unmute' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_promote',
                description: 'Promeut un membre au rang d\'administrateur du groupe. BOT ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID du membre à promouvoir' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_demote',
                description: 'Retire les droits administrateur d\'un membre. BOT ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'admin à rétrograder' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_groupinfo',
                description: 'Affiche les informations détaillées du groupe (admins, membres, description).',
                parameters: { type: 'object', properties: {} }
            }
        },
        // --- ARSENAL SENTINELLE (Nouveaux Outils) ---
        {
            type: 'function',
            function: {
                name: 'gm_kick_user',
                description: 'Expulse un utilisateur (Kick simple sans ban DB). ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' },
                        reason: { type: 'string', description: 'Raison de l\'expulsion' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_warn_user',
                description: 'Donne un avertissement officiel à un utilisateur. (Auto-ban au 3ème). ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        user_jid: { type: 'string', description: 'JID de l\'utilisateur' },
                        reason: { type: 'string', description: 'Raison du warn' }
                    },
                    required: ['user_jid']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'gm_lock_group',
                description: 'Verrouille/Déverrouille le groupe (Seuls les admins peuvent parler). ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['lock', 'unlock'], description: 'lock = fermer, unlock = ouvrir' }
                    },
                    required: ['action']
                }
            }
        }
    ],

    /**
     * Exécute une commande du Group Manager
     */
    async execute(args: any, context: any, toolName: any) {
        const { transport, message, chatId, sender } = context;

        // Vérifier qu'on est dans un groupe
        if (!message.isGroup) {
            return { success: false, message: 'REFUSÉ: Commande réservée aux groupes.' };
        }

        // Vérifier que l'utilisateur est admin
        const isAdmin = await transport.isAdmin(chatId, sender);
        // Exception: tagall peut être utilisé par le bot s'il est admin, mais ici on exige que l'user soit admin
        if (!isAdmin && toolName !== 'gm_filter_list') {
            // Cas Spécial "Ghost Tag" : Si un non-admin essaie, on réagit juste avec ❌
            if (toolName === 'gm_tagall') {
                await transport.sendReaction(chatId, message.raw.key, '❌');
                return { success: false, message: 'REFUSÉ: TagAll réservé aux admins.', silent: true };
            }
            return { success: false, message: 'REFUSÉ: Seuls les admins peuvent utiliser ce module.' };
        }

        // Dispatcher selon la commande
        switch (toolName) {
            case 'gm_filter_add':
                return await this._addFilter(chatId, args, sender);

            case 'gm_filter_list':
                return await this._listFilters(chatId);

            case 'gm_filter_remove':
                return await this._removeFilter(chatId, args.filter_id);

            case 'gm_whitelist_add':
                return await this._addWhitelist(chatId, args, sender, message);

            case 'gm_config':
                return await this._configure(chatId, args);

            case 'gm_warnings_reset':
                return await this._resetWarnings(chatId, args, message);

            // --- NOUVELLES COMMANDES (Fusion Moderation) ---
            case 'gm_tagall':
                await transport.tagAll(chatId, args.reason);
                return { success: true, message: '📢 Tout le monde a été tagué.' };

            case 'gm_ban_user':
                return await this._banUser(chatId, args, message, transport);

            case 'gm_add_user':
                return await this._generateInvite(chatId, transport);

            case 'gm_mute_user':
                return await this._muteUser(chatId, args, message);


            // --- INTÉGRATION groupService (Phase 2) ---
            case 'gm_mission':
                return await this._getMission(chatId);

            case 'gm_setmission':
                return await this._setMission(chatId, args, sender);

            case 'gm_mygroups':
                return await this._listMyGroups(sender);

            case 'gm_groupstats':
                return await this._getGroupStats(chatId);

            // --- COMMANDES MANQUANTES (Ajoutées) ---
            case 'gm_unmute_user':
                return await this._unmuteUser(chatId, args, message);

            case 'gm_promote':
                return await this._promoteUser(chatId, args, message, transport);

            case 'gm_demote':
                return await this._demoteUser(chatId, args, message, transport);

            case 'gm_groupinfo':
                return await this._getGroupInfo(chatId, transport);

            // --- ARSENAL SENTINELLE ---
            case 'gm_kick_user':
                return await this._kickUser(chatId, args, message, transport);

            case 'gm_warn_user':
                return await this._warnUser(chatId, args, message);

            case 'gm_lock_group':
                return await this._lockGroup(chatId, args, transport);

            default:
                return { success: false, message: `Commande inconnue: ${toolName}` };
        }
    },

    /**
     * Ajoute un filtre
     */
    async _addFilter(groupJid: any, args: any, sender: any) {
        try {
            const filter = await filterDB.addFilter(
                groupJid,
                args.keyword,
                args.rule || 'Ban si sérieux, tolérer l\'humour',
                args.severity || 'warn',
                sender
            );

            // Générer des variantes automatiquement
            const variants = await filterProcessor.generateVariants(args.keyword);
            if (variants.length) {
                await filterDB.updateVariants(filter.id, variants);
            }

            // Invalider le cache
            filterProcessor.invalidateCache(groupJid);

            return {
                success: true,
                message: `✅ Filtre ajouté: "${args.keyword}" (${args.severity || 'warn'})\n` +
                    `Règle: ${args.rule || 'défaut'}\n` +
                    `Variantes générées: ${variants.length}`
            };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Liste les filtres
     */
    async _listFilters(groupJid: any) {
        try {
            const filters = await filterDB.getFilters(groupJid);
            const config = await configDB.get(groupJid);

            if (!filters.length) {
                return { success: true, message: '📋 Aucun filtre configuré.' };
            }

            const list = filters.map((f: any, i: any) =>
                `${i + 1}. **${f.keyword}** [${f.severity}]\n   └ ${f.context_rule || 'Règle par défaut'}`
            ).join('\n');

            const status = config?.is_filtering_active ? '🟢 ACTIF' : '🔴 INACTIF';

            return {
                success: true,
                message: `📋 **Filtres du groupe** ${status}\n\n${list}\n\n` +
                    `⚠️ Limite warnings: ${config?.warning_limit || 3}\n` +
                    `🔨 Auto-ban: ${config?.auto_ban ? 'Oui' : 'Non'}`
            };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Supprime un filtre
     */
    async _removeFilter(groupJid: any, filterId: any) {
        try {
            await filterDB.removeFilter(filterId);
            filterProcessor.invalidateCache(groupJid);
            return { success: true, message: `✅ Filtre #${filterId} supprimé.` };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Ajoute à la whitelist
     */
    async _addWhitelist(groupJid: any, args: any, sender: any, message: any) {
        // Utiliser la mention du message original si disponible
        let targetJid = args.user_jid;
        const mentions = message.mentionedJids || [];

        if (mentions.length > 0) {
            // Prendre le premier JID mentionné (hors bot)
            targetJid = mentions[0];
        }

        try {
            await whitelistDB.add(groupJid, targetJid, sender);
            // Récupérer le nom depuis le message ou fallback sur JID
            const username = this._getUsername(message.raw, targetJid) || targetJid.split('@')[0];
            return { success: true, message: `✅ @${username} ajouté à la whitelist.` };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Configure le groupe
     */
    async _configure(groupJid: any, args: any) {
        try {
            switch (args.action) {
                case 'enable':
                    await configDB.setFilteringActive(groupJid, true);
                    return { success: true, message: '🟢 Filtrage activé!' };

                case 'disable':
                    await configDB.setFilteringActive(groupJid, false);
                    return { success: true, message: '🔴 Filtrage désactivé.' };

                case 'set_warnings':
                    const limit = args.value || 3;
                    await configDB.setWarningLimit(groupJid, limit);
                    return { success: true, message: `⚠️ Limite de warnings: ${limit}` };

                case 'auto_ban_on':
                    await configDB.setAutoBan(groupJid, true);
                    return { success: true, message: '🔨 Auto-ban activé.' };

                case 'auto_ban_off':
                    await configDB.setAutoBan(groupJid, false);
                    return { success: true, message: '🔨 Auto-ban désactivé.' };

                default:
                    return { success: false, message: `Action inconnue: ${args.action}` };
            }
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Réinitialise les warnings
     */
    async _resetWarnings(groupJid: any, args: any, message: any) {
        let targetJid = args.user_jid;
        const mentions = message.mentionedJids || [];

        if (mentions.length > 0) {
            targetJid = mentions[0];
        }

        try {
            await warningsDB.reset(groupJid, targetJid);
            const username = this._getUsername(message.raw, targetJid) || targetJid.split('@')[0];
            return { success: true, message: `✅ Warnings de @${username} réinitialisés.` };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Bannit un utilisateur (Logique intelligente fusionnée)
     */
    async _banUser(chatId: any, args: any, message: any, transport: any) {
        // Import du service DB pour vérifier le fondateur
        const { db } = await import('../../../services/supabase.js');

        let targetJid = args.user_jid;
        const msgMentions = message.mentionedJids || [];

        console.log('[DEBUG Ban] Input participant:', targetJid);
        console.log('[DEBUG Ban] Participants du groupe:', msgMentions);

        // Récupérer les identifiants du bot via jidHelper
        const rawBotId = transport.sock?.user?.id;
        const rawBotLid = transport.sock?.user?.lid;
        const botPhoneId = extractNumericId(rawBotId);
        const botLidId = extractNumericId(rawBotLid);

        // Si l'IA n'a pas fourni de user_jid, on cherche dans les mentions
        if (!targetJid && msgMentions.length > 0) {
            // Filtrer pour exclure le bot des mentions via jidMatch
            const nonBotMentions = msgMentions.filter((jid: any) => {
                const isBot = jidMatch(jid, rawBotId) || jidMatch(jid, rawBotLid);
                console.log(`[DEBUG Ban] Checking ${extractNumericId(jid)}: isBot=${isBot}`);
                return !isBot;
            });

            if (nonBotMentions.length > 0) {
                targetJid = nonBotMentions[0];
                console.log('[DEBUG Ban] Target sélectionné depuis mentions:', targetJid);
            }
        }

        // Fallback: si user_jid existe déjà, vérifier qu'il contient le format JID
        if (targetJid && !targetJid.includes('@')) {
            // PHASE SOCIAL GRAPH: Résolution par nom si ce n'est pas un numéro
            const isNumeric = /^\d+$/.test(targetJid.replace(/[^0-9]/g, ''));

            if (!isNumeric && targetJid.length >= 2) {
                // C'est probablement un nom, essayer de résoudre via userService
                console.log(`[DEBUG Ban] Tentative de résolution du nom: "${targetJid}"`);
                const { userService } = await import('../../../services/userService.js');
                const resolvedJid = await userService.resolveToJid(targetJid, chatId);

                if (resolvedJid) {
                    console.log(`[DEBUG Ban] Nom résolu: "${targetJid}" → ${resolvedJid}`);
                    targetJid = resolvedJid;
                } else {
                    console.log(`[DEBUG Ban] Impossible de résoudre le nom: "${targetJid}"`);
                    return {
                        success: false,
                        message: `❌ Je ne connais pas "${targetJid}" dans ce groupe. Mentionnez-le avec @ ou vérifiez l'orthographe.`
                    };
                }
            } else {
                // C'est un numéro, formatter en JID
                targetJid = targetJid.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            }
        }

        // **PROTECTION ANTI SELF-BAN** via jidMatch
        if (targetJid) {
            const isBotTarget = jidMatch(targetJid, rawBotId) || jidMatch(targetJid, rawBotLid);

            if (isBotTarget) {
                console.log('[DEBUG Ban] ⚠️ Tentative de ban du bot détectée!');

                // Vérifier si l'utilisateur est le fondateur du groupe
                const founder = await db.getGroupFounder(chatId);
                const isFounder = founder && jidMatch(message.sender, founder);

                if (!isFounder) {
                    return {
                        success: false,
                        message: '🛡️ Je ne peux pas me bannir moi-même! Seul le fondateur du groupe peut me retirer.'
                    };
                }

                console.log('[DEBUG Ban] ✓ Fondateur autorisé à bannir le bot');
                // Le fondateur peut bannir le bot - on continue
            }
        }

        // Vérifier qu'on a bien un targetJid
        if (!targetJid) {
            return {
                success: false,
                message: '❌ Impossible d\'identifier l\'utilisateur à bannir. Mentionnez-le explicitement.'
            };
        }

        console.log(`[DEBUG Ban] Tentative de ban avec JID: ${targetJid}`);

        // GESTION DU DÉLAI (Delayed Ban)
        if (args.delay_minutes && args.delay_minutes > 0) {
            const delayMs = args.delay_minutes * 60 * 1000;
            const executionTime = new Date(Date.now() + delayMs);
            const username = this._getUsername(message.raw, targetJid) || targetJid.split('@')[0];

            // Créer un rappel spécial "COMMAND:BAN_USER"
            // Format du message: COMMAND:BAN_USER:{jid}|Raison
            const commandPayload = `COMMAND:BAN_USER:${targetJid}|${args.reason || 'Ban différé'}`;

            try {
                // On utilise db.createReminder (via supabase service)
                const { db } = await import('../../../services/supabase.js');
                await db.createReminder(chatId, commandPayload, executionTime);

                return {
                    success: true,
                    message: `⏳ **Ban planifié !**\n\n👤 Utilisateur: @${username}\n⏱️ Délai: ${args.delay_minutes} minute(s)\n📅 Exécution: ${executionTime.toLocaleTimeString()}`
                };
            } catch (err: any) {
                return { success: false, message: `Erreur planification ban: ${err.message}` };
            }
        }

        try {
            const moderation = transport.container.get('moderation');
            await moderation.banUser(chatId, targetJid, args.reason || 'Aucune', transport);
            // Récupérer le nom depuis le message ou fallback sur JID
            const username = this._getUsername(message.raw, targetJid) || targetJid.split('@')[0];
            return {
                success: true,
                message: `🚫 Utilisateur @${username} banni.\nRaison: ${args.reason || 'Aucune'}`
            };
        } catch (error: any) {
            console.error('[Ban] Erreur:', error);
            return { success: false, message: `Erreur ban: ${error.message}` };
        }

    },

    /**
     * Génère un lien d'invitation (Contournement limitation Add)
     */
    async _generateInvite(chatId: any, transport: any) {
        try {
            const code = await transport.sock.groupInviteCode(chatId);
            const link = `https://chat.whatsapp.com/${code}`;
            return {
                success: true,
                message: `🔗 Voici le lien d'invitation pour ajouter le membre :\n${link}`
            };
        } catch (error: any) {
            return { success: false, message: `Erreur génération lien: ${error.message}` };
        }
    },

    /**
     * Mute temporairement un utilisateur (le bot ignore ses messages)
     */
    async _muteUser(chatId: any, args: any, message: any) {
        let targetJid = args.user_jid;
        const mentions = message.mentionedJids || [];

        if (mentions.length > 0) {
            targetJid = mentions[0];
        }

        // PHASE SOCIAL GRAPH: Résolution par nom si nécessaire
        if (targetJid && !targetJid.includes('@')) {
            const isNumeric = /^\d+$/.test(targetJid.replace(/[^0-9]/g, ''));

            if (!isNumeric && targetJid.length >= 2) {
                console.log(`[DEBUG Mute] Tentative de résolution du nom: "${targetJid}"`);
                const { userService } = await import('../../../services/userService.js');
                const resolvedJid = await userService.resolveToJid(targetJid, chatId);

                if (resolvedJid) {
                    targetJid = resolvedJid;
                } else {
                    return {
                        success: false,
                        message: `❌ Je ne connais pas "${targetJid}" dans ce groupe.`
                    };
                }
            } else {
                targetJid = targetJid.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            }
        }

        if (!targetJid) {
            return {
                success: false,
                message: '❌ Mentionnez l\'utilisateur à mute.'
            };
        }

        const duration = args.duration || 30; // 30 minutes par défaut

        try {
            await workingMemory.muteUser(chatId, targetJid, duration);
            const username = this._getUsername(message.raw, targetJid) || targetJid.split('@')[0];
            return {
                success: true,
                message: `🔇 @${username} est mute pour ${duration} minutes.\nJe n'écouterai plus ses messages pendant ce temps.`
            };
        } catch (error: any) {
            return { success: false, message: `Erreur mute: ${error.message}` };
        }
    },

    /**
     * Parse les commandes textuelles .task
     * Appelé depuis le core pour les commandes directes
     */
    parseTextCommand(text: any) {
        if (!text.toLowerCase().startsWith('.task')) return null;

        const parts = text.trim().split(/\s+/);
        const cmd = parts[1]?.toLowerCase();
        const subCmd = parts[2]?.toLowerCase();

        // .task filter ...
        if (cmd === 'filter') {
            if (subCmd === 'add') {
                // Format: .task filter add "mot" | règle: "..."
                const content = parts.slice(3).join(' ');
                const [keywordPart, rulePart] = content.split('|').map((s: any) => s.trim());
                const keyword = keywordPart.replace(/["']/g, '');
                const rule = rulePart?.replace(/r[eè]gle:?\s*/i, '').replace(/["']/g, '');
                
                return { name: 'gm_filter_add', args: { keyword, rule } };
            }
            if (subCmd === 'list') return { name: 'gm_filter_list', args: {} };
        }

        // .task config ...
        if (cmd === 'config') {
            if (subCmd === 'warnings') {
                const value = parseInt(parts[3]);
                return { name: 'gm_config', args: { action: 'set_warnings', value: isNaN(value) ? 3 : value } };
            }
        }

        // .task enable/disable ...
        if (cmd === 'enable' || cmd === 'disable') {
            const isEnable = cmd === 'enable';
            if (subCmd === 'auto_ban') {
                return { name: 'gm_config', args: { action: isEnable ? 'auto_ban_on' : 'auto_ban_off' } };
            }
            if (!subCmd) {
                return { name: 'gm_config', args: { action: isEnable ? 'enable' : 'disable' } };
            }
        }

        // .task whitelist ...
        if (cmd === 'whitelist') return { name: 'gm_whitelist_add', args: {} };

        // .task ban @user [raison]
        if (cmd === 'ban') {
            return {
                name: 'gm_ban_user',
                args: {
                    user_jid: null,
                    reason: parts.slice(3).join(' ') || 'Commande .task'
                }
            };
        }

        // .task mute @user [durée]
        if (cmd === 'mute') {
            const possibleDuration = parseInt(parts[parts.length - 1]);
            const hasDuration = !isNaN(possibleDuration) && parts.length > 3;
            return {
                name: 'gm_mute_user',
                args: {
                    user_jid: null,
                    duration: hasDuration ? possibleDuration : 30
                }
            };
        }

        // .task unmute @user
        if (cmd === 'unmute') return { name: 'gm_unmute_user', args: { user_jid: null } };

        // .task tagall [raison]
        if (cmd === 'tagall') return { name: 'gm_tagall', args: { reason: parts.slice(2).join(' ') } };

        return null;
    },


    /**
     * Récupère le nom d'utilisateur depuis un message
     */
    _getUsername(rawMessage: any, targetJid: any) {
        // Essayer de récupérer le nom depuis le pushName des mentions
        const contextInfo = rawMessage?.message?.extendedTextMessage?.contextInfo;
        if (contextInfo?.mentionedJid?.includes(targetJid)) {
            // WhatsApp ne stocke pas directement les noms dans mentionedJid
            // On utilise le pushName si c'est le sender
            if (rawMessage.participant === targetJid || rawMessage.key?.participant === targetJid) {
                return rawMessage.pushName;
            }
        }
        // Fallback: retourner null pour utiliser le JID
        return null;
    },

    // ============================================================
    // INTÉGRATION groupService (Phase 2) - Nouvelles méthodes
    // ============================================================

    /**
     * Affiche la mission du bot dans ce groupe
     */
    async _getMission(groupJid: any) {
        try {
            const { groupService } = await import('../../../services/groupService.js');
            const missionData = await groupService.getBotMission(groupJid);

            if (missionData && missionData.description) {
                return {
                    success: true,
                    message: `🎯 **Mission du bot:**\n\n📌 **${missionData.title || 'Sans titre'}**\n📝 ${missionData.description}\n\n👤 *Défini par: @${missionData.author ? missionData.author.split('@')[0] : 'Inconnu'}*`
                };
            } else {
                return {
                    success: true,
                    message: '📋 Aucune mission définie pour ce groupe.\nUtilisez `définir ma mission` pour en créer une.'
                };
            }
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Définit la mission du bot dans ce groupe
     */
    async _setMission(chatId: any, args: any, sender: any) {
        if (!args.description?.trim()) {
            return { success: false, message: '❌ Veuillez spécifier une description.' };
        }

        try {
            const { groupService } = await import('../../../services/groupService.js');
            // Mettre à jour via le service
            await groupService.setBotMission(chatId, args.title, args.description, sender);

            const authorName = sender.split('@')[0];
            let message = `✅ **Mission mise à jour !**\n\n> Titre : ${args.title}\n> Auteur : @${authorName}\n> Desc : ${args.description}`;

            // --- ANALYSE ACTIONNABLE (Mission Actionable) ---
            // On lance l'analyse en arrière-plan (ou on attend, ici on attend pour le feedback)
            try {
                const analysisResult = await this._analyzeAndExecuteMission(chatId, args.description, context);
                if (analysisResult && analysisResult.length > 0) {
                    message += `\n\n🚀 **Actions déclenchées :**\n${analysisResult.map((r: any) => `- ${r}`).join('\n')}`;
                }
            } catch (anaError: any) {
                console.error('[GroupManager] Mission Analysis Error:', anaError);
            }

            return {
                success: true,
                message: message
            };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Analyse le texte de la mission et exécute les actions immédiates
     * @param {string} chatId 
     * @param {string} missionText 
     * @param {Object} context 
     */
    async _analyzeAndExecuteMission(chatId: any, missionText: any, context: any) {
        console.log(`[GroupManager] Analyse de la mission: "${missionText}"`);

        // 1. Demander à l'IA d'extraire les actions
        // On utilise le provider configuré pour l'intelligence (Kimi ou Gemini)

        const systemPrompt = `Tu es un assistant d'administration WhatsApp. Ta tâche est d'analyser une "Mission" donnée par un administrateur et de détecter s'il y a des actions IMMÉDIATES à exécuter.
        
        OUTILS DISPONIBLES :
        - gm_ban_user(user_jid): Bannir un utilisateur (JID complet requis ou @Tag)
        - gm_mute_user(user_jid, duration): Mute un utilisateur
        - gm_filter_add(keyword, severity): Ajouter un filtre anti-spam
        - gm_groupstats(): Voir les stats
        
        Si la mission contient des ordres clairs (ex: "Ban @12345", "Ajoute un filtre 'casino'"), génère un JSON structuré.
        Si la mission est juste descriptive (ex: "Accueillir les gens"), retourne JSON vide.
        
        FORMAT DE RÉPONSE ATTENDU (JSON PUR):
        {
          "actions": [
            { "tool": "gm_ban_user", "args": { "user_jid": "123456@s.whatsapp.net" } }
          ]
        }
        
        IMPORTANT:
        - Convertis les mentions ex: "@123" -> tente de deviner ou demande brut. L'utilisateur a le contexte.
        - Si tu ne peux pas résoudre un @Tag, ignore l'action.
        `;

        try {
            // providerRouter est déjà importé en haut du fichier
            const response = await providerRouter.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Mission: ${missionText}` }
            ], {
                temperature: 0, // Zéro créativité, pur logique
                jsonMode: true // Force JSON si supporté, sinon le prompt le demande
            });

            // Nettoyage Markdown JSON éventuel
            let cleanJson = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const plan = JSON.parse(cleanJson);

            const results = [];

            if (plan.actions && Array.isArray(plan.actions)) {
                console.log(`[GroupManager] ${plan.actions.length} actions détectées`);

                for (const action of plan.actions) {
                    // Sécurité : on limite aux outils 'gm_'
                    if (!action.tool.startsWith('gm_')) continue;

                    results.push(`Exécution : ${action.tool}...`);

                    // Exécuter via la méthode execute locale
                    // Attention: il faut que les args soient corrects
                    const res = await this.execute(action.args, context, action.tool);

                    if (res.success) {
                        results.push(`✓ ${action.tool}: Succès`);
                    } else {
                        results.push(`✗ ${action.tool}: ${res.message}`);
                    }
                }
            }

            return results;

        } catch (error: any) {
            console.error('[GroupManager] Erreur Analyse IA:', error);
            return [];
        }
    },

    /**
     * Liste tous les groupes où l'utilisateur est admin
     */
    async _listMyGroups(userJid: any) {
        try {
            const { groupService } = await import('../../../services/groupService.js');
            const groups = await groupService.getAdminGroups(userJid);

            if (!groups || groups.length === 0) {
                return {
                    success: true,
                    message: '📋 Tu n\'es admin dans aucun groupe (selon mes données).'
                };
            }

            // Récupérer les noms des groupes depuis Supabase
            const { supabase } = await import('../../../services/supabase.js');
            const { data: groupData } = await supabase
                .from('groups')
                .select('jid, name')
                .in('jid', groups);

            const groupMap = new Map((groupData || []).map((g: any) => [g.jid, g.name]));

            const list = groups.map((jid: any, i: any) => {
                const name = groupMap.get(jid) || jid.split('@')[0];
                return `${i + 1}. ${name}`;
            }).join('\n');

            return {
                success: true,
                message: `👑 **Groupes où tu es admin (${groups.length}):**\n\n${list}`
            };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    /**
     * Affiche les statistiques du groupe
     */
    async _getGroupStats(groupJid: any) {
        try {
            const { groupService } = await import('../../../services/groupService.js');
            const { supabase } = await import('../../../services/supabase.js');

            // Compter les admins
            const adminCount = await groupService.countAdmins(groupJid);

            // Récupérer les infos du groupe
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('name, bot_mission, founder_jid, created_at')
                .eq('jid', groupJid)
                .single();

            if (groupError) {
                console.error('[GroupStats] Erreur récupération groupe:', groupError.message);
            }

            // Compter les warnings actifs
            const { count: warningCount } = await supabase
                .from('user_warnings')
                .select('*', { count: 'exact', head: true })
                .eq('group_jid', groupJid);

            // Compter les filtres
            const { count: filterCount } = await supabase
                .from('group_filters')
                .select('*', { count: 'exact', head: true })
                .eq('group_jid', groupJid);

            // Auteur de la mission (stocké dans admins[0])
            const missionAuthor = group?.founder_jid;

            const stats = [
                `📊 **Statistiques du groupe**`,
                ``,
                `👥 Admins (Bot): ${adminCount}`,
                `⚠️ Warnings actifs: ${warningCount || 0}`,
                `🔍 Filtres configurés: ${filterCount || 0}`,
                ``,
                `📝 **Mission & Objectifs**`,
                `> Titre: ${group?.name || 'N/A'}`,
                `> Auteur: ${missionAuthor ? '@' + missionAuthor.split('@')[0] : 'Inconnu'}`,
                `> Desc: ${group?.bot_mission ? (group.bot_mission.length > 50 ? group.bot_mission.substring(0, 47) + '...' : group.bot_mission) : 'Non définie'}`
            ];

            if (group?.created_at) {
                const date = new Date(group.created_at).toLocaleDateString('fr-FR');
                stats.push(`📅 Créé le: ${date}`);
            }

            return {
                success: true,
                message: stats.join('\n')
            };
        } catch (error: any) {
            return { success: false, message: `Erreur: ${error.message}` };
        }
    },

    // =================================================================
    // COMMANDES MANQUANTES (Implémentations)
    // =================================================================

    /**
     * Retire le mute d'un utilisateur
     */
    async _unmuteUser(groupJid: any, args: any, message: any) {
        try {
            const { redis: redisClient } = await import('../../../services/redisClient.js');

            let targetJid = args.user_jid;
            if (!targetJid && message.quoted?.sender) {
                targetJid = message.quoted.sender;
            }
            if (!targetJid && message.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetJid = message.raw.message.extendedTextMessage.contextInfo.mentionedJid[0];
            }

            if (!targetJid) {
                return { success: false, message: '❌ Aucun utilisateur spécifié.' };
            }

            const muteKey = `mute:${groupJid}:${targetJid}`;

            if (!redisClient.isReady) {
                return { success: false, message: '❌ Redis non disponible.' };
            }

            const exists = await redisClient.exists(muteKey);
            if (!exists) {
                return { success: true, message: `🔊 ${targetJid.split('@')[0]} n'était pas mute (ou le mute a expiré).` };
            }

            await redisClient.del(muteKey);
            return { success: true, message: `🔊 ${targetJid.split('@')[0]} peut de nouveau parler.` };
        } catch (error: any) {
            return { success: false, message: `Erreur unmute: ${error.message}` };
        }
    },

    /**
     * Promeut un membre au rang d'administrateur
     */
    async _promoteUser(groupJid: any, args: any, message: any, transport: any) {
        try {
            let targetJid = args.user_jid;
            if (!targetJid && message.quoted?.sender) {
                targetJid = message.quoted.sender;
            }
            if (!targetJid && message.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetJid = message.raw.message.extendedTextMessage.contextInfo.mentionedJid[0];
            }

            if (!targetJid) {
                return { success: false, message: '❌ Aucun utilisateur spécifié.' };
            }

            await transport.sock.groupParticipantsUpdate(groupJid, [targetJid], 'promote');
            return { success: true, message: `👑 @${targetJid.split('@')[0]} est maintenant admin !` };
        } catch (error: any) {
            console.error('[GroupManager] Erreur promote:', error);
            return { success: false, message: `Erreur promotion: ${error.message}` };
        }
    },

    /**
     * Retire les droits administrateur d'un membre
     */
    async _demoteUser(groupJid: any, args: any, message: any, transport: any) {
        try {
            let targetJid = args.user_jid;
            if (!targetJid && message.quoted?.sender) {
                targetJid = message.quoted.sender;
            }
            if (!targetJid && message.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetJid = message.raw.message.extendedTextMessage.contextInfo.mentionedJid[0];
            }

            if (!targetJid) {
                return { success: false, message: '❌ Aucun utilisateur spécifié.' };
            }

            await transport.sock.groupParticipantsUpdate(groupJid, [targetJid], 'demote');
            return { success: true, message: `📉 @${targetJid.split('@')[0]} n'est plus admin.` };
        } catch (error: any) {
            console.error('[GroupManager] Erreur demote:', error);
            return { success: false, message: `Erreur rétrogradation: ${error.message}` };
        }
    },

    /**
     * Affiche les informations détaillées du groupe
     */
    async _getGroupInfo(groupJid: any, transport: any) {
        try {
            const metadata = await transport.sock.groupMetadata(groupJid);

            const admins = metadata.participants.filter((p: any) => p.admin).map((p: any) => `@${p.id.split('@')[0]}`);
            const memberCount = metadata.participants.length;

            const info = [
                `📋 **Infos Groupe**`,
                ``,
                `📛 Nom: ${metadata.subject}`,
                `📝 Description: ${metadata.desc || 'Aucune'}`,
                `👥 Membres: ${memberCount}`,
                `👑 Admins (${admins.length}): ${admins.slice(0, 5).join(', ')}${admins.length > 5 ? '...' : ''}`,
                `🔗 ID: ${groupJid}`
            ];

            if (metadata.creation) {
                const createdDate = new Date(metadata.creation * 1000).toLocaleDateString('fr-FR');
                info.push(`📅 Créé le: ${createdDate}`);
            }

            return { success: true, message: info.join('\n') };
        } catch (error: any) {
            console.error('[GroupManager] Erreur groupinfo:', error);
            return { success: false, message: `Erreur récupération infos: ${error.message}` };
        }
    },

    /**
     * Expulse un utilisateur (Kick simple)
     */
    async _kickUser(chatId: any, args: any, message: any, transport: any) {
        // Pour l'instant, Kick = Ban sans blacklist DB persistante (juste remove)
        // On réutilise la logique de résolution de JID de _banUser
        // Mais on change le message de retour
        const result = await this._banUser(chatId, args, message, transport);
        if (result.success) {
            return {
                success: true,
                message: `👢 **KICK** : Utilisateur expulsé (Simple expulsion).\nRaison: ${args.reason || 'Aucune'}`
            };
        }
        return result;
    },

    /**
     * Donne un avertissement
     */
    async _warnUser(chatId: any, args: any, message: any) {
        try {
            let targetJid = args.user_jid;
            // Résolution basique si manquant
            if (!targetJid && message.quoted?.sender) targetJid = message.quoted.sender;

            if (!targetJid) return { success: false, message: '❌ Cible introuvable.' };

            const { warningsDB, configDB } = await import('./database.js');

            // 1. Ajouter le warning
            const warnCount = await warningsDB.add(chatId, targetJid, args.reason || 'Comportement inadéquat', message.sender);

            // 2. Vérifier la limite
            const config = await configDB.get(chatId);
            const limit = config?.warning_limit || 3;

            let extraMsg = '';

            // 3. Auto-Ban si limite atteinte
            if (warnCount >= limit && config?.auto_ban) {
                // Nécessite transport pour bannir
                // On ne l'a pas ici directement sauf si on le passe. 
                // Pour simplifier, on retourne un message spécial que l'IA peut lire, ou on notifie juste.
                // Idéalement on devrait appeler this._banUser mais il nous faut 'transport'.
                extraMsg = `\n🚫 **LIMITE ATTEINTE (${warnCount}/${limit})** : L'utilisateur devrait être banni (Auto-ban).`;
                // Note: L'auto-ban réel est géré par le `processor.js` lors des filtres, ici c'est manuel.
                // On laisse l'IA décider de bannir ensuite si elle veut.
            }

            return {
                success: true,
                message: `⚠️ **AVERTISSEMENT** pour @${targetJid.split('@')[0]}\nNombre: ${warnCount}/${limit}\nRaison: ${args.reason || 'N/A'}${extraMsg}`
            };

        } catch (error: any) {
            return { success: false, message: `Erreur warn: ${error.message}` };
        }
    },

    /**
     * Verrouille/Déverrouille le groupe
     */
    async _lockGroup(chatId: any, args: any, transport: any) {
        try {
            const setting = args.action === 'lock' ? 'announcement' : 'not_announcement';
            await transport.updateGroupSetting(chatId, setting);

            const state = args.action === 'lock' ? '🔒 VERROUILLÉ' : '🔓 DÉVERROUILLÉ';
            const desc = args.action === 'lock' ? 'Seuls les admins peuvent parler.' : 'Tout le monde peut parler.';

            return {
                success: true,
                message: `Groupe ${state}\n${desc}`
            };
        } catch (error: any) {
            return { success: false, message: `Erreur lock/unlock: ${error.message}` };
        }
    }
};
