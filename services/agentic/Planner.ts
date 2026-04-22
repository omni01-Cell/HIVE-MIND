// @ts-nocheck
// services/agentic/Planner.js
// ============================================================================
// EXPLICIT PLANNER - Plan → Execute → Review for complex tasks
// ============================================================================
// Décompose les objectifs complexes en étapes séquentielles avec gestion
// des dépendances et capacité de replanification en cas d'échec

import { providerRouter } from '../../providers/index.js';
import { actionMemory } from '../memory/ActionMemory.js';
import { supabase } from '../supabase.js';

// 🛡️ Parsing JSON robuste - bibliothèques externes
// Ces imports seront dynamiques pour éviter les erreurs si non installées
let json5, jsonRepair, Ajv;

// Chargement dynamique des bibliothèques (évite crash si pas installées)
async function loadJsonLibraries() {
    if (json5 && jsonRepair && Ajv) return { json5, jsonRepair, Ajv };
    
    try {
        const json5Module = await import('json5');
        const jsonRepairModule = await import('jsonrepair');
        const ajvModule = await import('ajv');
        
        json5 = json5Module;
        jsonRepair = jsonRepairModule;
        Ajv = ajvModule;
        
        console.log('[Planner] ✅ Bibliothèques JSON chargées (json5, jsonrepair, ajv)');
        return { json5, jsonRepair, Ajv };
    } catch (e: any) {
        console.warn('[Planner] ⚠️ Bibliothèques JSON non disponibles, fallback sur parsing natif:', e.message);
        return null;
    }
}

// Schéma de validation pour les plans
const PLAN_SCHEMA = {
    type: 'object',
    properties: {
        steps: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    action: { type: 'string', minLength: 1 },
                    tool: { type: 'string', minLength: 1 },
                    params: { type: 'object' },
                    estimated_time: { type: 'number', minimum: 0 },
                    depends_on: { 
                        type: 'array',
                        items: { type: 'number' }
                    }
                },
                required: ['id', 'action', 'tool']
            },
            minItems: 1
        },
        total_time_estimate: { type: 'number', minimum: 0 },
        complexity: { 
            type: 'string', 
            enum: ['low', 'medium', 'high'] 
        }
    },
    required: ['steps']
};

/**
 * Planificateur explicite pour tâches multi-étapes
 */
export class ExplicitPlanner {
    complexityThreshold: any;

    constructor() {
        this.complexityThreshold = 3; // Nb d'outils estimés pour déclencher planning
    }

    /**
     * 🛡️ Parse le JSON du plan avec bibliothèques robustes et validation
     * @param {string} planText - Texte JSON potentiellement malformé
     * @returns {Object|null} - Plan validé ou null
     */
    async _parsePlanJson(planText: any) {
        if (!planText) return null;

        try {
            // 1. Charger les bibliothèques JSON robustes
            const libs = await loadJsonLibraries();
            
            let cleanedJson = planText.trim();
            
            // 2. Extraire JSON des balises markdown si présentes
            const markdownMatch = cleanedJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (markdownMatch && markdownMatch[1]) {
                cleanedJson = markdownMatch[1];
            } else {
                // Sinon, chercher le premier { et le dernier }
                const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanedJson = jsonMatch[0];
                }
            }

            let parsedPlan: any;

            // 3. Tenter parsing avec bibliothèques robustes
            if (libs) {
                try {
                    // 3a. Réparer avec json-repair (corrige les malformations)
                    const repairedJson = libs.jsonRepair.repair(cleanedJson);
                    
                    // 3b. Parser avec json5 (plus tolérant)
                    parsedPlan = libs.json5.parse(repairedJson);
                    
                    console.log('[Planner] ✅ JSON réparé avec json-repair + json5');
                } catch (libError: any) {
                    console.warn('[Planner] ⚠️ Bibliothèques JSON ont échoué, fallback natif:', libError.message);
                    throw libError; // On relance pour passer au fallback
                }
            } else {
                // Fallback: parsing natif avec nettoyage manuel
                throw new Error('Bibliothèques JSON non disponibles');
            }

            // 4. Valider contre le schéma
            if (libs.Ajv) {
                const ajv = new libs.Ajv({ useDefaults: true, allErrors: true });
                const validate = ajv.compile(PLAN_SCHEMA);
                
                if (!validate(parsedPlan)) {
                    console.warn('[Planner] ⚠️ Plan invalide selon schéma:', validate.errors);
                    
                    // Tenter de corriger automatiquement
                    const correctedPlan = this._autoCorrectPlan(parsedPlan);
                    if (correctedPlan) {
                        console.log('[Planner] ✅ Plan corrigé automatiquement');
                        return correctedPlan;
                    }
                    
                    throw new Error(`Plan invalide: ${validate.errors[0].message}`);
                }
            }

            return parsedPlan;

        } catch (mainError: any) {
            // Fallback: parsing natif avec nettoyage
            console.warn('[Planner] ⚠️ Fallback parsing natif:', mainError.message);
            return this._parseJsonFallback(cleanedJson);
        }
    }

    /**
     * 🛡️ Fallback parsing natif avec nettoyage manuel
     * @private
     */
    _parseJsonFallback(jsonText: any) {
        try {
            // Nettoyage manuel (logique originale améliorée)
            const fixedJson = jsonText
                .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Guillemets clés
                .replace(/'/g, '"') // Simple quotes → double
                .replace(/,\s*([}\]])/g, '$1') // Virgules traînantes
                .replace(/([{,]\s*)"([^"]+)"\s*:\s*'(.*?)'/g, '$1"$2":"$3"') // Valeurs simple quotes
                .trim();
            
            return JSON.parse(fixedJson);
            
        } catch (e: any) {
            console.error('[Planner] ❌ Échec parsing JSON après toutes les tentatives:', e.message);
            return null;
        }
    }

    /**
     * 🛡️ Corrige automatiquement les plans mal formés
     * @private
     */
    _autoCorrectPlan(plan: any) {
        try {
            const corrected = { ...plan };
            
            // S'assurer que steps existe et est un tableau
            if (!Array.isArray(corrected.steps)) {
                corrected.steps = [];
            }
            
            // Filtrer et corriger les étapes invalides
            corrected.steps = corrected.steps
                .filter((step: any) => step && typeof step === 'object')
                .map((step: any, index: any) => ({
                    id: Number(step.id) || index + 1,
                    action: String(step.action || 'unknown_action'),
                    tool: String(step.tool || 'unknown_tool'),
                    params: step.params || {},
                    estimated_time: Number(step.estimated_time) || 0,
                    depends_on: Array.isArray(step.depends_on) ? step.depends_on.map(Number) : []
                }));
            
            // S'assurer qu'il y a au moins une étape
            if (corrected.steps.length === 0) {
                return null;
            }
            
            // Ajouter les champs manquants avec valeurs par défaut
            corrected.total_time_estimate = Number(corrected.total_time_estimate) || 
                corrected.steps.reduce((sum: any, step: any) => sum + (step.estimated_time || 0), 0);
            
            corrected.complexity = ['low', 'medium', 'high'].includes(corrected.complexity) 
                ? corrected.complexity 
                : 'medium';
            
            return corrected;
            
        } catch (e: any) {
            console.error('[Planner] Erreur auto-correction:', e.message);
            return null;
        }
    }

    /**
     * Détecte si une requête nécessite un plan explicite
     * @param {string} userMessage 
     * @param {Array} tools - Outils disponibles
     * @returns {Promise<boolean>}
     */
    async needsPlanning(userMessage: any, tools: any) {
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
${tools.slice(0, 10).map((t: any) => t.name).join(', ')}...
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

        } catch (e: any) {
            return false; // Fallback: pas de planning
        }
    }

    /**
     * Crée un plan d'action
     * @param {string} goal - Objectif principal
     * @param {Object} context - Contexte (tools, chatId, etc.)
     * @returns {Promise<Object>} Plan structuré
     */
    async plan(goal: any, context: any) {
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
${context.tools.slice(0, 15).map((t: any) => `- ${t.name}: ${t.description}`).join('\n')}
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

            // 🛡️ Parsing JSON robuste avec bibliothèques externes et validation
            const plan = await this._parsePlanJson(response.content);
            
            if (!plan) {
                throw new Error('Impossible de parser le plan JSON après toutes les tentatives');
            }

            // 🛡️ Validation détaillée du plan
            if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
                throw new Error('Plan invalide: pas d\'étapes définies');
            }

            // Valider chaque étape
            for (let i = 0; i < plan.steps.length; i++) {
                const step = plan.steps[i];
                if (!step || typeof step !== 'object') {
                    throw new Error(`Étape ${i + 1} invalide: pas un objet`);
                }
                if (!step.action || !step.tool) {
                    throw new Error(`Étape ${i + 1} invalide: action ou tool manquant`);
                }
                if (typeof step.id !== 'number') {
                    step.id = i + 1; // Auto-correct ID
                }
            }

            console.log(`[Planner] ✅ Plan validé: ${plan.steps.length} étapes`);

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

        } catch (error: any) {
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
    async execute(plan: any, context: any) {
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
                const depsReady = step.depends_on.every((depId: any) =>
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

            } catch (error: any) {
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
    async review(executionLog: any) {
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
            } catch (e: any) {
                // Optional feature
            }
        }

        console.log(`[Planner] Analyse: ${analysis.successRate * 100}% succès, ${analysis.duration}ms total`);

        return analysis;
    }

    /**
     * Détecte si un échec est critique
     */
    _isCriticalFailure(step: any, error: any) {
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
    async _replan(originalPlan: any, executionLog: any, context: any) {
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

        } catch (e: any) {
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
