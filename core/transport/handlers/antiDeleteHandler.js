import { workingMemory } from '../../../services/workingMemory.js';

export class AntiDeleteHandler {
    constructor(transport, logger) {
        this.transport = transport;
        this.logger = logger;
    }

    /**
     * Enregistre un message pour pouvoir le restaurer s'il est supprimé
     * @param {Object} normalizedMsg Message normalisé
     */
    async storeMessage(normalizedMsg) {
        if (!normalizedMsg.text || !normalizedMsg.isGroup) return;

        try {
            await workingMemory.storeMessage(normalizedMsg.chatId, normalizedMsg.id, {
                sender: normalizedMsg.sender,
                senderName: normalizedMsg.senderName || normalizedMsg.pushName || normalizedMsg.sender.split('@')[0],
                text: normalizedMsg.text,
                mediaType: normalizedMsg.type, // imageMessage, etc.
                timestamp: normalizedMsg.timestamp
            });
        } catch (e) {
            // Silencieux car non critique
        }
    }

    /**
     * Gère les mises à jour de messages (détection de suppression)
     * @param {Array} updates Tableau d'updates Baileys
     */
    async handleUpdate(updates) {
        for (const update of updates) {
            // messageStubType 1 = Revoke (suppression par l'auteur)
            if (update.update?.messageStubType === 1 || update.update?.message === null) {
                const chatId = update.key.remoteJid;
                const messageId = update.key.id;

                if (!chatId.endsWith('@g.us')) continue;

                try {
                    const isEnabled = await workingMemory.isAntiDeleteEnabled(chatId);
                    if (!isEnabled) continue;

                    const storedMsg = await workingMemory.getStoredMessage(chatId, messageId);
                    if (!storedMsg) continue;

                    this.logger.log(`[AntiDelete] 🗑️ Message supprimé détecté de ${storedMsg.senderName}`);
                    
                    // Logger dans Supabase si nécessaire via workingMemory
                    await workingMemory.trackDeletedMessage(chatId, messageId, storedMsg);

                    // Restaurer le message (repost)
                    const repostText = `🗑️ *Message supprimé par ${storedMsg.senderName}:*\n\n"${storedMsg.text}"`;
                    await this.transport.sock.sendMessage(chatId, { text: repostText });
                } catch (err) {
                    this.logger.error(`[AntiDelete] Erreur restauration: ${err.message}`);
                }
            }
        }
    }
}
