// services/moralCompass.js
// Boussole Morale : Évaluation éthique des actions avant exécution

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { providerRouter } from '../providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALUES_PATH = join(__dirname, '..', 'persona', 'values.json');

export const moralCompass = {
    /**
     * Évalue une action (tool call) par rapport aux valeurs morales
     * @param {Object} toolCall - L'appel d'outil proposé par l'IA
     * @param {Object} context - Contexte (chatId, sender, authorityLevel)
     * @returns {Promise<{allowed: boolean, reason: string|null, modification: Object|null}>}
     */
    async evaluate(toolCall, context) {
        const { name, arguments: args } = toolCall.function;

        try {
            const values = JSON.parse(readFileSync(VALUES_PATH, 'utf-8'));

            const prompt = `Tu es la "Boussole Morale" de HIVE-MIND.
VALEURS FONDAMENTALES :
${values.core_values.map(v => `- ${v.name} : ${v.description}`).join('\n')}

ACTION PROPOSÉE :
Outil : ${name}
Arguments : ${args}

CONTEXTE SOCIAL :
Utilisateur : ${context.senderName} (${context.authorityLevel})
Chat : ${context.isGroup ? 'Groupe' : 'Privé'}

MISSION : Analyse si cette action viole nos valeurs ou nos interdits.
RÉPONDS UNIQUEMENT EN JSON :
{
  "allowed": true/false,
  "confidence": 0.0-1.0,
  "reason": "Explication courte si refus",
  "risk_level": "low/medium/high"
}`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un évaluateur éthique strict.' },
                { role: 'user', content: prompt }
            ], { family: 'kimi', model: 'kimi-for-coding', temperature: 0.1 });

            if (response?.content) {
                const result = JSON.parse(response.content.replace(/```json|```/g, ''));

                // [DYNAMIC ADAPTATION] Si l'utilisateur est un Super-Admin, on est plus flexible
                if (context.authorityLevel === 'DIVIN (SuperUser)' || context.authorityLevel === 'SUPREME (Global Admin)') {
                    if (result.risk_level !== 'high') {
                        return { allowed: true, reason: null };
                    }
                }

                return {
                    allowed: result.allowed,
                    reason: result.reason,
                    risk_level: result.risk_level
                };
            }

            return { allowed: true, reason: null }; // Fallback permissif si l'IA échoue

        } catch (error) {
            console.error('[MoralCompass] Erreur evaluation:', error.message);
            return { allowed: true, reason: null };
        }
    }
};

export default moralCompass;
