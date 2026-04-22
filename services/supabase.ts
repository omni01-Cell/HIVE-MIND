/**
 * services/supabase.ts
 * Client Supabase pour la persistance cloud
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface AuthCredentials {
  supabase?: {
    project_url?: string;
    url?: string;
    service_role_key?: string;
    key?: string;
  };
}

// Charger les credentials
let credentials: AuthCredentials | null = null;
try {
  const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
  credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
} catch (error: any) {
  console.warn(`⚠️ Erreur lecture credentials: ${error.message}`);
  credentials = null;
}

let supabase: SupabaseClient | null = null;

let projUrl = credentials?.supabase?.project_url || credentials?.supabase?.url;
let projKey = credentials?.supabase?.service_role_key || credentials?.supabase?.key;

// Resolve Env Vars if needed
if (projUrl && process.env[projUrl]) projUrl = process.env[projUrl];
if (projKey && process.env[projKey]) projKey = process.env[projKey];

const DEFAULT_URL = 'https://VOTRE_PROJET.supabase.co';

if (projUrl && projUrl !== DEFAULT_URL) {
  supabase = createClient(projUrl, projKey!);
}

/**
 * Interface pour les statistiques de santé de la base de données
 */
export interface DbHealth {
  status: 'connected' | 'disconnected' | 'error';
  latency?: string;
  userCount?: number | null;
  error?: string;
}

/**
 * Utilitaires de base de données
 */
export const db = {
  /**
   * Instance brute du client Supabase
   */
  get client(): SupabaseClient | null {
    return supabase;
  },

  /**
   * Proxy vers le client pour compatibilité ascendante
   */
  from(table: string) {
    return supabase?.from(table);
  },

  /**
   * Proxy vers RPC
   */
  rpc(fn: string, args?: any) {
    return supabase?.rpc(fn, args);
  },

  /**
   * Vérifie si Supabase est disponible
   */
  isAvailable(): boolean {
    return supabase !== null;
  },

  /**
   * [EPISODIC MEMORY] Enregistre une action de l'agent
   */
  async logAction(
    chatId: string, 
    toolName: string, 
    params: any, 
    result: any, 
    isSuccess: boolean = true, 
    errorMessage: string | null = null
  ): Promise<void> {
    if (!supabase) return;

    try {
      await supabase.from('agent_actions').insert({
        chat_id: chatId,
        tool_name: toolName,
        params: params,
        result: result,
        status: isSuccess ? 'success' : 'error',
        error_message: errorMessage
      });
    } catch (e) {
      // Échec silencieux
    }
  },

  /**
   * Récupère la config avancée d'un groupe
   */
  async getGroupConfig(jid: string): Promise<any | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('group_configs')
      .select('*')
      .eq('group_jid', jid)
      .single();

    if (error && error.code !== 'PGRST116') {
      return null;
    }
    return data;
  },

  /**
   * Met à jour la config d'un groupe
   */
  async upsertGroupConfig(jid: string, config: any): Promise<any | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('group_configs')
      .upsert({
        group_jid: jid,
        ...config
      })
      .select()
      .single();

    if (error) console.error('[DB] Erreur upsertGroupConfig:', error);
    return data;
  },

  /**
   * Crée un nouveau rappel
   */
  async createReminder(chatId: string, message: string, remindAt: Date): Promise<any | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        chat_id: chatId,
        message: message,
        remind_at: remindAt.toISOString(),
        sent: false
      })
      .select()
      .single();

    if (error) {
      console.error('[DB] Erreur createReminder:', error);
      throw error;
    }
    return data;
  },

  /**
   * Récupère les rappels en attente
   */
  async getPendingReminders(): Promise<any[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('sent', false)
      .lte('remind_at', new Date().toISOString());

    if (error) console.error('[DB] Erreur getPendingReminders:', error);
    return data || [];
  },

  /**
   * Marque un rappel comme envoyé
   */
  async markReminderSent(reminderId: string | number): Promise<void> {
    if (!supabase) return;

    await supabase
      .from('reminders')
      .update({ sent: true })
      .eq('id', reminderId);
  },

  /**
   * Récupère le fondateur d'un groupe
   */
  async getGroupFounder(groupJid: string): Promise<string | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('groups')
      .select('founder_jid')
      .eq('jid', groupJid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Erreur getGroupFounder:', error);
    }
    return data?.founder_jid || null;
  },

  /**
   * Définit le fondateur d'un groupe
   */
  async setGroupFounder(groupJid: string, founderJid: string): Promise<any | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('groups')
      .update({ founder_jid: founderJid })
      .eq('jid', groupJid)
      .select()
      .single();

    if (error) console.error('[DB] Erreur setGroupFounder:', error);
    return data;
  },

  /**
   * Récupère l'historique d'un membre dans un groupe
   */
  async getMemberHistory(groupJid: string, userJid: string): Promise<any[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('group_member_history')
      .select('*')
      .eq('group_jid', groupJid)
      .eq('user_jid', userJid)
      .order('created_at', { ascending: false });

    if (error) console.error('[DB] Erreur getMemberHistory:', error);
    return data || [];
  },

  /**
   * Vérifie si un utilisateur a déjà quitté le groupe
   */
  async hasLeftBefore(groupJid: string, userJid: string): Promise<boolean> {
    const history = await this.getMemberHistory(groupJid, userJid);
    return history.some(event => event.action === 'remove');
  },

  /**
   * Vérifie l'état de santé de Supabase
   */
  async checkHealth(): Promise<DbHealth> {
    if (!supabase) {
      return { status: 'disconnected', error: 'Supabase client not initialized' };
    }
    try {
      const start = Date.now();
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      const latency = Date.now() - start;

      if (error) throw error;

      return {
        status: 'connected',
        latency: `${latency}ms`,
        userCount: count
      };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  }
};

export { supabase };
export default db;
