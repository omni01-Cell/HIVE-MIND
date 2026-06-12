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

        // Register a dummy transport for 'internal' to support system conscious pulse and silent events
        const internalTransport = {
            connect: async () => {},
            disconnect: async () => {},
            sendText: async () => ({}),
            sendMedia: async () => ({}),
            sendVoiceNote: async () => ({}),
            sendFile: async () => ({}),
            sendSticker: async () => ({}),
            getGroupMetadata: async () => ({}),
            downloadMedia: async () => Buffer.from(''),
            onMessage: () => {},
            onGroupEvent: () => {},
            setPresence: async () => {},
            sendUniversalResponse: async () => ({}),
            isAdmin: async () => false,
            sendReaction: async () => true
        };
        this.register('internal', internalTransport);
        this.register('system', internalTransport);
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
            const isTui = name === 'ink-cli' || name === 'tui';
            if (isTui && !this.transports.has(name)) {
                try {
                    const { hiveTransport } = await import('../../tui/transport/HiveTransport.js');
                    this.register(name, hiveTransport);
                    console.log(`[TransportManager] TUI HIVE-MIND chargé comme transport ${name}`);
                } catch (e) {
                    console.error(`[TransportManager] Failed to load HIVE-MIND TUI for ${name}:`, e);
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
     * Résout 'current' ou les transports non trouvés/inactifs vers le transport actif par défaut.
     */
    getTransport(name?: string): any {
        if (!name || name === 'current') {
            if (this.activeTransports.length > 0) {
                return this.transports.get(this.activeTransports[0]);
            }
            // Fallback pour les tests ou l'accès précoce
            return this.transports.get('whatsapp');
        }

        const transport = this.transports.get(name);
        if (!transport) {
            console.warn(`[TransportManager] Transport '${name}' non trouvé ou inactif. Fallback sur le transport par défaut.`);
            if (this.activeTransports.length > 0) {
                return this.transports.get(this.activeTransports[0]);
            }
            return this.transports.get('whatsapp');
        }
        return transport;
    }

    /**
     * Getter de compatibilité pour accéder au socket du transport par défaut (ex: Baileys)
     * WHY: BotCore et de nombreux handlers accèdent directement à .sock sur l'instance de transport.
     */
    get sock() {
        try {
            const transport = this.getTransport();
            return transport ? transport.sock : null;
        } catch {
            return null;
        }
    }

    set sock(value: any) {
        try {
            const transport = this.getTransport();
            if (transport) {
                transport.sock = value;
            }
        } catch {
            // Should not happen with the fallback in getTransport
        }
    }

    /**
     * Proxy pour récupérer les métadonnées d'un groupe
     */
    async getGroupMetadata(groupId: string, sourceChannel?: string) {
        const transport = this.getTransport(sourceChannel);
        if (typeof transport.getGroupMetadata === 'function') {
            return await transport.getGroupMetadata(groupId);
        }
        // Fallback si direct sock access is preferred by some transports
        if (transport.sock?.groupMetadata) {
            return await transport.sock.groupMetadata(groupId);
        }
        throw new Error(`[TransportManager] getGroupMetadata non supporté par le transport ${sourceChannel || 'par défaut'}`);
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

    async sendVoiceNote(channelId: string, audio: any, options: any = {}, sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendVoiceNote(channelId, audio, options);
    }

    async sendFile(channelId: string, filePath: any, fileName: string, caption: string = '', sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendFile(channelId, filePath, fileName, caption);
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

    async sendSticker(channelId: string, stickerBuffer: any, sourceChannel?: string) {
        return this.getTransport(sourceChannel).sendSticker(channelId, stickerBuffer);
    }

    async isAdmin(groupId: string, userId: string, sourceChannel?: string) {
        return this.getTransport(sourceChannel).isAdmin(groupId, userId);
    }

    async disconnect() {
        const disconnectPromises = this.activeTransports.map(async (name) => {
            const transport = this.transports.get(name);
            if (transport && typeof transport.disconnect === 'function') {
                await transport.disconnect();
            }
        });
        await Promise.all(disconnectPromises);
    }
}

export const transportManager = new TransportManager();
