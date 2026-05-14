import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SystemContext {
    transport?: any;
    message?: any;
    sender?: string;
    chatId?: string;
    [key: string]: any;
}

interface OsShutdownArgs {
    reason: string;
    restart?: boolean;
}

interface OsUpdatePullArgs {}
interface OsSystemInfoArgs {}

export default {
    name: 'system',
    description: 'System management (Shutdown, Restart, Shell) - SuperAdmin Only',
    version: '1.0.0',
    enabled: true,

    // Tool definitions
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'os_system_info',
                description: 'Displays system information (CPU, RAM, Uptime).',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'os_shutdown',
                description: 'Stops the bot (Process Exit). SUPER-ADMIN REQUIRED.',
                parameters: {
                    type: 'object',
                    properties: {
                        reason: { type: 'string', description: 'Reason for shutdown' },
                        restart: { type: 'boolean', description: 'If true, attempts a restart (via PM2/Docker)' }
                    },
                    required: ['reason']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'os_update_pull',
                description: 'Performs a Git Pull to update the bot. SUPER-ADMIN REQUIRED.',
                parameters: { type: 'object', properties: {} }
            }
        }
    ],

    // Text matchers for quick commands (.shutdown)
    textMatchers: [
        {
            pattern: /^\.(shutdown|stop)\b/i,
            handler: 'os_shutdown',
            description: 'Stop the bot',
            extractArgs: (match: any, message: any, text: string) => {
                const reason = text.replace(/^\.(shutdown|stop)\s*/i, '').trim();
                return { reason: reason || 'Manual command', restart: false };
            }
        },
        {
            pattern: /^\.(restart|reboot)\b/i,
            handler: 'os_shutdown', // Use shutdown with restart=true
            description: 'Restart the bot',
            extractArgs: (match: any, message: any, text: string) => {
                return { reason: 'Manual restart', restart: true };
            }
        },
        {
            pattern: /^\.(sys|system|status)\b/i,
            handler: 'os_system_info',
            description: 'System status',
            extractArgs: () => ({})
        }
    ],

    /**
     * Exécution des outils
     */
    async execute(args: unknown, context: SystemContext, toolName?: string) {
        const { transport, message, sender, chatId } = context || {};

        if (!transport) {
            return { success: false, message: 'Transport not available' };
        }
        const { adminService } = await import('../../../services/adminService.js');
        const isSuperUser = await adminService.isSuperUser(sender);
        const isGlobalAdmin = await adminService.isGlobalAdmin(sender);

        // System info accessible to global admins, but shutdown = SuperUser only
        if (toolName === 'os_system_info') {
            /* Open to admins */
        } else {
            // Critical actions (Shutdown, Update) -> SuperUser Only
            if (!isSuperUser) {
                return { success: false, message: '⛔ DENIED: Only the Creator (SuperUser) can touch the system.' };
            }
        }

        switch (toolName) {
            case 'os_system_info':
                return this._getSystemInfo();

            case 'os_shutdown':
                const shutdownArgs = args as OsShutdownArgs;
                return this._shutdown(shutdownArgs, transport, chatId as string);

            case 'os_update_pull':
                return await this._gitPull();

            default:
                return { success: false, message: `Unknown command: ${toolName}` };
        }
    },

    /**
     * System Info
     */
    _getSystemInfo() {
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const loadAvg = os.loadavg();

        const formatBytes = (bytes: any) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

        return {
            success: true,
            message: `💻 **SYSTEM STATUS**\n` +
                `- Uptime: ${Math.floor(uptime / 60)} min\n` +
                `- RAM: ${formatBytes(memUsage.rss)} (Heap: ${formatBytes(memUsage.heapUsed)})\n` +
                `- OS Mem: ${(freeMem / 1024 / 1024 / 1024).toFixed(1)}GB free / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB\n` +
                `- Load: ${loadAvg[0].toFixed(2)}\n` +
                `- Arch: ${os.arch()} (${os.platform()})\n` +
                `- Node: ${process.version}`
        };
    },

    /**
     * Shutdown / Restart
     */
    async _shutdown(args: OsShutdownArgs, transport: any, chatId: string) {
        // Need chatId passed correctly. 
        // Note: The execute method didn't extract chatId. Fixing logic here assuming context availability issues.

        const delay = 3000;
        const action = args.restart ? 'Restart' : 'Shutdown';

        // Immediate response before death
        setTimeout(() => {
            console.log(`[System] ${action} in progress... (${args.reason})`);
            process.exit(args.restart ? 0 : 0); // PM2 restarts on exit 0 or 1 generally
        }, delay);

        return {
            success: true,
            message: `⚠️ **${action.toUpperCase()} INITIATED**\nReason: ${args.reason}\nDelay: ${delay / 1000}s...`
        };
    },

    /**
     * Git Pull
     */
    async _gitPull() {
        try {
            const { stdout, stderr } = await execAsync('git pull');
            return {
                success: true,
                message: `📦 **GIT PULL**\n\`\`\`\n${stdout || stderr}\n\`\`\``
            };
        } catch (error: any) {
            return { success: false, message: `Git Error: ${error.message}` };
        }
    }
};
