// services/tagService.js
// Service d'Auto-Tagging : Catégorisation intelligente des souvenirs

import { providerRouter } from '../providers/index.js';

export const tagService = {
    /**
     * Génère des tags pour un contenu donné
     * @param {string} content 
     * @returns {Promise<string[]>}
     */
    async generateTags(content) {
        if (!content || content.length < 10) return [];

        try {
            const systemPrompt = `Tu es le "Categorizer" de HIVE-MIND.
Ta mission est d'assigner des tags à un souvenir.

TAGS POSSIBLES : preference, fact, opinion, task, emotion, technical, social.
RÈGLES :
1. Maximum 3 tags.
2. Uniquement les tags de la liste.
3. Réponds uniquement par les tags séparés par des virgules.`;

            const response = await providerRouter.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Texte : "${content}"` }
            ], {
                family: 'groq',
                model: 'llama-3.1-8b-instant',
                temperature: 0,
                maxTokens: 10
            });

            if (response?.content) {
                return response.content
                    .split(',')
                    .map(t => t.trim().toLowerCase())
                    .filter(t => t.length > 0);
            }

            return [];
        } catch (error) {
            console.error('[TagService] Erreur tagging:', error.message);
            return [];
        }
    }
};

export default tagService;
