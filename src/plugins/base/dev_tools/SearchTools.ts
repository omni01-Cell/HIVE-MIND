import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { fileState } from './FileState.js';
import { hashLines } from '../../../services/anchor/index.js';
import { readFileInRange } from '../../../utils/readFileInRange.js';

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
                description: 'Reads file content with line numbers and anchors (limited to 800 lines at a time). Supports line range offset and limit.',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'The path of the file to read' },
                        start_line: { type: 'number', description: 'Start line (1-indexed)' },
                        end_line: { type: 'number', description: 'End line (optional)' },
                        offset: { type: 'number', description: 'Offset in lines (alternative to start_line, 0-indexed)' },
                        limit: { type: 'number', description: 'Limit of lines to read' }
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

                    // WHY: storage_hm physically lives inside Sandbox1/ but the agent
                    // sees it as an independent top-level disk. Hiding it from Sandbox1
                    // listings maintains this virtual disk abstraction.
                    const isSandboxRoot = absolutePath === permissionManager.sandboxDir;

                    const items = fs.readdirSync(absolutePath, { withFileTypes: true });
                    let result = '';
                    let count = 0;

                    for (const item of items) {
                        if (BANNED_DIRS.includes(item.name) || item.name.startsWith('.git')) continue;
                        if (isSandboxRoot && item.name === 'storage_hm') continue;

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
                    if (!query || typeof query !== 'string') {
                        return { success: false, message: `TOOL_ERROR: grep_search requires a valid "query" parameter (got ${typeof query}).` };
                    }
                    if (!search_path || typeof search_path !== 'string') {
                        return { success: false, message: `TOOL_ERROR: grep_search requires a valid "search_path" parameter (got ${typeof search_path}).` };
                    }
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
                    const { file_path, start_line, end_line, offset: argOffset, limit: argLimit } = args;
                    // WHY: The Planner sometimes passes undefined file_path when the LLM
                    // omits required params. path.resolve(cwd, undefined) crashes with
                    // "paths[1] must be of type string". Fail closed with a clear error.
                    if (!file_path || typeof file_path !== 'string') {
                        return { success: false, message: `TOOL_ERROR: read_file requires a valid "file_path" parameter (got ${typeof file_path}). Please provide the file path as a string.` };
                    }
                    if (!(await checkReadAccess(file_path)).granted) {
                        return { success: false, message: 'Permission denied for reading outside sandbox.' };
                    }

                    const absolutePath = path.resolve(process.cwd(), file_path);
                    if (!fs.existsSync(absolutePath)) return { success: false, message: `File ${file_path} does not exist.` };

                    // [CLAUDE CODE PATTERN] Record read timestamp
                    fileState.recordRead(absolutePath);

                    // Compute offset and limit supporting both legacy start_line/end_line and new offset/limit
                    const offset = argOffset !== undefined ? Math.max(0, argOffset) : (start_line !== undefined ? Math.max(0, start_line - 1) : 0);

                    let limit = MAX_READ_LINES;
                    if (argLimit !== undefined) {
                        limit = Math.max(1, argLimit);
                    } else if (end_line !== undefined) {
                        const calculatedLimit = end_line - (start_line !== undefined ? start_line : offset + 1) + 1;
                        limit = Math.max(1, calculatedLimit);
                    }

                    const stats = fs.statSync(absolutePath);
                    let result = '';

                    // For files < 10 MB, load full file to preserve global Dirac anchor stability
                    if (stats.size < 10 * 1024 * 1024) {
                        const content = fs.readFileSync(absolutePath, 'utf8');
                        const hashedContent = hashLines(absolutePath, content);
                        const hashedLines = hashedContent.split('\n');

                        const startIdx = offset;
                        const endIdx = Math.min(hashedLines.length, startIdx + limit);

                        for (let i = startIdx; i < endIdx; i++) {
                            result += `${hashedLines[i]}\n`;
                        }

                        if (hashedLines.length > endIdx) {
                            result += '\n... (File truncated. Use offset and limit parameters to read specific portions) ...';
                        }
                    } else {
                        // For huge files, stream read directly to prevent OOM
                        const readResult = await readFileInRange(absolutePath, offset, limit);
                        // Generate anchors on the sliced content
                        const hashedFragment = hashLines(absolutePath, readResult.content);
                        result = hashedFragment;

                        if (readResult.totalLines > offset + readResult.lineCount) {
                            result += '\n... (File truncated. Use offset and limit parameters to read specific portions) ...';
                        }
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
