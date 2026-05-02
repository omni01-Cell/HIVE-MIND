// plugins/base/dev_tools/ASTTools.ts
// ============================================================================
// AST-NATIVE TOOLS — Tree-sitter powered code intelligence for the LLM
//
// WHY: These tools are 80-95% more token-efficient than raw file reading.
// Instead of sending 500 lines of code for a single function edit, we can:
// - get_file_skeleton: Show only signatures (~20 lines vs 500)
// - get_function: Extract just the target function (~30 lines vs 500)
// - find_symbol_references: Locate all usages without grep ambiguity
//
// These tools are the second pillar of the Dirac harness methodology.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { 
    getFileSkeleton, 
    getFunction, 
    findSymbolReferences,
    LANGUAGE_MAP 
} from '../../../services/ast/index.js';
import { hashLines } from '../../../services/anchor/index.js';

const execAsync = promisify(exec);

export default {
    name: 'dev_tools_ast',
    description: 'AST tools for structural code intelligence (skeleton, function extraction, references).',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'get_file_skeleton',
                description: `Extracts the structure of a source file (function signatures, classes, methods, interfaces) WITHOUT implementation bodies. Returns a compact skeleton ~80-95% smaller than the full file. Use this tool BEFORE read_file to understand a file's structure. Supports: TypeScript, JavaScript, Python.`,
                parameters: {
                    type: 'object',
                    properties: {
                        paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Array of file paths (relative or absolute).'
                        }
                    },
                    required: ['paths']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_function',
                description: `Extracts the complete code of a specific function or method by its name. Supports "Class.method" notation for class methods. Returns ONLY the targeted function's code with its hash-stable anchors. ~90% more efficient than read_file for a specific target.`,
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: {
                            type: 'string',
                            description: 'Source file path.'
                        },
                        function_name: {
                            type: 'string',
                            description: 'Name of the function/method. Use "Class.method" for class methods.'
                        }
                    },
                    required: ['file_path', 'function_name']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'find_symbol_references',
                description: `Finds all AST references of a symbol (function, class, variable) across a set of files. More accurate than grep as it uses AST (no false positives in comments or strings). Returns definitions and/or usages.`,
                parameters: {
                    type: 'object',
                    properties: {
                        symbol_name: {
                            type: 'string',
                            description: 'Name of the symbol to search for.'
                        },
                        search_paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Files or directories to search in.'
                        },
                        find_type: {
                            type: 'string',
                            enum: ['definition', 'reference', 'both'],
                            description: 'Result type: "definition" (declarations), "reference" (usages), or "both" (all). Default: "both".'
                        }
                    },
                    required: ['symbol_name', 'search_paths']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        const { chatId, sourceChannel } = context;
        const senderJid = context.message?.sender || 'system';

        try {
            switch (toolName) {
                case 'get_file_skeleton': {
                    const paths: string[] = args.paths || [];
                    if (paths.length === 0) {
                        return { success: false, message: 'Parameter "paths" required (array of file paths).' };
                    }

                    const results: string[] = [];

                    for (const filePath of paths) {
                        const absolutePath = path.isAbsolute(filePath) 
                            ? filePath 
                            : path.resolve(permissionManager.sandboxDir, filePath);

                        if (!fs.existsSync(absolutePath)) {
                            results.push(`--- ${filePath} ---\nError: File does not exist.`);
                            continue;
                        }

                        const ext = path.extname(absolutePath).toLowerCase().slice(1);
                        if (!LANGUAGE_MAP[ext]) {
                            results.push(`--- ${filePath} ---\nUnsupported language: .${ext}. Supported: ${Object.keys(LANGUAGE_MAP).join(', ')}`);
                            continue;
                        }

                        try {
                            const skeleton = await getFileSkeleton(absolutePath);
                            if (skeleton) {
                                results.push(`--- ${filePath} ---\n${skeleton}`);
                            } else {
                                results.push(`--- ${filePath} ---\nNo definitions found.`);
                            }
                        } catch (error: any) {
                            results.push(`--- ${filePath} ---\nAST Error: ${error.message}`);
                        }
                    }

                    return {
                        success: true,
                        message: results.join('\n\n')
                    };
                }

                case 'get_function': {
                    const { file_path, function_name } = args;
                    if (!file_path || !function_name) {
                        return { success: false, message: 'Parameters "file_path" and "function_name" required.' };
                    }

                    const absolutePath = path.isAbsolute(file_path) 
                        ? file_path 
                        : path.resolve(permissionManager.sandboxDir, file_path);

                    if (!fs.existsSync(absolutePath)) {
                        return { success: false, message: `File does not exist: ${file_path}` };
                    }

                    const ext = path.extname(absolutePath).toLowerCase().slice(1);
                    if (!LANGUAGE_MAP[ext]) {
                        return { 
                            success: false, 
                            message: `Unsupported language: .${ext}. Supported: ${Object.keys(LANGUAGE_MAP).join(', ')}` 
                        };
                    }

                    try {
                        const result = await getFunction(absolutePath, function_name);
                        if (!result) {
                            return {
                                success: false,
                                message: `Function "${function_name}" not found in ${file_path}. Use get_file_skeleton to see available symbols.`
                            };
                        }

                        // Return with hash-anchored lines for subsequent edit_file calls
                        const fullContent = fs.readFileSync(absolutePath, 'utf8');
                        const hashedContent = hashLines(absolutePath, fullContent);
                        const hashedLines = hashedContent.split('\n');

                        // Extract only the relevant hashed lines
                        const relevantLines = hashedLines.slice(result.startLine, result.endLine + 1);

                        return {
                            success: true,
                            message: `Function "${function_name}" (lines ${result.startLine + 1}-${result.endLine + 1}):\n${relevantLines.join('\n')}`
                        };
                    } catch (error: any) {
                        return { success: false, message: `AST Error: ${error.message}` };
                    }
                }

                case 'find_symbol_references': {
                    const { symbol_name, search_paths, find_type = 'both' } = args;
                    if (!symbol_name || !search_paths?.length) {
                        return { success: false, message: 'Parameters "symbol_name" and "search_paths" required.' };
                    }

                    // Expand directories to file lists
                    const filePaths: string[] = [];
                    for (const searchPath of search_paths) {
                        const absolutePath = path.isAbsolute(searchPath) 
                            ? searchPath 
                            : path.resolve(permissionManager.sandboxDir, searchPath);

                        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
                            // Find supported files in directory (non-recursive for safety)
                            try {
                                const supportedExts = Object.keys(LANGUAGE_MAP).map(e => `.${e}`).join(',');
                                const { stdout } = await execAsync(
                                    `find "${absolutePath}" -maxdepth 3 -type f \\( ${Object.keys(LANGUAGE_MAP).map(e => `-name "*.${e}"`).join(' -o ')} \\) | head -100`,
                                    { timeout: 5000 }
                                );
                                filePaths.push(...stdout.split('\n').filter(Boolean));
                            } catch {
                                // Fallback: just use the directory listing
                                const entries = fs.readdirSync(absolutePath);
                                for (const entry of entries) {
                                    const fullPath = path.join(absolutePath, entry);
                                    const ext = path.extname(entry).toLowerCase().slice(1);
                                    if (LANGUAGE_MAP[ext] && fs.statSync(fullPath).isFile()) {
                                        filePaths.push(fullPath);
                                    }
                                }
                            }
                        } else if (fs.existsSync(absolutePath)) {
                            filePaths.push(absolutePath);
                        }
                    }

                    if (filePaths.length === 0) {
                        return { success: false, message: 'No supported files found in specified paths.' };
                    }

                    try {
                        const references = await findSymbolReferences(filePaths, symbol_name, find_type);

                        if (references.length === 0) {
                            return {
                                success: true,
                                message: `No ${find_type === 'definition' ? 'definition' : find_type === 'reference' ? 'reference' : 'occurrence'} found for "${symbol_name}" in ${filePaths.length} file(s).`
                            };
                        }

                        // Group by file
                        const byFile = new Map<string, typeof references>();
                        for (const ref of references) {
                            const existing = byFile.get(ref.filePath) || [];
                            existing.push(ref);
                            byFile.set(ref.filePath, existing);
                        }

                        let output = `Symbol "${symbol_name}" — ${references.length} occurrence(s) in ${byFile.size} file(s):\n\n`;
                        for (const [filePath, refs] of byFile) {
                            const relPath = path.relative(permissionManager.sandboxDir, filePath);
                            output += `--- ${relPath} ---\n`;
                            for (const ref of refs) {
                                const tag = ref.isDefinition ? '[DEF]' : '[REF]';
                                output += `  ${tag} L${ref.line + 1}: ${ref.lineText.trim()}\n`;
                            }
                            output += '\n';
                        }

                        return { success: true, message: output.trim() };
                    } catch (error: any) {
                        return { success: false, message: `AST Error: ${error.message}` };
                    }
                }

                default:
                    return null;
            }
        } catch (error: any) {
            return { success: false, message: `Error in ${toolName}: ${error.message}` };
        }
    }
};
