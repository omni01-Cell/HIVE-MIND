// @ts-nocheck
// services/agentic/ActionEvaluator.js
// ============================================================================
// POST-ACTION EVALUATOR - Système d'évaluation et apprentissage continu
// ============================================================================
// Évalue chaque action exécutée et crée une boucle de feedback
// pour améliorer la sélection des outils et l'efficacité globale

import { supabase } from '../supabase.js';
import { providerRouter } from '../../providers/index.js';

/**
 * Évaluateur post-action pour l'amélioration continue
 */
export class ActionEvaluator {
    feedbackWindow: any;

    constructor() {
        this.feedbackWindow = 10000; // 10s pour détecter feedback user
    }

    /**
     * Évalue une action exécutée
     * @param {Object} action - {id, tool, params, result, error, duration_ms, chatId, timestamp}
     * @returns {Promise<Object>} Score evaluation
     */
    async evaluate(action: any) {
        console.log(`[ActionEvaluator] 📊 Évaluation: ${action.tool}`);

        try {
            // 1. Mesures objectives
            const objective = {
                success: !action.error,
                execution_time: action.duration_ms || 0,
                result_quality: await this._assessResult(action)
            };

            // 2. Feedback utilisateur (détection asynchrone)
            const userFeedback = await this._detectFeedback(action.chatId, action.timestamp);

            // 3. Score composite
            const finalScore = this._computeScore(objective, userFeedback);

            // 4. Leçon apprise
            const lesson = await this._extractLesson(action, finalScore);

            // 5. Stockage dans DB
            const { data, error } = await supabase
                .from('action_scores')
                .insert({
                    action_id: action.id,
                    tool: action.tool,
                    success: objective.success,
                    execution_time_ms: objective.execution_time,
                    result_quality: objective.result_quality,
                    user_feedback: userFeedback,
                    final_score: finalScore,
                    learned: lesson
                })
                .select()
                .single();

            if (error) throw error;

            console.log(`[ActionEvaluator] ✅ Score: ${finalScore.toFixed(2)} (success=${objective.success}, feedback=${userFeedback || 'none'})`);

            return {
                score: finalScore,
                components: objective,
                feedback: userFeedback,
                lesson
            };

        } catch (error: any) {
            console.error('[ActionEvaluator] Erreur evaluation:', error.message);
            return null;
        }
    }

    /**
     * Évalue la qualité du résultat (via IA)
     */
    async _assessResult(action: any) {
        // Si erreur, qualité = 0
        if (action.error) return 0;

        // Si pas de résultat, qualité moyenne
        if (!action.result) return 0.5;

        // Analyse rapide par l'IA
        try {
            const prompt = `<role>
You are the Quality Evaluator for HIVE-MIND tool executions.
Your scores directly influence tool selection optimization. Accurate scoring improves future performance.
</role>

<context>
This evaluation helps HIVE-MIND learn which tools perform well.
Low scores flag under-performing tools; high scores reinforce successful ones.
</context>

<tool_execution>
Tool: ${action.tool}
Input: ${JSON.stringify(action.params).substring(0, 200)}
Output: ${JSON.stringify(action.result).substring(0, 500)}
</tool_execution>

<evaluation_criteria>
Score from 0.0 to 1.0 based on weighted criteria:
1. Relevance to input (40% weight): Does output match what input requested?
2. Completeness (30% weight): Are all required elements present?
3. Correctness (30% weight): Is the output error-free and accurate?

Calibration examples:
- 0.0-0.2: Failed execution, wrong/irrelevant result
- 0.3-0.5: Partial success, missing key elements
- 0.6-0.7: Good result with minor issues
- 0.8-0.9: Very good, nearly complete and accurate
- 0.95-1.0: Excellent, perfect execution
</evaluation_criteria>

<output_format>
Respond with ONLY a decimal number between 0.0 and 1.0 (e.g., 0.75).
No explanation, no text, just the score.
</output_format>

Score:`;

            const response = await providerRouter.callServiceRecipe('ACTION_EVALUATOR', [
                { role: 'system', content: 'Tu es un évaluateur de qualité objectif.' },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) return 0.5;

            const score = parseFloat(response.content.trim());
            return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));

        } catch (e: any) {
            // Fallback sans IA
            return action.result ? 0.7 : 0.3;
        }
    }

    /**
     * Détecte le feedback utilisateur dans les messages suivants
     */
    async _detectFeedback(chatId: any, actionTimestamp: any) {
        try {
            // Attend la fenêtre de feedback pour laisser le temps à l'utilisateur de réagir
            await new Promise(resolve => setTimeout(resolve, this.feedbackWindow));

            const { data: messages } = await supabase
                .from('memories')
                .select('content, created_at')
                .eq('chat_id', chatId)
                .eq('role', 'user')
                .gte('created_at', new Date(actionTimestamp).toISOString())
                .order('created_at', { ascending: true })
                .limit(3); // 3 messages suivants

            if (!messages || messages.length === 0) return null;

            // Analyse sentiment des réactions
            const reactions = messages.map((m: any) => m.content.toLowerCase());
            const text = reactions.join(' ');

            // Mots positifs
            if (text.match(/(merci|super|génial|parfait|top|excellent|bravo|👍|❤️|✅)/)) {
                return 'positive';
            }

            // Mots négatifs
            if (text.match(/(nul|mauvais|erreur|faux|wtf|merde|non|stop|annule|❌|👎)/)) {
                return 'negative';
            }

            return 'neutral';

        } catch (e: any) {
            return null;
        }
    }

    /**
     * Calcule le score composite
     */
    _computeScore(objective: any, userFeedback: any) {
        let score = 0;

        // Poids: success (30%), result_quality (40%), feedback (30%)
        score += objective.success ? 0.3 : 0;
        score += objective.result_quality * 0.4;

        if (userFeedback === 'positive') score += 0.3;
        else if (userFeedback === 'negative') score += 0;
        else score += 0.15; // neutral ou null

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Extrait une leçon apprise
     */
    async _extractLesson(action: any, score: any) {
        // Leçons significatives seulement si échec notable ou succès remarquable
        if (score > 0.4 && score < 0.9) return null;

        if (score >= 0.9) {
            return `✅ ${action.tool} very effective for: ${JSON.stringify(action.params).substring(0, 100)}`;
        } else {
            return `❌ ${action.tool} failed: ${action.error || 'low quality result'}. Params: ${JSON.stringify(action.params).substring(0, 100)}`;
        }
    }

    /**
     * Met à jour la sélection des outils basée sur les stats
     */
    async updateToolSelection() {
        console.log('[ActionEvaluator] 🔄 Mise à jour priorités outils...');

        try {
            // Récupérer les stats depuis la vue agrégée
            const { data: stats } = await supabase
                .from('tool_performance')
                .select('*')
                .order('avg_score', { ascending: false });

            if (!stats) return;

            // Identifier les outils sous-performants
            const underperformers = stats.filter((s: any) => s.avg_score < 0.5);

            for (const tool of underperformers) {
                console.warn(`[ActionEvaluator] ⚠️ Tool ${tool.tool} sous-performant (score=${tool.avg_score.toFixed(2)}, uses=${tool.total_uses})`);

                // TODO: Modifier le embedding ou ajouter une note de warning dans bot_tools
                // Pour l'instant, juste log
            }

            console.log(`[ActionEvaluator] ✅ Top tools: ${stats.slice(0, 5).map((s) => `${s.tool} (${s.avg_score.toFixed(2)})`).join(', ')}`);

        } catch (error: any) {
            console.error('[ActionEvaluator] Erreur updateToolSelection:', error.message);
        }
    }

    /**
     * Enregistre un succès rapide (sans évaluation complète)
     */
    async recordQuickSuccess(tool: any, actionId: any) {
        try {
            await supabase.from('action_scores').insert({
                action_id: actionId,
                tool,
                success: true,
                execution_time_ms: 0,
                result_quality: 0.8,
                final_score: 0.8
            });
        } catch (e: any) {
            // Silent fail
        }
    }

    /**
     * Récupère les statistiques globales
     */
    async getStats() {
        const { data } = await supabase
            .from('tool_performance')
            .select('*')
            .order('avg_score', { ascending: false });

        return data || [];
    }
}

// Export singleton
export const actionEvaluator = new ActionEvaluator();
export default actionEvaluator;
