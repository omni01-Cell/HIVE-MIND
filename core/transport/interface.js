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
    sendSticker: async (chatId, stickerBuffer) => {
        throw new Error('sendSticker() must be implemented');
    },

    /**
     * Récupère les métadonnées d'un groupe
     * @param {string} groupId 
     * @returns {Promise<Object>} - { name, participants, admins, ... }
     */
    getGroupMetadata: async (groupId) => {
        throw new Error('getGroupMetadata() must be implemented');
    },

    /**
     * Télécharge un média depuis un message
     * @param {Object} message 
     * @returns {Promise<Buffer>}
     */
    downloadMedia: async (message) => {
        throw new Error('downloadMedia() must be implemented');
    },

    /**
     * Définit le callback pour les nouveaux messages
     * @param {Function} callback - (message) => void
     */
    onMessage: (callback) => {
        throw new Error('onMessage() must be implemented');
    },

    /**
     * Définit le callback pour les événements de groupe
     * @param {Function} callback - (event) => void
     */
    onGroupEvent: (callback) => {
        throw new Error('onGroupEvent() must be implemented');
    },

    /**
     * Met à jour la présence (typing, online, etc.)
     * @param {string} chatId 
     * @param {string} presence - 'composing' | 'paused' | 'available'
     */
    setPresence: async (chatId, presence) => {
        throw new Error('setPresence() must be implemented');
    },

    /**
     * Vérifie si un utilisateur est admin d'un groupe
     * @param {string} groupId 
     * @param {string} userId 
     * @returns {Promise<boolean>}
     */
    isAdmin: async (groupId, userId) => {
        throw new Error('isAdmin() must be implemented');
    }
};

/**
 * Valide qu'un objet implémente l'interface TransportInterface
 * @param {Object} transport 
 * @returns {boolean}
 */
export function validateTransport(transport) {
    const requiredMethods = Object.keys(TransportInterface);
    for (const method of requiredMethods) {
        if (typeof transport[method] !== 'function') {
            throw new Error(`Transport is missing required method: ${method}`);
        }
    }
    return true;
}
