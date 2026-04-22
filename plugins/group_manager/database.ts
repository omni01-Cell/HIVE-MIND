// @ts-nocheck
// plugins/group_manager/database.js
// Interface Supabase pour la gestion des configurations de groupe

import { supabase } from '../../services/supabase.js';

/**
 * Gestion des filtres de groupe
 */
export const filterDB = {
    /**
     * Ajoute un filtre à un groupe
     */
    async addFilter(groupJid: any, keyword: any, contextRule: any, severity: any = 'warn', createdBy: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { data, error } = await supabase
            .from('group_filters')
            .insert({
                group_jid: groupJid,
                keyword: keyword.toLowerCase(),
                context_rule: contextRule,
                severity,
                created_by: createdBy
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Récupère tous les filtres d'un groupe
     */
    async getFilters(groupJid: any) {
        if (!supabase) return [];

        const { data, error } = await supabase
            .from('group_filters')
            .select('*')
            .eq('group_jid', groupJid);

        if (error) throw error;
        return data || [];
    },

    /**
     * Supprime un filtre par ID
     */
    async removeFilter(filterId: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('group_filters')
            .delete()
            .eq('id', filterId);

        if (error) throw error;
        return true;
    },

    /**
     * Met à jour les variantes regex d'un filtre
     */
    async updateVariants(filterId: any, variants: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('group_filters')
            .update({ regex_variants: variants })
            .eq('id', filterId);

        if (error) throw error;
        return true;
    }
};

/**
 * Gestion de la whitelist
 */
export const whitelistDB = {
    /**
     * Ajoute un utilisateur à la whitelist
     */
    async add(groupJid: any, userJid: any, addedBy: any, reason: any = '') {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('group_whitelist')
            .upsert({
                group_jid: groupJid,
                user_jid: userJid,
                added_by: addedBy,
                reason
            });

        if (error) throw error;
        return true;
    },

    /**
     * Vérifie si un utilisateur est whitelisté
     */
    async isWhitelisted(groupJid: any, userJid: any) {
        if (!supabase) return false;

        const { data, error } = await supabase
            .from('group_whitelist')
            .select('user_jid')
            .eq('group_jid', groupJid)
            .eq('user_jid', userJid)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return !!data;
    },

    /**
     * Retire un utilisateur de la whitelist
     */
    async remove(groupJid: any, userJid: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('group_whitelist')
            .delete()
            .eq('group_jid', groupJid)
            .eq('user_jid', userJid);

        if (error) throw error;
        return true;
    }
};

/**
 * Gestion des warnings
 */
export const warningsDB = {
    /**
     * Ajoute un warning
     */
    async add(groupJid: any, userJid: any, reason: any, filterId: any = null) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('user_warnings')
            .insert({
                group_jid: groupJid,
                user_jid: userJid,
                reason,
                filter_id: filterId
            });

        if (error) throw error;
        return true;
    },

    /**
     * Compte les warnings d'un utilisateur (30 derniers jours)
     */
    async count(groupJid: any, userJid: any) {
        if (!supabase) return 0;

        const { data, error } = await supabase
            .rpc('count_user_warnings', {
                p_group_jid: groupJid,
                p_user_jid: userJid,
                p_days: 30
            });

        if (error) {
            console.error('[GroupManager] Erreur count warnings:', error);
            return 0;
        }
        return data || 0;
    },

    /**
     * Réinitialise les warnings d'un utilisateur
     */
    async reset(groupJid: any, userJid: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('user_warnings')
            .delete()
            .eq('group_jid', groupJid)
            .eq('user_jid', userJid);

        if (error) throw error;
        return true;
    }
};

/**
 * Gestion des configs de groupe
 */
export const configDB = {
    /**
     * Récupère la config d'un groupe
     */
    async get(groupJid: any) {
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('group_configs')
            .select('*')
            .eq('group_jid', groupJid)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    /**
     * Met à jour la config d'un groupe
     */
    async update(groupJid: any, updates: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        // Assurer que le groupe existe pour satisfaire la clé étrangère
        await supabase
            .from('groups')
            .upsert({ jid: groupJid }, { onConflict: 'jid' });

        const { error } = await supabase
            .from('group_configs')
            .upsert({
                group_jid: groupJid,
                ...updates,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        return true;
    },

    /**
     * Active/désactive le filtrage
     */
    async setFilteringActive(groupJid: any, active: any) {
        return this.update(groupJid, { is_filtering_active: active });
    },

    /**
     * Configure la limite de warnings
     */
    async setWarningLimit(groupJid: any, limit: any) {
        return this.update(groupJid, { warning_limit: limit });
    },

    /**
     * Active/désactive l'auto-ban
     */
    async setAutoBan(groupJid: any, enabled: any) {
        return this.update(groupJid, { auto_ban: enabled });
    }
};

export default { filterDB, whitelistDB, warningsDB, configDB };
