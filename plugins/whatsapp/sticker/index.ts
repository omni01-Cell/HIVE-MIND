// Sticker creation plugin from images/videos

import { Sticker, StickerTypes } from 'wa-sticker-formatter';

export default {
    name: 'create_sticker',
    description: 'Creates a sticker from an image, video, or GIF.',
    version: '1.0.0',
    enabled: true,

    // TEXT MATCHER: [sticker] pattern for textual fallback
    textMatchers: [
        {
            pattern: /\[sticker\]/i,
            handler: 'create_sticker',
            description: 'Create a sticker via [sticker]',
            extractArgs: () => ({})
        }
    ],

    // Tool definition for function calling
    toolDefinition: {
        type: 'function',
        function: {
            name: 'create_sticker',
            description: 'Create a sticker from an image or video attached to the message or quoted. User must send or reply to an image/video.',
            parameters: {
                type: 'object',
                properties: {
                    pack_name: {
                        type: 'string',
                        description: 'Sticker pack name (optional)'
                    },
                    author: {
                        type: 'string',
                        description: 'Sticker author name (optional)'
                    }
                },
                required: []
            }
        }
    },

    /**
     * Exécute la création de sticker
     * @param {Object} args - { pack_name, author, url }
     * @param {Object} context - { transport, message, chatId, sender }
     * @param {string} toolName - Nom de l'outil
     */
    async execute(args: any, context: any, toolName?: string) {
        const { transport, message, chatId } = context || {};
        const { pack_name = 'Bot Stickers', author = 'Bot', url } = args;

        if (!transport || !chatId) {
            return { success: false, message: 'Transport or chatId missing from context.' };
        }

        // Check if we have media
        let mediaMessage: any = null;
        let directBuffer: any = null;

        // Case 0: Direct URL (via use_tool or other)
        if (url) {
            try {
                // Import dynamique pour fetch (si non global) ou utiliser le fetch global
                const response = await fetch(url);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    directBuffer = Buffer.from(arrayBuffer);
                }
            } catch (e: any) {
                console.error('[Sticker] URL download error:', e);
            }
        }

        // Media in current message
        if (message.raw?.message?.imageMessage || message.raw?.message?.videoMessage) {
            mediaMessage = message.raw;
        }
        // Media in quoted message
        else if (message.quotedMsg?.message) {
            if (message.quotedMsg.message.imageMessage || message.quotedMsg.message.videoMessage) {
                mediaMessage = { message: message.quotedMsg.message, key: message.raw.key };
            }
        }

        if (!mediaMessage && !directBuffer) {
            return {
                success: false,
                message: 'IMAGE_REQUIRED: Send, reply to an image/video, or provide a URL to create a sticker.'
            };
        }

        try {
            // Download media (either URL buffer or Message)
            const mediaBuffer = directBuffer || await transport.downloadMedia({ raw: mediaMessage });

            // Create sticker
            const sticker = new Sticker(mediaBuffer, {
                pack: pack_name,
                author: author,
                type: StickerTypes.FULL,
                quality: 80
            });

            const stickerBuffer = await sticker.toBuffer();

            // Send sticker
            await transport.sendSticker(chatId, stickerBuffer);

            return {
                success: true,
                message: 'Sticker created and sent successfully! 🎉'
            };

        } catch (error: any) {
            console.error('[Sticker Plugin] Error:', error);
            return {
                success: false,
                message: `Error creating sticker: ${error.message}`
            };
        }
    }
};
