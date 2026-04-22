// @ts-nocheck
// services/agentMemory.js
// Mémoire épisodique des actions de l'agent
// Utilise la table Supabase agent_actions pour tracer et apprendre de chaque action

import { supabase } from './supabase.js';

/**
 * Service de mémoire épisodique
 * Enregistre toutes les actions de l'agent pour:
 * - Debugging et audit
 * - Apprentissage des erreurs (éviter répétition)
 * - Statistiques d'utilisation
 */
export const agentMemory = {
    /**
     * Log une action effectuée par l'agent
     * @param {string} chatId - ID du chat (groupe ou privé)
     * @param {string} toolName - Nom de l'outil appelé
     * @param {Object} params - Paramètres passés à l'outil
     * @param {Object} result - Résultat retourné
     * @param {'success'|'error'} status - Statut de l'exécution
     * @param {string|null} errorMessage - Message d'erreur si applicable
     */
    async logAction(chatId: any, toolName: any, params: any, result: any, status: any, errorMessage: any = null) {
        try {
            const { error } = await supabase
                .from('agent_actions')
                .insert({
                    chat_id: chatId,
                    tool_name: toolName,
                    params: params,
                    result: result,
                    status: status,
                    error_message: errorMessage
                });

            if (error) {
                console.warn('[AgentMemory] Erreur log action:', error.message);
            }
        } catch (e: any) {
            // Silently fail - logging should never break the main flow
            console.warn('[AgentMemory] Exception log:', e.message);
        }
    },

    /**
     * Récupère les dernières actions pour un chat (contexte)
     * @param {string} chatId 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async getRecentActions(chatId: any, limit: any = 5) {
        try {
            const { data, error } = await supabase
                .from('agent_actions')
                .select('tool_name, status, error_message, created_at')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (e: any) {
            console.warn('[AgentMemory] Erreur getRecentActions:', e.message);
            return [];
        }
    },

    /**
     * Vérifie si un outil a récemment échoué (évite répétition d'erreurs)
     * @param {string} chatId 
     * @param {string} toolName 
     * @param {number} withinMinutes - Fenêtre de temps en minutes
     * @returns {Promise<{hasFailure: boolean, errorMessage: string|null}>}
     */
    async hasRecentFailure(chatId: any, toolName: any, withinMinutes: any = 30) {
        try {
            const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

            const { data, error } = await supabase
                .from('agent_actions')
                .select('error_message')
                .eq('chat_id', chatId)
                .eq('tool_name', toolName)
                .eq('status', 'error')
                .gte('created_at', cutoff)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                return {
                    hasFailure: true,
                    errorMessage: data[0].error_message
                };
            }

            return { hasFailure: false, errorMessage: null };
        } catch (e: any) {
            console.warn('[AgentMemory] Erreur hasRecentFailure:', e.message);
            return { hasFailure: false, errorMessage: null };
        }
    },

    /**
     * Statistiques d'utilisation des outils pour un chat
     * @param {string} chatId 
     * @returns {Promise<Object>} - { toolName: { success: n, error: n } }
     */
    async getToolStats(chatId: any) {
        try {
            const { data, error } = await supabase
                .from('agent_actions')
                .select('tool_name, status')
                .eq('chat_id', chatId);

            if (error) throw error;

            const stats = {};
            for (const row of (data || [])) {
                if (!stats[row.tool_name]) {
                    stats[row.tool_name] = { success: 0, error: 0 };
                }
                stats[row.tool_name][row.status]++;
            }

            return stats;
        } catch (e: any) {
            console.warn('[AgentMemory] Erreur getToolStats:', e.message);
            return {};
        }
    },

    /**
     * Récupère les "leçons apprises" - les erreurs les plus fréquentes
     * Utile pour éviter de répéter les mêmes erreurs
     * @param {string} chatId 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async getLessonsLearned(chatId: any, limit: any = 3) {
        try {
            const { data, error } = await supabase
                .from('agent_actions')
                .select('tool_name, error_message, created_at')
                .eq('chat_id', chatId)
                .eq('status', 'error')
                .not('error_message', 'is', null)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return (data || []).map((d: any) => ({
                tool: d.tool_name,
                error: d.error_message,
                when: d.created_at
            }));
        } catch (e: any) {
            console.warn('[AgentMemory] Erreur getLessonsLearned:', e.message);
            return [];
        }
    },

    /**
     * Récupère les leçons apprises globales (tous les chats)
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async getGlobalLessonsLearned(limit: any = 10) {
        try {
            const { data, error } = await supabase
                .from('agent_actions')
                .select('tool_name, error_message, created_at')
                .eq('status', 'error')
                .not('error_message', 'is', null)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return (data || []).map((d: any) => ({
                tool: d.tool_name,
                error: d.error_message,
                when: d.created_at
            }));
        } catch (e: any) {
            console.warn('[AgentMemory] Erreur getGlobalLessonsLearned:', e.message);
            return [];
        }
    }
};

export default agentMemory;
