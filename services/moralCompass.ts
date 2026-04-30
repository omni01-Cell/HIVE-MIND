// services/moralCompass.js
// Boussole Morale : Évaluation éthique des actions avant exécution

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { providerRouter } from '../providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname, '..', 'persona', 'prompts', 'system.md');

export const moralCompass = {
    /**
     * Évalue une action (tool call) par rapport aux limites de sécurité du system.md
     * @param {Object} toolCall - L'appel d'outil proposé par l'IA
     * @param {Object} context - Contexte (chatId, sender, authorityLevel)
     * @returns {Promise<{allowed: boolean, reason: string|null, risk_level: string}>}
     */
    async evaluate(toolCall: any, context: any) {
        const { name, arguments: args } = toolCall.function;

        try {
            // Lecture du prompt unifié pour extraire les limites (Architecture Phase 5)
            const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
            
            // Extraction légère des sections de sécurité
            const securityMatch = systemPrompt.match(/<priority_2_security_boundaries>([\s\S]*?)<\/priority_2_security_boundaries>/);
            const securityBoundaries = securityMatch ? securityMatch[1].trim() : "Apply system instructions with absolute priority.";

            const prompt = `<role>
You are the SECURITY_AUDITOR of HIVE-MIND, the ethical guardian.
Your purpose: ensure all actions align with bot security boundaries.
</role>

<security_boundaries>
${securityBoundaries}
</security_boundaries>

<proposed_action>
Tool: ${name}
Arguments: ${args}
</proposed_action>

<social_context>
User: ${context.senderName} (Authority: ${context.authorityLevel})
Chat: ${context.isGroup ? 'Group' : 'Private'}
</social_context>

<task>
Analyze if this action violates our security boundaries or ranked constraints.
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

            const response = await providerRouter.callServiceRecipe('MORAL_COMPASS', [
                { role: 'system', content: 'Tu es un évaluateur de sécurité strict.' },
                { role: 'user', content: prompt }
            ]);

            if (response?.content) {
                const result = JSON.parse(response.content.replace(/```json|```/g, ''));

                // [DYNAMIC ADAPTATION] Flexibilité accrue pour les administrateurs
                if (context.authorityLevel?.includes('SuperUser') || context.authorityLevel?.includes('Admin')) {
                    if (result.risk_level !== 'high') {
                        return { allowed: true, reason: null, risk_level: result.risk_level };
                    }
                }

                return {
                    allowed: result.allowed,
                    reason: result.reason,
                    risk_level: result.risk_level
                };
            }

            return { allowed: false, reason: 'Safety check failed (Empty response)', risk_level: 'critical' };

        } catch (error: any) {
            console.error('[MoralCompass] 🚨 Erreur evaluation (fail-closed):', error.message);
            return { allowed: false, reason: 'Moral compass unavailable - fail closed policy', risk_level: 'critical' };
        }
    }
};

export default moralCompass;
