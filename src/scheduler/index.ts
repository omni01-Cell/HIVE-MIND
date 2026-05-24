// @ts-nocheck
// scheduler/index.js
// Gestionnaire de tâches planifiées (Cron) pour le mode proactif

import cron from 'node-cron';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { orchestrator } from '../core/orchestrator.js';
import { eventBus, BotEvents } from '../core/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger la config
let schedulerConfig: any;
try {
    schedulerConfig = JSON.parse(
        readFileSync(join(__dirname, '..', 'config', 'scheduler.json'), 'utf-8')
    );
} catch (error: any) {
    console.warn('⚠️ scheduler.json non trouvé, mode proactif désactivé');
    schedulerConfig = { enabled: false, jobs: [] };
}

class Scheduler {
    jobs: any;
    isRunning: any;

    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Initialise tous les jobs configurés
     */
    init() {
        if (this.isRunning) return;
        if (!schedulerConfig.enabled) {

            // Scheduler désactivé silencieusement
            return;
        }

        // Initialisation silencieuse

        for (const jobConfig of schedulerConfig.jobs || []) {
            if (!jobConfig.enabled) continue;

            try {
                this._registerJob(jobConfig);
            } catch (error: any) {
                console.error(`❌ Erreur job ${jobConfig.name}:`, error.message);
            }
        }

        this.isRunning = true;
        // Jobs initialisés silencieusement
    }

    /**
     * Enregistre un job Cron
     */
    _registerJob(config: any) {
        const { name, cron: cronExpr, target } = config;

        // Valide l'expression Cron
        if (!cron.validate(cronExpr)) {
            throw new Error(`Expression cron invalide: ${cronExpr}`);
        }

        const task = cron.schedule(cronExpr, async () => {
            console.log(`⏰ Job déclenché: ${name}`);

            eventBus.publish(BotEvents.JOB_TRIGGERED, { job: name });

            // Envoie l'événement à l'orchestrateur
            orchestrator.enqueue({
                type: 'scheduled',
                job: name,
                target,
                priority: 2, // Priorité moyenne
                timestamp: Date.now()
            });

        }, {
            timezone: schedulerConfig.timezone || 'Europe/Paris',
            scheduled: false // On démarre manuellement
        });

        this.jobs.set(name, { task, config });
        task.start();

        // Job enregistré silencieusement
    }

    /**
     * Démarre un job spécifique
     */
    start(jobName: any) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.task.start();
            console.log(`▶️ Job démarré: ${jobName}`);
        }
    }

    /**
     * Arrête un job spécifique
     */
    stop(jobName: any) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.task.stop();
            console.log(`⏹️ Job arrêté: ${jobName}`);
        }
    }

    /**
     * Arrête tous les jobs
     */
    stopAll() {
        for (const [name, job] of this.jobs) {
            job.task.stop();
        }
        this.isRunning = false;
        console.log('⏹️ Tous les jobs arrêtés');
    }

    /**
     * Exécute un job immédiatement
     */
    async runNow(jobName: any) {
        const job = this.jobs.get(jobName);
        if (!job) {
            throw new Error(`Job inconnu: ${jobName}`);
        }

        console.log(`🚀 Exécution immédiate: ${jobName}`);

        orchestrator.enqueue({
            type: 'scheduled',
            job: jobName,
            target: job.config.target,
            priority: 1, // Haute priorité pour exécution manuelle
            timestamp: Date.now()
        });
    }

    /**
     * Liste tous les jobs
     */
    list() {
        return Array.from(this.jobs.entries()).map(([name, job]) => ({
            name,
            cron: job.config.cron,
            description: job.config.description,
            enabled: job.config.enabled,
            nextRun: this._getNextRun(job.config.cron)
        }));
    }

    /**
     * Calcule la prochaine exécution
     */
    _getNextRun(cronExpr: any) {
        // Simplifié - utiliser une lib comme cron-parser pour plus de précision
        return 'Voir expression cron';
    }

    /**
     * Récupère la config des triggers
     */
    getTriggers() {
        return schedulerConfig.triggers || {};
    }
}

export const scheduler = new Scheduler();
export default scheduler;
