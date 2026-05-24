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
import { tryParseJson } from '../../utils/ResponseFormatEnforcer.js';

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
            let parsedPlan: any;
            try {
                parsedPlan = tryParseJson<any>(planText);
                console.log('[Planner] ✅ JSON parsé avec succès via tryParseJson');
            } catch (err: any) {
                console.warn('[Planner] ⚠️ tryParseJson a échoué, tentative de nettoyage manuel:', err.message);
                parsedPlan = this._parseJsonFallback(planText);
                if (!parsedPlan) return null;
            }

            const libs = await loadJsonLibraries();

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
            let cleaned = jsonText.trim();
            // Extraire d'abord la partie JSON
            const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonBlockMatch) {
                cleaned = jsonBlockMatch[1].trim();
            } else {
                const firstOpen = cleaned.search(/[{[]/);
                if (firstOpen !== -1) {
                    const lastClose = cleaned.lastIndexOf(cleaned[firstOpen] === '{' ? '}' : ']');
                    if (lastClose !== -1 && lastClose > firstOpen) {
                        cleaned = cleaned.slice(firstOpen, lastClose + 1).trim();
                    }
                }
            }

            // Nettoyage manuel (logique originale améliorée)
            const fixedJson = cleaned
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
                .map((step: any, index: any) => {
                    // Résoudre les synonymes possibles pour la propriété "tool"
                    let resolvedTool = step.tool || step.tool_name || step.toolName || step.function || step.use_tool || step.action_type || step.command || null;
                    
                    // Si aucun outil n'est explicitement défini, tenter de l'inférer de l'action
                    if (!resolvedTool && step.action) {
                        const actionLower = String(step.action).toLowerCase();
                        if (actionLower.includes('screenshot') || actionLower.includes('capture')) {
                            resolvedTool = 'browser_screenshot';
                        } else if (actionLower.includes('scrape') || actionLower.includes('extraire') || actionLower.includes('github') || actionLower.includes('trending')) {
                            resolvedTool = 'browser_open'; // Ouvrir d'abord
                        } else if (actionLower.includes('command') || actionLower.includes('bash') || actionLower.includes('terminal') || actionLower.includes('script')) {
                            resolvedTool = 'execute_bash_command';
                        } else if (actionLower.includes('file') || actionLower.includes('écrire') || actionLower.includes('write') || actionLower.includes('sauvegarder')) {
                            resolvedTool = 'execute_bash_command'; // Fallback terminal pour création fichier
                        } else {
                            resolvedTool = 'execute_bash_command'; // Fallback universel sécurisé
                        }
                        console.log(`[Planner] 🔧 Auto-inferred tool "${resolvedTool}" for action: "${step.action}"`);
                    }

                    return {
                        id: Number(step.id) || index + 1,
                        action: String(step.action || 'unknown_action'),
                        tool: resolvedTool ? String(resolvedTool) : 'execute_bash_command',
                        params: step.params || {},
                        estimated_time: Number(step.estimated_time) || 10,
                        depends_on: Array.isArray(step.depends_on) ? step.depends_on.map(Number) : []
                    };
                });
            
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
Respond with ONLY an integer number representing the estimate. Do not include any other text, reasoning, or markdown.

Few-shot examples:
- Estimate: 1
- Estimate: 3
</output_format>

Estimate:`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un estimateur de complexité. Tu réponds uniquement par un chiffre.' },
                { role: 'user', content: prompt }
            ], { temperature: 0.1, maxTokens: 5 });

            const text = response.content.trim();
            const match = text.match(/\d+/);
            const estimate = match ? parseInt(match[0], 10) : NaN;
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

        const planPrompt = `<role>
You are HIVE-MIND's PLANNER agent specialized in multi-step task decomposition.
Your primary mission is to break down the user's high-level goal into a series of logical, executable steps.
</role>

<context>
Goal to achieve:
"${goal}"

You will execute these steps sequentially, tracking system state between each action.
</context>

<available_tools>
${context.tools.map(formatToolForPlanner).join('\n')}
</available_tools>

<planning_instructions>
To ensure successful execution, structure your planning process according to these guidelines:
1. ANALYSIS AND REASONING: First, analyze the goal. Identify if it is a compound task (e.g., browsing a page AND creating a file, or taking a screenshot AND extracting details).
2. FORCE STEP SPLITTING: If the task is compound, you must explicitly split it into at least 2 distinct steps:
   - Step 1: Retrieve or gather data (e.g., browser_screenshot, read_file, google_ai_search).
   - Step 2: Process, format, write, or report the gathered data (e.g., execute_bash_command, send_file).
3. MATCH TOOLS ACCURATELY: Choose tool names exclusively from the list of available tools. Verify that each selected tool exists exactly as defined.
4. CHOOSE THE RIGHT TOOL:
   - Use \`execute_bash_command\` for terminal actions, running Node scripts, and creating files in the filesystem.
   - Reserve \`code_execution\` only for lightweight orchestration of multiple existing HIVE tools using sandboxed JavaScript. (Do not use it for require/import, npm packages, shell commands, or local file writes).
5. DEFINE COMPLETE PARAMETERS: For every step, provide all required properties for the chosen tool.
6. PASS DATA SEQUENTIALLY: Reuse outputs from previous steps by using the variable interpolation syntax "{{step_X_propertyName}}" (e.g., {"filePath": "{{step_1_filePath}}"} or "{{step_1_result}}").
7. DRAFT CONCISE QUERIES: When using search tools (\`google_ai_search\`, \`duckduck_search\`, \`wikipedia\`), write a short, concise search query (maximum of 15 words) for the query parameter. Avoid passing large chunks of text or variable references like "{{step_X_result}}".
8. JSON VALIDITY: Double-check your JSON block. Ensure there are no trailing commas, all keys and strings are wrapped in double quotes, and braces/brackets are correctly balanced.
</planning_instructions>

<output_format>
Your response must consist of two parts:
1. A brief "Thinking" section explaining your reasoning and why the task must be decomposed into at least 2 steps.
2. A "Plan JSON" block containing the structured plan, wrapped in markdown triple backticks.

Example format:
Thinking:
The user wants to navigate to a page, take a screenshot, and then extract trending repositories to format them in a markdown file. This is a compound task. I will split it into two steps: Step 1 will take the screenshot of the page, and Step 2 will extract the data and format the markdown file.

\`\`\`json
{
  "steps": [
    {
      "id": 1,
      "action": "Navigate to the URL and capture a screenshot",
      "tool": "browser_screenshot",
      "params": {
        "url": "https://example.com"
      },
      "estimated_time": 15,
      "depends_on": []
    },
    {
      "id": 2,
      "action": "Extract page content and format as markdown",
      "tool": "execute_bash_command",
      "params": {
        "command": "node scripts/extract.js"
      },
      "estimated_time": 20,
      "depends_on": [1]
    }
  ],
  "total_time_estimate": 35,
  "complexity": "medium"
}
\`\`\`
</output_format>

Plan:`;

        let attempts = 0;
        const maxAttempts = 5;
        let plan: any = null;
        let chatHistory: any[] = [
            { role: 'system', content: 'Tu es un planificateur expert en décomposition de tâches. Tu dois impérativement respecter le schéma de sortie JSON demandé et diviser les tâches complexes en au moins 2 étapes distinctes.' },
            { role: 'user', content: planPrompt }
        ];

        while (attempts < maxAttempts) {
            attempts++;
            let response: any = null;
            try {
                response = await providerRouter.chat(chatHistory, { temperature: 0.3 });
                if (!response?.content) {
                    throw new Error('La réponse du modèle est vide ou nulle.');
                }

                plan = await this._parsePlanJson(response.content);
                if (!plan) {
                    throw new Error('Échec du parsing JSON. Assure-toi de renvoyer un JSON valide conforme au schéma.');
                }

                // Validation de la structure globale du plan
                if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
                    throw new Error('Le plan ne contient aucune étape dans le tableau "steps".');
                }

                // Construire la liste des outils disponibles
                const availableToolNames = new Set(
                    context.tools.map((t: any) => t.function?.name || t.name).filter(Boolean)
                );

                // Valider chaque étape individuellement
                for (let i = 0; i < plan.steps.length; i++) {
                    const step = plan.steps[i];
                    if (!step || typeof step !== 'object') {
                        throw new Error(`L'étape ${i + 1} du plan est invalide (n'est pas un objet).`);
                    }
                    if (!step.action) {
                        throw new Error(`L'étape d'index ${i} du plan est invalide : la propriété "action" est manquante.`);
                    }
                    if (!step.tool) {
                        throw new Error(`L'étape "${step.action}" (index ${i}) est invalide : la propriété "tool" est manquante.`);
                    }
                    if (typeof step.id !== 'number') {
                        step.id = i + 1; // Auto-correction
                    }

                    // Validation et auto-correction des outils hallucinés
                    if (!availableToolNames.has(step.tool)) {
                        console.warn(`[Planner] ⚠️ Étape ${step.id}: outil "${step.tool}" halluciné`);
                        const closest = [...availableToolNames].find(t =>
                            step.tool.includes(t) || t.includes(step.tool) ||
                            step.tool.replace(/_/g, '').includes(t.replace(/_/g, ''))
                        );
                        if (closest) {
                            console.log(`[Planner] 🔧 Auto-correction: "${step.tool}" → "${closest}"`);
                            step.tool = closest;
                        } else {
                            throw new Error(`L'outil "${step.tool}" spécifié à l'étape ${step.id} n'existe pas dans la liste des outils disponibles.`);
                        }
                    }
                }

                // Vérification métier : forcer au moins 2 étapes pour les requêtes complexes/composées
                const isComplexQuery = goal.toLowerCase().match(/(?: et | puis | ensuite | après | extraire | extrais | résumé | screenshot | capture | faire | créer | sauvegarder | enregistrer)/i);
                if (isComplexQuery && plan.steps.length < 2) {
                    throw new Error('Le plan généré comporte seulement 1 étape. Pour cette tâche complexe, tu DOIS décomposer l\'action en au moins 2 étapes distinctes (ex: 1. Naviguer/Chercher les informations, 2. Formater/Extraire/Envoyer le livrable). Ne fusionne pas ces étapes.');
                }

                // Si toutes les vérifications passent, on sort de la boucle de retry
                break;
            } catch (err: any) {
                console.warn(`[Planner] ⚠️ Tentative ${attempts}/${maxAttempts} échouée: ${err.message}`);
                if (attempts >= maxAttempts) {
                    throw new Error(`Planification impossible après ${maxAttempts} tentatives. Dernière erreur: ${err.message}`);
                }
                // Alimenter l'historique pour la tentative suivante avec le feedback d'erreur
                chatHistory.push({ role: 'assistant', content: response?.content || 'Plan malformé ou incomplet' });
                chatHistory.push({ role: 'user', content: `ERREUR DE PLANIFICATION: ${err.message}\n\nVeuillez corriger le plan et me renvoyer uniquement le JSON valide contenant toutes les étapes nécessaires.` });
            }
        }

        console.log(`[Planner] ✅ Plan validé après ${attempts} tentative(s) : ${plan.steps.length} étapes`);

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
You are HIVE-MIND's adaptive PLANNER recovering from an execution failure.
Your mission is to analyze the execution history, identify the root cause of the failure, and formulate a new, viable plan to achieve the goal.
</role>

<context>
Original Goal:
"${originalPlan.goal}"

Execution Status:
- Completed Steps: ${executionLog.completed.join(', ') || 'none'}
- Failed Steps: ${executionLog.failed.join(', ')}
</context>

<execution_history_details>
${detailedStepsLog}
</execution_history_details>

<available_tools>
${detailedToolsList || 'No tool list provided'}
</available_tools>

<replanning_instructions>
Formulate your new plan using these guidelines:
1. FAILURE ANALYSIS: Analyze why the previous steps failed. Formulate an alternate strategy that circumvents the error.
2. DECOMPOSE THE REMAINING TASK: Split complex remaining operations into separate steps (e.g., separate data collection from processing or file creation).
3. MATCH TOOLS ACCURATELY: Choose tool names exclusively from the list of available tools. Verify that each selected tool exists exactly as defined.
4. CHOOSE THE RIGHT TOOL:
   - Use \`execute_bash_command\` for terminal actions, running Node scripts, and creating files in the filesystem.
   - Reserve \`code_execution\` only for lightweight orchestration of multiple HIVE tools.
5. DEFINE COMPLETE PARAMETERS: For every step, provide all required properties for the chosen tool. Use exact selectors or coordinates found in the execution log if navigating/clicking.
6. PASS DATA SEQUENTIALLY: Reuse outputs from previous steps by using the variable interpolation syntax "{{step_X_propertyName}}" (e.g., {"filePath": "{{step_1_filePath}}"} or "{{step_1_result}}").
7. DRAFT CONCISE QUERIES: When using search tools (\`google_ai_search\`, \`duckduck_search\`, \`wikipedia\`), write a short, concise search query (maximum of 15 words) for the query parameter. Avoid passing large chunks of text or variable references like "{{step_X_result}}".
</replanning_instructions>

<output_format>
Your response must consist of two parts:
1. A brief "Thinking" section explaining why the previous run failed and how you are adjusting the plan.
2. A "Plan JSON" block containing the corrected structured plan, wrapped in markdown triple backticks.

Example format:
Thinking:
The previous step failed because the selector was not found on the page. I will first use browser_eval to inspect the DOM, then click the correct element.

\`\`\`json
{
  "steps": [
    {
      "id": 1,
      "action": "Inspect the DOM to find the correct selector",
      "tool": "browser_eval",
      "params": {
        "expression": "document.body.innerHTML"
      },
      "estimated_time": 10,
      "depends_on": []
    }
  ],
  "total_time_estimate": 10,
  "complexity": "medium"
}
\`\`\`
</output_format>

New plan:`;

        let attempts = 0;
        const maxAttempts = 3;
        let newPlan: any = null;
        let chatHistory: any[] = [
            { role: 'system', content: 'Tu es un planificateur expert en récupération d\'échecs.' },
            { role: 'user', content: replanPrompt }
        ];

        while (attempts < maxAttempts) {
            attempts++;
            let response: any = null;
            try {
                response = await providerRouter.chat(chatHistory, { temperature: 0.5 });
                if (!response?.content) {
                    throw new Error('AI response for replan is empty');
                }

                newPlan = await this._parsePlanJson(response.content);
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

                break;
            } catch (err: any) {
                console.warn(`[Planner] ⚠️ Tentative replan ${attempts}/${maxAttempts} échouée: ${err.message}`);
                if (attempts >= maxAttempts) {
                    console.error('[Planner] Erreur replanification:', err.message);
                    return {
                        ...executionLog,
                        replanFailed: true
                    };
                }
                chatHistory.push({ role: 'assistant', content: response?.content || 'Plan malformé ou incomplet' });
                chatHistory.push({ role: 'user', content: `ERREUR DE PLANIFICATION: ${err.message}\n\nVeuillez corriger le plan et me renvoyer uniquement le JSON valide.` });
            }
        }

        console.log('[Planner] ✅ Nouveau plan créé, réexécution...');

        // Execute with the new plan (guard flag already set, so no recursive replan)
        return await this.execute({ ...originalPlan, steps: newPlan.steps }, context, executionLog);
    }
}

// Export singleton
export const planner = new ExplicitPlanner();
export default planner;
