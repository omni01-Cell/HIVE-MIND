/**
 * services/adminService.ts
 * Service sécurisé pour les admins globaux
 * Source de vérité: Supabase global_admins
 */

import { supabase } from './supabase.js';
import { findInJidMap } from '../utils/jidHelper.js';

export type AdminRole = 'owner' | 'moderator';

export interface AdminEntry {
  jid: string;
  name?: string | null;
  role: AdminRole;
}

/**
 * Service d'administration globale
 */
export const adminService = {
  private_cache: new Map<string, AdminRole>(),
  private_lastRefresh: 0,
  private_REFRESH_INTERVAL: 10 * 60 * 1000, // 10 minutes
  container: null as any,

  setContainer(container: any): void {
    this.container = container;
  },

  get userService() {
    return this.container?.get('userService');
  },

  /**
   * Initialise et charge les admins
   */
  async init(): Promise<void> {
    await this.refresh();

    setInterval(() => {
      this.refresh().catch(console.error);
    }, this.private_REFRESH_INTERVAL);
  },

  /**
   * Rafraîchit le cache des admins depuis Supabase
   */
  async refresh(): Promise<void> {
    if (!supabase) {
      console.warn('[AdminService] Supabase non disponible');
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

      this.private_cache.clear();
      data?.forEach((a: any) => this.private_cache.set(a.jid, (a.role as AdminRole) || 'moderator'));
      this.private_lastRefresh = Date.now();
    } catch (error: any) {
      console.error('[AdminService] Erreur refresh:', error.message);
    }
  },

  /**
   * Vérifie si un JID est admin global
   */
  async isGlobalAdmin(jid: string): Promise<boolean> {
    let resolvedJid = jid;
    if (this.userService) {
      resolvedJid = await this.userService.resolveLid(jid) || jid;
    }

    const found = findInJidMap(resolvedJid, this.private_cache);
    return found !== null;
  },

  /**
   * Vérifie si un JID est Super User (Owner)
   */
  async isSuperUser(jid: string): Promise<boolean> {
    let resolvedJid = jid;
    if (this.userService) {
      resolvedJid = await this.userService.resolveLid(jid) || jid;
    }

    const found = findInJidMap(resolvedJid, this.private_cache);
    return found?.value === 'owner';
  },

  /**
   * Ajoute un admin global
   */
  async addAdmin(jid: string, name: string | null = null, role: AdminRole = 'moderator'): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('global_admins')
        .insert({ jid, name, role });

      if (error) {
        console.error('[AdminService] Erreur addAdmin:', error);
        return false;
      }

      this.private_cache.set(jid, role);
      return true;
    } catch (error: any) {
      console.error('[AdminService] Erreur addAdmin:', error.message);
      return false;
    }
  },

  /**
   * Retire un admin global
   */
  async removeAdmin(jid: string): Promise<boolean> {
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

      this.private_cache.delete(jid);
      return true;
    } catch (error: any) {
      console.error('[AdminService] Erreur removeAdmin:', error.message);
      return false;
    }
  },

  /**
   * Liste tous les admins globaux
   */
  async listAdmins(): Promise<AdminEntry[]> {
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

      return (data || []) as AdminEntry[];
    } catch (error: any) {
      console.error('[AdminService] Erreur listAdmins:', error.message);
      return [];
    }
  },

  /**
   * Retourne la taille du cache
   */
  getCacheSize(): number {
    return this.private_cache.size;
  }
};

export default adminService;
