// @ts-nocheck
// services/adminService.js
// Service sécurisé pour les admins globaux (DTC Phase 1)
// Source de vérité: Supabase global_admins
// Cache RAM avec refresh automatique

import { supabase, default as db } from './supabase.js';

// Cache RAM pour vérification instantanée (0ms)
const adminCache = new Map(); // UUID -> Role ('owner', 'moderator')
let lastRefresh = 0;
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * Service d'administration globale
 */
export const adminService = {
    container: null,

    setContainer(container: any) {
        this.container = container;
    },

    get userService() {
        return this.container?.get('userService');
    },

    async init() {
        const initialRefresh = async () => {
            const success = await this.refresh();
            if (!success) {
                console.log('[AdminService] Retry refresh in 5s...');
                setTimeout(initialRefresh, 5000);
            }
        };
        await initialRefresh();

        setInterval(() => {
            this.refresh().catch(console.error);
        }, REFRESH_INTERVAL);
    },

    async refresh() {
        if (!supabase) return false;

        try {
            const { data, error } = await supabase
                .from('global_admins')
                .select('user_id, role');

            if (error) {
                console.error('[AdminService] Erreur refresh:', error);
                return false;
            }

            adminCache.clear();
            data.forEach((a: any) => adminCache.set(a.user_id, a.role || 'moderator'));
            lastRefresh = Date.now();
            return true;
        } catch (error: any) {
            console.error('[AdminService] Erreur refresh:', error.message);
            return false;
        }
    },

    async isGlobalAdmin(jid: any) {
        if (!jid) return false;

        let resolvedJid = jid;
        if (this.userService) {
            resolvedJid = await this.userService.resolveLid(jid) || jid;
        }

        const resolved = await db.resolveContextFromLegacyId(resolvedJid);
        if (!resolved || resolved.type !== 'user') return false;

        const role = adminCache.get(resolved.context_id);
        if (role) {
            console.log(`[AdminService] ✓ GlobalAdmin match: ${resolvedJid} ↔ UUID`);
        }
        return !!role;
    },

    async isSuperUser(jid: any) {
        if (!jid) return false;

        let resolvedJid = jid;
        if (this.userService) {
            resolvedJid = await this.userService.resolveLid(jid) || jid;
        }

        const resolved = await db.resolveContextFromLegacyId(resolvedJid);
        if (!resolved || resolved.type !== 'user') return false;

        const role = adminCache.get(resolved.context_id);
        if (role === 'owner') {
            console.log(`[AdminService] ✓ SuperUser match: ${resolvedJid} ↔ UUID`);
            return true;
        }
        return false;
    },

    async addAdmin(jid: any, name: any = null, role: any = 'moderator') {
        if (!supabase) return false;

        try {
            const resolved = await db.resolveContextFromLegacyId(jid);
            if (!resolved || resolved.type !== 'user') return false;

            // Optional: update user name if provided
            if (name) {
                await supabase.from('users').update({ username: name }).eq('id', resolved.context_id);
            }

            const { error } = await supabase
                .from('global_admins')
                .upsert({ user_id: resolved.context_id, role });

            if (error) {
                console.error('[AdminService] Erreur addAdmin:', error);
                return false;
            }

            adminCache.set(resolved.context_id, role);
            console.log(`[AdminService] Admin ajouté: ${jid}`);
            return true;

        } catch (error: any) {
            console.error('[AdminService] Erreur addAdmin:', error.message);
            return false;
        }
    },

    async removeAdmin(jid: any) {
        if (!supabase) return false;

        try {
            const resolved = await db.resolveContextFromLegacyId(jid);
            if (!resolved || resolved.type !== 'user') return false;

            const { error } = await supabase
                .from('global_admins')
                .delete()
                .eq('user_id', resolved.context_id);

            if (error) {
                console.error('[AdminService] Erreur removeAdmin:', error);
                return false;
            }

            adminCache.delete(resolved.context_id);
            console.log(`[AdminService] Admin retiré: ${jid}`);
            return true;

        } catch (error: any) {
            console.error('[AdminService] Erreur removeAdmin:', error.message);
            return false;
        }
    },

    async listAdmins() {
        if (!supabase) return [];

        try {
            // Join with users to get username
            const { data, error } = await supabase
                .from('global_admins')
                .select('*, users(username)')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[AdminService] Erreur listAdmins:', error);
                return [];
            }

            // Map to old format for compatibility if needed
            return (data || []).map((row: any) => ({
                id: row.id,
                user_id: row.user_id,
                name: row.users?.username || 'Unknown',
                role: row.role,
                created_at: row.created_at
            }));

        } catch (error: any) {
            console.error('[AdminService] Erreur listAdmins:', error.message);
            return [];
        }
    },

    getCacheSize() {
        return adminCache.size;
    },

    /**
     * Resolves the platform JID of the global admin with role='owner'.
     * WHY: Used by PermissionManager HITL to route permission requests
     * to the bot creator/deployer instead of a hardcoded env var.
     * This prevents a moderator-level global admin from self-approving
     * dangerous actions in groups that aren't theirs.
     */
    async getOwnerJid(): Promise<string | null> {
        if (!supabase) return null;

        // 1. Find the owner UUID from RAM cache (0ms)
        let ownerUserId: string | null = null;
        for (const [userId, role] of adminCache.entries()) {
            if (role === 'owner') {
                ownerUserId = userId;
                break;
            }
        }

        if (!ownerUserId) {
            console.warn('[AdminService] ⚠️ No owner found in global_admins cache');
            return null;
        }

        // 2. Reverse-resolve UUID → platform JID via user_identities
        try {
            const { data, error } = await supabase
                .from('user_identities')
                .select('platform_user_id')
                .eq('user_id', ownerUserId)
                .limit(1)
                .single();

            if (error || !data) {
                console.warn('[AdminService] ⚠️ Could not resolve owner JID from UUID:', ownerUserId);
                return null;
            }

            return data.platform_user_id;
        } catch (e: any) {
            console.error('[AdminService] ❌ Error resolving owner JID:', e.message);
            return null;
        }
    }
};

export default adminService;
