// @ts-nocheck
import { Client } from 'discord.js-selfbot-v13';
import { TransportInterface } from './interface.js';

export const discordTransport = {
    client: null as Client | null,
    messageCallback: null as any,
    groupEventCallback: null as any,

    connect: async () => {
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            throw new Error('[DiscordTransport] DISCORD_TOKEN is missing in environment variables.');
        }

        discordTransport.client = new Client({
            checkUpdate: false,
        });

        discordTransport.client.on('ready', () => {
            console.log(`[DiscordTransport] Connected to Discord as ${discordTransport.client?.user?.username}`);
        });

        discordTransport.client.on('messageCreate', async (msg: any) => {
            if (msg.author.id === discordTransport.client?.user?.id) return; // Ignore self

            if (discordTransport.messageCallback) {
                // Map to HIVE-MIND MessageData format
                const messageData = {
                    id: msg.id,
                    chatId: msg.channelId,
                    sender: msg.author.id,
                    senderName: msg.author.username,
                    text: msg.content,
                    isGroup: msg.channel.type === 'GUILD_TEXT' || msg.channel.type === 'GROUP_DM',
                    timestamp: Math.floor(msg.createdTimestamp / 1000),
                    // raw: msg // Optional if needed
                };
                discordTransport.messageCallback(messageData);
            }
        });

        await discordTransport.client.login(token);
    },

    disconnect: async () => {
        if (discordTransport.client) {
            discordTransport.client.destroy();
            discordTransport.client = null;
        }
    },

    sendText: async (chatId: string, text: string, options: any = {}) => {
        if (!discordTransport.client) return;
        const channel = await discordTransport.client.channels.fetch(chatId);
        if (channel && channel.isText()) {
            return await channel.send(text);
        }
    },

    sendMedia: async (chatId: string, media: any, options: any = {}) => {
        if (!discordTransport.client) return;
        const channel = await discordTransport.client.channels.fetch(chatId);
        if (channel && channel.isText()) {
            return await channel.send({ files: [media] });
        }
    },

    sendSticker: async (chatId: any, stickerBuffer: any) => {
        console.warn('[DiscordTransport] sendSticker not implemented fully');
    },

    getGroupMetadata: async (groupId: any) => {
        if (!discordTransport.client) return null;
        const channel = await discordTransport.client.channels.fetch(groupId);
        if (channel && channel.isText()) {
            return {
                id: channel.id,
                name: (channel as any).name || 'Discord Group',
                participants: [], // Can map guild members if needed
                admins: []
            };
        }
        return null;
    },

    downloadMedia: async (message: any) => {
        // Simple download media logic or return null
        return null;
    },

    onMessage: (callback: any) => {
        discordTransport.messageCallback = callback;
    },

    onGroupEvent: (callback: any) => {
        discordTransport.groupEventCallback = callback;
    },

    setPresence: async (chatId: any, presence: any) => {
        if (!discordTransport.client) return;
        const channel = await discordTransport.client.channels.fetch(chatId);
        if (channel && channel.isText()) {
            if (presence === 'composing') {
                await channel.sendTyping();
            }
        }
    },

    sendUniversalResponse: async (chatId: string, response: any, options: any = {}) => {
        // Discord supports full markdown natively, so we prefer the markdown property
        let text = response.markdown || response.plainText;
        if (!text) return;
        
        // Split text if it exceeds Discord's 2000 character limit
        if (text.length > 2000) {
            const chunks = text.match(/[\s\S]{1,1990}/g) || [];
            for (const chunk of chunks) {
                await discordTransport.sendText(chatId, chunk, options);
            }
        } else {
            await discordTransport.sendText(chatId, text, options);
        }
    },

    isAdmin: async (groupId: any, userId: any) => {
        return false; // Basic implementation for selfbot
    },

    sendReaction: async (chatId: string, key: any, emoji: string) => {
        console.warn('[DiscordTransport] sendReaction not fully implemented');
        return false;
    }
};
