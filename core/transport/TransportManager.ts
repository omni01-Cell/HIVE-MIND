import { baileysTransport } from './baileys.js';
import { cliTransport } from './cli.js';
import { discordTransport } from './discord.js';
import { telegramTransport } from './telegram.js';
import { validateTransport } from './interface.js';
import type { MessageData, BotEvent } from '../types/BotTypes.js';

export class TransportManager {
    private transports: Map<string, any> = new Map();
    private activeTransports: string[] = [];

    constructor() {
        this.register('whatsapp', baileysTransport);
        this.register('cli', cliTransport);
        this.register('discord', discordTransport);
        this.register('telegram', telegramTransport);
    }

    /**
     * Enregistre un nouveau transport
     */
    register(name: string, transportInstance: any) {
        if (validateTransport(transportInstance)) {
            this.transports.set(name, transportInstance);
        }
    }

    /**
     * Propager le container d'injection de dépendances aux transports
     */
    setContainer(container: any) {
        this.transports.forEach((transport, name) => {
            if (typeof transport.setContainer === 'function') {
                transport.setContainer(container);
            }
        });
    }

    /**
     * Initialise les transports actifs selon la config (ex: ACTIVE_TRANSPORT=whatsapp,cli)
     */
    async initialize(activeTransportNames: string[] = ['whatsapp']) {
        this.activeTransports = activeTransportNames;
        
        const initPromises = this.activeTransports.map(async (name) => {
            if (name === 'ink-cli' && !this.transports.has('ink-cli')) {
                try {
                    const { InkCLIAdapter } = await import('./ink/InkCLIAdapter.js');
                    this.register('ink-cli', InkCLIAdapter);
                } catch (e) {
                    console.error('[TransportManager] Failed to load ink-cli adapter:', e);
                }
            }

            const transport = this.transports.get(name);
            if (!transport) {
                console.warn(`[TransportManager] Transport inconnu: ${name}`);
                return;
            }
            try {
                await transport.connect();
                console.log(`[TransportManager] Transport connecté: ${name}`);
            } catch (error: any) {
                console.error(`[TransportManager] Erreur de connexion au transport ${name}:`, error.message);
                throw error;
            }
        });

        await Promise.all(initPromises);
    }

    /**
     * Assigne les callbacks de réception de message à tous les transports actifs
     */
    onMessage(callback: (message: MessageData, sourceChannel: string) => void) {
        this.activeTransports.forEach((name) => {
            const transport = this.transports.get(name);
            if (transport) {
                // Wrapper le callback pour injecter la source du canal
                transport.onMessage((msg: MessageData) => {
                    // Inject source channel metadata
                    (msg as any).sourceChannel = name;
                    callback(msg, name);
                });
            }
        });
    }

    /**
     * Assigne les callbacks d'événements de groupe
     */
    onGroupEvent(callback: (event: BotEvent, sourceChannel: string) => void) {
        this.activeTransports.forEach((name) => {
            const transport = this.transports.get(name);
            if (transport) {
                transport.onGroupEvent((event: BotEvent) => {
                    (event as any).sourceChannel = name;
                    callback(event, name);
                });
            }
        });
    }

    /**
     * Récupère un transport spécifique (pour l'envoi ciblé)
     * Par défaut, renvoie le premier transport actif
     */
    getTransport(name?: string): any {
        if (!name && this.activeTransports.length > 0) {
            return this.transports.get(this.activeTransports[0]);
        }
        
        const transport = this.transports.get(name || '');
        if (!transport) {
            throw new Error(`[TransportManager] Transport non trouvé ou inactif: ${name}`);
        }
        return transport;
    }

    // --- Proxy methods for default/target transport ---

    async sendText(channelId: string, text: string, options: any = {}, sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendText(channelId, text, options);
    }

    async sendUniversalResponse(channelId: string, response: any, options: any = {}, sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendUniversalResponse(channelId, response, options);
    }

    async setPresence(channelId: string, presence: string, sourceChannel?: string) {
        return this.getTransport(sourceChannel).setPresence(channelId, presence);
    }

    async sendReaction(channelId: string, key: any, emoji: string, sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendReaction(channelId, key, emoji);
    }

    async sendMedia(channelId: string, media: any, options: any = {}, sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendMedia(channelId, media, options);
    }

    async downloadMedia(message: any, sourceChannel?: string) {
        return this.getTransport(sourceChannel || message.sourceChannel).downloadMedia(message);
    }

    async downloadQuotedMedia(message: any, sourceChannel?: string) {
        const transport = this.getTransport(sourceChannel || message.sourceChannel);
        if (typeof transport.downloadQuotedMedia === 'function') {
            return transport.downloadQuotedMedia(message);
        }
        return null;
    }

    async disconnect() {
        const disconnectPromises = this.activeTransports.map(async (name) => {
            const transport = this.transports.get(name);
            if (transport) {
                await transport.disconnect();
            }
        });
        await Promise.all(disconnectPromises);
    }
}

export const transportManager = new TransportManager();
