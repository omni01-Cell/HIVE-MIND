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

            const prompt = `<role>
You are the MORAL COMPASS of HIVE-MIND, the ethical guardian.
Your purpose: ensure all actions align with bot values and prevent harmful behaviors.
</role>

<core_values>
${values.core_values.map(v => `- ${v.name}: ${v.description}`).join('\\n')}
</core_values>

<proposed_action>
Tool: ${name}
Arguments: ${args}
</proposed_action>

<social_context>
User: ${context.senderName} (Authority: ${context.authorityLevel})
Chat: ${context.isGroup ? 'Group' : 'Private'}
</social_context>

<task>
Analyze if this action violates our values or prohibitions.
Consider: user authority, action destructiveness, alignment with mission.
</task>

<output_format>
Respond in JSON only:
{
  "allowed": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation if denied",
  "risk_level": "low|medium|high"
}
</output_format>`;

            const response = await providerRouter.callServiceAgent('MORAL_COMPASS', [
                { role: 'system', content: 'Tu es un évaluateur éthique strict.' },
                { role: 'user', content: prompt }
            ]);

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
