// utils/startup.js
// Module d'affichage au démarrage avec cli-progress pour une barre professionnelle

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
};

/**
 * Génère le logo ASCII HIVE-MIND avec effet 3D
 */
function generateLogo(botName) {
    const displayName = `🧠 ${botName} AI - v3.0`;

    // Logo HIVE-MIND 3D avec ombres
    // Utilise █ pour le front, ▓▒░ pour la profondeur
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

    logo3D.forEach(line => {
        output += `${THEME.PRIMARY}║ ${line}${THEME.PRIMARY}║${THEME.RESET}\n`;
    });

    output += `${THEME.PRIMARY}║                                                                       ║${THEME.RESET}\n`;
    output += `${THEME.PRIMARY}║                    ${THEME.SECONDARY}${displayName.padEnd(40)}${THEME.PRIMARY}      ║${THEME.RESET}\n`;
    output += `${THEME.PRIMARY}╚═══════════════════════════════════════════════════════════════════════╝${THEME.RESET}\n`;

    return output;
}

/**
 * Liste par défaut des modules (fallback)
 */
const DEFAULT_MODULES = [
    { id: 'config', name: 'Configuration', icon: '⚙️' },
    { id: 'redis', name: 'Redis Cloud', icon: '🔴' },
    { id: 'supabase', name: 'Supabase DB', icon: '🗄️' },
    { id: 'plugins', name: 'Plugins', icon: '🔌' },
    { id: 'scheduler', name: 'Scheduler', icon: '⏰' },
    { id: 'admin', name: 'Admin Service', icon: '👑' },
    { id: 'transport', name: 'WhatsApp Transport', icon: '📱' }
];

/**
 * Classe de gestion de l'affichage avec cli-progress
 */
class StartupDisplay {
    constructor() {
        this.results = new Map();
        this.errors = [];
        this.startTime = Date.now();
        this.modules = DEFAULT_MODULES;
        this.totalSteps = this.modules.length;
        this.currentStep = 0;
        this.progressBar = null;
        this.isDebug = process.env.DEBUG === 'true';

        // Sauvegarde des fonctions console originales
        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            info: console.info
        };
        this.suppressedLogs = [];
        this.isLoading = false;
    }

    /**
     * Supprime temporairement les logs pendant le chargement
     */
    suppressLogs() {
        this.isLoading = true;
        const self = this;

        // Remplacer console.log/warn/info pour capturer les logs
        console.log = (...args) => {
            if (self.isLoading && !self.isDebug) {
                self.suppressedLogs.push({ type: 'log', args });
            } else {
                self.originalConsole.log(...args);
            }
        };
        console.warn = (...args) => {
            if (self.isLoading && !self.isDebug) {
                self.suppressedLogs.push({ type: 'warn', args });
            } else {
                self.originalConsole.warn(...args);
            }
        };
        console.info = (...args) => {
            if (self.isLoading && !self.isDebug) {
                self.suppressedLogs.push({ type: 'info', args });
            } else {
                self.originalConsole.info(...args);
            }
        };
    }

    /**
     * Restaure les logs et affiche les logs supprimés
     */
    restoreLogs() {
        this.isLoading = false;

        // Restaurer les fonctions originales
        console.log = this.originalConsole.log;
        console.warn = this.originalConsole.warn;
        console.info = this.originalConsole.info;

        // Afficher les logs supprimés si nécessaire (optionnel - commenté)
        // for (const log of this.suppressedLogs) {
        //     this.originalConsole[log.type](...log.args);
        // }
        this.suppressedLogs = [];
    }

    /**
     * Définit dynamiquement la liste des modules à charger
     * @param {Array} modulesList 
     */
    setModules(modulesList) {
        if (Array.isArray(modulesList)) {
            this.modules = modulesList;
            this.totalSteps = this.modules.length;
        }
    }

    /**
     * Affiche le logo et initialise la barre
     */
    showLogo() {
        // Supprimer les logs parasites pendant le chargement
        this.suppressLogs();

        // Ne pas effacer la console en mode debug pour garder les logs d'erreur de boot
        if (!this.isDebug) {
            this.originalConsole.log('\x1bc'); // Clear screen sans passer par console.log intercepté
        } else {
            this.originalConsole.log('\n--- Démarrage du système ---\n');
        }

        const logo = generateLogo(botIdentity.fullName);
        this.originalConsole.log(logo);

        // Créer la barre de progression avec style amélioré
        this.progressBar = new cliProgress.SingleBar({
            format: `  ${THEME.PRIMARY}║${THEME.ACCENT} {bar} ${THEME.PRIMARY}║${THEME.RESET} ${THEME.CYAN}{percentage}%${THEME.RESET} │ {module}`,
            barCompleteChar: '▓',
            barIncompleteChar: '░',
            barsize: 30,
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: false
        }, cliProgress.Presets.shades_classic);

        // Démarrer la barre
        this.progressBar.start(this.totalSteps, 0, { module: `${THEME.GRAY}Initialisation...${THEME.RESET}` });
    }

    /**
     * Module en cours de chargement
     */
    loading(moduleId) {
        const module = this.modules.find(m => m.id === moduleId);
        if (module && this.progressBar) {
            const label = `${module.icon} ${module.name}...`;
            this.progressBar.update(this.currentStep, { module: label });
        }
    }

    /**
     * Module chargé avec succès
     */
    success(moduleId, detail = '') {
        const module = this.modules.find(m => m.id === moduleId);
        if (module) {
            this.currentStep++;
            const statusText = detail ? `${module.icon} ${module.name} (${detail})` : `${module.icon} ${module.name}`;
            this.results.set(moduleId, { status: 'success', module, detail });

            if (this.progressBar) {
                this.progressBar.update(this.currentStep, { module: `\x1b[32m✓\x1b[0m ${statusText}` });
            }
        }
    }

    /**
     * Module échoué
     */
    error(moduleId, errorMsg) {
        const module = this.modules.find(m => m.id === moduleId);
        if (module) {
            this.currentStep++;
            this.results.set(moduleId, { status: 'error', module, error: errorMsg });
            this.errors.push({ module: module.name, error: errorMsg });

            if (this.progressBar) {
                this.progressBar.update(this.currentStep, { module: `\x1b[31m✗\x1b[0m ${module.icon} ${module.name}` });
            }
        }
    }

    /**
     * Affiche le résumé final
     */
    complete(botName = 'Bot') {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);

        // Arrêter la barre de progression
        if (this.progressBar) {
            this.progressBar.update(this.totalSteps, { module: `${THEME.SUCCESS}✓ Démarrage terminé!${THEME.RESET}` });
            this.progressBar.stop();
        }

        // Restaurer les logs normaux
        this.restoreLogs();

        console.log('\n');

        // Résumé des modules
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

        // Encadré final
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
