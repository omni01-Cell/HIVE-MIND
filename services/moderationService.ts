// @ts-nocheck
import { supabase } from './supabase.js';
import { redis } from './redisClient.js';
import { workingMemory } from './workingMemory.js';

export class ModerationService {
    logger: any;
    container: any;

    constructor(logger) {
        this.logger = logger || console;
        this.container = null;
    }

    setContainer(container: any) {
        this.container = container;
    }

    /**
     * Bannit un utilisateur d'un groupe
     */
    async banUser(chatId: any, userJid: any, reason: any, transport: any) {
        try {
            await transport.banUser(chatId, userJid);
            await this.logAction(chatId, userJid, 'ban', reason);
            return { success: true, userJid, reason };
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur ban: ${error.message}`);
            throw error;
        }
    }

    /**
     * Expulse un utilisateur
     */
    async kickUser(chatId: any, userJid: any, reason: any, transport: any) {
        try {
            await transport.banUser(chatId, userJid); // Baileys uses same for kick/ban
            await this.logAction(chatId, userJid, 'remove', reason);
            return { success: true, userJid, reason };
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur kick: ${error.message}`);
            throw error;
        }
    }

    /**
     * Mute un utilisateur
     */
    async muteUser(chatId: any, userJid: any, durationMinutes: any = 30) {
        try {
            await workingMemory.muteUser(chatId, userJid, durationMinutes);
            return { success: true, userJid, durationMinutes };
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur mute: ${error.message}`);
            throw error;
        }
    }

    /**
     * Unmute un utilisateur
     */
    async unmuteUser(chatId: any, userJid: any) {
        try {
            const muteKey = `mute:${chatId}:${userJid}`;
            await redis.del(muteKey);
            return { success: true, userJid };
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur unmute: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ajoute un avertissement (Warn)
     */
    async warnUser(chatId: any, userJid: any, reason: any, moderatorJid: any) {
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
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur warn: ${error.message}`);
            throw error;
        }
    }

    /**
     * Récupère le nombre de warnings d'un utilisateur
     */
    async getWarningCount(chatId: any, userJid: any) {
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
    async resetWarnings(chatId: any, userJid: any) {
        try {
            const { error } = await supabase
                .from('user_warnings')
                .delete()
                .eq('group_jid', chatId)
                .eq('user_jid', userJid);

            if (error) throw error;
            return { success: true };
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur resetWarnings: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ajoute un filtre de mot-clé
     */
    async addFilter(chatId: any, keyword: any, severity: any = 'warn', rule: any = '', creator: any = null) {
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
    async getFilters(chatId: any) {
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
    async addToWhitelist(chatId: any, userJid: any, addedBy: any = null) {
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
    async isWhitelisted(chatId: any, userJid: any) {
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
    async logAction(chatId: any, userJid: any, action: any, reason: any = null) {
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
    async setGroupLock(chatId: any, locked: any, transport: any) {
        try {
            const setting = locked ? 'announcement' : 'not_announcement';
            await transport.updateGroupSetting(chatId, setting);
            return { success: true, locked };
        } catch (error: any) {
            this.logger.error(`[ModerationService] Erreur lock: ${error.message}`);
            throw error;
        }
    }
}

export const moderationService = new ModerationService();
