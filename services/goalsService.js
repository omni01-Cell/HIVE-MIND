// services/goalsService.js
// Service de gestion des objectifs autonomes du bot

import { supabase } from './supabase.js';

/**
 * Goals Service - Permet au bot de s'auto-assigner des tâches persistantes
 */
export const goalsService = {
    /**
     * Crée un nouvel objectif autonome
     * @param {Object} goal - { title, description, executeAt, targetChatId, priority, origin }
     * @returns {Promise<Object>} L'objectif créé
     */
    async createGoal({ title, description, executeAt, targetChatId = null, priority = 5, origin = 'self' }) {
        try {
            const { data, error } = await supabase
                .from('autonomous_goals')
                .insert({
                    title,
                    description,
                    execute_at: executeAt,
                    target_chat_id: targetChatId,
                    priority,
                    origin
                })
                .select()
                .single();

            if (error) throw error;
            console.log(`[GoalsService] ✅ Objectif créé: "${title}"`);
            return data;
        } catch (error) {
            console.error('[GoalsService] Erreur createGoal:', error.message);
            throw error;
        }
    },

    /**
     * Récupère les objectifs en attente dont la date d'exécution est passée
     * @returns {Promise<Array>}
     */
    async getPendingGoals() {
        try {
            const { data, error } = await supabase
                .from('autonomous_goals')
                .select('*')
                .eq('status', 'pending')
                .lte('execute_at', new Date().toISOString())
                .order('priority', { ascending: false })
                .order('execute_at', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[GoalsService] Erreur getPendingGoals:', error.message);
            return [];
        }
    },

    /**
     * Alias pour getPendingGoals (utilisé par le scheduler)
     * @returns {Promise<Array>}
     */
    async getDueGoals() {
        return this.getPendingGoals();
    },

    /**
     * Marque un objectif comme "en cours"
     * @param {string} goalId 
     */
    async markInProgress(goalId) {
        try {
            const { error } = await supabase
                .from('autonomous_goals')
                .update({ status: 'in_progress' })
                .eq('id', goalId);

            if (error) throw error;
        } catch (error) {
            console.error('[GoalsService] Erreur markInProgress:', error.message);
        }
    },

    /**
     * Marque un objectif comme complété
     * @param {string} goalId 
     * @param {string} result - Résultat de l'exécution
     */
    async completeGoal(goalId, result) {
        try {
            const { error } = await supabase
                .from('autonomous_goals')
                .update({
                    status: 'completed',
                    result: typeof result === 'object' ? JSON.stringify(result) : result
                })
                .eq('id', goalId);

            if (error) throw error;
            console.log(`[GoalsService] ✅ Objectif complété: ${goalId}`);
        } catch (error) {
            console.error('[GoalsService] Erreur completeGoal:', error.message);
        }
    },

    /**
     * Annule un objectif
     * @param {string} goalId 
     */
    async cancelGoal(goalId) {
        try {
            const { error } = await supabase
                .from('autonomous_goals')
                .update({ status: 'cancelled' })
                .eq('id', goalId);

            if (error) throw error;
            console.log(`[GoalsService] ⚠️ Objectif annulé: ${goalId}`);
        } catch (error) {
            console.error('[GoalsService] Erreur cancelGoal:', error.message);
        }
    },

    /**
     * Récupère tous les objectifs d'un chat
     * @param {string} chatId 
     * @returns {Promise<Array>}
     */
    async getChatGoals(chatId) {
        try {
            const { data, error } = await supabase
                .from('autonomous_goals')
                .select('*')
                .eq('target_chat_id', chatId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[GoalsService] Erreur getChatGoals:', error.message);
            return [];
        }
    },

    /**
     * Parse une durée relative (ex: "2h", "1d", "tomorrow 9am") en timestamp
     * @param {string} duration 
     * @returns {Date}
     */
    parseDuration(duration) {
        const now = new Date();

        // Patterns simples
        const hourMatch = duration.match(/^(\d+)h$/);
        if (hourMatch) {
            now.setHours(now.getHours() + parseInt(hourMatch[1]));
            return now;
        }

        const dayMatch = duration.match(/^(\d+)d$/);
        if (dayMatch) {
            now.setDate(now.getDate() + parseInt(dayMatch[1]));
            return now;
        }

        const minMatch = duration.match(/^(\d+)m(?:in)?$/);
        if (minMatch) {
            now.setMinutes(now.getMinutes() + parseInt(minMatch[1]));
            return now;
        }

        // "tomorrow" = demain 9h
        if (duration.toLowerCase().includes('tomorrow')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            return tomorrow;
        }

        // Fallback: 1 heure
        now.setHours(now.getHours() + 1);
        return now;
    }
};

export default goalsService;
