// core/FairnessQueue.js
/**
 * File d'attente à équité garantie (Fairness Queue)
 * Implémente un algorithme Round-Robin pondéré entre les chatIds
 */
export class FairnessQueue {
    queues: any;
    chatIds: any;
    currentIndex: any;

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
    enqueue(chatId: any, event: any, isPremium: any = false) {
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

        // WHY: Old code used a snapshot for iteration but currentIndex pointed into the LIVE array.
        // After splice removed a chatId, currentIndex referenced a different chatId → skip bug.
        // New approach: iterate on live array with correct index adjustment after splice.
        const totalChats = this.chatIds.length;

        for (let i = 0; i < totalChats; i++) {
            // Wrap around if currentIndex exceeds array bounds (can happen after splice)
            if (this.currentIndex >= this.chatIds.length) {
                this.currentIndex = 0;
            }
            if (this.chatIds.length === 0) return null;

            const chatId = this.chatIds[this.currentIndex];
            const queue = this.queues.get(chatId);

            if (queue && queue.length > 0) {
                const event = queue.shift();

                if (queue.length === 0) {
                    // Chat queue empty → remove from rotation
                    this.queues.delete(chatId);
                    this.chatIds.splice(this.currentIndex, 1);
                    // DON'T increment currentIndex: the next chatId slid into this position
                    if (this.chatIds.length > 0 && this.currentIndex >= this.chatIds.length) {
                        this.currentIndex = 0;
                    }
                } else {
                    // Chat still has messages → advance to next chat for fairness
                    this.advance();
                }

                return event;
            } else {
                // Empty queue edge case — clean up and try next
                if (queue) this.queues.delete(chatId);
                this.chatIds.splice(this.currentIndex, 1);
                // Same logic: don't increment, next chatId slid into position
                if (this.chatIds.length > 0 && this.currentIndex >= this.chatIds.length) {
                    this.currentIndex = 0;
                }
                // Don't increment i-iteration counter since we're now looking at a new chatId at same index
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
