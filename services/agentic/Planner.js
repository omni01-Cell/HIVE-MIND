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
            const prompt = `<task>
You are estimating task complexity for HIVE-MIND's explicit planner.
Your estimate determines if multi-step planning is needed.
</task>

<user_request>
"${userMessage}"
</user_request>

<available_tools>
${tools.slice(0, 10).map(t => t.name).join(', ')}...
</available_tools>

<estimation_criteria>
Count tools needed:
- 1 tool = Simple, direct action
- 2-3 tools = Medium, sequential steps
- 4+ tools = Complex, requires explicit planning
</estimation_criteria>

<output_format>
Respond with ONLY an integer number (e.g., 2)
</output_format>

Estimate:`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un estimateur de complexité.' },
                { role: 'user', content: prompt }
            ], { temperature: 0.1, maxTokens: 5 });

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
            const planPrompt = `<role>
You are HIVE-MIND's PLANNER agent for multi-step tasks.
Your plan quality determines execution success. Excellence in task decomposition is critical.
</role>

<long_horizon_context>
This is a complex task requiring incremental progress across multiple steps.
Focus on steady advances: break down into manageable chunks, maintain clear dependencies.
Your plan will be executed sequentially with state tracking between steps.
</long_horizon_context>

<goal>
${goal}
</goal>

<available_tools>
${context.tools.slice(0, 15).map(t => `- ${t.name}: ${t.description}`).join('\n')}
</available_tools>

<planning_instructions>
1. Decompose goal into sequential steps
2. For each step identify:
   - Specific action to execute
   - Tool to use (from available list)
   - Dependencies (which steps must complete first)
   - Time estimate (realistic, in seconds)
3. Order steps by dependencies (prerequisites first)
4. Validate each step can be executed with available tools
</planning_instructions>

<output_format>
Respond in JSON only:
{
  "steps": [
    {
      "id": 1,
      "action": "Clear action description",
      "tool": "tool_name",
      "params": {"key": "value"},
      "estimated_time": 10,
      "depends_on": []
    }
  ],
  "total_time_estimate": 30,
  "complexity": "low|medium|high"
}
</output_format>

Plan:`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un planificateur expert en décomposition de tâches.' },
                { role: 'user', content: planPrompt }
            ], { temperature: 0.3 });

            if (!response?.content) {
                throw new Error('AI response is empty or null');
            }

            // Nettoyage robuste : Extraire uniquement ce qui ressemble à du JSON
            let planText = response.content;

            // 1. Tenter d'extraire via balises markdown ```json ... ```
            const markdownMatch = planText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (markdownMatch && markdownMatch[1]) {
                planText = markdownMatch[1];
            } else {
                // 2. Sinon, chercher le premier { et le dernier }
                const jsonMatch = planText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    planText = jsonMatch[0];
                }
            }

            let plan;
            try {
                // Nettoyage final (espaces, sauts de ligne parasites)
                planText = planText.trim();
                plan = JSON.parse(planText);
            } catch (e) {
                console.warn('[Planner] ⚠️ Échec parsing JSON standard, tentative de nettoyage...');
                try {
                    // Si échec, tentative de nettoyage des clés sans guillemets (erreur commune LLM)
                    const fixedJson = planText
                        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Ajout guillemets aux clés
                        .replace(/'/g, '"') // Remplacement simple quotes par double quotes
                        .replace(/,\s*([}\]])/g, '$1'); // Suppression virgules traînantes
                    plan = JSON.parse(fixedJson);
                } catch (innerE) {
                    console.error('[Planner] ❌ Erreur fatale parsing JSON:', innerE.message);
                    console.log('[Planner] Début contenu:', planText.substring(0, 100));
                    console.log('[Planner] Fin contenu:', planText.substring(planText.length - 100));
                    throw new Error('AI response is not valid JSON');
                }
            }

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

        const replanPrompt = `<role>
You are HIVE-MIND's adaptive PLANNER recovering from execution failure.
Your replan must learn from errors and propose a viable alternative path.
</role>

<original_goal>
${originalPlan.goal}
</original_goal>

<execution_results>
Completed steps: ${executionLog.completed.join(', ') || 'none'}
Failed steps: ${executionLog.failed.join(', ')}
</execution_results>

<replanning_strategy>
1. Analyze WHY failures occurred
2. Propose alternative approach avoiding same errors
3. Consider:
   - Different tool selection
   - Modified parameters
   - Alternative step ordering
   - Simpler intermediate goals
</replanning_strategy>

<output_format>
Respond in JSON (same format as original plan):
{
  "steps": [...],
  "total_time_estimate": X,
  "complexity": "low|medium|high"
}
</output_format>

New plan:`;

        try {
            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un planificateur expert en récupération d\'échecs.' },
                { role: 'user', content: replanPrompt }
            ], { temperature: 0.5 });

            if (!response?.content) {
                throw new Error('AI response for replan is empty');
            }

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
