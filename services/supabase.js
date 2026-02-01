// services/supabase.js
// Client Supabase pour la persistance cloud

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les credentials
let credentials;
try {
    const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
    credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
} catch (error) {
    console.warn(`⚠️ Erreur lecture credentials: ${error.message}`);
    console.warn(`⚠️ Path tenté: ${join(__dirname, '..', 'config', 'credentials.json')}`);
    credentials = null;
}

// Créer le client Supabase
let supabase = null;

let projUrl = credentials?.supabase?.project_url || credentials?.supabase?.url;
let projKey = credentials?.supabase?.service_role_key || credentials?.supabase?.key;

// Resolve Env Vars if needed
if (projUrl && process.env[projUrl]) projUrl = process.env[projUrl];
if (projKey && process.env[projKey]) projKey = process.env[projKey];

if (projUrl && projUrl !== 'https://VOTRE_PROJET.supabase.co') {

    // IMPORTANT : Utiliser service_role_key pour contourner Row Level Security
    // Cela donne un accès complet administrateur à la base de données
    supabase = createClient(
        projUrl,
        projKey
    );

    // Connecté silencieusement
} else {
    // Supabase non configuré (silencieux)
}

/**
 * Utilitaires de base de données
 */
export const db = {
    /**
     * Instance brute du client Supabase
     */
    get client() {
        return supabase;
    },

    /**
     * Proxy vers le client pour compatibilité ascendante (db.from(...) -> db.client.from(...))
     */
    from(table) {
        return supabase?.from(table);
    },

    /**
     * Proxy vers RPC
     */
    rpc(fn, args) {
        return supabase?.rpc(fn, args);
    },

    /**
     * Vérifie si Supabase est disponible
     */
    isAvailable() {
        return supabase !== null;
    },


    // NOTE: upsertUser, getUser, incrementXP supprimés - utilisez userService à la place

    /**
     * Enregistre un log
     */
    async log(eventType, data = {}) {
        // Logs désactivés pour économiser la DB
        return;
    },

    /**
     * [EPISODIC MEMORY] Enregistre une action de l'agent
     */
    async logAction(chatId, toolName, params, result, isSuccess = true, errorMessage = null) {
        if (!supabase) return;

        // On ne log pas les actions de lecture (get_) pour ne pas polluer, sauf si pertinent
        // if (toolName.startsWith('get_')) return; 

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
            // Silencieux si la table n'existe pas encore
            // console.warn('[DB] Impossible de logger l\'action (Table manquante ?)');
        }
    },

    // NOTE: upsertGroup, getTask supprimés - utilisez groupService à la place

    /**
     * (Module 3) Récupère la config avancée d'un groupe
     */
    async getGroupConfig(jid) {
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
     * (Module 3) Met à jour la config d'un groupe
     */
    async upsertGroupConfig(jid, config) {
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('group_configs')
            .upsert({
                group_jid: jid,
                ...config
                // Note: updated_at géré automatiquement par trigger PostgreSQL
            })
            .select()
            .single();

        if (error) console.error('[DB] Erreur upsertGroupConfig:', error);
        return data;
    },

    /**
     * Crée un nouveau rappel
     */
    async createReminder(chatId, message, remindAt) {
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
    async getPendingReminders() {
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
    async markReminderSent(reminderId) {
        if (!supabase) return;

        await supabase
            .from('reminders')
            .update({ sent: true })
            .eq('id', reminderId);
    },

    /**
     * Récupère le fondateur d'un groupe
     */
    async getGroupFounder(groupJid) {
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
    async setGroupFounder(groupJid, founderJid) {
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('groups')
            .update({ founder_jid: founderJid })
            .eq('jid', groupJid)
            .select()
            .single();

        if (error) console.error('[DB] Erreur setGroupFounder:', error);
        return data;
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
    async hasLeftBefore(groupJid, userJid) {
        const history = await this.getMemberHistory(groupJid, userJid);
        // Si on trouve un 'remove' dans l'historique, l'utilisateur a déjà quitté
        return history.some(event => event.action === 'remove');
    },

    /**
     * Vérifie l'état de santé de Supabase
     * @returns {Promise<Object>} Status et métriques
     */
    async checkHealth() {
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
        } catch (e) {
            return { status: 'error', error: e.message };
        }
    }
};

export { supabase };
export default db;
