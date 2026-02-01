// core/FairnessQueue.js
/**
 * File d'attente à équité garantie (Fairness Queue)
 * Implémente un algorithme Round-Robin pondéré entre les chatIds
 */
export class FairnessQueue {
    constructor() {
        // Map<chatId, Array<Event>>
        this.queues = new Map();
        // Liste circulaire des chatIds actifs
        this.chatIds = [];
        // Index courant pour le Round-Robin
        this.currentIndex = 0;
    }

    /**
     * Ajoute un événement à la file spécifique de son chatId
     * @param {string} chatId 
     * @param {Object} event 
     * @param {boolean} isPremium - Si vrai, saute la file (ex: Admin DM)
     */
    enqueue(chatId, event, isPremium = false) {
        if (!this.queues.has(chatId)) {
            this.queues.set(chatId, []);
            this.chatIds.push(chatId);
        }

        const queue = this.queues.get(chatId);

        // Les événements premium (Admin) sont ajoutés au DÉBUT de leur file
        // et on pourrait même implémenter une file prioritaire séparée si besoin
        if (isPremium) {
            queue.unshift(event);
            // On s'assure que ce chat est le prochain servi
            const idx = this.chatIds.indexOf(chatId);
            if (idx !== -1) this.currentIndex = idx;
        } else {
            queue.push(event);
        }
    }

    /**
     * Récupère le prochain événement selon l'algo Round-Robin
     * CORRECTION: Utilise un snapshot pour éviter les race conditions
     * @returns {Object|null}
     */
    dequeue() {
        if (this.chatIds.length === 0) return null;

        // Snapshot du tableau pour éviter les problèmes de modification pendant itération
        const chatIdsSnapshot = [...this.chatIds];
        let startIndex = this.currentIndex;
        
        // Parcourir tous les chats à partir de l'index courant
        for (let i = 0; i < chatIdsSnapshot.length; i++) {
            // Calculer l'index circulaire
            const actualIndex = (startIndex + i) % chatIdsSnapshot.length;
            const chatId = chatIdsSnapshot[actualIndex];
            
            // Vérifier si ce chat existe encore (pourrait avoir été supprimé)
            if (!this.chatIds.includes(chatId)) {
                continue; // Skip si déjà supprimé
            }
            
            const queue = this.queues.get(chatId);
            
            if (queue && queue.length > 0) {
                // Récupérer l'événement
                const event = queue.shift();
                
                // Nettoyer si la file est maintenant vide
                if (queue.length === 0) {
                    this.queues.delete(chatId);
                    const idx = this.chatIds.indexOf(chatId);
                    if (idx !== -1) {
                        this.chatIds.splice(idx, 1);
                    }
                    
                    // Ajuster currentIndex si nécessaire
                    if (this.currentIndex >= this.chatIds.length && this.chatIds.length > 0) {
                        this.currentIndex = 0;
                    }
                } else {
                    // Avancer pour la prochaine fois
                    this.advance();
                }
                
                return event;
            } else if (queue && queue.length === 0) {
                // File vide détectée (cas edge) - nettoyer
                this.queues.delete(chatId);
                const idx = this.chatIds.indexOf(chatId);
                if (idx !== -1) {
                    this.chatIds.splice(idx, 1);
                }
                
                // Ajuster currentIndex
                if (this.currentIndex >= this.chatIds.length && this.chatIds.length > 0) {
                    this.currentIndex = 0;
                }
            }
        }

        return null;
    }

    advance() {
        if (this.chatIds.length === 0) {
            this.currentIndex = 0;
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.chatIds.length;
        }
    }

    get size() {
        let count = 0;
        for (const q of this.queues.values()) {
            count += q.length;
        }
        return count;
    }

    get activeChats() {
        return this.chatIds.length;
    }
}
