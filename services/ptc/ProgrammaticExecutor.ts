/**
 * ProgrammaticExecutor — Cœur du Programmatic Tool Calling (PTC)
 * 
 * WHY: Remplace la boucle ReAct multi-round-trip par une exécution unique.
 * Le LLM génère un script JS → on l'exécute dans un VM sandbox → seul le résultat final
 * revient au LLM. Économise ~80% de tokens sur les requêtes multi-tools.
 * 
 * ARCHITECTURE:
 *   1. Le LLM reçoit un meta-tool `code_execution` en plus des tools normaux
 *   2. S'il décide de l'utiliser, il génère du code JS orchestrant N tools
 *   3. Ce code est exécuté ici dans un Node.js `vm` sandbox
 *   4. Les tools sont injectés comme fonctions globales dans le sandbox
 *   5. Seul le résultat final est renvoyé au LLM (pas les résultats intermédiaires)
 */

import { createContext, Script } from 'node:vm';
import type {
    ToolCallRecord,
    PTCExecutionResult,
    PTCConfig,
    ToolFunction,
    OpenAIToolDefinition,
} from './types.js';
import { SANDBOX_HELPERS_SOURCE } from './SandboxHelpers.js';
import { validateCode, autoRepairCode } from './SafeScriptValidator.js';

const DEFAULT_CONFIG: PTCConfig = {
    timeoutMs: 30_000,
    baseContextTokens: 7_000,
};

export class ProgrammaticExecutor {
    private readonly config: PTCConfig;

    constructor(config: Partial<PTCConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    /**
     * Crée la définition du meta-tool `code_execution` au format OpenAI.
     * La description inclut la liste des tools disponibles pour guider le LLM.
     */
    buildCodeExecutionToolDef(
        availableTools: readonly OpenAIToolDefinition[],
    ): OpenAIToolDefinition {
        const toolDocs = availableTools
            .map((t) => {
                const fn = t.function;
                const params = fn.parameters?.properties
                    ? Object.entries(fn.parameters.properties)
                          .map(([key, val]: [string, any]) => {
                              const type = val.type || 'any';
                              const desc = val.description || '';
                              return `    - ${key}: ${type}${desc ? ` — ${desc}` : ''}`;
                          })
                          .join('\n')
                    : '    (pas de paramètres)';
                return `• ${fn.name}: ${fn.description}\n${params}`;
            })
            .join('\n\n');

        return {
            type: 'function',
            function: {
                name: 'code_execution',
                description: `Exécute du code JavaScript pour orchestrer PLUSIEURS appels d'outils en une seule fois.
UTILISE CET OUTIL quand tu dois faire 3 appels d'outils ou plus. C'est BEAUCOUP plus rapide et économique.

QUAND UTILISER:
- Récupérer des données de plusieurs sources en parallèle
- Traiter des listes ou faire des opérations en lot
- Chaîner des outils (résultat de l'un → entrée de l'autre)
- Agréger ou filtrer des résultats

OUTILS DISPONIBLES DANS LE CODE:
${toolDocs}

HELPERS DÉFENSIFS (toujours disponibles):
- toArray(value) — Convertit en array (null → [], objet → extrait .items/.data)
- safeGet(obj, 'path.to.prop', default) — Accès sûr
- safeMap(value, fn) — Map sûr
- isSuccess(response) — Vérifie succès
- extractText(response) — Extrait du texte

EXEMPLE:
\`\`\`javascript
const [meteo1, meteo2, meteo3] = await Promise.all([
  get_weather({ city: 'Paris' }),
  get_weather({ city: 'Lyon' }),
  get_weather({ city: 'Marseille' })
]);
return { paris: meteo1, lyon: meteo2, marseille: meteo3 };
\`\`\`

RÈGLES:
1. Appeler chaque outil avec UN SEUL objet: nomOutil({ param1: val, param2: val })
2. TOUJOURS retourner le résultat final avec \`return\`
3. Utiliser \`await\` pour chaque appel d'outil
4. Utiliser \`Promise.all()\` pour les appels parallèles`,
                parameters: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            description:
                                'Code JavaScript à exécuter. Peut utiliser async/await. Les outils sont disponibles comme fonctions globales. Retourner le résultat final avec return.',
                        },
                    },
                    required: ['code'],
                },
            },
        };
    }

    /**
     * Exécute le code JS généré par le LLM dans un sandbox VM.
     * 
     * @param code — Code JS généré par le LLM
     * @param toolFunctions — Map nom → fonction exécutable pour chaque outil
     * @returns Résultat + métriques d'économies de tokens
     */
    async execute(
        code: string,
        toolFunctions: ReadonlyMap<string, ToolFunction>,
    ): Promise<PTCExecutionResult> {
        const startTime = Date.now();
        const toolCalls: ToolCallRecord[] = [];
        const availableToolNames = [...toolFunctions.keys()];

        // ── Guard : Rejeter si le code n'appelle qu'un seul outil ──
        // Le PTC est rentable à partir de 2+ appels d'outils.
        // Pour 1 seul outil, le Tool Calling natif est plus rapide (~10ms de vérification AST
        // au lieu de ~2-5s d'un round-trip LLM gaspillé si le code est buggé).
        const { countToolCalls } = await import('./SafeScriptValidator.js');
        const toolCallCount = countToolCalls(code, availableToolNames);
        if (toolCallCount < 2) {
            console.log(`[PTC] ⏭️ Code rejeté : seulement ${toolCallCount} appel(s) d'outil détecté(s). Tool Calling natif plus efficace.`);
            throw new Error('PTC_SINGLE_TOOL: Le code ne contient qu\'un seul appel d\'outil. Utilise le tool calling natif.');
        }

        // ── Layer 1 : Validation statique (AST + scope) ──
        let validatedCode = code;
        const validation = validateCode(code, availableToolNames);

        if (!validation.isValid) {
            // Tenter l'auto-repair (Layer 3)
            const repair = autoRepairCode(code, validation.errors);
            if (repair.success && repair.repairedCode) {
                console.log(`[PTC] 🔧 SafeScript auto-repair: ${repair.appliedFixes.join(', ')}`);
                // Re-valider le code réparé
                const revalidation = validateCode(repair.repairedCode, availableToolNames);
                if (revalidation.isValid) {
                    validatedCode = repair.repairedCode;
                } else {
                    // Erreurs non-fixables après repair
                    const errorSummary = revalidation.errors.map((e) => `${e.type}: ${e.message}`).join('; ');
                    throw new Error(`[PTC] SafeScript — Erreurs non-réparables: ${errorSummary}`);
                }
            } else {
                // Pas de repair possible
                const errorSummary = validation.errors.map((e) => `${e.type}: ${e.message}`).join('; ');
                throw new Error(`[PTC] SafeScript — Code invalide: ${errorSummary}`);
            }
        }

        // Log warnings (non-bloquants)
        for (const warning of validation.warnings) {
            console.warn(`[PTC] ⚠️ SafeScript warning: ${warning.type} — ${warning.message}`);
        }

        // Construire le contexte VM avec les tools injectés
        const sandboxGlobals = this.buildSandboxContext(toolFunctions, toolCalls);

        // ── Layer 2 : Scope Guard (Proxy) — appliqué dans buildSandboxContext ──

        // Wrapper async : le code utilisateur est dans une async IIFE
        const wrappedCode = `
${SANDBOX_HELPERS_SOURCE}

(async () => {
    try {
        const __result = await (async () => {
            ${validatedCode}
        })();
        __resolve(__result);
    } catch (err) {
        __reject(err);
    }
})();
`;

        // Exécuter dans le VM
        const output = await this.runInVM(wrappedCode, sandboxGlobals);

        const executionTime = Date.now() - startTime;
        const tokenSavings = this.calculateTokenSavings(toolCalls);

        console.log(
            `[PTC] ✅ Exécution terminée: ${toolCalls.length} tool calls en ${executionTime}ms, ~${tokenSavings.totalSaved} tokens économisés`,
        );

        // Sérialiser le résultat
        const serializableOutput = this.safeSerialize(output, toolCalls);

        return {
            result: serializableOutput,
            metadata: {
                toolCallCount: toolCalls.length,
                intermediateTokensSaved: tokenSavings.intermediateResults,
                totalTokensSaved: tokenSavings.totalSaved,
                tokenSavingsBreakdown: tokenSavings,
                toolsUsed: [...new Set(toolCalls.map((c) => c.toolName))],
                executionTimeMs: executionTime,
                sandboxToolCalls: toolCalls,
            },
        };
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVATE
    // ─────────────────────────────────────────────────────────────

    /**
     * Construit le contexte global injecté dans le VM.
     * Chaque outil HIVE-MIND devient une fonction globale `async toolName(args)`.
     */
    private buildSandboxContext(
        toolFunctions: ReadonlyMap<string, ToolFunction>,
        toolCalls: ToolCallRecord[],
    ): Record<string, unknown> {
        const globals: Record<string, unknown> = {
            // Standard JS globals nécessaires dans le VM
            console: {
                log: (...args: unknown[]) => console.log('[PTC:sandbox]', ...args),
                warn: (...args: unknown[]) => console.warn('[PTC:sandbox]', ...args),
                error: (...args: unknown[]) => console.error('[PTC:sandbox]', ...args),
            },
            setTimeout,
            Promise,
            JSON,
            Array,
            Object,
            Math,
            Date,
            Error,
            Map,
            Set,
            parseInt,
            parseFloat,
            isNaN,
            isFinite,
            String,
            Number,
            Boolean,
            RegExp,
            encodeURIComponent,
            decodeURIComponent,
            encodeURI,
            decodeURI,
        };

        // Injecter chaque outil comme fonction globale
        for (const [name, fn] of toolFunctions) {
            globals[name] = async (args: Record<string, unknown>) => {
                const callStart = Date.now();
                const record: ToolCallRecord = { toolName: name, args };
                toolCalls.push(record);

                try {
                    const result = await fn(args);
                    record.result = result;
                    record.executionTimeMs = Date.now() - callStart;
                    return result;
                } catch (err: unknown) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    record.error = errorMsg;
                    record.executionTimeMs = Date.now() - callStart;
                    // Retourner l'erreur au code au lieu de crasher
                    return { success: false, error: errorMsg, gracefulDegradation: true };
                }
            };
        }

        // ── Layer 2 : Scope Guard (Proxy) ──
        // Empêche l'accès silencieux à des variables non définies.
        // Sans ça, `undefinedVar` retourne `undefined` au lieu de lancer une erreur.
        return this.createGuardedContext(globals);
    }

    /**
     * Enveloppe les globals dans un Proxy qui lance des ReferenceError explicites
     * pour toute variable non injectée. Empêche les bugs silencieux.
     */
    private createGuardedContext(
        globals: Record<string, unknown>,
    ): Record<string, unknown> {
        return new Proxy(globals, {
            get(target, prop: string | symbol) {
                if (typeof prop === 'symbol') return Reflect.get(target, prop);
                if (prop in target) return target[prop as string];

                // Variables internes du VM à ignorer
                const vmInternals = ['global', 'globalThis', 'GLOBAL', 'root', 'window', 'self'];
                if (vmInternals.includes(prop as string)) return undefined;

                // Variable non définie → erreur explicite
                throw new ReferenceError(
                    `[SafeScript] "${String(prop)}" n'est pas défini. ` +
                    `Vérifiez le nom de la variable ou de l'outil.`,
                );
            },
            set(target, prop: string | symbol, value) {
                // Permettre la création de variables dans le scope
                target[prop as string] = value;
                return true;
            },
            has() {
                // Retourner true pour forcer le VM à passer par get()
                // au lieu de ReferenceError silencieux
                return true;
            },
        });
    }

    /**
     * Exécute le code dans un Node.js VM isolé.
     * Utilise une Promise pour gérer le résultat async.
     */
    private runInVM(
        code: string,
        sandboxGlobals: Record<string, unknown>,
    ): Promise<unknown> {
        return new Promise((resolve, reject) => {
            // Injecter les callbacks de résolution dans le sandbox
            sandboxGlobals.__resolve = resolve;
            sandboxGlobals.__reject = (err: unknown) => {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(String(err)));
                }
            };

            const context = createContext(sandboxGlobals);
            const script = new Script(code, {
                filename: 'ptc-execution.js',
            });

            // Timeout de sécurité global
            const timeoutId = setTimeout(() => {
                reject(new Error(`[PTC] Timeout: exécution dépassant ${this.config.timeoutMs}ms`));
            }, this.config.timeoutMs);

            try {
                script.runInContext(context, {
                    timeout: this.config.timeoutMs,
                });
            } catch (err) {
                clearTimeout(timeoutId);
                reject(err);
                return;
            }

            // Le script est async, le resolve/reject se fera via les callbacks.
            // On nettoie le timeout quand la promise se résout.
            const cleanup = () => clearTimeout(timeoutId);
            // Patch: attacher cleanup sur la résolution
            const originalResolve = sandboxGlobals.__resolve as (v: unknown) => void;
            const originalReject = sandboxGlobals.__reject as (e: unknown) => void;
            sandboxGlobals.__resolve = (v: unknown) => { cleanup(); originalResolve(v); };
            sandboxGlobals.__reject = (e: unknown) => { cleanup(); originalReject(e); };
        });
    }

    // validateSyntax is now handled by SafeScriptValidator (Layer 1 + Layer 3)

    /** Sérialise le résultat de manière sûre (gère les objets non-sérialisables) */
    private safeSerialize(output: unknown, toolCalls: ToolCallRecord[]): unknown {
        // Si le code n'a pas retourné de valeur, utiliser les résultats des tools
        if (output === undefined || output === null) {
            if (toolCalls.length === 0) {
                return { message: 'Code exécuté sans résultat', success: true };
            }
            if (toolCalls.length === 1) {
                return toolCalls[0].result ?? { success: !toolCalls[0].error };
            }
            return {
                message: `${toolCalls.length} outils exécutés`,
                results: toolCalls.map((tc) => ({
                    tool: tc.toolName,
                    success: !tc.error,
                    result: tc.result,
                })),
            };
        }

        try {
            return JSON.parse(JSON.stringify(output));
        } catch {
            if (typeof output === 'object' && output !== null) {
                const safe: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(output)) {
                    try {
                        safe[key] = JSON.parse(JSON.stringify(value));
                    } catch {
                        safe[key] = String(value);
                    }
                }
                return safe;
            }
            return { value: String(output), type: typeof output };
        }
    }

    /**
     * Calcule les tokens économisés par rapport à la boucle ReAct classique.
     * 
     * En ReAct, chaque tool call = 1 round-trip LLM complet :
     *   - Re-envoi de tout le contexte (system + history + résultats précédents)
     *   - Le LLM décide "quoi faire ensuite" (tokens de décision)
     *   - Overhead JSON de la structure tool_call
     * 
     * En PTC, tout ça est remplacé par 1 exécution locale.
     */
    private calculateTokenSavings(toolCalls: ToolCallRecord[]): {
        intermediateResults: number;
        roundTripContext: number;
        toolCallOverhead: number;
        llmDecisions: number;
        totalSaved: number;
    } {
        const numCalls = toolCalls.length;

        if (numCalls <= 1) {
            return {
                intermediateResults: 0,
                roundTripContext: 0,
                toolCallOverhead: 0,
                llmDecisions: 0,
                totalSaved: 0,
            };
        }

        // 1. Tokens des résultats intermédiaires (jamais envoyés au LLM)
        let intermediateResults = 0;
        const resultSizes: number[] = [];
        for (const call of toolCalls) {
            if (call.result) {
                const tokens = Math.ceil(JSON.stringify(call.result).length / 4);
                intermediateResults += tokens;
                resultSizes.push(tokens);
            }
        }

        // 2. Tokens de re-envoi du contexte (base + résultats accumulés × N-1 calls)
        let roundTripContext = 0;
        let accumulated = 0;
        for (let i = 1; i < numCalls; i++) {
            accumulated += resultSizes[i - 1] || 50;
            roundTripContext += this.config.baseContextTokens + accumulated;
        }

        // 3. Overhead JSON par tool_call (~40 tokens par appel)
        const toolCallOverhead = numCalls * 40;

        // 4. Tokens de décision LLM (~80 tokens par étape de réflexion)
        const llmDecisions = (numCalls - 1) * 80;

        const totalSaved = intermediateResults + roundTripContext + toolCallOverhead + llmDecisions;

        return { intermediateResults, roundTripContext, toolCallOverhead, llmDecisions, totalSaved };
    }
}
