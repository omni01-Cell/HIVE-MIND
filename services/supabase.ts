// services/supabase.ts
// Client Supabase pour la persistance cloud - Omni-Channel Ready

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les credentials
let credentials: any;
try {
    const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
    credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
} catch (error: any) {
    console.warn(`⚠️ Erreur lecture credentials: ${error.message}`);
    credentials = null;
}

// Créer le client Supabase
let supabase: any = null;

let projUrl = credentials?.supabase?.project_url || credentials?.supabase?.url;
let projKey = credentials?.supabase?.service_role_key || credentials?.supabase?.key;

// Resolve Env Vars if needed
if (projUrl && process.env[projUrl]) projUrl = process.env[projUrl];
if (projKey && process.env[projKey]) projKey = process.env[projKey];

// Direct fallback to common env vars if still empty
if (!projUrl) projUrl = process.env.SUPABASE_URL;
if (!projKey) projKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (projUrl && projUrl !== 'https://VOTRE_PROJET.supabase.co') {
    // IMPORTANT : Utiliser service_role_key pour contourner Row Level Security
    supabase = createClient(projUrl, projKey);
}

/**
 * Utilitaires de base de données
 */
export const db = {
    get client() {
        return supabase;
    },

    from(table: any) {
        return supabase?.from(table);
    },

    rpc(fn: any, args: any) {
        return supabase?.rpc(fn, args);
    },

    isAvailable() {
        return supabase !== null;
    },

    // =========================================================================
    // NOUVELLES MÉTHODES DE RÉSOLUTION D'IDENTITÉ (OMNI-CHANNEL)
    // =========================================================================

    /**
     * Resolves a unified User UUID from a platform specific ID
     */
    async resolveUser(platform: string, platformUserId: string, username?: string): Promise<string | null> {
        if (!supabase) return null;
        
        // 1. Cherche l'identité existante
        let { data: identity } = await supabase
            .from('user_identities')
            .select('user_id')
            .eq('platform', platform)
            .eq('platform_user_id', platformUserId)
            .single();

        if (identity) return identity.user_id;

        // 2. Si non trouvée, créer le Contact central (User)
        const { data: newUser, error: errUser } = await supabase
            .from('users')
            .insert({ username: username || platformUserId })
            .select()
            .single();

        if (errUser) { 
            console.error('[DB] Erreur création contact central:', errUser); 
            return null; 
        }

        // 3. Créer le lien d'identité
        const { error: errId } = await supabase
            .from('user_identities')
            .insert({ user_id: newUser.id, platform, platform_user_id: platformUserId });

        if (errId) { 
            console.error('[DB] Erreur création user_identity:', errId); 
            return null; 
        }

        return newUser.id;
    },

    /**
     * Resolves a unified Group UUID from a platform specific ID
     */
    async resolveGroup(platform: string, platformGroupId: string, name?: string): Promise<string | null> {
        if (!supabase) return null;
        
        let { data: group } = await supabase
            .from('groups')
            .select('id')
            .eq('platform', platform)
            .eq('platform_group_id', platformGroupId)
            .single();

        if (group) return group.id;

        const { data: newGroup, error } = await supabase
            .from('groups')
            .insert({ platform, platform_group_id: platformGroupId, name: name || platformGroupId })
            .select()
            .single();

        if (error) { 
            console.error('[DB] Erreur création groupe unifié:', error); 
            return null; 
        }
        return newGroup.id;
    },

    /**
     * Legacy JID resolver for backward compatibility
     * Déduit automatiquement la plateforme depuis le format du JID WhatsApp/Telegram/Discord
     */
    /**
     * Resolves a legacy JID from a context UUID
     */
    async resolveLegacyIdFromContext(contextId: string): Promise<string | null> {
        if (!supabase) return null;
        
        const { data: group } = await supabase.from('groups').select('platform_group_id').eq('id', contextId).maybeSingle();
        if (group) return group.platform_group_id;
        
        const { data: identity } = await supabase.from('user_identities').select('platform_user_id').eq('user_id', contextId).maybeSingle();
        if (identity) return identity.platform_user_id;
        
        return null;
    },

    /**
     * Legacy JID resolver for backward compatibility
     * Déduit automatiquement la plateforme depuis le format du JID WhatsApp/Telegram/Discord
     */
    async resolveContextFromLegacyId(legacyId: string): Promise<{ context_id: string, type: 'user'|'group' } | null> {
        if (!legacyId) return null;
        
        // Heuristiques de détection
        const isGroup = legacyId.includes('@g.us') || legacyId.includes('-') || legacyId.startsWith('chat_');
        let platform = 'cli';
        
        if (legacyId.includes('whatsapp.net') || legacyId.includes('@g.us')) {
            platform = 'whatsapp';
        } else if (legacyId.includes('discord')) {
            platform = 'discord';
        } else if (legacyId.includes('telegram')) {
            platform = 'telegram';
        }

        if (isGroup) {
            const id = await this.resolveGroup(platform, legacyId);
            return id ? { context_id: id, type: 'group' } : null;
        } else {
            const id = await this.resolveUser(platform, legacyId);
            return id ? { context_id: id, type: 'user' } : null;
        }
    },

    // =========================================================================
    // ADAPTATION DES FONCTIONS EXISTANTES (RETRO-COMPATIBLES)
    // =========================================================================

    /**
     * [EPISODIC MEMORY] Enregistre une action de l'agent
     */
    async logAction(chatId: any, toolName: any, params: any, result: any, isSuccess: any = true, errorMessage: any = null) {
        if (!supabase) return;
        const resolved = await this.resolveContextFromLegacyId(chatId);
        if (!resolved) return;

        try {
            await supabase.from('agent_actions').insert({
                context_id: resolved.context_id,
                tool_name: toolName,
                params: params,
                result: result,
                status: isSuccess ? 'success' : 'error',
                error_message: errorMessage
            });
        } catch (e: any) {
            // Silencieux si la table n'existe pas encore
        }
    },

    /**
     * Récupère la config avancée d'un groupe
     */
    async getGroupConfig(jid: any) {
        if (!supabase) return null;
        const resolved = await this.resolveContextFromLegacyId(jid);
        if (!resolved || resolved.type !== 'group') return null;

        const { data, error } = await supabase
            .from('group_configs')
            .select('*')
            .eq('group_id', resolved.context_id)
            .single();

        if (error && error.code !== 'PGRST116') {
            return null;
        }
        return data;
    },

    /**
     * Met à jour la config d'un groupe
     */
    async upsertGroupConfig(jid: any, config: any) {
        if (!supabase) return null;
        const resolved = await this.resolveContextFromLegacyId(jid);
        if (!resolved || resolved.type !== 'group') return null;

        const { data, error } = await supabase
            .from('group_configs')
            .upsert({
                group_id: resolved.context_id,
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
    async createReminder(chatId: any, message: any, remindAt: any) {
        if (!supabase) return null;
        const resolved = await this.resolveContextFromLegacyId(chatId);
        if (!resolved) return null;

        const { data, error } = await supabase
            .from('reminders')
            .insert({
                context_id: resolved.context_id,
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
    async markReminderSent(reminderId: any) {
        if (!supabase) return;

        await supabase
            .from('reminders')
            .update({ sent: true })
            .eq('id', reminderId);
    },

    /**
     * Reprogramme un rappel récurrent
     */
    async rescheduleReminder(reminderId: any, nextDate: any) {
        if (!supabase) return;

        await supabase
            .from('reminders')
            .update({ remind_at: nextDate.toISOString(), sent: false })
            .eq('id', reminderId);
    },

    async getGroupFounder(groupJid: any) {
        if (!supabase) return null;
        const resolved = await this.resolveContextFromLegacyId(groupJid);
        if (!resolved || resolved.type !== 'group') return null;

        const { data, error } = await supabase
            .from('groups')
            .select('founder_id')
            .eq('id', resolved.context_id)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('[DB] Erreur getGroupFounder:', error);
        }
        
        if (!data?.founder_id) return null;

        // On va chercher l'ID brut pour la rétrocompatibilité
        const { data: idData } = await supabase
            .from('user_identities')
            .select('platform_user_id')
            .eq('user_id', data.founder_id)
            .single();

        return idData?.platform_user_id || null;
    },

    /**
     * Définit le fondateur d'un groupe
     */
    async setGroupFounder(groupJid: any, founderJid: any) {
        if (!supabase) return null;
        const groupRes = await this.resolveContextFromLegacyId(groupJid);
        const founderRes = await this.resolveContextFromLegacyId(founderJid);
        
        if (!groupRes || !founderRes || groupRes.type !== 'group' || founderRes.type !== 'user') return null;

        const { data, error } = await supabase
            .from('groups')
            .update({ founder_id: founderRes.context_id })
            .eq('id', groupRes.context_id)
            .select()
            .single();

        if (error) console.error('[DB] Erreur setGroupFounder:', error);
        return data;
    },

    /**
     * Récupère l'historique d'un membre dans un groupe
     */
    async getMemberHistory(groupJid: any, userJid: any) {
        if (!supabase) return [];
        const groupRes = await this.resolveContextFromLegacyId(groupJid);
        const userRes = await this.resolveContextFromLegacyId(userJid);
        
        if (!groupRes || !userRes) return [];

        const { data, error } = await supabase
            .from('group_member_history')
            .select('*')
            .eq('group_id', groupRes.context_id)
            .eq('user_id', userRes.context_id)
            .order('created_at', { ascending: false });

        if (error) console.error('[DB] Erreur getMemberHistory:', error);
        return data || [];
    },

    /**
     * Vérifie si un utilisateur a déjà quitté le groupe
     */
    async hasLeftBefore(groupJid: any, userJid: any) {
        const history = await this.getMemberHistory(groupJid, userJid);
        return history.some((event: any) => event.action === 'remove');
    },

    /**
     * Vérifie l'état de santé de Supabase
     */
    async checkHealth() {
        if (!supabase) {
            return { status: 'disconnected', error: 'Supabase client not initialized' };
        }
        try {
            const start = Date.now();
            const { count, error } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .limit(1);

            if (error) throw error;
            return { status: 'connected', latency: `${Date.now() - start}ms`, userCount: count };
        } catch (e: any) {
            return { status: 'error', error: e.message };
        }
    }
};

export { supabase };
export default db;
