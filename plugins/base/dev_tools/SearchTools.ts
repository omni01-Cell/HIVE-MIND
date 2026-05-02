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
    description: 'Read-only search tools (LS, Grep, File Reading)',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'list_directory',
                description: 'Lists files and folders in a specified directory (limited to 1000 items).',
                parameters: {
                    type: 'object',
                    properties: {
                        dir_path: { type: 'string', description: 'The directory path to list (e.g., ".", "src/")' }
                    },
                    required: ['dir_path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'grep_search',
                description: 'Search for a string or regular expression in files using ripgrep or grep.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The term to search for' },
                        search_path: { type: 'string', description: 'The directory or file to search in (e.g., "src/")' }
                    },
                    required: ['query', 'search_path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_file',
                description: 'Reads file content with line numbers and anchors (limited to 800 lines at a time).',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'The path of the file to read' },
                        start_line: { type: 'number', description: 'Start line (1-indexed)' },
                        end_line: { type: 'number', description: 'End line (optional)' }
                    },
                    required: ['file_path']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        const { chatId, sourceChannel } = context;

        const senderJid = context.message?.sender || 'system';

        // WHY: Universal read access — reading cannot cause side effects.
        // The agent needs to inspect any file/directory for diagnostics (e.g. /etc/os-release).
        // Write operations are still gated by PermissionManager.validateFileWrite().
        const checkReadAccess = async (_targetPath: string): Promise<{ granted: boolean }> => {
            return { granted: true };
        };

        try {
            switch (toolName) {
                case 'list_directory': {
                    const dirPath = args.dir_path || '.';
                    if (!(await checkReadAccess(dirPath)).granted) {
                        return { success: false, message: 'Permission denied for listing outside sandbox.' };
                    }

                    const absolutePath = path.resolve(process.cwd(), dirPath);
                    if (!fs.existsSync(absolutePath)) return { success: false, message: `Directory ${dirPath} does not exist.` };

                    const items = fs.readdirSync(absolutePath, { withFileTypes: true });
                    let result = '';
                    let count = 0;

                    for (const item of items) {
                        if (BANNED_DIRS.includes(item.name) || item.name.startsWith('.git')) continue;
                        
                        const type = item.isDirectory() ? '[DIR] ' : '[FILE]';
                        result += `${type} ${item.name}\n`;
                        count++;
                        if (count >= MAX_FILES_TO_LIST) {
                            result += `\n... (More than ${MAX_FILES_TO_LIST} files, use grep or target a sub-folder) ...`;
                            break;
                        }
                    }
                    return { success: true, message: result || 'Empty directory.' };
                }

                case 'grep_search': {
                    const { query, search_path } = args;
                    if (!(await checkReadAccess(search_path)).granted) {
                        return { success: false, message: 'Permission denied for searching outside sandbox.' };
                    }
                    
                    const absolutePath = path.resolve(process.cwd(), search_path);
                    
                    let command = '';
                    try {
                        await execAsync('which rg');
                        command = `rg --no-heading --line-number -F "${query.replace(/"/g, '\\"')}" "${absolutePath}"`;
                        console.log('[SearchTools] 🚀 Using Ripgrep (rg)');
                    } catch (e) {
                        const excludeDirs = BANNED_DIRS.map(d => `--exclude-dir=${d}`).join(' ');
                        command = `grep -rn -F ${excludeDirs} "${query.replace(/"/g, '\\"')}" "${absolutePath}"`;
                        console.log('[SearchTools] 🐌 Falling back to standard grep');
                    }

                    try {
                        const { stdout } = await execAsync(command);
                        const lines = stdout.split('\n');
                        if (lines.length > 100) {
                            return { success: true, message: lines.slice(0, 100).join('\n') + '\n\n... [TRUNCATED at 100 results] ...' };
                        }
                        return { success: true, message: stdout || 'No results.' };
                    } catch (e: any) {
                        if (e.code === 1) return { success: true, message: 'No results found.' };
                        return { success: false, message: `Grep error: ${e.message}` };
                    }
                }

                case 'read_file': {
                    const { file_path, start_line = 1, end_line } = args;
                    if (!(await checkReadAccess(file_path)).granted) {
                        return { success: false, message: 'Permission denied for reading outside sandbox.' };
                    }

                    const absolutePath = path.resolve(process.cwd(), file_path);
                    if (!fs.existsSync(absolutePath)) return { success: false, message: `File ${file_path} does not exist.` };

                    // [CLAUDE CODE PATTERN] Record read timestamp
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
                        result += `\n... (File truncated. Use start_line and end_line to see more) ...`;
                    }

                    return { success: true, message: result };
                }

                default:
                    return null;
            }
        } catch (error: any) {
            return { success: false, message: `Error in ${toolName}: ${error.message}` };
        }
    }
};
