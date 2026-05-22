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

// ============================================================================
// STEP VARIABLES INTERPOLATION UTILITIES
// ============================================================================

function extractValueFromStepResult(result: any, placeholderName: string): string {
    if (!result) return '';
    
    // Extract output payload
    let output = result.llmOutput;
    if (output === undefined) {
        output = result.data;
    }
    if (output === undefined) {
        output = result;
    }
    
    const isPathPlaceholder = placeholderName.toLowerCase().includes('path');
    const isUrlPlaceholder = placeholderName.toLowerCase().includes('url');

    // Recursive object traversal to search exact case-insensitive key first
    const findExactKey = (obj: any, targetKey: string): any => {
        if (!obj || typeof obj !== 'object') return undefined;
        const targetLower = targetKey.toLowerCase();
        
        for (const key in obj) {
            if (key.toLowerCase() === targetLower) {
                return obj[key];
            }
        }
        
        for (const key in obj) {
            const found = findExactKey(obj[key], targetKey);
            if (found !== undefined) return found;
        }
        return undefined;
    };

    // Recursive object traversal to search key patterns
    const findKey = (obj: any, keys: string[]): any => {
        if (!obj || typeof obj !== 'object') return undefined;
        for (const key of keys) {
            if (key in obj) return obj[key];
        }
        for (const k in obj) {
            const found = findKey(obj[k], keys);
            if (found !== undefined) return found;
        }
        return undefined;
    };

    if (typeof output === 'object' && output !== null) {
        // 1. Try to find exact case-insensitive key matching the placeholderName first
        const exactMatch = findExactKey(output, placeholderName);
        if (exactMatch !== undefined) {
            if (typeof exactMatch === 'object' && exactMatch !== null) {
                const subUrl = exactMatch.url || exactMatch.href || exactMatch.link;
                if (subUrl && typeof subUrl !== 'object') {
                    return String(subUrl);
                }
                return JSON.stringify(exactMatch);
            }
            return String(exactMatch);
        }

        // 2. Fallbacks for paths and URLs if exact match was not found
        if (isPathPlaceholder) {
            const pathKeys = ['filePath', 'path', 'fileName', 'file', 'filepath'];
            const foundPath = findKey(output, pathKeys);
            if (foundPath) return String(foundPath);
        }
        if (isUrlPlaceholder) {
            const urlKeys = ['url', 'href', 'link'];
            const foundUrl = findKey(output, urlKeys);
            if (foundUrl) return String(foundUrl);
        }
        
        // General common keys
        const generalKeys = ['result', 'data', 'text', 'value', 'filePath', 'path', 'url'];
        const foundGeneral = findKey(output, generalKeys);
        if (foundGeneral !== undefined) {
            if (typeof foundGeneral === 'object') {
                return JSON.stringify(foundGeneral);
            }
            return String(foundGeneral);
        }
        
        // Default properties fallback
        if (output.result !== undefined) {
            return typeof output.result === 'object' ? JSON.stringify(output.result) : String(output.result);
        }
        if (output.data !== undefined) {
            if (typeof output.data === 'object' && output.data.result !== undefined) {
                return String(output.data.result);
            }
            return typeof output.data === 'object' ? JSON.stringify(output.data) : String(output.data);
        }
        
        return JSON.stringify(output);
    }
    
    return String(output);
}

function formatToolForPlanner(t: any): string {
    const name = t.function?.name || t.name;
    const desc = t.function?.description || t.description || '';
    const params = t.function?.parameters || t.parameters;
    
    let paramsStr = '';
    if (params && params.properties) {
        const required = params.required || [];
        const props = Object.entries(params.properties).map(([key, val]: [string, any]) => {
            const req = required.includes(key) ? ' (REQUIRED)' : ' (optional)';
            const type = val.type ? `: ${val.type}` : '';
            return `     * ${key}${type}${req} - ${val.description || ''}`;
        }).join('\n');
        if (props) {
            paramsStr = `\n   Parameters:\n${props}`;
        }
    }
    return `- ${name}: ${desc}${paramsStr}`;
}

function interpolateParams(params: any, stepResults: any): any {
    if (!params) return params;
    
    if (typeof params === 'string') {
        // Robust multi-format interpolation parsing to support {{steps.2.output.filePath}}, {{step_2_filePath}}, {{filePath_from_step_2}}
        return params.replace(/\{\{([\s\S]+?)\}\}/g, (match, inner) => {
            const clean = inner.trim();
            
            // Format 1: {{name_from_step_X}}
            const matchFromStep = clean.match(/^([a-zA-Z0-9_]+)_from_step_(\d+)$/i);
            if (matchFromStep) {
                const name = matchFromStep[1];
                const stepId = parseInt(matchFromStep[2], 10);
                const result = stepResults[stepId];
                if (result) return extractValueFromStepResult(result, name);
                return match;
            }
            
            // Format 2: {{steps.X.output.name}} or {{step_X_name}} or {{step.X.name}}
            const stepIdMatch = clean.match(/(?:step|steps)(?:\.|\s|_|-)?(\d+)/i);
            if (stepIdMatch) {
                const stepId = parseInt(stepIdMatch[1], 10);
                const result = stepResults[stepId];
                if (result) {
                    let propName = 'result';
                    const parts = clean.split(/[\._\-]/).map((p: string) => p.trim());
                    const technicalWords = ['step', 'steps', 'output', 'result', String(stepId)];
                    const cleanParts = parts.filter((p: string) => p && !technicalWords.includes(p.toLowerCase()));
                    
                    if (cleanParts.length > 0) {
                        propName = cleanParts[0]; // take the custom property name, e.g. "filePath"
                    }
                    
                    const val = extractValueFromStepResult(result, propName);
                    console.log(`[Planner] 🔄 Interpolation placeholder: "${clean}" (step: ${stepId}, prop: ${propName}) -> "${val}"`);
                    return val;
                }
                console.warn(`[Planner] ⚠️ Impossible d'interpoler ${match}: aucun résultat pour l'étape ${stepId}`);
                return match;
            }
            
            return match;
        });
    }
    
    if (Array.isArray(params)) {
        return params.map(item => interpolateParams(item, stepResults));
    }
    
    if (typeof params === 'object' && params !== null) {
        const interpolated: any = {};
        for (const key in params) {
            interpolated[key] = interpolateParams(params[key], stepResults);
        }
        return interpolated;
    }
    
    return params;
}


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
        
        // ESM: json5 exporte { default: { parse, stringify } }
        json5 = json5Module.default || json5Module;
        // ESM: jsonrepair exporte { jsonrepair: fn } directement
        jsonRepair = jsonRepairModule;
        // ESM: ajv exporte { default: AjvClass }
        Ajv = ajvModule.default || ajvModule;
        
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

        // Déclaration hors du try pour rester accessible dans le catch
        let cleanedJson = planText.trim();

        try {
            // 1. Charger les bibliothèques JSON robustes
            const libs = await loadJsonLibraries();
            
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
                    const repairedJson = libs.jsonRepair.jsonrepair(cleanedJson);
                    
                    // 3b. Parser avec json5 (plus tolérant)
                    parsedPlan = libs.json5.parse(repairedJson);
                    
                    console.log('[Planner] ✅ JSON réparé avec json-repair + json5');
                } catch (libError: any) {
                    console.warn('[Planner] ⚠️ Bibliothèques JSON ont échoué, fallback natif:', libError.message);
                    // Fallback natif au lieu de re-throw
                    parsedPlan = this._parseJsonFallback(cleanedJson);
                    if (!parsedPlan) return null;
                }
            } else {
                // Fallback: parsing natif avec nettoyage manuel
                parsedPlan = this._parseJsonFallback(cleanedJson);
                if (!parsedPlan) return null;
            }

            // 4. Valider contre le schéma (Ajv est déjà le constructor grâce au .default)
            if (libs && Ajv) {
                try {
                    const ajv = new Ajv({ useDefaults: true, allErrors: true });
                    const validate = ajv.compile(PLAN_SCHEMA);
                    
                    if (!validate(parsedPlan)) {
                        console.warn('[Planner] ⚠️ Plan invalide selon schéma:', validate.errors);
                        
                        // Tenter de corriger automatiquement
                        const correctedPlan = this._autoCorrectPlan(parsedPlan);
                        if (correctedPlan) {
                            console.log('[Planner] ✅ Plan corrigé automatiquement');
                            return correctedPlan;
                        }
                        
                        console.warn(`[Planner] ⚠️ Plan invalide: ${validate.errors?.[0]?.message}`);
                    }
                } catch (ajvErr: any) {
                    console.warn('[Planner] ⚠️ Validation Ajv échouée, plan retourné sans validation:', ajvErr.message);
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
                    tool: step.tool ? String(step.tool) : null,
                    params: step.params || {},
                    estimated_time: Number(step.estimated_time) || 0,
                    depends_on: Array.isArray(step.depends_on) ? step.depends_on.map(Number) : []
                }))
                .filter((step: any) => step.tool !== null);
            
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
${tools.map((t: any) => t.function?.name || t.name).join(', ')}
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
${context.tools.map(formatToolForPlanner).join('\n')}
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
5. CRITICAL: ONLY use tools EXACTLY as named in the available list. NEVER hallucinate tools.
6. Use \`execute_bash_command\` for terminal commands, npm installs, Node scripts, and filesystem file creation.
7. Use \`code_execution\` only for sandboxed JavaScript that orchestrates 2+ existing HIVE tools. Never use it for require/import, npm packages, shell commands, or local file writes.
8. CRITICAL: To reuse outputs from prior steps (like generated files, URLs, or text), use the syntax "{{step_X_propertyName}}".
   For example, if step 2 outputs a screenshot file path (e.g., property "filePath"), step 3 should use: {"filePath": "{{step_2_filePath}}"}.
   If you need the default result of step 1, use: "{{step_1_result}}".
   NEVER use random placeholders. Always refer to step outputs explicitly using the "{{step_X_propertyName}}" format.
9. CRITICAL: Pay extreme attention to the parameters format of each tool. Provide ALL REQUIRED properties specified in the tool schema (e.g., "javascript" for "browser_eval", "text" for "send_message").
10. CRITICAL: For web search tools (like \`google_ai_search\`, \`duckduck_search\`, \`wikipedia\`), the \`query\` parameter must ALWAYS be a short search query or a specific question (max 15 words). NEVER pass large blocks of text, scraped content, or massive step results (like "{{step_X_result}}" containing a scraped webpage) as the query argument. Doing so will cause HTTP query errors. To summarize, translate, or analyze previously retrieved text, do NOT call a search tool; instead, perform the summary directly in the final response step or use local tools.
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

            // 🛡️ [BUG #3 FIX] Construire la liste des outils disponibles
            const availableToolNames = new Set(
                context.tools.map((t: any) => t.function?.name || t.name).filter(Boolean)
            );

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

                // Vérifier que l'outil existe dans la liste disponible
                if (!availableToolNames.has(step.tool)) {
                    console.warn(`[Planner] ⚠️ Étape ${step.id}: outil "${step.tool}" halluciné (n'existe pas dans les ${availableToolNames.size} outils disponibles)`);
                    // Tenter de trouver un outil similaire (fuzzy match basique)
                    const closest = [...availableToolNames].find(t =>
                        step.tool.includes(t) || t.includes(step.tool) ||
                        step.tool.replace(/_/g, '').includes(t.replace(/_/g, ''))
                    );
                    if (closest) {
                        console.log(`[Planner] 🔧 Auto-correction: "${step.tool}" → "${closest}"`);
                        step.tool = closest;
                    } else {
                        console.warn(`[Planner] ❌ Suppression de l'étape ${step.id} (outil "${step.tool}" introuvable)`);
                        plan.steps.splice(i, 1);
                        i--; // Reculer l'index après suppression
                    }
                }
            }

            // Vérifier qu'il reste des étapes valides
            if (plan.steps.length === 0) {
                throw new Error('Plan invalide après validation: tous les outils étaient hallucinés');
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
    async execute(plan: any, context: any, initialExecutionLog?: any) {
        console.log(`[Planner] 🚀 Exécution du plan: ${plan.steps.length} étapes`);

        const executionLog = {
            planId: plan.id,
            goal: plan.goal,
            plan: plan,
            startTime: initialExecutionLog?.startTime || Date.now(),
            completed: initialExecutionLog?.completed ? [...initialExecutionLog.completed] : [],
            failed: initialExecutionLog?.failed ? [...initialExecutionLog.failed] : [],
            results: initialExecutionLog?.results ? { ...initialExecutionLog.results } : {},
            _replanAttempt: initialExecutionLog?._replanAttempt || false
        };

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];

            if (executionLog.completed.includes(step.id)) {
                console.log(`[Planner] ⏭️ Étape ${step.id} déjà complétée, passage.`);
                continue;
            }

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
                // Interpoler les paramètres avec les résultats des étapes précédentes
                if (step.params) {
                    step.params = interpolateParams(step.params, executionLog.results);
                }

                // [PRIORITY 4 FIX] Skip steps with no valid tool instead of executing 'unknown_tool'
                const toolName = step.tool;
                if (!toolName || toolName === 'unknown_tool') {
                    console.warn(`[Planner] ⚠️ Étape ${step.id} ignorée: outil manquant ou invalide ("${toolName || 'null'}")`);
                    executionLog.failed.push(step.id);
                    executionLog.results[step.id] = { error: true, message: `Step skipped: no valid tool (was "${toolName || 'null'}")` };
                    await actionMemory.updateStep(context.chatId, `⏭️ Étape ${step.id}: ${step.action} - outil manquant`);
                    continue;
                }

                // [GLOBAL TOOL RETRY SYSTEM] Pre-execution parameter validation
                // WHY: The Planner bypassed the ReAct loop's validateToolArgs check,
                // causing crashes when LLMs omit required params (e.g., file_path, instructions).
                // This applies the same validation the ReAct path uses, preventing crashes.
                const { validateToolArgs } = await import('../../utils/toolValidator.js');
                const validation = validateToolArgs(toolName, JSON.stringify(step.params || {}), context.tools || []);
                if (!validation.valid) {
                    console.warn(`[Planner] ⚠️ Étape ${step.id}: paramètres manquants pour "${toolName}": [${validation.missing.join(', ')}]`);
                    executionLog.failed.push(step.id);
                    executionLog.results[step.id] = { 
                        error: true, 
                        success: false, 
                        message: `Missing required parameters: [${validation.missing.join(', ')}]. Expected: ${JSON.stringify(validation.schema, null, 0)}` 
                    };
                    await actionMemory.updateStep(context.chatId, `❌ Étape ${step.id}: ${step.action} - params manquants: ${validation.missing.join(', ')}`);
                    continue;
                }
                
                // Construire le toolCall format
                const toolCall = {
                    id: `step_${step.id}`,
                    function: {
                        name: toolName,
                        arguments: JSON.stringify(step.params || {})
                    }
                };

                // Utiliser la fonction d'exécution fournie
                const result = await context.executeToolFn(toolCall, context.message);

                executionLog.results[step.id] = result;

                // [BUG #8 FIX] Vérifier si l'outil a réellement réussi
                if (result && (result.error === true || result.success === false)) {
                    const errorMessage = result.message || result.error || (typeof result.llmOutput === 'string' ? result.llmOutput : '') || 'erreur inconnue';
                    console.warn(`[Planner] ⚠️ Étape ${step.id} échouée (outil): ${errorMessage}`);
                    executionLog.failed.push(step.id);
                    await actionMemory.updateStep(context.chatId, `❌ Étape ${step.id}: ${step.action} - ${errorMessage}`);

                    // Analyser si échec critique
                    if (this._isCriticalFailure(step, new Error(errorMessage || 'tool_error'))) {
                        console.warn(`[Planner] 🛑 Échec critique détecté, replanification...`);
                        return await this._replan(plan, executionLog, context);
                    }
                    continue;
                }

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
        // En mode de récupération adaptatif, n'importe quel échec d'étape est considéré comme critique
        // pour déclencher une replanification intelligente (si pas déjà tentée).
        return true;
    }

    /**
     * Replanifie après échec
     */
    async _replan(originalPlan: any, executionLog: any, context: any) {
        // [PRIORITY 4 FIX] Anti-rebounce guard — replan only once
        if ((executionLog as any)._replanAttempt) {
            console.warn('[Planner] 🛑 Replan already attempted, aborting to prevent infinite loop.');
            return { ...executionLog, replanFailed: true };
        }
        (executionLog as any)._replanAttempt = true;

        console.log('[Planner] 🔄 Replanification...');

        // Build detailed tools list for the LLM
        const detailedToolsList = (context.tools || [])
            .map(formatToolForPlanner)
            .join('\n');

        // Construit un log détaillé des étapes exécutées avec leurs résultats
        const detailedStepsLog = originalPlan.steps.map((s: any) => {
            const result = executionLog.results[s.id];
            if (!result) return `- Step ${s.id} (${s.action}): Not executed`;
            
            const status = executionLog.completed.includes(s.id) ? 'SUCCESS' : 'FAILED';
            let outputStr = '';
            
            if (result.error) {
                outputStr = `Error: ${result.message || JSON.stringify(result)}`;
            } else if (result.llmOutput) {
                const out = result.llmOutput;
                outputStr = typeof out === 'string' ? out : JSON.stringify(out);
            } else {
                outputStr = JSON.stringify(result);
            }
            
            // Truncate output to avoid prompt bloat but keep crucial context (like accessibility tree)
            if (outputStr.length > 3000) {
                outputStr = outputStr.substring(0, 3000) + '\n... [TRUNCATED]';
            }
            
            return `### Step ${s.id} (${s.action}) - ${status}
- Tool: ${s.tool}
- Params: ${JSON.stringify(s.params)}
- Output/Error: ${outputStr}`;
        }).join('\n\n');

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

<detailed_execution_log>
${detailedStepsLog}
</detailed_execution_log>

<available_tools>
${detailedToolsList || 'No tool list provided'}
</available_tools>

<replanning_strategy>
1. Analyze WHY failures occurred
2. Propose alternative approach avoiding same errors
3. CRITICAL: You MUST ONLY use tools from the <available_tools> list above. Do NOT invent tool names.
4. Consider:
   - Different tool selection from the available list
   - Modified parameters
   - Alternative step ordering
   - Simpler intermediate goals
5. CRITICAL: Look closely at the <detailed_execution_log> to find the exact element references (like @e181, @e182) from the previous browser_snapshot step. In your corrected steps, use these exact references (e.g. {"selector": "@e182"}) as the parameters for browser_click or browser_fill.
6. Use \`execute_bash_command\` for terminal commands, npm installs, Node scripts, and filesystem file creation.
7. Use \`code_execution\` only for sandboxed JavaScript that orchestrates 2+ existing HIVE tools. Never use it for require/import, npm packages, shell commands, or local file writes.
8. CRITICAL: To reuse outputs from prior steps (like generated files, URLs, or text), use the syntax "{{step_X_propertyName}}".
   For example, if step 2 outputs a screenshot file path (e.g., property "filePath"), step 3 should use: {"filePath": "{{step_2_filePath}}"}.
   If you need the default result of step 1, use: "{{step_1_result}}".
   NEVER use random placeholders. Always refer to step outputs explicitly using the "{{step_X_propertyName}}" format.
9. CRITICAL: Pay extreme attention to the parameters format of each tool. Provide ALL REQUIRED properties specified in the tool schema (e.g., "javascript" for "browser_eval", "text" for "send_message").
10. CRITICAL: For web search tools (like \`google_ai_search\`, \`duckduck_search\`, \`wikipedia\`), the \`query\` parameter must ALWAYS be a short search query or a specific question (max 15 words). NEVER pass large blocks of text, scraped content, or massive step results (like "{{step_X_result}}" containing a scraped webpage) as the query argument. Doing so will cause HTTP query errors. To summarize, translate, or analyze previously retrieved text, do NOT call a search tool; instead, perform the summary directly in the final response step or use local tools.
</replanning_strategy>

<output_format>
Respond in JSON (same format as original plan):
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

            const newPlan = await this._parsePlanJson(response.content);
            if (!newPlan) {
                throw new Error('Impossible de parser le nouveau plan JSON après replanification');
            }

            // Validate that all tools in the new plan actually exist
            const validToolNames = new Set((context.tools || []).map((t: any) => t.function?.name || t.name));
            const invalidSteps = (newPlan.steps || []).filter((s: any) => s.tool && !validToolNames.has(s.tool));
            if (invalidSteps.length > 0) {
                console.warn(`[Planner] ⚠️ Replan contains ${invalidSteps.length} invalid tool(s): ${invalidSteps.map((s: any) => s.tool).join(', ')}. Filtering out.`);
                newPlan.steps = (newPlan.steps || []).filter((s: any) => !s.tool || validToolNames.has(s.tool));
            }

            if (!newPlan.steps || newPlan.steps.length === 0) {
                throw new Error('Replan produced no valid steps');
            }

            console.log('[Planner] ✅ Nouveau plan créé, réexécution...');

            // Execute with the new plan (guard flag already set, so no recursive replan)
            return await this.execute({ ...originalPlan, steps: newPlan.steps }, context, executionLog);

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
