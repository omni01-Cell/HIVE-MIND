// @ts-nocheck
// plugins/group_manager/database.ts
// Interface Supabase pour la gestion des configurations de groupe (Omni-Channel Ready)

import db, { supabase } from '../../../services/supabase.js';

/**
 * Helper: Resolve group UUID from legacy JID
 */
async function getGroupId(groupJid: string): Promise<string> {
    const resolved = await db.resolveContextFromLegacyId(groupJid);
    if (!resolved || resolved.type !== 'group') throw new Error(`Group not found for JID: ${groupJid}`);
    return resolved.context_id;
}

/**
 * Helper: Resolve user UUID from legacy JID
 */
async function getUserId(userJid: string): Promise<string> {
    const resolved = await db.resolveContextFromLegacyId(userJid);
    if (!resolved || resolved.type !== 'user') throw new Error(`User not found for JID: ${userJid}`);
    return resolved.context_id;
}

/**
 * Gestion des filtres de groupe
 */
export const filterDB = {
    async addFilter(groupJid: any, keyword: any, contextRule: any, severity: any = 'warn', createdBy: any) {
        if (!supabase) throw new Error("Supabase non connecté");
        const groupId = await getGroupId(groupJid);
        const creatorId = createdBy ? await getUserId(createdBy) : null;

        const { data, error } = await supabase
            .from('group_filters')
            .insert({
                group_id: groupId,
                keyword: keyword.toLowerCase(),
                context_rule: contextRule,
                severity,
                created_by: creatorId
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getFilters(groupJid: any) {
        if (!supabase) return [];
        const groupId = await getGroupId(groupJid);

        const { data, error } = await supabase
            .from('group_filters')
            .select('*')
            .eq('group_id', groupId);

        if (error) throw error;
        return data || [];
    },

    async removeFilter(filterId: any) {
        if (!supabase) throw new Error("Supabase non connecté");

        const { error } = await supabase
            .from('group_filters')
            .delete()
            .eq('id', filterId);

        if (error) throw error;
        return true;
    },

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
    async add(groupJid: any, userJid: any, addedBy: any, reason: any = '') {
        if (!supabase) throw new Error("Supabase non connecté");
        const groupId = await getGroupId(groupJid);
        const userId = await getUserId(userJid);
        const addedById = addedBy ? await getUserId(addedBy) : null;

        const { error } = await supabase
            .from('group_whitelist')
            .upsert({
                group_id: groupId,
                user_id: userId,
                added_by: addedById,
                reason
            });

        if (error) throw error;
        return true;
    },

    async isWhitelisted(groupJid: any, userJid: any) {
        if (!supabase) return false;
        try {
            const groupId = await getGroupId(groupJid);
            const userId = await getUserId(userJid);

            const { data, error } = await supabase
                .from('group_whitelist')
                .select('user_id')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        } catch (e) {
            return false;
        }
    },

    async remove(groupJid: any, userJid: any) {
        if (!supabase) throw new Error("Supabase non connecté");
        const groupId = await getGroupId(groupJid);
        const userId = await getUserId(userJid);

        const { error } = await supabase
            .from('group_whitelist')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', userId);

        if (error) throw error;
        return true;
    }
};

/**
 * Gestion des warnings
 */
export const warningsDB = {
    async add(groupJid: any, userJid: any, reason: any, filterId: any = null) {
        if (!supabase) throw new Error("Supabase non connecté");
        const groupId = await getGroupId(groupJid);
        const userId = await getUserId(userJid);

        const { error } = await supabase
            .from('user_warnings')
            .insert({
                group_id: groupId,
                user_id: userId,
                reason,
                filter_id: filterId
            });

        if (error) throw error;
        return true;
    },

    async count(groupJid: any, userJid: any) {
        if (!supabase) return 0;
        try {
            const groupId = await getGroupId(groupJid);
            const userId = await getUserId(userJid);

            const { data, error } = await supabase
                .rpc('count_user_warnings', {
                    p_group_id: groupId,
                    p_user_id: userId,
                    p_days: 30
                });

            if (error) {
                console.error('[GroupManager] Erreur count warnings:', error);
                return 0;
            }
            return data || 0;
        } catch (e) {
            return 0;
        }
    },

    async reset(groupJid: any, userJid: any) {
        if (!supabase) throw new Error("Supabase non connecté");
        const groupId = await getGroupId(groupJid);
        const userId = await getUserId(userJid);

        const { error } = await supabase
            .from('user_warnings')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', userId);

        if (error) throw error;
        return true;
    }
};

/**
 * Gestion des configs de groupe
 */
export const configDB = {
    async get(groupJid: any) {
        if (!supabase) return null;
        try {
            const groupId = await getGroupId(groupJid);

            const { data, error } = await supabase
                .from('group_configs')
                .select('*')
                .eq('group_id', groupId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } catch (e) {
            return null;
        }
    },

    async update(groupJid: any, updates: any) {
        if (!supabase) throw new Error("Supabase non connecté");
        const groupId = await getGroupId(groupJid);

        const { error } = await supabase
            .from('group_configs')
            .upsert({
                group_id: groupId,
                ...updates,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        return true;
    },

    async setFilteringActive(groupJid: any, active: any) {
        return this.update(groupJid, { is_filtering_active: active });
    },

    async setWarningLimit(groupJid: any, limit: any) {
        return this.update(groupJid, { warning_limit: limit });
    },

    async setAutoBan(groupJid: any, enabled: any) {
        return this.update(groupJid, { auto_ban: enabled });
    }
};

export default { filterDB, whitelistDB, warningsDB, configDB };
