// services/feedbackService.js
// Service de Feedback Humain : Apprendre des réactions WhatsApp (👍/👎)

import { eventBus, BotEvents } from '../core/events.js';
import { supabase } from './supabase.js';
import { agentMemory } from './agentMemory.js';

export const feedbackService = {
    /**
     * Initialise les écouteurs de feedback
     */
    init() {
        eventBus.subscribe(BotEvents.REACTION_RECEIVED, this.handleReaction.bind(this));
        // Log removed to avoid interfering with startup progress bar
    },

    /**
     * Traite une réaction reçue
     * @param {Object} data - { chatId, messageId, sender, reaction, timestamp }
     */
    async handleReaction(data) {
        const { chatId, messageId, reaction } = data;

        // On ne traite que les pouces pour le feedback binaire
        const isPositive = reaction === '👍';
        const isNegative = reaction === '👎';

        if (!isPositive && !isNegative) return;

        try {
            // 1. Mettre à jour le score du souvenir associé (si c'était un message stocké en RAG)
            const { data: memory, error } = await supabase
                .from('memories')
                .update({
                    metadata: {
                        feedback: isPositive ? 'positive' : 'negative',
                        last_reaction: reaction
                    }
                })
                .eq('chat_id', chatId)
                .contains('metadata', { msgId: messageId }); // Supposant qu'on stocke l'ID message dans metadata

            // 2. Loguer l'événement pour le DreamService (Mémoire épisodique)
            await agentMemory.logAction(
                chatId,
                'user_feedback',
                { messageId, reaction },
                { status: 'processed' },
                isPositive ? 'success' : 'error',
                isNegative ? 'L’utilisateur n’a pas aimé cette réponse.' : null
            );

            console.log(`[FeedbackService] ✅ Feedback ${reaction} enregistré pour ${messageId}`);

        } catch (error) {
            console.error('[FeedbackService] Erreur processing reaction:', error.message);
        }
    }
};

export default feedbackService;
