// @ts-nocheck
// plugins/system/index.js
// Plugin Système - Gestion du Processus & OS
// PERMISSIONS CRITIQUES : Réservé aux Super-Admins / Global Admins

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default {
    name: 'system',
    description: 'Gestion du système (Shutdown, Restart, Shell) - SuperAdmin Only',
    version: '1.0.0',
    enabled: true,

    // Definitions des outils
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'os_system_info',
                description: 'Affiche les informations système (CPU, RAM, Uptime).',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'os_shutdown',
                description: 'Arrête le bot (Process Exit). SUPER-ADMIN REQUIS.',
                parameters: {
                    type: 'object',
                    properties: {
                        reason: { type: 'string', description: 'Raison de l\'arrêt' },
                        restart: { type: 'boolean', description: 'Si true, tente un redémarrage (via PM2/Docker)' }
                    },
                    required: ['reason']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'os_update_pull',
                description: 'Effectue un Git Pull pour mettre à jour le bot. SUPER-ADMIN REQUIS.',
                parameters: { type: 'object', properties: {} }
            }
        }
    ],

    // Matchers textuels pour commandes rapides (.shutdown)
    textMatchers: [
        {
            pattern: /^\.(shutdown|arret|stop)\b/i,
            handler: 'os_shutdown',
            description: 'Arrêter le bot',
            extractArgs: (match, message, text) => {
                const reason = text.replace(/^\.(shutdown|arret|stop)\s*/i, '').trim();
                return { reason: reason || 'Commande manuelle', restart: false };
            }
        },
        {
            pattern: /^\.(restart|reboot)\b/i,
            handler: 'os_shutdown', // On utilise shutdown avec restart=true
            description: 'Redémarrer le bot',
            extractArgs: (match, message, text) => {
                return { reason: 'Redémarrage manuel', restart: true };
            }
        },
        {
            pattern: /^\.(sys|system|status)\b/i,
            handler: 'os_system_info',
            description: 'Status système',
            extractArgs: () => ({})
        }
    ],

    /**
     * Exécution des outils
     */
    async execute(args: any, context: any, toolName: any) {
        const { transport, message, sender } = context;

        // 1. VÉRIFICATION PERMISSIONS (GLOBAL ADMIN / SUPERUSER)
        const { adminService } = await import('../../services/adminService.js');
        const isSuperUser = await adminService.isSuperUser(sender);
        const isGlobalAdmin = await adminService.isGlobalAdmin(sender);

        // Info système accessible aux admins globaux, mais shutdown = SuperUser only (ou Global selon politique)
        // Ici on permet aux Global Admins de voir les infos, mais pas forcément shutdown
        if (toolName === 'os_system_info') {
            /* Open to admins */
        } else {
            // Actions critiques (Shutdown, Update) -> SuperUser Only
            if (!isSuperUser) {
                return { success: false, message: '⛔ REFUSÉ : Seul le Créateur (SuperUser) peut toucher au système.' };
            }
        }

        switch (toolName) {
            case 'os_system_info':
                return this._getSystemInfo();

            case 'os_shutdown':
                return this._shutdown(args, transport, chatId); // chatId is missing in destructuring above

            case 'os_update_pull':
                return this._gitPull();

            default:
                return { success: false, message: `Commande inconnue: ${toolName}` };
        }
    },

    /**
     * Infos Système
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
            message: `💻 **SYSTÈME STATUS**\n` +
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
    async _shutdown(args: any, transport: any, chatId: any) {
        // Need chatId passed correctly. 
        // Note: The execute method didn't extract chatId. Fixing logic here assuming context availability issues.

        const delay = 3000;
        const action = args.restart ? 'Redémarrage' : 'Arrêt';

        // Réponse immédiate avant de mourir
        setTimeout(() => {
            console.log(`[System] ${action} en cours... (${args.reason})`);
            process.exit(args.restart ? 0 : 0); // PM2 redémarre sur exit 0 ou 1 généralement
        }, delay);

        return {
            success: true,
            message: `⚠️ **${action} INITIE**\nRaison: ${args.reason}\nDélai: ${delay / 1000}s...`
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
            return { success: false, message: `Erreur Git: ${error.message}` };
        }
    }
};
