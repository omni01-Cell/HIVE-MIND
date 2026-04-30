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
    description: 'Outils AST pour intelligence structurelle du code (skeleton, extraction de fonction, références).',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'get_file_skeleton',
                description: `Extrait la structure d'un fichier source (signatures de fonctions, classes, méthodes, interfaces) SANS les corps d'implémentation. Retourne un squelette compact ~80-95% plus petit que le fichier complet. Utilise cet outil AVANT read_file pour comprendre la structure d'un fichier. Supporte: TypeScript, JavaScript, Python.`,
                parameters: {
                    type: 'object',
                    properties: {
                        paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Tableau de chemins de fichiers (relatifs ou absolus).'
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
                description: `Extrait le code complet d'une fonction ou méthode spécifique par son nom. Supporte la notation "Classe.methode" pour les méthodes de classe. Retourne UNIQUEMENT le code de la fonction ciblée avec ses ancres hash-stables. ~90% plus efficace que read_file pour une cible précise.`,
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: {
                            type: 'string',
                            description: 'Chemin du fichier source.'
                        },
                        function_name: {
                            type: 'string',
                            description: 'Nom de la fonction/méthode. Utiliser "Classe.methode" pour les méthodes de classe.'
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
                description: `Trouve toutes les références AST d'un symbole (fonction, classe, variable) dans un ensemble de fichiers. Plus précis que grep car utilise l'AST (pas de faux positifs dans les commentaires ou les strings). Retourne les définitions et/ou les utilisations.`,
                parameters: {
                    type: 'object',
                    properties: {
                        symbol_name: {
                            type: 'string',
                            description: 'Nom du symbole à chercher.'
                        },
                        search_paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Fichiers ou répertoires dans lesquels chercher.'
                        },
                        find_type: {
                            type: 'string',
                            enum: ['definition', 'reference', 'both'],
                            description: 'Type de résultats: "definition" (déclarations), "reference" (utilisations), ou "both" (tout). Défaut: "both".'
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
                        return { success: false, message: 'Paramètre "paths" requis (tableau de chemins de fichiers).' };
                    }

                    const results: string[] = [];

                    for (const filePath of paths) {
                        const absolutePath = path.isAbsolute(filePath) 
                            ? filePath 
                            : path.resolve(permissionManager.sandboxDir, filePath);

                        if (!fs.existsSync(absolutePath)) {
                            results.push(`--- ${filePath} ---\nErreur: Fichier inexistant.`);
                            continue;
                        }

                        const ext = path.extname(absolutePath).toLowerCase().slice(1);
                        if (!LANGUAGE_MAP[ext]) {
                            results.push(`--- ${filePath} ---\nLangue non supportée: .${ext}. Supportés: ${Object.keys(LANGUAGE_MAP).join(', ')}`);
                            continue;
                        }

                        try {
                            const skeleton = await getFileSkeleton(absolutePath);
                            if (skeleton) {
                                results.push(`--- ${filePath} ---\n${skeleton}`);
                            } else {
                                results.push(`--- ${filePath} ---\nAucune définition trouvée.`);
                            }
                        } catch (error: any) {
                            results.push(`--- ${filePath} ---\nErreur AST: ${error.message}`);
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
                        return { success: false, message: 'Paramètres "file_path" et "function_name" requis.' };
                    }

                    const absolutePath = path.isAbsolute(file_path) 
                        ? file_path 
                        : path.resolve(permissionManager.sandboxDir, file_path);

                    if (!fs.existsSync(absolutePath)) {
                        return { success: false, message: `Fichier inexistant: ${file_path}` };
                    }

                    const ext = path.extname(absolutePath).toLowerCase().slice(1);
                    if (!LANGUAGE_MAP[ext]) {
                        return { 
                            success: false, 
                            message: `Langue non supportée: .${ext}. Supportés: ${Object.keys(LANGUAGE_MAP).join(', ')}` 
                        };
                    }

                    try {
                        const result = await getFunction(absolutePath, function_name);
                        if (!result) {
                            return {
                                success: false,
                                message: `Fonction "${function_name}" introuvable dans ${file_path}. Utilisez get_file_skeleton pour voir les symboles disponibles.`
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
                            message: `Fonction "${function_name}" (lignes ${result.startLine + 1}-${result.endLine + 1}):\n${relevantLines.join('\n')}`
                        };
                    } catch (error: any) {
                        return { success: false, message: `Erreur AST: ${error.message}` };
                    }
                }

                case 'find_symbol_references': {
                    const { symbol_name, search_paths, find_type = 'both' } = args;
                    if (!symbol_name || !search_paths?.length) {
                        return { success: false, message: 'Paramètres "symbol_name" et "search_paths" requis.' };
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
                        return { success: false, message: 'Aucun fichier supporté trouvé dans les chemins spécifiés.' };
                    }

                    try {
                        const references = await findSymbolReferences(filePaths, symbol_name, find_type);

                        if (references.length === 0) {
                            return {
                                success: true,
                                message: `Aucune ${find_type === 'definition' ? 'définition' : find_type === 'reference' ? 'référence' : 'occurrence'} trouvée pour "${symbol_name}" dans ${filePaths.length} fichier(s).`
                            };
                        }

                        // Group by file
                        const byFile = new Map<string, typeof references>();
                        for (const ref of references) {
                            const existing = byFile.get(ref.filePath) || [];
                            existing.push(ref);
                            byFile.set(ref.filePath, existing);
                        }

                        let output = `Symbole "${symbol_name}" — ${references.length} occurrence(s) dans ${byFile.size} fichier(s):\n\n`;
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
                        return { success: false, message: `Erreur AST: ${error.message}` };
                    }
                }

                default:
                    return null;
            }
        } catch (error: any) {
            return { success: false, message: `Erreur dans ${toolName}: ${error.message}` };
        }
    }
};
