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

            const prompt = `Tu es le "Subconscient" de HIVE-MIND.
Voici les logs d'erreurs et d'actions des dernières 24h :
${recentErrors.map(e => `- Tool: ${e.tool}, Error: ${e.error}`).join('\n')}

Leçons actuelles :
${currentLessons}

MISSION : Étudie ces erreurs. Identifie les patterns récurrents (mauvais paramètres, mauvais outils choisis, limitations techniques).
RÉDIGE une liste de 3 à 5 leçons CRITIQUES et ACTIONNABLES pour ne pas répéter ces erreurs demain.

Format : Markdown pur, liste à puces, sois très direct.`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es le module de réflexion interne du bot.' },
                { role: 'user', content: prompt }
            ], { family: 'gemini', model: 'gemini-2.0-flash', temperature: 0.1 });

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
