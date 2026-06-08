/**
 * HiveTransport — Pont entre TUI et core HIVE-MIND
 *
 * Implémente TransportInterface pour permettre au TUI de communiquer
 * avec le core HIVE-MIND via le même mécanisme que WhatsApp/Discord/Telegram.
 *
 * Flux :
 *   TUI submitQuery(text)
 *     → HiveTransport.sendText("tui-local", text)
 *     → core._handleMessage(BotEvent)
 *     → ReAct loop → LLM → tools → response
 *     → HiveTransport.sendText() (core envoie la réponse)
 *     → onMessage callback
 *     → TUI affiche la réponse
 */

import type { MessageData, BotEvent } from '../../core/types/BotTypes.js';

type MessageCallback = (message: MessageData) => void;
type GroupEventCallback = (event: BotEvent) => void;

const TUI_CHAT_ID = 'tui-local';

class HiveTransportImpl {
    private messageCallbacks: MessageCallback[] = [];
    private groupEventCallbacks: GroupEventCallback[] = [];
    private isInitialized = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private core: any = null;

    /**
   * Initialise le transport et le core HIVE-MIND
   */
    async connect(): Promise<void> {
        if (this.isInitialized) {
            console.log('[HiveTransport] Déjà initialisé');
            return;
        }

        try {
            // Import dynamique du core pour éviter les dépendances circulaires
            const { botCore } = await import('../../core/index.js');
            this.core = botCore;

            // Initialiser le core si ce n'est pas déjà fait
            if (!this.core.isReady) {
                await this.core.init();
            }

            this.isInitialized = true;
            console.log('[HiveTransport] ✅ Connecté au core HIVE-MIND');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[HiveTransport] ❌ Erreur de connexion:', message);
            throw error;
        }
    }

    /**
   * Arrêt propre du transport
   */
    async disconnect(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            // Le core gère son propre arrêt
            this.isInitialized = false;
            this.messageCallbacks = [];
            this.groupEventCallbacks = [];
            console.log('[HiveTransport] Déconnecté');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[HiveTransport] Erreur de déconnexion:', message);
        }
    }

    /**
   * Envoie un message texte au core
   * C'est la méthode clé : le TUI l'appelle quand l'utilisateur soumet une requête
   */
    async sendText(chatId: string, text: string, options: Record<string, unknown> = {}): Promise<void> {
        if (!this.isInitialized || !this.core) {
            throw new Error('[HiveTransport] Pas connecté au core');
        }

        // Créer un BotEvent pour le core
        const event: BotEvent = {
            data: {
                chatId: chatId || TUI_CHAT_ID,
                sender: 'tui-user',
                senderName: 'TUI User',
                text,
                isGroup: false,
                sourceChannel: 'tui',
                ...options
            }
        } as BotEvent;

        // Envoyer au core via _handleMessage
        try {
            await this.core._handleMessage(event);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[HiveTransport] Erreur _handleMessage:', message);

            // Notifier les callbacks de l'erreur
            this.notifyMessageCallbacks({
                chatId: chatId || TUI_CHAT_ID,
                sender: 'system',
                text: `❌ Erreur: ${message}`,
                isGroup: false,
                sourceChannel: 'tui'
            });
        }
    }

    /**
   * Envoie un média
   */
    async sendMedia(chatId: string, _media: unknown, _options: Record<string, unknown> = {}): Promise<void> {
        console.log('[HiveTransport] sendMedia:', chatId);
    }

    /**
   * Envoie une note vocale
   */
    async sendVoiceNote(chatId: string, _audio: unknown, _options: Record<string, unknown> = {}): Promise<void> {
        console.log('[HiveTransport] sendVoiceNote:', chatId);
    }

    /**
   * Envoie un fichier
   */
    async sendFile(chatId: string, _filePath: string, fileName: string, _caption: string = ''): Promise<void> {
        console.log('[HiveTransport] sendFile:', chatId, fileName);
    }

    /**
   * Envoie un sticker
   */
    async sendSticker(chatId: string, _stickerBuffer: Buffer): Promise<void> {
        console.log('[HiveTransport] sendSticker:', chatId);
    }

    /**
   * Récupère les métadonnées d'un groupe
   */
    async getGroupMetadata(_groupId: string): Promise<Record<string, unknown>> {
        return { name: 'TUI Group', participants: [], admins: [] };
    }

    /**
   * Télécharge un média depuis un message
   */
    async downloadMedia(_message: unknown): Promise<Buffer> {
        return Buffer.from('');
    }

    /**
   * Enregistre le callback pour les nouveaux messages
   * C'est ici que le core envoie les réponses au TUI
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
   * Met à jour la présence (typing indicator)
   */
    async setPresence(chatId: string, presence: string): Promise<void> {
    // Le TUI peut afficher "En train d'écrire..." si nécessaire
        if (presence === 'composing') {
            console.log(`[HiveTransport] ${chatId} est en train d'écrire...`);
        }
    }

    /**
   * Envoie une réponse structurée
   */
    async sendUniversalResponse(chatId: string, response: { markdown?: string; plainText?: string }, _options: Record<string, unknown> = {}): Promise<void> {
        const text = response.markdown || response.plainText || '';
        if (text) {
            this.notifyMessageCallbacks({
                chatId: chatId || TUI_CHAT_ID,
                sender: 'assistant',
                text,
                isGroup: false,
                sourceChannel: 'tui'
            });
        }
    }

    /**
   * Vérifie si un utilisateur est admin (toujours false pour le TUI)
   */
    async isAdmin(_groupId: string, _userId: string): Promise<boolean> {
        return false;
    }

    /**
   * Envoie une réaction
   */
    async sendReaction(chatId: string, _key: unknown, emoji: string): Promise<void> {
        console.log('[HiveTransport] sendReaction:', chatId, emoji);
    }

    /**
   * Notifie tous les callbacks de message
   * Appelé par le core quand il envoie une réponse
   */
    private notifyMessageCallbacks(message: MessageData): void {
        for (const callback of this.messageCallbacks) {
            try {
                callback(message);
            } catch (error: unknown) {
                console.error('[HiveTransport] Erreur dans callback message:', error);
            }
        }
    }

    /**
   * Notifie tous les callbacks d'événements de groupe
   */
    private notifyGroupEventCallbacks(event: BotEvent): void {
        for (const callback of this.groupEventCallbacks) {
            try {
                callback(event);
            } catch (error: unknown) {
                console.error('[HiveTransport] Erreur dans callback groupe:', error);
            }
        }
    }

    /**
   * Retourne l'identifiant du chat local
   */
    getChatId(): string {
        return TUI_CHAT_ID;
    }

    /**
   * Vérifie si le transport est connecté
   */
    isConnected(): boolean {
        return this.isInitialized;
    }
}

// Instance singleton
export const hiveTransport = new HiveTransportImpl();

// Export par défaut pour compatibilité
export default hiveTransport;
