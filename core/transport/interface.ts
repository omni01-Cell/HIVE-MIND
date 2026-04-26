// @ts-nocheck
// core/transport/interface.js
// Interface générique pour l'abstraction du transport (WhatsApp, Telegram, Discord...)

/**
 * Interface que tout transport doit implémenter
 * Permet de découpler la logique métier du protocole de messagerie
 */
export const TransportInterface = {
    /**
     * Connecte au service de messagerie
     * @returns {Promise<void>}
     */
    connect: async () => {
        throw new Error('connect() must be implemented');
    },

    /**
     * Déconnecte du service
     * @returns {Promise<void>}
     */
    disconnect: async () => {
        throw new Error('disconnect() must be implemented');
    },

    /**
     * Envoie un message texte
     * @param {string} chatId - Identifiant de la conversation
     * @param {string} text - Texte à envoyer
     * @param {Object} options - Options (mentions, reply, etc.)
     * @returns {Promise<Object>} - Message envoyé
     */
    sendText: async (chatId, text, options = {}) => {
        throw new Error('sendText() must be implemented');
    },

    /**
     * Envoie un média (image, vidéo, audio, document)
     * @param {string} chatId 
     * @param {Buffer|string} media - Buffer ou URL
     * @param {Object} options - { type, caption, filename }
     * @returns {Promise<Object>}
     */
    sendMedia: async (chatId, media, options = {}) => {
        throw new Error('sendMedia() must be implemented');
    },

    /**
     * Envoie un sticker
     * @param {string} chatId 
     * @param {Buffer} stickerBuffer 
     * @returns {Promise<Object>}
     */
    sendSticker: async (chatId: any, stickerBuffer: any) => {
        throw new Error('sendSticker() must be implemented');
    },

    /**
     * Récupère les métadonnées d'un groupe
     * @param {string} groupId 
     * @returns {Promise<Object>} - { name, participants, admins, ... }
     */
    getGroupMetadata: async (groupId: any) => {
        throw new Error('getGroupMetadata() must be implemented');
    },

    /**
     * Télécharge un média depuis un message
     * @param {Object} message 
     * @returns {Promise<Buffer>}
     */
    downloadMedia: async (message: any) => {
        throw new Error('downloadMedia() must be implemented');
    },

    /**
     * Définit le callback pour les nouveaux messages
     * @param {Function} callback - (message: any) => void
     */
    onMessage: (callback: any) => {
        throw new Error('onMessage() must be implemented');
    },

    /**
     * Définit le callback pour les événements de groupe
     * @param {Function} callback - (event: any) => void
     */
    onGroupEvent: (callback: any) => {
        throw new Error('onGroupEvent() must be implemented');
    },

    /**
     * Met à jour la présence (typing, online, etc.)
     * @param {string} chatId 
     * @param {string} presence - 'composing' | 'paused' | 'available'
     */
    setPresence: async (chatId: any, presence: any) => {
        throw new Error('setPresence() must be implemented');
    },

    /**
     * Envoie une réponse structurée (Universal Response)
     * @param {string} chatId 
     * @param {Object} response - { markdown, plainText, visual, data }
     * @param {Object} options 
     */
    sendUniversalResponse: async (chatId, response, options = {}) => {
        throw new Error('sendUniversalResponse() must be implemented');
    },

    /**
     * Vérifie si un utilisateur est admin d'un groupe
     * @param {string} groupId 
     * @param {string} userId 
     * @returns {Promise<boolean>}
     */
    isAdmin: async (groupId: any, userId: any) => {
        throw new Error('isAdmin() must be implemented');
    },

    /**
     * Envoie une réaction (emoji) sur un message
     * @param {string} chatId 
     * @param {Object} key - Clé du message cible
     * @param {string} emoji 
     * @returns {Promise<boolean>}
     */
    sendReaction: async (chatId: any, key: any, emoji: any) => {
        throw new Error('sendReaction() must be implemented');
    }
};

/**
 * Valide qu'un objet implémente l'interface TransportInterface
 * @param {Object} transport 
 * @returns {boolean}
 */
export function validateTransport(transport: any) {
    const requiredMethods = Object.keys(TransportInterface);
    for (const method of requiredMethods) {
        if (typeof transport[method] !== 'function') {
            console.warn(`[TransportInterface] Warning: Transport is missing method: ${method}`);
        }
    }
    return true;
}
