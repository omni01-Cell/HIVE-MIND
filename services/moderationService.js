import { supabase } from './supabase.js';
import { redis } from './redisClient.js';
import { workingMemory } from './workingMemory.js';

export class ModerationService {
    constructor(logger) {
        this.logger = logger || console;
        this.container = null;
    }

    setContainer(container) {
        this.container = container;
    }

    /**
     * Bannit un utilisateur d'un groupe
     */
    async banUser(chatId, userJid, reason, transport) {
        try {
            await transport.banUser(chatId, userJid);
            await this.logAction(chatId, userJid, 'ban', reason);
            return { success: true, userJid, reason };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur ban: ${error.message}`);
            throw error;
        }
    }

    /**
     * Expulse un utilisateur
     */
    async kickUser(chatId, userJid, reason, transport) {
        try {
            await transport.banUser(chatId, userJid); // Baileys uses same for kick/ban
            await this.logAction(chatId, userJid, 'remove', reason);
            return { success: true, userJid, reason };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur kick: ${error.message}`);
            throw error;
        }
    }

    /**
     * Mute un utilisateur
     */
    async muteUser(chatId, userJid, durationMinutes = 30) {
        try {
            await workingMemory.muteUser(chatId, userJid, durationMinutes);
            return { success: true, userJid, durationMinutes };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur mute: ${error.message}`);
            throw error;
        }
    }

    /**
     * Unmute un utilisateur
     */
    async unmuteUser(chatId, userJid) {
        try {
            const muteKey = `mute:${chatId}:${userJid}`;
            await redis.del(muteKey);
            return { success: true, userJid };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur unmute: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ajoute un avertissement (Warn)
     */
    async warnUser(chatId, userJid, reason, moderatorJid) {
        try {
            const { error } = await supabase
                .from('user_warnings')
                .insert({
                    group_jid: chatId,
                    user_jid: userJid,
                    reason: reason
                });

            if (error) throw error;
            
            const count = await this.getWarningCount(chatId, userJid);
            return { success: true, warnCount: count };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur warn: ${error.message}`);
            throw error;
        }
    }

    /**
     * Récupère le nombre de warnings d'un utilisateur
     */
    async getWarningCount(chatId, userJid) {
        const { count, error } = await supabase
            .from('user_warnings')
            .select('*', { count: 'exact', head: true })
            .eq('group_jid', chatId)
            .eq('user_jid', userJid);
        
        if (error) return 0;
        return count || 0;
    }

    /**
     * Réinitialise les warnings
     */
    async resetWarnings(chatId, userJid) {
        try {
            const { error } = await supabase
                .from('user_warnings')
                .delete()
                .eq('group_jid', chatId)
                .eq('user_jid', userJid);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur resetWarnings: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ajoute un filtre de mot-clé
     */
    async addFilter(chatId, keyword, severity = 'warn', rule = '', creator = null) {
        const { data, error } = await supabase
            .from('group_filters')
            .insert({
                group_jid: chatId,
                keyword: keyword,
                severity: severity,
                context_rule: rule,
                created_by: creator
            })
            .select();
        
        if (error) throw error;
        return data[0];
    }

    /**
     * Récupère les filtres d'un groupe
     */
    async getFilters(chatId) {
        const { data, error } = await supabase
            .from('group_filters')
            .select('*')
            .eq('group_jid', chatId);
        
        if (error) return [];
        return data;
    }

    /**
     * Whitelist d'un utilisateur
     */
    async addToWhitelist(chatId, userJid, addedBy = null) {
        const { error } = await supabase
            .from('group_whitelist')
            .upsert({
                group_jid: chatId,
                user_jid: userJid,
                added_by: addedBy
            });
        
        if (error) throw error;
        return true;
    }

    /**
     * Vérifie si un utilisateur est en whitelist
     */
    async isWhitelisted(chatId, userJid) {
        const { data, error } = await supabase
            .from('group_whitelist')
            .select('*')
            .eq('group_jid', chatId)
            .eq('user_jid', userJid)
            .maybeSingle();
        
        return !!data;
    }

    /**
     * Log une action dans l'historique
     */
    async logAction(chatId, userJid, action, reason = null) {
        await supabase
            .from('group_member_history')
            .insert({
                group_jid: chatId,
                user_jid: userJid,
                action: action
            });
    }

    /**
     * Verrouille/Déverrouille le groupe
     */
    async setGroupLock(chatId, locked, transport) {
        try {
            const setting = locked ? 'announcement' : 'not_announcement';
            await transport.updateGroupSetting(chatId, setting);
            return { success: true, locked };
        } catch (error) {
            this.logger.error(`[ModerationService] Erreur lock: ${error.message}`);
            throw error;
        }
    }
}

export const moderationService = new ModerationService();
