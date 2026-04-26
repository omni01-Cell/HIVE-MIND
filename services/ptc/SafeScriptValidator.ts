/**
 * SafeScriptValidator — Validation statique + Auto-Repair du code LLM
 *
 * WHY: Les LLM peuvent générer du JS avec des erreurs de syntaxe, des variables
 * non définies, ou des appels à des fonctions inexistantes. Ce validateur attrape
 * ces erreurs AVANT l'exécution dans le sandbox VM, et tente de les réparer
 * automatiquement quand c'est possible.
 *
 * ARCHITECTURE (3 couches — seules les couches 1 et 3 sont ici) :
 *   Layer 1 : Analyse AST (acorn) — syntaxe + scope + sécurité
 *   Layer 2 : Proxy runtime (dans ProgrammaticExecutor) — gardes pendant l'exécution
 *   Layer 3 : Auto-Repair — correction des erreurs de syntaxe courantes
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ValidationError {
    readonly type: 'SYNTAX' | 'UNDEFINED_VAR' | 'UNKNOWN_TOOL' | 'UNSAFE_CONSTRUCT';
    readonly message: string;
    readonly line?: number;
    readonly column?: number;
    readonly autoFixable: boolean;
}

export interface ValidationWarning {
    readonly type: 'INFINITE_LOOP' | 'MISSING_AWAIT' | 'MISSING_RETURN';
    readonly message: string;
}

export interface ValidationResult {
    readonly isValid: boolean;
    readonly errors: readonly ValidationError[];
    readonly warnings: readonly ValidationWarning[];
}

export interface RepairResult {
    readonly success: boolean;
    readonly repairedCode: string | null;
    readonly appliedFixes: readonly string[];
}

// Globales JS toujours disponibles dans le sandbox
const JS_BUILTINS = new Set([
    'console', 'JSON', 'Array', 'Object', 'Math', 'Date',
    'Error', 'Map', 'Set', 'Promise', 'parseInt', 'parseFloat',
    'isNaN', 'isFinite', 'String', 'Number', 'Boolean', 'RegExp',
    'setTimeout', 'undefined', 'null', 'true', 'false', 'Infinity', 'NaN',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
]);

// Helpers défensifs injectés par SandboxHelpers.ts
const SANDBOX_HELPERS = new Set([
    'toArray', 'safeGet', 'safeMap', 'safeFilter', 'first', 'len',
    'isSuccess', 'extractData', 'extractText', 'getCommandOutput',
]);

// Constructions JS dangereuses interdites dans le sandbox
const UNSAFE_FUNCTIONS = new Set([
    'eval', 'Function', 'require', 'import', 'process', 'globalThis',
    '__proto__', 'constructor',
]);

// ─────────────────────────────────────────────────────────────
// LAYER 1 : STATIC VALIDATOR (AST Analysis)
// ─────────────────────────────────────────────────────────────

/**
 * Valide le code JS généré par le LLM avant exécution.
 *
 * @param code — Code brut du LLM
 * @param availableTools — Noms des outils injectés dans le sandbox
 * @returns Résultat de validation avec erreurs et warnings
 */
export function validateCode(
    code: string,
    availableTools: readonly string[],
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Construire le set complet des identifiants autorisés
    const allowedGlobals = new Set([
        ...JS_BUILTINS,
        ...SANDBOX_HELPERS,
        ...availableTools,
    ]);

    // 1. Parse AST
    let ast: acorn.Node;
    try {
        ast = acorn.parse(code, {
            ecmaVersion: 2022,
            sourceType: 'script',
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
        });
    } catch (parseErr: any) {
        errors.push({
            type: 'SYNTAX',
            message: parseErr.message,
            line: parseErr.loc?.line,
            column: parseErr.loc?.column,
            autoFixable: true,
        });
        return { isValid: false, errors, warnings };
    }

    // 2. Collecter les déclarations et usages
    const declaredVars = new Set<string>();
    const usedIdentifiers = new Set<string>();
    const calledFunctions = new Set<string>();
    const functionParams = new Set<string>();

    // Collecter les déclarations de variables et paramètres de fonctions
    walk.simple(ast, {
        VariableDeclarator(node: any) {
            if (node.id?.type === 'Identifier') {
                declaredVars.add(node.id.name);
            }
            // Destructuring : const { a, b } = ...
            if (node.id?.type === 'ObjectPattern') {
                for (const prop of node.id.properties || []) {
                    if (prop.value?.type === 'Identifier') declaredVars.add(prop.value.name);
                    else if (prop.key?.type === 'Identifier') declaredVars.add(prop.key.name);
                }
            }
            // Array destructuring : const [a, b] = ...
            if (node.id?.type === 'ArrayPattern') {
                for (const el of node.id.elements || []) {
                    if (el?.type === 'Identifier') declaredVars.add(el.name);
                }
            }
        },
        FunctionDeclaration(node: any) {
            if (node.id?.name) declaredVars.add(node.id.name);
            for (const param of node.params || []) {
                if (param.type === 'Identifier') functionParams.add(param.name);
            }
        },
        ArrowFunctionExpression(node: any) {
            for (const param of node.params || []) {
                if (param.type === 'Identifier') functionParams.add(param.name);
            }
        },
        CatchClause(node: any) {
            if (node.param?.type === 'Identifier') declaredVars.add(node.param.name);
        },
        ForInStatement(node: any) {
            if (node.left?.type === 'VariableDeclaration') {
                for (const decl of node.left.declarations || []) {
                    if (decl.id?.type === 'Identifier') declaredVars.add(decl.id.name);
                }
            }
        },
        ForOfStatement(node: any) {
            if (node.left?.type === 'VariableDeclaration') {
                for (const decl of node.left.declarations || []) {
                    if (decl.id?.type === 'Identifier') declaredVars.add(decl.id.name);
                }
            }
        },
    });

    // Collecter les identifiants utilisés (pas les déclarations)
    walk.ancestor(ast, {
        Identifier(node: any, ancestors: any[]) {
            const parent = ancestors[ancestors.length - 2];
            if (!parent) return;

            // Ignorer si c'est la partie gauche d'une déclaration
            if (parent.type === 'VariableDeclarator' && parent.id === node) return;
            // Ignorer les propriétés d'objets (obj.prop → ignorer 'prop')
            if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
            // Ignorer les clés de propriétés d'objets littéraux
            if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
            // Ignorer les labels
            if (parent.type === 'LabeledStatement') return;

            usedIdentifiers.add(node.name);
        },
        CallExpression(node: any) {
            if (node.callee?.type === 'Identifier') {
                calledFunctions.add(node.callee.name);
            }
        },
    });

    // 3. Vérifier les variables non définies
    for (const name of usedIdentifiers) {
        if (
            !declaredVars.has(name) &&
            !functionParams.has(name) &&
            !allowedGlobals.has(name)
        ) {
            errors.push({
                type: 'UNDEFINED_VAR',
                message: `Variable "${name}" utilisée mais jamais déclarée. Déclarez-la avec const/let ou vérifiez le nom.`,
                autoFixable: false,
            });
        }
    }

    // 4. Vérifier les appels à des fonctions inexistantes
    for (const fnName of calledFunctions) {
        if (
            !availableTools.includes(fnName) &&
            !SANDBOX_HELPERS.has(fnName) &&
            !JS_BUILTINS.has(fnName) &&
            !declaredVars.has(fnName) &&
            !functionParams.has(fnName)
        ) {
            // Tenter de trouver un outil similaire (fuzzy)
            const suggestion = findClosestTool(fnName, [...availableTools]);
            const hint = suggestion
                ? ` Vouliez-vous dire "${suggestion}" ?`
                : ` Outils disponibles : ${availableTools.join(', ')}`;
            errors.push({
                type: 'UNKNOWN_TOOL',
                message: `Fonction "${fnName}" n'existe pas.${hint}`,
                autoFixable: false,
            });
        }
    }

    // 5. Bloquer les constructions dangereuses
    walk.simple(ast, {
        CallExpression(node: any) {
            const calleeName =
                node.callee?.name ||
                node.callee?.property?.name;
            if (calleeName && UNSAFE_FUNCTIONS.has(calleeName)) {
                errors.push({
                    type: 'UNSAFE_CONSTRUCT',
                    message: `"${calleeName}()" est interdit dans le sandbox.`,
                    autoFixable: false,
                });
            }
        },
        MemberExpression(node: any) {
            if (
                node.property?.type === 'Identifier' &&
                (node.property.name === '__proto__' || node.property.name === 'constructor')
            ) {
                errors.push({
                    type: 'UNSAFE_CONSTRUCT',
                    message: `Accès à "${node.property.name}" est interdit (prototype pollution).`,
                    autoFixable: false,
                });
            }
        },
    });

    // 6. Warnings (non-bloquants)
    walk.simple(ast, {
        WhileStatement(node: any) {
            if (node.test?.type === 'Literal' && node.test.value === true) {
                warnings.push({
                    type: 'INFINITE_LOOP',
                    message: 'while(true) détecté — risque de boucle infinie.',
                });
            }
        },
        ForStatement(node: any) {
            if (!node.test) {
                warnings.push({
                    type: 'INFINITE_LOOP',
                    message: 'for(;;) détecté — risque de boucle infinie.',
                });
            }
        },
    });

    // 7. Warning si pas de `return` dans le code top-level
    const hasReturn = code.includes('return ');
    if (!hasReturn && calledFunctions.size > 0) {
        warnings.push({
            type: 'MISSING_RETURN',
            message: 'Le code ne contient pas de `return`. Le résultat pourrait être undefined.',
        });
    }

    return { isValid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────
// LAYER 3 : AUTO-REPAIR
// ─────────────────────────────────────────────────────────────

/**
 * Tente de réparer automatiquement les erreurs de syntaxe courantes.
 * Ne modifie JAMAIS la logique — uniquement la syntaxe.
 *
 * @param code — Code original avec erreurs
 * @param errors — Erreurs détectées par validateCode
 * @returns Code réparé si possible, null sinon
 */
export function autoRepairCode(
    code: string,
    errors: readonly ValidationError[],
): RepairResult {
    let repaired = code;
    const appliedFixes: string[] = [];

    for (const error of errors) {
        if (!error.autoFixable) continue;

        const msg = error.message.toLowerCase();

        // Fix 1: Parenthèses / accolades / crochets déséquilibrés
        if (msg.includes('unexpected end of input') || msg.includes('unexpected token')) {
            const parenDiff = countChar(repaired, '(') - countChar(repaired, ')');
            if (parenDiff > 0) {
                repaired += ')'.repeat(parenDiff);
                appliedFixes.push(`Ajouté ${parenDiff} parenthèse(s) fermante(s)`);
            }

            const braceDiff = countChar(repaired, '{') - countChar(repaired, '}');
            if (braceDiff > 0) {
                repaired += '}'.repeat(braceDiff);
                appliedFixes.push(`Ajouté ${braceDiff} accolade(s) fermante(s)`);
            }

            const bracketDiff = countChar(repaired, '[') - countChar(repaired, ']');
            if (bracketDiff > 0) {
                repaired += ']'.repeat(bracketDiff);
                appliedFixes.push(`Ajouté ${bracketDiff} crochet(s) fermant(s)`);
            }
        }

        // Fix 2: Point-virgule manquant provoquant "unexpected identifier"
        if (msg.includes('unexpected identifier') && error.line && error.line > 1) {
            const lines = repaired.split('\n');
            const prevLine = lines[error.line - 2]?.trim();
            if (prevLine && !prevLine.endsWith(';') && !prevLine.endsWith('{') && !prevLine.endsWith(',')) {
                lines[error.line - 2] = lines[error.line - 2].trimEnd() + ';';
                repaired = lines.join('\n');
                appliedFixes.push(`Ajouté ";" à la fin de la ligne ${error.line - 1}`);
            }
        }

        // Fix 3: Template literal mal fermé
        if (msg.includes('unterminated template')) {
            const backtickCount = countChar(repaired, '`');
            if (backtickCount % 2 !== 0) {
                repaired += '`';
                appliedFixes.push('Fermé template literal (backtick manquant)');
            }
        }

        // Fix 4: String non terminée
        if (msg.includes('unterminated string')) {
            // Compter les guillemets simples et doubles non échappés
            const singleQuotes = (repaired.match(/(?<!\\)'/g) || []).length;
            if (singleQuotes % 2 !== 0) {
                repaired += "'";
                appliedFixes.push("Fermé string (guillemet simple manquant)");
            }
            const doubleQuotes = (repaired.match(/(?<!\\)"/g) || []).length;
            if (doubleQuotes % 2 !== 0) {
                repaired += '"';
                appliedFixes.push('Fermé string (guillemet double manquant)');
            }
        }
    }

    // Fix global : `await` manquant sur les appels d'outils connus
    // Pattern: `const x = search_web(...)` sans `await`
    // On ne fait ce fix que si aucune erreur non-fixable n'a été trouvée
    const hasNonFixable = errors.some((e) => !e.autoFixable);
    if (!hasNonFixable) {
        const awaitPattern = /(\b(?:const|let|var)\s+\w+\s*=\s*)(?!await\s)(\w+\s*\()/g;
        const withAwait = repaired.replace(awaitPattern, '$1await $2');
        if (withAwait !== repaired) {
            repaired = withAwait;
            appliedFixes.push('Ajouté "await" manquant sur les appels d\'outils');
        }
    }

    if (appliedFixes.length === 0) {
        return { success: false, repairedCode: null, appliedFixes: [] };
    }

    // Re-valider le code réparé (syntaxe uniquement)
    try {
        acorn.parse(repaired, {
            ecmaVersion: 2022,
            sourceType: 'script',
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
        });
        console.log(`[SafeScript] 🔧 Auto-repair réussi: ${appliedFixes.join(', ')}`);
        return { success: true, repairedCode: repaired, appliedFixes };
    } catch {
        console.warn(`[SafeScript] 🔧 Auto-repair tenté mais échoué: ${appliedFixes.join(', ')}`);
        return { success: false, repairedCode: null, appliedFixes };
    }
}

// ─────────────────────────────────────────────────────────────
// TOOL CALL COUNTING (Anti-gaspillage)
// ─────────────────────────────────────────────────────────────

/**
 * Compte le nombre d'appels uniques à des outils dans le code.
 * Utilisé pour rejeter le PTC quand le LLM n'appelle qu'un seul outil
 * (dans ce cas, le Tool Calling natif est plus rapide).
 *
 * @param code — Code JS à analyser
 * @param availableTools — Noms des outils disponibles
 * @returns Nombre d'appels d'outils distincts (pas les helpers JS)
 */
export function countToolCalls(
    code: string,
    availableTools: readonly string[],
): number {
    const toolSet = new Set(availableTools);
    let count = 0;

    try {
        const ast = acorn.parse(code, {
            ecmaVersion: 2022,
            sourceType: 'script',
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
        });

        walk.simple(ast, {
            CallExpression(node: any) {
                const name = node.callee?.type === 'Identifier'
                    ? node.callee.name
                    : null;
                if (name && toolSet.has(name)) {
                    count++;
                }
            },
        });
    } catch {
        // Si le code ne parse pas, on ne peut pas compter → laisser passer
        // La validation SafeScript gérera l'erreur après
        return 999;
    }

    return count;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Compte les occurrences d'un caractère dans une string */
function countChar(str: string, char: string): number {
    let count = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === char) count++;
    }
    return count;
}

/** Trouve l'outil le plus proche par distance de Levenshtein */
function findClosestTool(input: string, tools: readonly string[]): string | null {
    const inputLower = input.toLowerCase();
    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const tool of tools) {
        const d = levenshtein(inputLower, tool.toLowerCase());
        // Seuil : max 3 caractères de différence ou 40% de la longueur
        if (d < bestDistance && d <= Math.max(3, Math.floor(tool.length * 0.4))) {
            bestDistance = d;
            bestMatch = tool;
        }
    }

    return bestMatch;
}

/** Distance de Levenshtein (implémentation compacte) */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}
