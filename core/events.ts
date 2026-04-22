// core/events.js
// Bus d'événements interne pour la communication entre modules

import EventEmitter from 'events';

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // Augmente la limite pour les plugins
    }

    /**
     * Émet un événement avec logging optionnel
     * @param {string} event 
     * @param  {...any} args 
     */
    publish(event: any, ...args: any[]) {
        if (process.env.DEBUG === 'true') {
            console.log(`[EventBus] ${event}`, args[0] ? JSON.stringify(args[0]).substring(0, 100) : '');
        }
        this.emit(event, ...args);
    }

    /**
     * S'abonne à un événement
     * @param {string} event 
     * @param {Function} handler 
     */
    subscribe(event: any, handler: any) {
        this.on(event, handler);
    }

    /**
     * S'abonne à un événement une seule fois
     * @param {string} event 
     * @param {Function} handler 
     */
    subscribeOnce(event: any, handler: any) {
        this.once(event, handler);
    }

    /**
     * Se désabonne d'un événement
     * @param {string} event 
     * @param {Function} handler 
     */
    unsubscribe(event: any, handler: any) {
        this.off(event, handler);
    }
}

// Événements standards du bot
export const BotEvents = {
    // Messages
    MESSAGE_RECEIVED: 'message:received',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_FAILED: 'message:failed',
    REACTION_RECEIVED: 'message:reaction',

    // IA
    AI_REQUEST: 'ai:request',
    AI_RESPONSE: 'ai:response',
    AI_ERROR: 'ai:error',

    // Plugins
    PLUGIN_LOADED: 'plugin:loaded',
    PLUGIN_EXECUTED: 'plugin:executed',
    PLUGIN_ERROR: 'plugin:error',

    // Scheduler
    JOB_TRIGGERED: 'scheduler:job_triggered',
    JOB_COMPLETED: 'scheduler:job_completed',
    JOB_FAILED: 'scheduler:job_failed',

    // Groupes
    GROUP_JOIN: 'group:join',
    GROUP_LEAVE: 'group:leave',
    GROUP_PROMOTE: 'group:promote',
    GROUP_DEMOTE: 'group:demote',

    // Connexion
    CONNECTED: 'connection:open',
    DISCONNECTED: 'connection:close',
    QR_RECEIVED: 'connection:qr',

    // Mémoire
    MEMORY_STORED: 'memory:stored',
    MEMORY_RECALLED: 'memory:recalled'
};

export const eventBus = new EventBus();
export default EventBus;
