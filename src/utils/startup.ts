/**
 * utils/startup.ts
 * Module d'affichage au démarrage avec cli-progress pour une barre professionnelle
 */

import { botIdentity } from './botIdentity.js';
import cliProgress from 'cli-progress';

/**
 * Thème de couleurs pour la console
 */
const THEME = {
    PRIMARY: '\x1b[34m',   // Blue
    ACCENT: '\x1b[94m',    // Bright Blue
    CYAN: '\x1b[36m',      // Cyan
    SHADOW: '\x1b[90m',    // Dark Gray (shadow)
    SECONDARY: '\x1b[33m', // Yellow
    SUCCESS: '\x1b[32m',   // Green
    ERROR: '\x1b[31m',     // Red
    GRAY: '\x1b[90m',      // Gray
    RESET: '\x1b[0m'       // Reset
} as const;

export interface StartupModule {
  id: string;
  name: string;
  icon: string;
}

export interface ModuleResult {
  status: 'success' | 'error';
  module: StartupModule;
  detail?: string;
  error?: string;
}

/**
 * Génère le logo ASCII HIVE-MIND avec effet 3D
 */
function generateLogo(botName: string): string {
    const displayName = `🧠 ${botName} AI - v1.0`;

    const logo3D = [
        `${THEME.ACCENT} ██╗  ██╗${THEME.CYAN}██╗${THEME.ACCENT}██╗   ██╗${THEME.CYAN}███████╗${THEME.SHADOW}      ${THEME.ACCENT}███╗   ███╗${THEME.CYAN}██╗${THEME.ACCENT}███╗   ██╗${THEME.CYAN}██████╗ `,
        `${THEME.ACCENT} ██║  ██║${THEME.CYAN}██║${THEME.ACCENT}██║   ██║${THEME.CYAN}██╔════╝${THEME.SHADOW}      ${THEME.ACCENT}████╗ ████║${THEME.CYAN}██║${THEME.ACCENT}████╗  ██║${THEME.CYAN}██╔══██╗`,
        `${THEME.ACCENT} ███████║${THEME.CYAN}██║${THEME.ACCENT}██║   ██║${THEME.CYAN}█████╗${THEME.SHADOW}  █████╗${THEME.ACCENT}██╔████╔██║${THEME.CYAN}██║${THEME.ACCENT}██╔██╗ ██║${THEME.CYAN}██║  ██║`,
        `${THEME.ACCENT} ██╔══██║${THEME.CYAN}██║${THEME.ACCENT}╚██╗ ██╔╝${THEME.CYAN}██╔══╝${THEME.SHADOW}  ╚════╝${THEME.ACCENT}██║╚██╔╝██║${THEME.CYAN}██║${THEME.ACCENT}██║╚██╗██║${THEME.CYAN}██║  ██║`,
        `${THEME.ACCENT} ██║  ██║${THEME.CYAN}██║${THEME.ACCENT} ╚████╔╝ ${THEME.CYAN}███████╗${THEME.SHADOW}      ${THEME.ACCENT}██║ ╚═╝ ██║${THEME.CYAN}██║${THEME.ACCENT}██║ ╚████║${THEME.CYAN}██████╔╝`,
        `${THEME.SHADOW} ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝      ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ `
    ];

    let output = `\n${THEME.PRIMARY}╔═══════════════════════════════════════════════════════════════════════╗${THEME.RESET}\n`;
    output += `${THEME.PRIMARY}║                                                                       ║${THEME.RESET}\n`;

    logo3D.forEach((line: any) => {
        output += `${THEME.PRIMARY}║ ${line}${THEME.PRIMARY}║${THEME.RESET}\n`;
    });

    output += `${THEME.PRIMARY}║                                                                       ║${THEME.RESET}\n`;
    output += `${THEME.PRIMARY}║                    ${THEME.SECONDARY}${displayName.padEnd(40)}${THEME.PRIMARY}      ║${THEME.RESET}\n`;
    output += `${THEME.PRIMARY}╚═══════════════════════════════════════════════════════════════════════╝${THEME.RESET}\n`;

    return output;
}

const DEFAULT_MODULES: StartupModule[] = [
    { id: 'config', name: 'Configuration', icon: '⚙️' },
    { id: 'redis', name: 'Redis Cloud', icon: '🔴' },
    { id: 'supabase', name: 'Supabase DB', icon: '🗄️' },
    { id: 'plugins', name: 'Plugins', icon: '🔌' },
    { id: 'scheduler', name: 'Scheduler', icon: '⏰' },
    { id: 'admin', name: 'Admin Service', icon: '👑' },
    { id: 'transport', name: 'WhatsApp Transport', icon: '📱' }
];

export class StartupDisplay {
    private results = new Map<string, ModuleResult>();
    private errors: { module: string; error: string }[] = [];
    private startTime: number = Date.now();
    private modules: StartupModule[] = DEFAULT_MODULES;
    private totalSteps: number = DEFAULT_MODULES.length;
    private currentStep: number = 0;
    private progressBar: cliProgress.SingleBar | null = null;
    private isDebug: boolean = process.env.DEBUG === 'true';

    private originalConsole = {
        log: console.log,
        warn: console.warn,
        info: console.info
    };
    private suppressedLogs: { type: 'log' | 'warn' | 'info'; args: any[] }[] = [];
    private isLoading: boolean = false;

    constructor() { }

    public suppressLogs(): void {
        this.isLoading = true;
        const self = this;

        console.log = (...args: any[]) => {
            if (self.isLoading && !self.isDebug) {
                self.suppressedLogs.push({ type: 'log', args });
            } else {
                self.originalConsole.log(...args);
            }
        };
        console.warn = (...args: any[]) => {
            if (self.isLoading && !self.isDebug) {
                self.suppressedLogs.push({ type: 'warn', args });
            } else {
                self.originalConsole.warn(...args);
            }
        };
        console.info = (...args: any[]) => {
            if (self.isLoading && !self.isDebug) {
                self.suppressedLogs.push({ type: 'info', args });
            } else {
                self.originalConsole.info(...args);
            }
        };
    }

    public restoreLogs(): void {
        this.isLoading = false;
        console.log = this.originalConsole.log;
        console.warn = this.originalConsole.warn;
        console.info = this.originalConsole.info;
        this.suppressedLogs = [];
    }

    public setModules(modulesList: StartupModule[]): void {
        if (Array.isArray(modulesList)) {
            this.modules = modulesList;
            this.totalSteps = this.modules.length;
        }
    }

    public showLogo(): void {
        this.suppressLogs();
        if (!this.isDebug) {
            this.originalConsole.log('\x1bc');
        } else {
            this.originalConsole.log('\n--- Démarrage du système ---\n');
        }

        const logo = generateLogo(botIdentity.fullName);
        this.originalConsole.log(logo);

        this.progressBar = new cliProgress.SingleBar({
            format: `  ${THEME.PRIMARY}║${THEME.ACCENT} {bar} ${THEME.PRIMARY}║${THEME.RESET} ${THEME.CYAN}{percentage}%${THEME.RESET} │ {module}`,
            barCompleteChar: '▓',
            barIncompleteChar: '░',
            barsize: 30,
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: false
        }, cliProgress.Presets.shades_classic);

        this.progressBar.start(this.totalSteps, 0, { module: `${THEME.GRAY}Initialisation...${THEME.RESET}` });
    }

    public loading(moduleId: string): void {
        const module = this.modules.find((m: any) => m.id === moduleId);
        if (module && this.progressBar) {
            const label = `${module.icon} ${module.name}...`;
            this.progressBar.update(this.currentStep, { module: label });
        }
    }

    public success(moduleId: string, detail = ''): void {
        const module = this.modules.find((m: any) => m.id === moduleId);
        if (module) {
            this.currentStep++;
            const statusText = detail ? `${module.icon} ${module.name} (${detail})` : `${module.icon} ${module.name}`;
            this.results.set(moduleId, { status: 'success', module, detail });

            if (this.progressBar) {
                this.progressBar.update(this.currentStep, { module: `\x1b[32m✓\x1b[0m ${statusText}` });
            }
        }
    }

    public error(moduleId: string, errorMsg: string): void {
        const module = this.modules.find((m: any) => m.id === moduleId);
        if (module) {
            this.currentStep++;
            this.results.set(moduleId, { status: 'error', module, error: errorMsg });
            this.errors.push({ module: module.name, error: errorMsg });

            if (this.progressBar) {
                this.progressBar.update(this.currentStep, { module: `\x1b[31m✗\x1b[0m ${module.icon} ${module.name}` });
            }
        }
    }

    public complete(botName = 'Bot'): void {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);

        if (this.progressBar) {
            this.progressBar.update(this.totalSteps, { module: `${THEME.SUCCESS}✓ Démarrage terminé!${THEME.RESET}` });
            this.progressBar.stop();
        }

        this.restoreLogs();
        console.log('\n');

        for (const module of this.modules) {
            const result = this.results.get(module.id);
            if (!result) continue;

            if (result.status === 'success') {
                const detail = result.detail ? ` ${THEME.GRAY}(${result.detail})${THEME.RESET}` : '';
                console.log(`  ${THEME.SUCCESS}✓${THEME.RESET} ${module.icon} ${module.name}${detail}`);
            } else {
                console.log(`  ${THEME.ERROR}✗${THEME.RESET} ${module.icon} ${module.name} ${THEME.ERROR}- ${result.error}${THEME.RESET}`);
            }
        }

        console.log('');

        const border = this.errors.length === 0 ? THEME.SUCCESS : THEME.SECONDARY;
        console.log(`${border}╔════════════════════════════════════════════╗${THEME.RESET}`);
        if (this.errors.length === 0) {
            console.log(`${border}║  ✅ ${botName.substring(0, 20).padEnd(20)} prêt !         ║${THEME.RESET}`);
            console.log(`${border}║  ⏱️  Démarrage en ${elapsed.padStart(5)}s                   ║${THEME.RESET}`);
        } else {
            console.log(`${border}║  ⚠️  ${botName.substring(0, 15).padEnd(15)} : ${this.errors.length} erreur(s)  ║${THEME.RESET}`);
        }
        console.log(`${border}╚════════════════════════════════════════════╝${THEME.RESET}`);

        if (this.errors.length > 0) {
            console.log(`\n${THEME.ERROR}Détails des erreurs:${THEME.RESET}`);
            for (const err of this.errors) {
                console.log(`  • ${err.module}: ${err.error}`);
            }
        }

        console.log(`\n${THEME.SUCCESS}✅ Système actif et connecté !${THEME.RESET}\n`);
    }
}

export const startupDisplay = new StartupDisplay();
export default startupDisplay;
