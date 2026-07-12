import { hiveConfig } from '../config/hiveConfig.js';
/**
 * HiveTransport — Pont entre TUI et core HIVE-MIND
 *
 * Implémente TransportInterface pour connecter le TUI au core.
 * Hérite de EventEmitter pour notifier l'UI Ink locale des réponses et états du core.
 */

import { EventEmitter } from 'events';
import type { MessageData, BotEvent } from '../../core/types/BotTypes.js';

type MessageCallback = (message: MessageData) => void;
type GroupEventCallback = (event: BotEvent) => void;


class HiveTransportImpl extends EventEmitter {
    private messageCallbacks: MessageCallback[] = [];
    private groupEventCallbacks: GroupEventCallback[] = [];
    private isInitialized = false;
    private pendingConfirmations: Map<string, { resolve: (res: { approved: boolean; feedback?: string }) => void }> = new Map();
    private sessionId = '';

    constructor() {
        super();
    }

    /** Set the TUI session ID from the configuration */
    setSessionId(id: string): void {
        this.sessionId = id;
    }

    /** Retrieve the TUI session ID */
    getSessionId(): string {
        return this.sessionId || hiveConfig.getSessionId();
    }

    /**
     * Initialise le transport
     */
    async connect(): Promise<void> {
        this.isInitialized = true;
        console.log('[HiveTransport] ✅ Connecté');
        this.emit('connection_status', { connected: true });
    }

    /**
     * Arrêt propre du transport
     */
    async disconnect(): Promise<void> {
        this.isInitialized = false;
        this.messageCallbacks = [];
        this.groupEventCallbacks = [];
        console.log('[HiveTransport] Déconnecté');
        this.emit('connection_status', { connected: false });
    }

    /**
     * Envoie un message texte du core vers le TUI
     */
    async sendText(chatId: string, text: string, options: Record<string, unknown> = {}): Promise<unknown> {
        const message: MessageData = {
            chatId: chatId || this.getSessionId(),
            sender: 'assistant',
            text,
            isGroup: false,
            sourceChannel: 'ink-cli',
            ...options
        };

        this.emit('message', message);
        return { success: true, messageId: `tui-msg-${Date.now()}` };
    }

    /**
     * Envoie un média (image, vidéo, audio, document) du core vers le TUI
     */
    async sendMedia(chatId: string, media: unknown, options: Record<string, unknown> = {}): Promise<unknown> {
        const type = options.type || 'document';
        const filename = options.filename || 'media';
        const caption = options.caption || '';

        this.emit('media', { chatId, media, type, filename, caption });
        return { success: true };
    }

    /**
     * Envoie une note vocale du core vers le TUI
     */
    async sendVoiceNote(chatId: string, audio: unknown, options: Record<string, unknown> = {}): Promise<unknown> {
        this.emit('voice', { chatId, audio, options });
        return { success: true };
    }

    /**
     * Envoie un fichier du core vers le TUI
     */
    async sendFile(chatId: string, filePath: string, fileName: string, caption: string = ''): Promise<unknown> {
        this.emit('file', { chatId, filePath, fileName, caption });
        return { success: true };
    }

    /**
     * Envoie un sticker du core vers le TUI
     */
    async sendSticker(chatId: string, stickerBuffer: Buffer): Promise<unknown> {
        this.emit('sticker', { chatId, stickerBuffer });
        return { success: true };
    }

    /**
     * Récupère les métadonnées d'un groupe (non applicable au TUI local)
     */
    async getGroupMetadata(_groupId: string): Promise<Record<string, unknown>> {
        return { name: 'TUI Group', participants: [], admins: [] };
    }

    /**
     * Télécharge un média (non applicable au TUI local)
     */
    async downloadMedia(_message: unknown): Promise<Buffer> {
        return Buffer.from('');
    }

    /**
     * Enregistre le callback pour les nouveaux messages (appelé par TransportManager)
     */
    onMessage(callback: MessageCallback): void {
        this.messageCallbacks.push(callback);
    }

    /**
     * Enregistre le callback pour les événements de groupe
     */
    onGroupEvent(callback: GroupEventCallback): void {
        this.groupEventCallbacks.push(callback);
    }

    /**
     * Met à jour la présence (ex: typing indicator)
     */
    async setPresence(chatId: string, presence: string): Promise<void> {
        this.emit('presence', { chatId, presence });
    }

    /**
     * Envoie une réponse structurée (Universal Response)
     */
    async sendUniversalResponse(
        chatId: string,
        response: { markdown?: string; plainText?: string; visual?: unknown },
        options: Record<string, unknown> = {}
    ): Promise<unknown> {
        const text = response.markdown || response.plainText || '';
        if (text) {
            await this.sendText(chatId, text, options);
        }
        if (response.visual) {
            this.emit('visual_response', { chatId, visual: response.visual });
        }
        return { success: true };
    }

    /**
     * Vérifie si un utilisateur est admin du canal TUI (toujours true car owner@local)
     */
    async isAdmin(_groupId: string, _userId: string): Promise<boolean> {
        return true;
    }

    /**
     * Envoie une réaction
     */
    async sendReaction(chatId: string, key: unknown, emoji: string): Promise<boolean> {
        this.emit('reaction', { chatId, key, emoji });
        return true;
    }

    /**
     * Méthode interne pour pousser l'input utilisateur vers le core (User -> Core)
     */
    submitUserMessage(text: string, options: Record<string, unknown> = {}): void {
        const msg: MessageData = {
            chatId: this.getSessionId(),
            sender: 'owner@local',
            senderName: 'TUI Admin',
            text,
            isGroup: false,
            sourceChannel: 'ink-cli',
            ...options
        };

        for (const callback of this.messageCallbacks) {
            try {
                callback(msg);
            } catch (error: unknown) {
                console.error('[HiveTransport] Erreur dans callback message:', error);
            }
        }
    }

    /**
     * Retourne l'identifiant du chat local
     */
    getChatId(): string {
        return this.getSessionId();
    }

    /**
     * Vérifie si le transport est connecté
     */
    isConnected(): boolean {
        return this.isInitialized;
    }

    /**
     * Workspace actif pour la TUI (bypass sandbox)
     */
    getWorkspace(): string {
        return process.cwd();
    }

    /**
     * Envoie une requête de confirmation HITL vers le TUI
     */
    async requestConfirmation(type: string, data: unknown, description: string): Promise<{ approved: boolean; feedback?: string }> {
        const id = `conf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return new Promise((resolve) => {
            this.pendingConfirmations.set(id, { resolve });
            this.emit('confirmation_request', { id, type, data, description });
        });
    }

    /**
     * Soumet la réponse de l'utilisateur TUI à une requête de confirmation
     */
    submitConfirmationResponse(id: string, approved: boolean, feedback?: string): void {
        const pending = this.pendingConfirmations.get(id);
        if (pending) {
            this.pendingConfirmations.delete(id);
            pending.resolve({ approved, feedback });
        }
    }
}

// Instance singleton
export const hiveTransport = new HiveTransportImpl();

// Export par défaut
export default hiveTransport;
