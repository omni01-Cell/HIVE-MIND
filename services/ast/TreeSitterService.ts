// services/ast/TreeSitterService.ts
// ============================================================================
// TREE-SITTER SERVICE — AST parsing engine for code intelligence
//
// WHY: Provides structural understanding of source code files via tree-sitter
// WASM bindings. Enables skeleton extraction, function isolation, and
// symbol-level operations that are 80-95% more token-efficient than raw
// file reading for the LLM.
//
// ARCHITECTURE:
// - Uses web-tree-sitter (WASM) for portability (no native compilation)
// - Language parsers are lazily loaded and cached
// - Queries capture definitions and references per-language
// ============================================================================

import * as path from 'path';
import * as fs from 'fs';
import { Parser, Language, Query, Node as SyntaxNode } from 'web-tree-sitter';
import { LANGUAGE_MAP } from './queries.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SymbolDefinition {
    /** Symbol name (e.g., "processData", "UserService") */
    name: string;
    /** Symbol kind (function, method, class, interface, enum, type) */
    kind: string;
    /** Parent symbol name for nested definitions (e.g., "UserService" for method "getUser") */
    parent?: string;
    /** 0-indexed start line in the file */
    startLine: number;
    /** 0-indexed end line in the file */
    endLine: number;
    /** Number of lines in the definition */
    lineCount: number;
    /** The definition's signature line text */
    signatureLine: string;
    /** Indentation of the definition */
    indentation: string;
}

export interface SymbolReference {
    /** Referenced symbol name */
    name: string;
    /** File path where the reference is found */
    filePath: string;
    /** 0-indexed line number */
    line: number;
    /** The line text containing the reference */
    lineText: string;
    /** Whether this is a definition or just a reference */
    isDefinition: boolean;
}

// ── Singleton State ────────────────────────────────────────────────────────

let isInitialized = false;
let initPromise: Promise<void> | null = null;

const languageCache = new Map<string, Language>();
const queryCache = new Map<string, Query>();

// ── Initialization ─────────────────────────────────────────────────────────

async function ensureInitialized(): Promise<void> {
    if (isInitialized) return;
    if (!initPromise) {
        initPromise = Parser.init({
            locateFile(scriptName: string) {
                // WHY: web-tree-sitter needs its own WASM file (tree-sitter.wasm)
                const localPath = path.join(__dirname, scriptName);
                if (fs.existsSync(localPath)) return localPath;
                return path.join(process.cwd(), 'node_modules', 'web-tree-sitter', scriptName);
            },
        }).then(() => {
            isInitialized = true;
        });
    }
    return initPromise;
}

async function loadLanguage(langName: string): Promise<Language> {
    const cached = languageCache.get(langName);
    if (cached) return cached;

    const wasmName = `tree-sitter-${langName}.wasm`;
    const searchPaths = [
        path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out', wasmName),
        path.join(__dirname, wasmName),
    ];

    for (const wasmPath of searchPaths) {
        try {
            if (fs.existsSync(wasmPath)) {
                const language = await Language.load(wasmPath);
                languageCache.set(langName, language);
                return language;
            }
        } catch { /* try next path */ }
    }
    throw new Error(`[AST] WASM non trouvé pour: ${langName}. Fichier attendu: ${wasmName}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parses a file and returns all symbol definitions.
 * 
 * @param absolutePath - Full path to the source file
 * @returns Array of symbol definitions, or null if language unsupported
 */
export async function parseDefinitions(absolutePath: string): Promise<SymbolDefinition[] | null> {
    await ensureInitialized();

    const ext = path.extname(absolutePath).toLowerCase().slice(1);
    const langConfig = LANGUAGE_MAP[ext];
    if (!langConfig) return null;

    const content = fs.readFileSync(absolutePath, 'utf8');
    const language = await loadLanguage(langConfig.langName);

    const queryCacheKey = `${langConfig.langName}:def`;
    let query = queryCache.get(queryCacheKey);
    if (!query) {
        query = new Query(language, langConfig.query);
        queryCache.set(queryCacheKey, query);
    }

    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(content);

    if (!tree?.rootNode) return null;

    const captures = query.captures(tree.rootNode);
    const lines = content.split('\n');
    const definitions: SymbolDefinition[] = [];

    // Build a map of definition blocks (full nodes)
    const definitionNodes = new Map<number, { name: string; node: SyntaxNode }>();
    const nameToKind = new Map<string, string>();

    // First pass: identify definition blocks and their names
    for (const capture of captures) {
        if (capture.name.includes('definition') && !capture.name.includes('name.definition')) {
            definitionNodes.set(capture.node.id, { name: capture.name, node: capture.node });
        }
        if (capture.name.includes('name.definition')) {
            const kind = capture.name.replace('name.definition.', '');
            nameToKind.set(capture.node.text, kind);
        }
    }

    // Second pass: extract definitions with positions
    const seen = new Set<number>();
    for (const capture of captures) {
        if (!capture.name.includes('name.definition')) continue;

        const startLine = capture.node.startPosition.row;
        if (seen.has(startLine)) continue;
        seen.add(startLine);

        const kind = capture.name.replace('name.definition.', '');
        const name = capture.node.text;

        // Find the encompassing definition node
        let defNode: SyntaxNode | null = null;
        let current: SyntaxNode | null = capture.node;
        while (current) {
            if (definitionNodes.has(current.id)) {
                defNode = current;
                break;
            }
            current = current.parent;
        }

        const endLine = defNode ? defNode.endPosition.row : startLine;
        const lineCount = endLine - startLine + 1;

        // Detect parent (for methods inside classes)
        let parent: string | undefined;
        if (kind === 'method' && defNode) {
            let parentNode: SyntaxNode | null = defNode.parent;
            while (parentNode) {
                if (parentNode.type.includes('class') || parentNode.type === 'class_definition') {
                    const className = parentNode.childForFieldName('name');
                    if (className) {
                        parent = className.text;
                    }
                    break;
                }
                parentNode = parentNode.parent;
            }
        }

        definitions.push({
            name,
            kind,
            parent,
            startLine,
            endLine,
            lineCount,
            signatureLine: lines[startLine] || '',
            indentation: lines[startLine]?.match(/^\s*/)?.[0] || '',
        });
    }

    // Sort by line number
    definitions.sort((a, b) => a.startLine - b.startLine);
    return definitions;
}

/**
 * Extracts a file skeleton: definition signatures without implementation bodies.
 * This is 80-95% smaller than the full file content.
 *
 * @param absolutePath - Full path to the source file
 * @returns Formatted skeleton string with anchored lines
 */
export async function getFileSkeleton(absolutePath: string): Promise<string | null> {
    const definitions = await parseDefinitions(absolutePath);
    if (!definitions || definitions.length === 0) return null;

    const lines = fs.readFileSync(absolutePath, 'utf8').split('\n');
    const result: string[] = [];

    for (const def of definitions) {
        const prefix = def.parent ? `${def.parent}.` : '';
        const lineCountStr = def.lineCount > 1 ? ` (${def.lineCount} lines)` : '';
        result.push(`${def.indentation}${def.signatureLine.trim()}${lineCountStr}`);
    }

    return result.join('\n');
}

/**
 * Extracts a specific function/method by name from a file.
 * Supports dot-notation for class methods (e.g., "ClassName.methodName").
 *
 * @param absolutePath - Full path to the source file
 * @param functionName - Name of the function/method (supports "Class.method" syntax)
 * @returns The full function text including body, or null if not found
 */
export async function getFunction(
    absolutePath: string, 
    functionName: string
): Promise<{ content: string; startLine: number; endLine: number } | null> {
    const definitions = await parseDefinitions(absolutePath);
    if (!definitions) return null;

    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split('\n');

    // Support "ClassName.methodName" dot notation
    const parts = functionName.split('.');
    let targetName: string;
    let targetParent: string | undefined;

    if (parts.length >= 2) {
        targetParent = parts[0];
        targetName = parts[1];
    } else {
        targetName = parts[0];
    }

    const match = definitions.find(def => {
        if (def.name !== targetName) return false;
        if (targetParent && def.parent !== targetParent) return false;
        return true;
    });

    if (!match) return null;

    const extractedLines = lines.slice(match.startLine, match.endLine + 1);
    return {
        content: extractedLines.join('\n'),
        startLine: match.startLine,
        endLine: match.endLine,
    };
}

/**
 * Finds all references to a symbol across multiple files.
 *
 * @param filePaths - Array of file paths to search
 * @param symbolName - The symbol name to find
 * @param findType - 'definition', 'reference', or 'both'
 * @returns Array of references found
 */
export async function findSymbolReferences(
    filePaths: string[],
    symbolName: string,
    findType: 'definition' | 'reference' | 'both' = 'both'
): Promise<SymbolReference[]> {
    await ensureInitialized();
    const results: SymbolReference[] = [];

    for (const filePath of filePaths) {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        const langConfig = LANGUAGE_MAP[ext];
        if (!langConfig) continue;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const language = await loadLanguage(langConfig.langName);

            const queryCacheKey = `${langConfig.langName}:ref`;
            let query = queryCache.get(queryCacheKey);
            if (!query) {
                query = new Query(language, langConfig.query);
                queryCache.set(queryCacheKey, query);
            }

            const parser = new Parser();
            parser.setLanguage(language);
            const tree = parser.parse(content);
            if (!tree?.rootNode) continue;

            const captures = query.captures(tree.rootNode);
            const lines = content.split('\n');

            for (const capture of captures) {
                if (capture.node.text !== symbolName) continue;

                const isDefinition = capture.name.includes('name.definition');
                const isReference = capture.name.includes('name.reference');

                if (findType === 'definition' && !isDefinition) continue;
                if (findType === 'reference' && !isReference) continue;

                const line = capture.node.startPosition.row;
                results.push({
                    name: symbolName,
                    filePath,
                    line,
                    lineText: lines[line] || '',
                    isDefinition,
                });
            }
        } catch { /* skip unparseable files */ }
    }

    return results;
}
