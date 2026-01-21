// services/dreamService.js
// Module de Rêve : Analyse des actions passées pour l'auto-apprentissage

import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { agentMemory } from './agentMemory.js';
import { providerRouter } from '../providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LESSONS_PATH = join(__dirname, '..', 'persona', 'lessons_learned.md');

export const dreamService = {
    /**
     * Analyse les actions des dernières 24h et met à jour les leçons apprises
     */
    async dream() {
        console.log('[DreamService] 💤 Le bot entre en phase de rêve (Auto-Reflection)...');

        try {
            // 1. Récupérer les actions récentes (on prend les 50 dernières actions globales)
            // Note: agentMemory.getRecentActions est par chatId, on pourrait avoir besoin d'un getGlobalRecentActions
            // Pour l'instant, on va simuler une récupération globale ou boucler sur les chats actifs.

            // On récupère les leçons déjà présentes
            const currentLessons = readFileSync(LESSONS_PATH, 'utf-8');

            // Extraction des erreurs via agentMemory (on prend un échantillon large)
            const recentErrors = await agentMemory.getGlobalLessonsLearned(30);


            if (recentErrors.length === 0) {
                console.log('[DreamService] ✨ Aucun cauchemar (erreur) détecté. Tout va bien.');
                return;
            }

            const prompt = `<role>
You are the SUBCONSCIOUS of HIVE-MIND, the nightly reflection process that learns from mistakes.
Your analysis directly improves tomorrow's performance by identifying patterns in failures.
</role>

<context>
This is HIVE-MIND's self-improvement loop. Every night, you analyze today's errors to extract actionable lessons.
These lessons become permanent knowledge that prevents future mistakes.
</context>

<error_logs>
${recentErrors.map(e => `- Tool: ${e.tool}, Error: ${e.error}`).join('\\n')}
</error_logs>

<current_lessons>
${currentLessons}
</current_lessons>

<task>
Analyze error patterns to extract actionable lessons.
Focus on: recurring issues, wrong tool selections, parameter mistakes, technical limitations.
Create 3-5 CRITICAL, ACTIONABLE lessons to prevent repetition.
</task>

<output_constraints>
- Format: Markdown bullet points ONLY
- Length: Maximum 10 bullet points total
- Style: Concise, imperative (e.g., "Avoid X when Y", "Always check Z before...")
- NO verbose explanations, NO introductions, NO conclusions
- Focus ONLY on specific, actionable lessons
</output_constraints>

Lessons:`;

            const response = await providerRouter.callServiceAgent('DREAM_SERVICE', [
                { role: 'system', content: 'Tu es le module de réflexion interne du bot.' },
                { role: 'user', content: prompt }
            ]);

            if (response?.content) {
                const newLessons = `# Lessons Learned (Updated: ${new Date().toLocaleDateString()})\n\n${response.content}`;
                writeFileSync(LESSONS_PATH, newLessons);
                console.log('[DreamService] ✅ Rêve terminé. Nouvelles leçons enregistrées.');
            }

        } catch (error) {
            console.error('[DreamService] Erreur pendant le rêve:', error.message);
        }
    },

    /**
     * Charge les leçons pour les injecter dans le prompt
     */
    getLessons() {
        try {
            return readFileSync(LESSONS_PATH, 'utf-8');
        } catch {
            return "";
        }
    }
};

export default dreamService;
