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
    async handleReaction(data: any) {
        const { chatId, messageId, reaction } = data;

        // On ne traite que les pouces pour le feedback binaire
        const isPositive = reaction === '👍';
        const isNegative = reaction === '👎';

        if (!isPositive && !isNegative) return;

        try {
            // 1. Mettre à jour le score du souvenir associé (seulement si c'est une réponse du bot)
            // Note: On utilise un filtre explicite sur le rôle 'assistant' pour éviter de tagguer des messages utilisateurs
            // [FIX] On fait d'abord un select pour ne pas écraser les autres métadonnées (comme les tags)
            // Et on utilise context_id plutôt que chat_id legacy si possible
            const { db } = await import('./supabase.js');
            const resolved = await db.resolveContextFromLegacyId(chatId);
            
            const { data: memories, error } = await supabase
                .from('memories')
                .select('id, metadata')
                .eq('context_id', resolved ? resolved.context_id : chatId)
                .eq('role', 'assistant')
                .contains('metadata', { msgId: messageId })
                .limit(1);

            if (memories && memories.length > 0) {
                const memory = memories[0];
                const newMetadata = { 
                    ...memory.metadata, 
                    feedback: isPositive ? 'positive' : 'negative', 
                    last_reaction: reaction 
                };
                await supabase.from('memories').update({ metadata: newMetadata }).eq('id', memory.id);
            }

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

        } catch (error: any) {
            console.error('[FeedbackService] Erreur processing reaction:', error.message);
        }
    }
};

export default feedbackService;
