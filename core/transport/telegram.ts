// @ts-nocheck
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

export const telegramTransport = {
    client: null as TelegramClient | null,
    messageCallback: null as any,
    groupEventCallback: null as any,

    connect: async () => {
        const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
        const apiHash = process.env.TELEGRAM_API_HASH || "";
        const sessionString = process.env.TELEGRAM_SESSION || "";
        const botToken = process.env.TELEGRAM_BOT_TOKEN || "";

        if (!apiId || !apiHash) {
            throw new Error('[TelegramTransport] TELEGRAM_API_ID and TELEGRAM_API_HASH are required.');
        }

        const stringSession = new StringSession(sessionString);
        telegramTransport.client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
            useWSS: false,
        });

        if (botToken) {
            await telegramTransport.client.start({
                botAuthToken: botToken,
            });
            console.log('[TelegramTransport] Connected to Telegram as Bot');
        } else if (sessionString) {
            await telegramTransport.client.connect();
            console.log('[TelegramTransport] Connected to Telegram with Session');
        } else {
            console.warn('[TelegramTransport] No Bot Token or Session String provided. Connecting without pre-auth.');
            await telegramTransport.client.connect();
        }

        // Register message listener
        telegramTransport.client.addEventHandler(async (event: any) => {
            const msg = event.message;
            if (!msg) return;

            const me = await telegramTransport.client?.getMe();
            if (msg.senderId?.toString() === me?.id?.toString()) return; // Ignore self

            if (telegramTransport.messageCallback) {
                const isGroup = msg.isGroup || msg.isChannel;
                let senderName = 'Unknown';
                try {
                    const sender = await msg.getSender();
                    senderName = sender?.username || sender?.firstName || 'Unknown';
                } catch (e) {}
                
                const chatId = msg.peerId?.userId?.toString() || msg.peerId?.chatId?.toString() || msg.peerId?.channelId?.toString();
                
                const messageData = {
                    id: msg.id?.toString(),
                    chatId: chatId,
                    sender: msg.senderId?.toString(),
                    senderName: senderName,
                    text: msg.message || '',
                    isGroup: isGroup,
                    timestamp: msg.date,
                };
                telegramTransport.messageCallback(messageData);
            }
        }, new NewMessage({}));
    },

    disconnect: async () => {
        if (telegramTransport.client) {
            await telegramTransport.client.disconnect();
            telegramTransport.client = null;
        }
    },

    sendText: async (chatId: string, text: string, options: any = {}) => {
        if (!telegramTransport.client) return;
        return await telegramTransport.client.sendMessage(chatId, { message: text });
    },

    sendMedia: async (chatId: string, media: any, options: any = {}) => {
        if (!telegramTransport.client) return;
        return await telegramTransport.client.sendMessage(chatId, { file: media });
    },

    sendSticker: async (chatId: any, stickerBuffer: any) => {
        if (!telegramTransport.client) return;
        return await telegramTransport.client.sendMessage(chatId, { file: stickerBuffer });
    },

    getGroupMetadata: async (groupId: any) => {
        return {
            id: groupId,
            name: 'Telegram Group',
            participants: [],
            admins: []
        };
    },

    downloadMedia: async (message: any) => {
        return null;
    },

    onMessage: (callback: any) => {
        telegramTransport.messageCallback = callback;
    },

    onGroupEvent: (callback: any) => {
        telegramTransport.groupEventCallback = callback;
    },

    setPresence: async (chatId: any, presence: any) => {
        // Presence typing not implemented for GramJS natively without extra API calls
    },

    sendUniversalResponse: async (chatId: string, response: any, options: any = {}) => {
        let text = response.markdown || response.plainText;
        if (!text) return;
        
        // Split text if it exceeds Telegram's 4096 character limit
        if (text.length > 4000) {
            const chunks = text.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) {
                await telegramTransport.sendText(chatId, chunk, options);
            }
        } else {
            await telegramTransport.sendText(chatId, text, options);
        }
    },

    isAdmin: async (groupId: any, userId: any) => {
        return false;
    },

    sendReaction: async (chatId: string, key: any, emoji: string) => {
        console.warn('[TelegramTransport] sendReaction not implemented');
        return false;
    }
};
