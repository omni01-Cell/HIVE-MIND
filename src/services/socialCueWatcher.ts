import { workingMemory } from './workingMemory.js';
import { providerRouter } from '../providers/index.js';
import { tryParseJson } from '../utils/ResponseFormatEnforcer.js';

/**
 * Social Cue Watcher - Analyse passive des groupes pour détecter les situations nécessitant intervention
 */
export const socialCueWatcher = {
    /**
     * Analyse le "pouls" d'un groupe (sentiment, vélocité, thèmes)
     * @param {string} chatId 
     * @returns {Promise<Object>} Analyse { sentiment, conflict, unansweredQuestion }
     */
    async analyzeGroupPulse(chatId: any) {
        try {
            // 1. Récupérer les derniers messages du contexte Redis
            const context = await workingMemory.getContext(chatId);

            if (context.length < 5) {
                // Pas assez d'activité pour analyser
                return {
                    sentiment: 'neutral',
                    conflict: false,
                    unansweredQuestion: false,
                    needsHelp: false,
                    shouldIntervene: false
                };
            }

            // 2. Construire une représentation textuelle
            const conversationSnippet = context
                .slice(-15) // Derniers 15 messages
                .map((m: any) => m.content)
                .join('\n');

            // 3. Prompt d'analyse LLM
            const analysisPrompt = `Tu es un observateur social silencieux de HIVE-MIND.
Analyse cette conversation de groupe WhatsApp :

${conversationSnippet}

DÉTECTE:
1. Conflit ou tension (insultes, désaccord)
2. Question restée sans réponse claire
3. Quelqu'un qui demande de l'aide technique/conseil

<output_format>
Réponds en JSON strict :
{
  "conflict": true/false,
  "unansweredQuestion": true/false,
  "needsHelp": true/false,
  "sentiment": "positive"/"neutral"/"negative",
  "reason": "Explication courte"
}

Few-shot examples:
Example 1:
{
  "conflict": false,
  "unansweredQuestion": true,
  "needsHelp": false,
  "sentiment": "neutral",
  "reason": "The user asked about sticker creation tool availability but received no replies."
}

Example 2:
{
  "conflict": true,
  "unansweredQuestion": false,
  "needsHelp": false,
  "sentiment": "negative",
  "reason": "Users are arguing over python code formats with aggressive tone."
}
</output_format>`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un analyseur de sentiment social de HIVE-MIND. Output JSON only.' },
                { role: 'user', content: analysisPrompt }
            ], {
                family: 'kimi',
                model: 'kimi-for-coding',
                temperature: 0.1
            });

            if (!response?.content) {
                return {
                    sentiment: 'neutral',
                    conflict: false,
                    unansweredQuestion: false,
                    needsHelp: false,
                    shouldIntervene: false
                };
            }

            let analysis: any;
            try {
                analysis = tryParseJson<any>(response.content);
            } catch (err) {
                const jsonMatch = response.content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw err;
                analysis = tryParseJson<any>(jsonMatch[0]);
            }

            analysis.shouldIntervene = analysis.conflict || analysis.unansweredQuestion || analysis.needsHelp;
            return analysis;

        } catch (error: any) {
            console.error('[SocialCueWatcher] Erreur analyzeGroupPulse:', error.message);
            return {
                sentiment: 'neutral',
                conflict: false,
                unansweredQuestion: false,
                needsHelp: false,
                shouldIntervene: false
            };
        }
    },

    /**
     * Alias pour la compatibilité avec schedulerHandler
     */
    async scanGroup(chatId: any) {
        return this.analyzeGroupPulse(chatId);
    },

    /**
     * Décide si le bot doit intervenir
     * @param {Object} analysis 
     * @returns {boolean}
     */
    shouldIntervene(analysis: any) {
        // Seuils d'intervention
        if (analysis.conflict && analysis.sentiment === 'negative') {
            return true; // Conflit manifeste
        }

        if (analysis.unansweredQuestion) {
            return true; // Question sans réponse
        }

        if (analysis.needsHelp) {
            return true; // Demande d'aide
        }

        return false;
    },

    /**
     * Génère une pensée proactive contextuelle
     * @param {string} chatId 
     * @param {Object} analysis 
     * @returns {Promise<string|null>}
     */
    async generateProactiveThought(chatId: any, analysis: any) {
        try {
            const context = await workingMemory.getContext(chatId);
            const recent = context.slice(-10).map((m: any) => m.content).join('\n');

            let instruction = '';
            if (analysis.conflict) {
                instruction = 'Calme la situation avec humour ou une remarque constructive. Sois bref.';
            } else if (analysis.unansweredQuestion) {
                instruction = 'Réponds à la question posée ou propose ton aide.';
            } else if (analysis.needsHelp) {
                instruction = 'Offre ton aide de manière proactive.';
            } else {
                return null; // Pas d'intervention nécessaire finalement
            }

            const thoughtPrompt = `Conversation récente:
${recent}

CONTEXTE: ${analysis.reason}
MISSION: ${instruction}

Réponds comme si tu participais naturellement à la conversation (1-2 phrases max).`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es HIVE-MIND, un bot WhatsApp social et utile.' },
                { role: 'user', content: thoughtPrompt }
            ], {
                family: 'kimi',
                model: 'kimi-for-coding',
                temperature: 0.8
            });

            return response.content;

        } catch (error: any) {
            console.error('[SocialCueWatcher] Erreur generateProactiveThought:', error.message);
            return null;
        }
    }
};

export default socialCueWatcher;
