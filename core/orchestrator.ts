// core/orchestrator.js
// Gestionnaire d'événements asynchrones - Sépare réception et traitement

import EventEmitter from 'events';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FairnessQueue } from './FairnessQueue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger la configuration de protection contre le backlog
let config: any;
try {
    config = JSON.parse(
        readFileSync(join(__dirname, '..', 'config', 'config.json'), 'utf-8')
    );
} catch {
    config = {
        backlog_protection: {
            cooldown_between_responses_ms: 2000
        }
    };
}

// Variable locale pour la configuration active (modifiable pour les tests)
let activeConfig = config;

/**
 * Types d'événements gérés par l'orchestrateur
 * @typedef {'message' | 'scheduled' | 'proactive' | 'group_event'} EventType
 */

/**
 * Structure d'un événement dans la file
 * @typedef {Object} QueueEvent
 * @property {EventType} type - Type de l'événement
 * @property {string} chatId - Identifiant de la conversation
 * @property {Object} data - Données de l'événement
 * @property {number} timestamp - Timestamp de création
 * @property {number} priority - Priorité (1 = haute, 5 = basse)
 */

class Orchestrator extends EventEmitter {
    queue: any;
    processing: any;
    handlers: any;
    maxConcurrent: any;
    activeCount: any;
    lastProcessedTime: any;

    constructor() {
        super();
        this.queue = new FairnessQueue();
        this.processing = false;
        this.handlers = new Map();
        this.maxConcurrent = 3;
        this.activeCount = 0;
        this.lastProcessedTime = 0; // Timestamp du dernier traitement (pour cooldown)
    }

    /**
     * Enregistre un handler pour un type d'événement
     * @param {EventType} type 
     * @param {Function} handler 
     */
    registerHandler(type: any, handler: any) {
        this.handlers.set(type, handler);
    }

    /**
     * Met à jour la configuration (pour les tests)
     * @param {Object} newConfig 
     */
    setConfig(newConfig: any) {
        activeConfig = { ...activeConfig, ...newConfig };
        console.log('[Orchestrator] Configuration mise à jour');
    }

    /**
     * Ajoute un événement à la file d'attente
     * @param {QueueEvent} event 
     */
    enqueue(event: any) {
        const queueEvent = {
            ...event,
            timestamp: event.timestamp || Date.now(),
            priority: event.priority || 3
        };

        // Insertion intelligente via Fairness Queue
        // On considère les messages privés ou admin comme "Priority 1"
        const isPremium = event.priority <= 1;
        this.queue.enqueue(event.chatId, queueEvent, isPremium);

        this.emit('queued', queueEvent);
        this.process();
    }

    /**
     * Traite la file de manière asynchrone
     */
    async process() {
        if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        while (this.queue.size > 0 && this.activeCount < this.maxConcurrent) {
            const event = this.queue.dequeue();
            if (!event) break;

            this.activeCount++;

            // Traitement non-bloquant
            this.handleEvent(event)
                .then(() => {
                    this.emit('processed', event);
                })
                .catch(error => {
                    this.emit('error', { event, error });
                })
                .finally(() => {
                    this.activeCount--;
                    this.process(); // Continue le traitement
                });
        }
    }

    /**
     * Dispatch vers le handler approprié
     * @param {QueueEvent} event 
     */
    async handleEvent(event: any) {
        this.emit('processing', event);

        const handler = this.handlers.get(event.type);
        if (!handler) {
            console.warn(`[Orchestrator] Aucun handler pour le type: ${event.type}`);
            return;
        }

        try {
            // ⚡ Cooldown : Éviter de spammer les API IA
            if (activeConfig.backlog_protection?.cooldown_between_responses_ms) {
                const cooldownMs = activeConfig.backlog_protection.cooldown_between_responses_ms;
                const timeSinceLastProcess = Date.now() - this.lastProcessedTime;

                if (this.lastProcessedTime > 0 && timeSinceLastProcess < cooldownMs) {
                    const waitTime = cooldownMs - timeSinceLastProcess;
                    console.log(`[Orchestrator] ⏳ Cooldown appliqué: ${waitTime}ms`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }

            await handler(event);
            this.lastProcessedTime = Date.now(); // Mettre à jour le timestamp
        } catch (error: any) {
            console.error(`[Orchestrator] Erreur lors du traitement:`, error);
            throw error;
        }
    }

    /**
     * Statistiques de la file
     */
    getStats() {
        return {
            queueLength: this.queue.size,
            activeChats: this.queue.activeChats,
            activeCount: this.activeCount,
            handlers: Array.from(this.handlers.keys())
        };
    }

    /**
     * Vide la file d'attente
     */
    clear() {
        this.queue = new FairnessQueue();
        this.emit('cleared');
    }
}

export const orchestrator = new Orchestrator();
export default Orchestrator;
