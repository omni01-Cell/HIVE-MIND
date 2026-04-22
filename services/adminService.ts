// @ts-nocheck
// services/adminService.js
// Service sécurisé pour les admins globaux (DTC Phase 1)
// Source de vérité: Supabase global_admins
// Cache RAM avec refresh automatique

import { supabase } from './supabase.js';
import { findInJidMap } from '../utils/jidHelper.js';
// import { userService } from './userService.js'; // REMOVED FOR DI

// Cache RAM pour vérification instantanée (0ms)
let adminCache = new Map(); // JID -> Role ('owner', 'moderator')
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
    /**
     * Initialise et charge les admins depuis Supabase
     * Appelé au démarrage du bot
     */
    async init() {
        await this.refresh();

        // Auto-refresh périodique
        setInterval(() => {
            this.refresh().catch(console.error);
        }, REFRESH_INTERVAL);

        // Initialisé silencieusement
    },

    /**
     * Rafraîchit le cache des admins depuis Supabase
     */
    async refresh() {
        if (!supabase) {
            console.warn('[AdminService] Supabase non disponible, cache vide');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('global_admins')
                .select('jid, role');

            if (error) {
                console.error('[AdminService] Erreur refresh:', error);
                return;
            }

            adminCache.clear();
            data.forEach((a: any) => adminCache.set(a.jid, a.role || 'moderator'));
            lastRefresh = Date.now();

            // Cache rafraîchi silencieusement

        } catch (error: any) {
            console.error('[AdminService] Erreur refresh:', error.message);
        }
    },

    /**
     * Vérifie si un JID est admin global (supporte LID et JID via jidHelper)
     * @param {string} jid 
     * @returns {boolean}
     */
    async isGlobalAdmin(jid: any) {
        // 1. Résoudre l'identité (LID -> JID)
        let resolvedJid = jid;
        if (this.userService) {
            resolvedJid = await this.userService.resolveLid(jid);
        }

        const found = findInJidMap(resolvedJid, adminCache);
        if (found) {
            console.log(`[AdminService] ✓ GlobalAdmin match: ${resolvedJid} ↔ ${found.key}`);
        }
        return found !== null;
    },

    /**
     * Vérifie si un JID est Super User (Owner)
     * @param {string} jid 
     * @returns {boolean}
     */
    async isSuperUser(jid: any) {
        // 1. Résoudre l'identité (LID -> JID)
        let resolvedJid = jid;
        if (this.userService) {
            resolvedJid = await this.userService.resolveLid(jid);
        }

        const found = findInJidMap(resolvedJid, adminCache);
        if (found?.value === 'owner') {
            console.log(`[AdminService] ✓ SuperUser match: ${resolvedJid} ↔ ${found.key}`);
            return true;
        }
        return false;
    },

    /**
     * Ajoute un admin global
     * @param {string} jid 
     * @param {string} name 
     * @param {string} role - 'owner' ou 'moderator'
     */
    async addAdmin(jid: any, name: any = null, role: any = 'moderator') {
        if (!supabase) return false;

        try {
            const { error } = await supabase
                .from('global_admins')
                .insert({ jid, name, role });

            if (error) {
                console.error('[AdminService] Erreur addAdmin:', error);
                return false;
            }

            // Mettre à jour le cache local
            adminCache.set(jid, role);
            console.log(`[AdminService] Admin ajouté: ${jid}`);
            return true;

        } catch (error: any) {
            console.error('[AdminService] Erreur addAdmin:', error.message);
            return false;
        }
    },

    /**
     * Retire un admin global
     * @param {string} jid 
     */
    async removeAdmin(jid: any) {
        if (!supabase) return false;

        try {
            const { error } = await supabase
                .from('global_admins')
                .delete()
                .eq('jid', jid);

            if (error) {
                console.error('[AdminService] Erreur removeAdmin:', error);
                return false;
            }

            // Mettre à jour le cache local
            adminCache.delete(jid);
            console.log(`[AdminService] Admin retiré: ${jid}`);
            return true;

        } catch (error: any) {
            console.error('[AdminService] Erreur removeAdmin:', error.message);
            return false;
        }
    },

    /**
     * Liste tous les admins globaux
     * @returns {Promise<Array>}
     */
    async listAdmins() {
        if (!supabase) return [];

        try {
            const { data, error } = await supabase
                .from('global_admins')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[AdminService] Erreur listAdmins:', error);
                return [];
            }

            return data || [];

        } catch (error: any) {
            console.error('[AdminService] Erreur listAdmins:', error.message);
            return [];
        }
    },

    /**
     * Retourne la taille du cache (pour debug)
     */
    getCacheSize() {
        return adminCache.size;
    }
};

export default adminService;
