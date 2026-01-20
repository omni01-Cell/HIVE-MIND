// services/agentic/Planner.js
// ============================================================================
// EXPLICIT PLANNER - Plan → Execute → Review for complex tasks
// ============================================================================
// Décompose les objectifs complexes en étapes séquentielles avec gestion
// des dépendances et capacité de replanification en cas d'échec

import { providerRouter } from '../../providers/index.js';
import { actionMemory } from '../memory/ActionMemory.js';
import { supabase } from '../supabase.js';

/**
 * Planificateur explicite pour tâches multi-étapes
 */
export class ExplicitPlanner {
    constructor() {
        this.complexityThreshold = 3; // Nb d'outils estimés pour déclencher planning
    }

    /**
     * Détecte si une requête nécessite un plan explicite
     * @param {string} userMessage 
     * @param {Array} tools - Outils disponibles
     * @returns {Promise<boolean>}
     */
    async needsPlanning(userMessage, tools) {
        // Keywords obvies
        if (userMessage.match(/(plan|planifie|étapes|d'abord.*ensuite|puis|après)/i)) {
            return true;
        }

        // Estimation rapide de complexité via IA
        try {
            const prompt = `Estime le nombre d'outils nécessaires pour cette tâche.
Tâche: "${userMessage}"

Outils disponibles: ${tools.slice(0, 10).map(t => t.name).join(', ')}...

Réponds UNIQUEMENT avec un nombre entier (ex: 2)`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un estimateur de complexité.' },
                { role: 'user', content: prompt }
            ], { family: 'gemini', model: 'gemini-2.0-flash', temperature: 0.1, maxTokens: 5 });

            const estimate = parseInt(response.content.trim());
            return !isNaN(estimate) && estimate >= this.complexityThreshold;

        } catch (e) {
            return false; // Fallback: pas de planning
        }
    }

    /**
     * Crée un plan d'action
     * @param {string} goal - Objectif principal
     * @param {Object} context - Contexte (tools, chatId, etc.)
     * @returns {Promise<Object>} Plan structuré
     */
    async plan(goal, context) {
        console.log('[Planner] 📋 Création du plan...');

        try {
            const planPrompt = `Tu es le PLANIFICATEUR du système HIVE-MIND.

Objectif: ${goal}

Outils disponibles:
${context.tools.slice(0, 15).map(t => `- ${t.name}: ${t.description}`).join('\n')}

Mission:
1. Décompose l'objectif en étapes séquentielles
2. Pour chaque étape, identifie:
   - L'action à exécuter
   - L'outil à utiliser
   - Les dépendances (quelle étape doit être complétée avant)
   - Le temps estimé (en secondes)

Format JSON:
{
  "steps": [
    {
      "id": 1,
      "action": "Description de l'action",
      "tool": "nom_outil",
      "params": {"key": "value"},
      "estimated_time": 10,
      "depends_on": []
    }
  ],
  "total_time_estimate": 30,
  "complexity": "low|medium|high"
}`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un planificateur expert en décomposition de tâches.' },
                { role: 'user', content: planPrompt }
            ], { family: 'gemini', model: 'gemini-2.0-flash', temperature: 0.3 });

            const planText = response.content.replace(/```json|```/g, '').trim();
            const plan = JSON.parse(planText);

            // Stocker le plan dans ActionMemory
            const planId = await actionMemory.startAction(context.chatId, {
                type: 'explicit_plan',
                goal,
                context: { plan },
                priority: 8
            });

            console.log(`[Planner] ✅ Plan créé: ${plan.steps.length} étapes, ~${plan.total_time_estimate}s`);

            return {
                id: planId,
                goal,
                steps: plan.steps,
                totalTime: plan.total_time_estimate,
                complexity: plan.complexity,
                status: 'ready'
            };

        } catch (error) {
            console.error('[Planner] Erreur création plan:', error.message);
            return null;
        }
    }

    /**
     * Exécute le plan étape par étape
     * @param {Object} plan
     * @param {Object} context - {executeToolFn, chatId, message}
     * @returns {Promise<Object>} Résultat d'exécution
     */
    async execute(plan, context) {
        console.log(`[Planner] 🚀 Exécution du plan: ${plan.steps.length} étapes`);

        const executionLog = {
            planId: plan.id,
            goal: plan.goal,
            startTime: Date.now(),
            completed: [],
            failed: [],
            results: {}
        };

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];

            console.log(`[Planner] Étape ${step.id}/${plan.steps.length}: ${step.action}`);

            // Vérifier dépendances
            if (step.depends_on && step.depends_on.length > 0) {
                const depsReady = step.depends_on.every(depId =>
                    executionLog.completed.includes(depId)
                );

                if (!depsReady) {
                    console.warn(`[Planner] ⚠️ Dépendances non satisfaites pour étape ${step.id}`);
                    executionLog.failed.push(step.id);
                    continue;
                }
            }

            // Exécuter l'étape
            try {
                // Construire le toolCall format
                const toolCall = {
                    id: `step_${step.id}`,
                    function: {
                        name: step.tool,
                        arguments: JSON.stringify(step.params || {})
                    }
                };

                // Utiliser la fonction d'exécution fournie
                const result = await context.executeToolFn(toolCall, context.message);

                executionLog.results[step.id] = result;
                executionLog.completed.push(step.id);

                // Mettre à jour ActionMemory
                await actionMemory.updateStep(context.chatId, `✅ Étape ${step.id}: ${step.action}`);

                console.log(`[Planner] ✅ Étape ${step.id} terminée`);

            } catch (error) {
                console.error(`[Planner] ❌ Échec étape ${step.id}:`, error.message);
                executionLog.failed.push(step.id);

                // Analyser si échec critique
                if (this._isCriticalFailure(step, error)) {
                    console.warn(`[Planner] 🛑 Échec critique détecté, replanification...`);
                    return await this._replan(plan, executionLog, context);
                }

                // Sinon, continuer avec les autres étapes
                await actionMemory.updateStep(context.chatId, `❌ Étape ${step.id} échouée: ${error.message}`);
            }
        }

        executionLog.endTime = Date.now();
        executionLog.duration = executionLog.endTime - executionLog.startTime;

        console.log(`[Planner] 🏁 Plan terminé: ${executionLog.completed.length}/${plan.steps.length} étapes réussies`);

        return executionLog;
    }

    /**
     * Révise le plan après exécution
     * @param {Object} executionLog
     * @returns {Promise<Object>} Analyse
     */
    async review(executionLog) {
        console.log('[Planner] 📊 Révision post-exécution...');

        const successRate = executionLog.completed.length / (executionLog.completed.length + executionLog.failed.length);

        const analysis = {
            success: successRate >= 0.8,
            successRate,
            totalSteps: executionLog.completed.length + executionLog.failed.length,
            completed: executionLog.completed.length,
            failed: executionLog.failed.length,
            duration: executionLog.duration,
            efficiency: executionLog.duration / ((executionLog.completed.length || 1) * 1000) // secs per step
        };

        // Si succès, enregistrer dans Dream Service
        if (analysis.success) {
            try {
                const { dreamService } = await import('../dreamService.js');
                await dreamService.recordPlanSuccess?.({
                    goal: executionLog.goal,
                    steps: executionLog.completed.length,
                    duration: executionLog.duration,
                    efficiency: analysis.efficiency
                });
            } catch (e) {
                // Optional feature
            }
        }

        console.log(`[Planner] Analyse: ${analysis.successRate * 100}% succès, ${analysis.duration}ms total`);

        return analysis;
    }

    /**
     * Détecte si un échec est critique
     */
    _isCriticalFailure(step, error) {
        // Échec critique si:
        // 1. C'est la première étape (base du plan)
        // 2. Error fatale (network, auth, etc.)
        if (step.id === 1) return true;
        if (error.message.match(/(network|auth|timeout|fatal)/i)) return true;
        return false;
    }

    /**
     * Replanifie après échec
     */
    async _replan(originalPlan, executionLog, context) {
        console.log('[Planner] 🔄 Replanification...');

        const replanPrompt = `Plan original échoué. Analyse et propose un nouveau plan.

Objectif: ${originalPlan.goal}
Étapes complétées: ${executionLog.completed.join(', ')}
Étapes échouées: ${executionLog.failed.join(', ')}

Propose un plan alternatif qui évite les échecs précédents.
Format JSON identique au plan original.`;

        try {
            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un planificateur expert en récupération d\'échecs.' },
                { role: 'user', content: replanPrompt }
            ], { family: 'gemini', temperature: 0.5 });

            const newPlanText = response.content.replace(/```json|```/g, '').trim();
            const newPlan = JSON.parse(newPlanText);

            console.log('[Planner] ✅ Nouveau plan créé, réexécution...');

            // Réexécuter avec le nouveau plan
            return await this.execute({ ...originalPlan, steps: newPlan.steps }, context);

        } catch (e) {
            console.error('[Planner] Erreur replanification:', e.message);
            return {
                ...executionLog,
                replanFailed: true
            };
        }
    }
}

// Export singleton
export const planner = new ExplicitPlanner();
export default planner;
