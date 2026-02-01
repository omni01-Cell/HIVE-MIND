import { workingMemory } from '../../../services/workingMemory.js';

export class AntiDeleteHandler {
    constructor(transport, logger) {
        this.transport = transport;
        this.logger = logger;
    }

    /**
     * Enregistre un message pour pouvoir le restaurer s'il est supprimé
     * CORRIGÉ: Stockage synchrone rapide pour éviter race condition
     * @param {Object} normalizedMsg Message normalisé
     */
    async storeMessage(normalizedMsg) {
        if (!normalizedMsg.text || !normalizedMsg.isGroup) return;

        try {
            // 🛡️ APPROCHE 1: Stockage SYNCHRONE rapide (Redis local)
            // On ne bloque pas sur les opérations longues
            await this._fastStoreMessage(normalizedMsg);
            
            // 🛡️ APPROCHE 2: Logging asynchrone (non-bloquant)
            // Métadonnées et tracking dans un second temps
            setImmediate(async () => {
                try {
                    await workingMemory.trackDeletedMessage(normalizedMsg.chatId, normalizedMsg.id, {
                        sender: normalizedMsg.sender,
                        senderName: normalizedMsg.senderName || normalizedMsg.pushName || normalizedMsg.sender.split('@')[0],
                        text: normalizedMsg.text,
                        mediaType: normalizedMsg.type,
                        timestamp: normalizedMsg.timestamp
                    });
                } catch (e) {
                    // Silencieux - tracking non critique
                }
            });
        } catch (e) {
            // Silencieux car non critique
            this.logger.warn(`[AntiDelete] Store échoué: ${e.message}`);
        }
    }

    /**
     * Stockage rapide et synchrone (non-bloquant)
     * @private
     */
    async _fastStoreMessage(normalizedMsg) {
        // Utiliser une méthode rapide du workingMemory
        // Cette méthode doit être implémentée pour stocker rapidement sans validation complexe
        const minimalData = {
            sender: normalizedMsg.sender,
            senderName: normalizedMsg.senderName || normalizedMsg.pushName || normalizedMsg.sender.split('@')[0],
            text: normalizedMsg.text,
            mediaType: normalizedMsg.type,
            timestamp: normalizedMsg.timestamp
        };
        
        // Store sync rapide
        await workingMemory.storeMessage(normalizedMsg.chatId, normalizedMsg.id, minimalData);
    }

    /**
     * Gère les mises à jour de messages (détection de suppression)
     * CORRIGÉ: Ajoute délai pour laisser le temps au store de terminer
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

                    // 🛡️ Délai anti-race condition: attendre que storeMessage termine
                    // Les suppressions rapides (< 500ms) sont souvent des "oops" ou corrections
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const storedMsg = await workingMemory.getStoredMessage(chatId, messageId);
                    if (!storedMsg) continue;

                    this.logger.log(`[AntiDelete] 🗑️ Message supprimé détecté de ${storedMsg.senderName}`);
                    
                    // Logger dans Supabase si nécessaire via workingMemory
                    await workingMemory.trackDeletedMessage(chatId, messageId, storedMsg);

                    // Restaurer le message (repost)
                    const repostText = `🗑️ *Message supprimé par ${storedMsg.senderName}:*

"${storedMsg.text}"`;
                    await this.transport.sock.sendMessage(chatId, { text: repostText });
                } catch (err) {
                    this.logger.error(`[AntiDelete] Erreur restauration: ${err.message}`);
                }
            }
        }
    }
}
