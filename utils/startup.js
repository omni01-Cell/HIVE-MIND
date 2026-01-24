// utils/startup.js
// Module d'affichage au démarrage avec cli-progress pour une barre professionnelle

import { botIdentity } from './botIdentity.js';
import cliProgress from 'cli-progress';

/**
 * Génère le logo ASCII HIVE-MIND
 */
function generateLogo(botName) {
    const displayName = `🧠 WhatsApp Bot v3.0 - ${botName} AI`.padEnd(45);

    return `
\x1b[36m╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗  ██╗██╗██╗   ██╗███████╗    ███╗   ███╗██╗███╗   ██╗██████╗  ║
║   ██║  ██║██║██║   ██║██╔════╝    ████╗ ████║██║████╗  ██║██╔══██╗ ║
║   ███████║██║██║   ██║█████╗█████╗██╔████╔██║██║██╔██╗ ██║██║  ██║ ║
║   ██╔══██║██║╚██╗ ██╔╝██╔══╝╚════╝██║╚██╔╝██║██║██║╚██╗██║██║  ██║ ║
║   ██║  ██║██║ ╚████╔╝ ███████╗    ██║ ╚═╝ ██║██║██║ ╚████║██████╔╝ ║
║   ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝    ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝  ║
║                                                               ║
║   \x1b[33m${displayName}\x1b[36m║
╚═══════════════════════════════════════════════════════════════╝\x1b[0m
`;
}

/**
 * Liste des modules à charger
 */
const MODULES = [
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
        this.totalSteps = MODULES.length;
        this.currentStep = 0;
        this.progressBar = null;
        this.currentModule = '';
    }

    /**
     * Affiche le logo et initialise la barre
     */
    showLogo() {
        console.clear();
        const logo = generateLogo(botIdentity.fullName);
        console.log(logo);
        console.log('');

        // Créer la barre de progression
        this.progressBar = new cliProgress.SingleBar({
            format: '  {bar} {percentage}% | {module}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: false
        }, cliProgress.Presets.shades_classic);

        // Démarrer la barre
        this.progressBar.start(this.totalSteps, 0, { module: 'Démarrage...' });
    }

    /**
     * Module en cours de chargement
     */
    loading(moduleId) {
        const module = MODULES.find(m => m.id === moduleId);
        if (module && this.progressBar) {
            this.currentModule = `${module.icon} ${module.name}...`;
            this.progressBar.update(this.currentStep, { module: this.currentModule });
        }
    }

    /**
     * Module chargé avec succès
     */
    success(moduleId, detail = '') {
        const module = MODULES.find(m => m.id === moduleId);
        if (module) {
            this.currentStep++;
            const statusText = detail ? `${module.icon} ${module.name} (${detail})` : `${module.icon} ${module.name}`;
            this.results.set(moduleId, { status: 'success', module, detail });

            if (this.progressBar) {
                this.progressBar.update(this.currentStep, { module: `✓ ${statusText}` });
            }
        }
    }

    /**
     * Module échoué
     */
    error(moduleId, errorMsg) {
        const module = MODULES.find(m => m.id === moduleId);
        if (module) {
            this.currentStep++;
            this.results.set(moduleId, { status: 'error', module, error: errorMsg });
            this.errors.push({ module: module.name, error: errorMsg });

            if (this.progressBar) {
                this.progressBar.update(this.currentStep, { module: `✗ ${module.icon} ${module.name}` });
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
            this.progressBar.update(this.totalSteps, { module: 'Démarrage terminé!' });
            this.progressBar.stop();
        }

        console.log('\n');

        // Résumé des modules
        for (const module of MODULES) {
            const result = this.results.get(module.id);
            if (!result) continue;

            if (result.status === 'success') {
                const detail = result.detail ? ` \x1b[90m(${result.detail})\x1b[0m` : '';
                console.log(`  \x1b[32m✓\x1b[0m ${module.icon} ${module.name}${detail}`);
            } else {
                console.log(`  \x1b[31m✗\x1b[0m ${module.icon} ${module.name} \x1b[31m- ${result.error}\x1b[0m`);
            }
        }

        console.log('');

        // Encadré final
        if (this.errors.length === 0) {
            console.log(`\x1b[32m╔════════════════════════════════════════════╗\x1b[0m`);
            console.log(`\x1b[32m║  ✅ ${botName.substring(0, 20).padEnd(20)} prêt !         ║\x1b[0m`);
            console.log(`\x1b[32m║  ⏱️  Démarrage en ${elapsed.padStart(5)}s                   ║\x1b[0m`);
            console.log(`\x1b[32m╚════════════════════════════════════════════╝\x1b[0m`);
        } else {
            console.log(`\x1b[33m╔════════════════════════════════════════════╗\x1b[0m`);
            console.log(`\x1b[33m║  ⚠️  ${botName.substring(0, 15)} démarré avec ${this.errors.length} erreur(s)  ║\x1b[0m`);
            console.log(`\x1b[33m╚════════════════════════════════════════════╝\x1b[0m`);

            console.log('\n\x1b[31mErreurs:\x1b[0m');
            for (const err of this.errors) {
                console.log(`  • ${err.module}: ${err.error}`);
            }
        }


        console.log('✅ Connecté à WhatsApp !');
        console.log('');
    }
}

export const startupDisplay = new StartupDisplay();
export default startupDisplay;
