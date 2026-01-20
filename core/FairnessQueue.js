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
     * @returns {Object|null}
     */
    dequeue() {
        if (this.chatIds.length === 0) return null;

        // Essayer de trouver un chatId avec des items
        // On parcourt au maximum une fois tous les chats
        const startCount = this.chatIds.length;
        let visited = 0;

        while (visited < startCount) {
            const chatId = this.chatIds[this.currentIndex];
            const queue = this.queues.get(chatId);

            if (queue && queue.length > 0) {
                const event = queue.shift();

                // Si la file est vide après ça, on nettoie
                if (queue.length === 0) {
                    this.queues.delete(chatId);
                    this.chatIds.splice(this.currentIndex, 1);
                    // Ajuster l'index car le tableau a rétréci
                    if (this.currentIndex >= this.chatIds.length) {
                        this.currentIndex = 0;
                    }
                } else {
                    // Sinon on passe au suivant pour la prochaine fois
                    this.advance();
                }

                return event;
            } else {
                // File vide (ne devrait pas arriver avec la logique de nettoyage, mais safety first)
                this.queues.delete(chatId);
                this.chatIds.splice(this.currentIndex, 1);
                if (this.currentIndex >= this.chatIds.length) {
                    this.currentIndex = 0;
                }
            }
            // On ne compte pas visited si on a supprimé une entrée, 
            // car on est "retombé" sur un nouvel élément au même index
            // Sauf si tableau vide
            if (this.chatIds.length === 0) return null;
        }

        return null;
    }

    advance() {
        this.currentIndex = (this.currentIndex + 1) % this.chatIds.length;
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
