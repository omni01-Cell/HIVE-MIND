// plugins/sticker/index.js
// Plugin de création de stickers à partir d'images/vidéos

import Sticker, { StickerTypes } from 'wa-sticker-formatter';

export default {
    name: 'create_sticker',
    description: 'Crée un sticker à partir d\'une image, vidéo ou GIF.',
    version: '1.0.0',
    enabled: true,

    // TEXT MATCHER : Pattern [sticker] pour fallback textuel
    textMatchers: [
        {
            pattern: /\[sticker\]/i,
            handler: 'create_sticker',
            description: 'Créer un sticker via [sticker]',
            extractArgs: () => ({})
        }
    ],

    // Définition pour function calling
    toolDefinition: {
        type: 'function',
        function: {
            name: 'create_sticker',
            description: 'Créer un sticker à partir d\'une image ou vidéo jointe au message ou citée. L\'utilisateur doit envoyer ou répondre à une image/vidéo.',
            parameters: {
                type: 'object',
                properties: {
                    pack_name: {
                        type: 'string',
                        description: 'Nom du pack de stickers (optionnel)'
                    },
                    author: {
                        type: 'string',
                        description: 'Nom de l\'auteur du sticker (optionnel)'
                    }
                },
                required: []
            }
        }
    },

    /**
     * Exécute la création du sticker
     * @param {Object} args - { pack_name, author }
     * @param {Object} context - { transport, message, chatId, sender }
     */
    async execute(args, context) {
        const { transport, message, chatId } = context;
        const { pack_name = 'Bot Stickers', author = 'Bot', url } = args;

        // Vérifier si on a un média
        let mediaMessage = null;
        let directBuffer = null;

        // Cas 0: URL directe (via use_tool ou autre)
        if (url) {
            try {
                // Import dynamique pour fetch (si pas global) ou use global fetch
                const response = await fetch(url);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    directBuffer = Buffer.from(arrayBuffer);
                }
            } catch (e) {
                console.error('[Sticker] Erreur téléchargement URL:', e);
            }
        }

        // Média dans le message actuel
        if (message.raw?.message?.imageMessage || message.raw?.message?.videoMessage) {
            mediaMessage = message.raw;
        }
        // Média dans le message cité
        else if (message.quotedMsg?.message) {
            if (message.quotedMsg.message.imageMessage || message.quotedMsg.message.videoMessage) {
                mediaMessage = { message: message.quotedMsg.message, key: message.raw.key };
            }
        }

        if (!mediaMessage && !directBuffer) {
            return {
                success: false,
                message: 'IMAGE_REQUISE: Envoie, réponds à une image/vidéo, ou fournis une URL pour créer un sticker.'
            };
        }

        try {
            // Télécharger le média (soit URL buffer, soit Message)
            const mediaBuffer = directBuffer || await transport.downloadMedia({ raw: mediaMessage });

            // Créer le sticker
            const sticker = new Sticker(mediaBuffer, {
                pack: pack_name,
                author: author,
                type: StickerTypes.FULL,
                quality: 80
            });

            const stickerBuffer = await sticker.toBuffer();

            // Envoyer le sticker
            await transport.sendSticker(chatId, stickerBuffer);

            return {
                success: true,
                message: 'Sticker créé et envoyé avec succès ! 🎉'
            };

        } catch (error) {
            console.error('[Sticker Plugin] Erreur:', error);
            return {
                success: false,
                message: `Erreur lors de la création du sticker: ${error.message}`
            };
        }
    }
};
