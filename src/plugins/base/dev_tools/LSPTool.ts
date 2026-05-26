import * as fs from 'fs';
import * as path from 'path';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { 
    parseDefinitions, 
    findSymbolReferences, 
    getFunction 
} from '../../../services/ast/index.js';

export default {
    name: 'dev_tools_lsp',
    description: 'Language Server Protocol (LSP) AST-Native tool for navigating code structures.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'lsp_query',
                description: 'Executes structural symbol-level navigation and queries. Supported operations: goToDefinition, findReferences, hover, documentSymbol.',
                parameters: {
                    type: 'object',
                    properties: {
                        operation: {
                            type: 'string',
                            enum: ['goToDefinition', 'findReferences', 'hover', 'documentSymbol'],
                            description: 'LSP navigation operation to perform.'
                        },
                        file_path: {
                            type: 'string',
                            description: 'Relative or absolute file path.'
                        },
                        symbol_name: {
                            type: 'string',
                            description: 'Symbol name to query (required for goToDefinition, findReferences, hover).'
                        },
                        search_paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Directories or files to search for references (optional, defaults to file_path dir).'
                        }
                    },
                    required: ['operation', 'file_path']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'lsp_query') return null;

        const { operation, file_path, symbol_name, search_paths } = args;

        if (!file_path) {
            return { success: false, message: 'Parameter "file_path" is required.' };
        }

        const absolutePath = path.isAbsolute(file_path)
            ? file_path
            : path.resolve(permissionManager.sandboxDir, file_path);

        if (!fs.existsSync(absolutePath)) {
            return { success: false, message: `File does not exist: ${file_path}` };
        }

        try {
            switch (operation) {
                case 'documentSymbol': {
                    const definitions = await parseDefinitions(absolutePath);
                    if (!definitions || definitions.length === 0) {
                        return { success: true, message: `No document symbols found in ${file_path}.` };
                    }

                    const formatted = definitions.map(def => {
                        const parentStr = def.parent ? ` (in ${def.parent})` : '';
                        return `  [${def.kind.toUpperCase()}] ${def.name}${parentStr} - L${def.startLine + 1} to L${def.endLine + 1}`;
                    }).join('\n');

                    return {
                        success: true,
                        message: `Symbols defined in ${file_path}:\n${formatted}`
                    };
                }

                case 'goToDefinition': {
                    if (!symbol_name) {
                        return { success: false, message: 'Parameter "symbol_name" is required for goToDefinition operation.' };
                    }

                    // Scan file's own definitions first
                    const definitions = await parseDefinitions(absolutePath);
                    if (definitions) {
                        const localDef = definitions.find(d => d.name === symbol_name);
                        if (localDef) {
                            return {
                                success: true,
                                message: `Found local definition of "${symbol_name}" in ${file_path} at L${localDef.startLine + 1} to L${localDef.endLine + 1}:\n  ${localDef.signatureLine.trim()}`
                            };
                        }
                    }

                    // Otherwise, search across project files
                    const targetPaths = search_paths && search_paths.length > 0 
                        ? search_paths.map((p: string) => path.resolve(permissionManager.sandboxDir, p))
                        : [path.dirname(absolutePath)];

                    // Resolve directories
                    const filesToScan: string[] = [];
                    for (const targetPath of targetPaths) {
                        if (fs.existsSync(targetPath)) {
                            if (fs.statSync(targetPath).isDirectory()) {
                                const entries = fs.readdirSync(targetPath);
                                for (const entry of entries) {
                                    const ext = path.extname(entry).slice(1).toLowerCase();
                                    if (['ts', 'js', 'tsx', 'py'].includes(ext)) {
                                        filesToScan.push(path.join(targetPath, entry));
                                    }
                                }
                            } else {
                                filesToScan.push(targetPath);
                            }
                        }
                    }

                    if (filesToScan.length === 0) {
                        filesToScan.push(absolutePath);
                    }

                    const refs = await findSymbolReferences(filesToScan, symbol_name, 'definition');
                    if (refs.length === 0) {
                        return { success: true, message: `Definition of symbol "${symbol_name}" not found in surrounding scope.` };
                    }

                    const formatted = refs.map(ref => {
                        const relPath = path.relative(permissionManager.sandboxDir, ref.filePath);
                        return `  Definition at ${relPath}:L${ref.line + 1}: ${ref.lineText.trim()}`;
                    }).join('\n');

                    return {
                        success: true,
                        message: `Definitions of "${symbol_name}" found:\n${formatted}`
                    };
                }

                case 'findReferences': {
                    if (!symbol_name) {
                        return { success: false, message: 'Parameter "symbol_name" is required for findReferences operation.' };
                    }

                    const targetPaths = search_paths && search_paths.length > 0 
                        ? search_paths.map((p: string) => path.resolve(permissionManager.sandboxDir, p))
                        : [path.dirname(absolutePath)];

                    const filesToScan: string[] = [];
                    for (const targetPath of targetPaths) {
                        if (fs.existsSync(targetPath)) {
                            if (fs.statSync(targetPath).isDirectory()) {
                                const entries = fs.readdirSync(targetPath);
                                for (const entry of entries) {
                                    const ext = path.extname(entry).slice(1).toLowerCase();
                                    if (['ts', 'js', 'tsx', 'py'].includes(ext)) {
                                        filesToScan.push(path.join(targetPath, entry));
                                    }
                                }
                            } else {
                                filesToScan.push(targetPath);
                            }
                        }
                    }

                    if (filesToScan.length === 0) {
                        filesToScan.push(absolutePath);
                    }

                    const refs = await findSymbolReferences(filesToScan, symbol_name, 'reference');
                    if (refs.length === 0) {
                        return { success: true, message: `No references found for symbol "${symbol_name}" in surrounding scope.` };
                    }

                    const formatted = refs.map(ref => {
                        const relPath = path.relative(permissionManager.sandboxDir, ref.filePath);
                        return `  Reference at ${relPath}:L${ref.line + 1}: ${ref.lineText.trim()}`;
                    }).join('\n');

                    return {
                        success: true,
                        message: `References of "${symbol_name}" found:\n${formatted}`
                    };
                }

                case 'hover': {
                    if (!symbol_name) {
                        return { success: false, message: 'Parameter "symbol_name" is required for hover operation.' };
                    }

                    const funcDetails = await getFunction(absolutePath, symbol_name);
                    if (funcDetails) {
                        const signature = funcDetails.content.split('\n')[0];
                        return {
                            success: true,
                            message: `Symbol "${symbol_name}" (Function):\n  Signature: ${signature.trim()}\n  Defined in ${file_path} at line ${funcDetails.startLine + 1}`
                        };
                    }

                    const definitions = await parseDefinitions(absolutePath);
                    if (definitions) {
                        const match = definitions.find(d => d.name === symbol_name);
                        if (match) {
                            return {
                                success: true,
                                message: `Symbol "${symbol_name}" (${match.kind}):\n  Defined in ${file_path} at line ${match.startLine + 1}\n  Signature: ${match.signatureLine.trim()}`
                            };
                        }
                    }

                    return {
                        success: true,
                        message: `Hover information for "${symbol_name}" is unavailable in this file.`
                    };
                }

                default:
                    return { success: false, message: `Unsupported LSP operation: ${operation}.` };
            }
        } catch (err: any) {
            return { success: false, message: `LSP Tool AST Error: ${err.message}` };
        }
    }
};
