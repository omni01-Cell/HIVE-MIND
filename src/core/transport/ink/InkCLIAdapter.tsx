import React from 'react';
import { render, Instance } from 'ink';
import { App } from './App.js';

export const InkCLIAdapter = {
    appInstance: null as Instance | null,
    messageCallback: null as any,
    groupEventCallback: null as any,
    messages: [] as any[],
    isTyping: false as boolean,

    // Hook exposé par le composant React pour mettre à jour l'état interne
    updateMessages: null as ((messages: any[]) => void) | null,
    updateIsTyping: null as ((isTyping: boolean) => void) | null,

    /**
     * Helper pour ajouter un message à l'interface
     */
    addMessage: (msg: any) => {
        InkCLIAdapter.messages = [...InkCLIAdapter.messages, msg];
        InkCLIAdapter.isTyping = false;

        if (InkCLIAdapter.updateMessages) {
            InkCLIAdapter.updateMessages(InkCLIAdapter.messages);
        }
        if (InkCLIAdapter.updateIsTyping) {
            InkCLIAdapter.updateIsTyping(false);
        }
    },

    /**
     * Connecte au service de messagerie (ici le terminal via Ink)
     */
    connect: async () => {
        // Au lieu d'utiliser readline, on lance l'application Ink
        // Pour pouvoir mettre à jour l'état depuis l'extérieur, on crée un composant conteneur

        const Container = () => {
            const [messages, setMessages] = React.useState<any[]>(InkCLIAdapter.messages);
            const [isTyping, setIsTyping] = React.useState<boolean>(InkCLIAdapter.isTyping);

            // On expose le setter
            React.useEffect(() => {
                InkCLIAdapter.updateMessages = setMessages;
                InkCLIAdapter.updateIsTyping = setIsTyping;
                return () => {
                    InkCLIAdapter.updateMessages = null;
                    InkCLIAdapter.updateIsTyping = null;
                };
            }, []);

            const handleMessage = (text: string) => {
                if (text === '.exit') {
                    process.exit(0);
                }

                // Afficher le message de l'utilisateur
                InkCLIAdapter.addMessage({ id: 'cli_' + Date.now(), sender: 'user', text });

                if (InkCLIAdapter.messageCallback) {
                    const messageObj = {
                        id: 'cli_' + Date.now(),
                        chatId: 'cli_chat',
                        sender: 'cli_user',
                        senderName: 'Admin CLI',
                        text,
                        isGroup: false,
                        isSystem: false,
                        raw: { text }
                    };
                    InkCLIAdapter.messageCallback(messageObj);
                }
            };

            return <App messages={messages} onMessage={handleMessage} isTyping={isTyping} />;
        };

        console.clear();
        InkCLIAdapter.appInstance = render(<Container />);
    },

    /**
     * Déconnecte du service
     */
    disconnect: async () => {
        if (InkCLIAdapter.appInstance) {
            InkCLIAdapter.appInstance.unmount();
            InkCLIAdapter.appInstance = null;
        }
    },

    /**
     * Envoie un message texte
     */
    sendText: async (chatId: string, text: string, options: any = {}) => {
        InkCLIAdapter.addMessage({ id: 'sent_' + Date.now(), sender: 'agent', text });
        return { id: 'sent_' + Date.now() };
    },

    /**
     * Envoie une réponse universelle formatée pour le Terminal (Pattern du Double Rendu)
     */
    sendUniversalResponse: async (chatId: string, response: any, options: any = {}) => {
        // On récupère le markdown complet
        const text = response.markdown || response.plain_text;

        InkCLIAdapter.addMessage({ id: 'sent_' + Date.now(), sender: 'agent', text });
        return { id: 'sent_' + Date.now() };
    },

    /**
     * Envoie un média
     */
    sendMedia: async (chatId: string, media: any, options: any = {}) => {
        InkCLIAdapter.addMessage({ id: 'sent_' + Date.now(), sender: 'agent', text: `[MÉDIA ENVOYÉ: ${options.caption || 'Sans légende'}]` });
        return { id: 'sent_media_' + Date.now() };
    },

    /**
     * Envoie un sticker
     */
    sendSticker: async (chatId: string, stickerBuffer: any) => {
        InkCLIAdapter.addMessage({ id: 'sent_' + Date.now(), sender: 'agent', text: '[STICKER ENVOYÉ]' });
        return { id: 'sent_sticker_' + Date.now() };
    },

    /**
     * Récupère les métadonnées d'un groupe
     */
    getGroupMetadata: async (groupId: string) => {
        return {
            id: groupId,
            subject: 'CLI Group',
            participants: ['cli_user'],
            admins: ['cli_user']
        };
    },

    /**
     * Télécharge un média depuis un message
     */
    downloadMedia: async (message: any) => {
        return Buffer.from('');
    },

    /**
     * Définit le callback pour les nouveaux messages
     */
    onMessage: (callback: any) => {
        InkCLIAdapter.messageCallback = callback;
    },

    /**
     * Définit le callback pour les événements de groupe
     */
    onGroupEvent: (callback: any) => {
        InkCLIAdapter.groupEventCallback = callback;
    },

    /**
     * Met à jour la présence (typing, online, etc.)
     */
    setPresence: async (chatId: string, presence: string) => {
        InkCLIAdapter.isTyping = (presence === 'composing' || presence === 'recording');
        if (InkCLIAdapter.updateIsTyping) {
            InkCLIAdapter.updateIsTyping(InkCLIAdapter.isTyping);
        }
    },

    /**
     * Vérifie si un utilisateur est admin d'un groupe
     */
    isAdmin: async (groupId: string, userId: string) => {
        return true;
    }
};
