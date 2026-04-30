import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { fileState } from './FileState.js';
import { hashLines } from '../../../services/anchor/index.js';

const execAsync = promisify(exec);
const MAX_FILES_TO_LIST = 1000;
const MAX_READ_LINES = 800;
const BANNED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build'];

export default {
    name: 'dev_tools_search',
    description: 'Outils de recherche en lecture seule (LS, Grep, Lecture de fichiers)',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'list_directory',
                description: 'Liste les fichiers et dossiers dans un répertoire spécifié (limité à 1000 éléments).',
                parameters: {
                    type: 'object',
                    properties: {
                        dir_path: { type: 'string', description: 'Le chemin du répertoire à lister (ex: ".", "src/")' }
                    },
                    required: ['dir_path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'grep_search',
                description: 'Recherche une chaîne de caractères ou une expression régulière dans les fichiers en utilisant ripgrep ou grep.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Le terme à rechercher' },
                        search_path: { type: 'string', description: 'Le répertoire ou fichier où chercher (ex: "src/")' }
                    },
                    required: ['query', 'search_path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_file',
                description: 'Lit le contenu d\'un fichier avec les numéros de ligne (limité à 800 lignes à la fois).',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'Le chemin du fichier à lire' },
                        start_line: { type: 'number', description: 'Ligne de départ (1-indexé)' },
                        end_line: { type: 'number', description: 'Ligne de fin (optionnelle)' }
                    },
                    required: ['file_path']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        const { chatId, sourceChannel } = context;

        const senderJid = context.message?.sender || 'system';

        // Fonction utilitaire pour vérifier l'accès en lecture
        const checkReadAccess = async (targetPath: string): Promise<{ granted: boolean; feedback?: string }> => {
            const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);
            if (!permissionManager.isInSandbox(absolutePath)) {
                return await permissionManager.askPermission(
                    chatId, 
                    `Lecture hors Sandbox : ${absolutePath}`, 
                    sourceChannel,
                    senderJid
                );
            }
            return { granted: true };
        };

        try {
            switch (toolName) {
                case 'list_directory': {
                    const dirPath = args.dir_path || '.';
                    if (!(await checkReadAccess(dirPath)).granted) {
                        return { success: false, message: 'Permission refusée pour lister hors sandbox.' };
                    }

                    const absolutePath = path.resolve(process.cwd(), dirPath);
                    if (!fs.existsSync(absolutePath)) return { success: false, message: `Le répertoire ${dirPath} n'existe pas.` };

                    const items = fs.readdirSync(absolutePath, { withFileTypes: true });
                    let result = '';
                    let count = 0;

                    for (const item of items) {
                        if (BANNED_DIRS.includes(item.name) || item.name.startsWith('.git')) continue;
                        
                        const type = item.isDirectory() ? '[DIR] ' : '[FILE]';
                        result += `${type} ${item.name}\n`;
                        count++;
                        if (count >= MAX_FILES_TO_LIST) {
                            result += `\n... (Plus de ${MAX_FILES_TO_LIST} fichiers, utilisez grep ou ciblez un sous-dossier) ...`;
                            break;
                        }
                    }
                    return { success: true, message: result || 'Dossier vide.' };
                }

                case 'grep_search': {
                    const { query, search_path } = args;
                    if (!(await checkReadAccess(search_path)).granted) {
                        return { success: false, message: 'Permission refusée pour chercher hors sandbox.' };
                    }
                    
                    const absolutePath = path.resolve(process.cwd(), search_path);
                    
                    let command = '';
                    try {
                        await execAsync('which rg');
                        command = `rg --no-heading --line-number -F "${query.replace(/"/g, '\\"')}" "${absolutePath}"`;
                        console.log('[SearchTools] 🚀 Utilisation de Ripgrep (rg)');
                    } catch (e) {
                        const excludeDirs = BANNED_DIRS.map(d => `--exclude-dir=${d}`).join(' ');
                        command = `grep -rn -F ${excludeDirs} "${query.replace(/"/g, '\\"')}" "${absolutePath}"`;
                        console.log('[SearchTools] 🐌 Fallback sur grep standard');
                    }

                    try {
                        const { stdout } = await execAsync(command);
                        const lines = stdout.split('\n');
                        if (lines.length > 100) {
                            return { success: true, message: lines.slice(0, 100).join('\n') + '\n\n... [TRONQUÉ à 100 résultats] ...' };
                        }
                        return { success: true, message: stdout || 'Aucun résultat.' };
                    } catch (e: any) {
                        if (e.code === 1) return { success: true, message: 'Aucun résultat trouvé.' };
                        return { success: false, message: `Erreur grep: ${e.message}` };
                    }
                }

                case 'read_file': {
                    const { file_path, start_line = 1, end_line } = args;
                    if (!(await checkReadAccess(file_path)).granted) {
                        return { success: false, message: 'Permission refusée pour lire hors sandbox.' };
                    }

                    const absolutePath = path.resolve(process.cwd(), file_path);
                    if (!fs.existsSync(absolutePath)) return { success: false, message: `Le fichier ${file_path} n'existe pas.` };

                    // [CLAUDE CODE PATTERN] Enregistrer le timestamp de lecture
                    fileState.recordRead(absolutePath);

                    const content = fs.readFileSync(absolutePath, 'utf8');
                    const lines = content.split('\n');
                    
                    const startIdx = Math.max(0, start_line - 1);
                    const endIdx = end_line ? Math.min(lines.length, end_line) : Math.min(lines.length, startIdx + MAX_READ_LINES);

                    // [DIRAC] Hash-Anchored Lines: Each line gets a stable word-anchor
                    // WHY: Anchors survive insertions/deletions, unlike line numbers.
                    // The LLM uses these anchors to target edits with 100% precision.
                    const hashedContent = hashLines(absolutePath, content);
                    const hashedLines = hashedContent.split('\n');

                    let result = '';
                    for (let i = startIdx; i < endIdx; i++) {
                        result += `${hashedLines[i]}\n`;
                    }

                    if (lines.length > endIdx) {
                        result += `\n... (Fichier tronqué. Utilisez start_line et end_line pour voir la suite) ...`;
                    }

                    return { success: true, message: result };
                }

                default:
                    return null;
            }
        } catch (error: any) {
            return { success: false, message: `Erreur dans ${toolName}: ${error.message}` };
        }
    }
};
