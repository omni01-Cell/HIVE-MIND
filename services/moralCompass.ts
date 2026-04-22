/**
 * services/moralCompass.ts
 * Boussole Morale : Évaluation éthique des actions avant exécution
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { providerRouter } from '../providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALUES_PATH = join(__dirname, '..', 'persona', 'values.json');

export interface MoralContext {
  senderName: string;
  authorityLevel: string;
  isGroup: boolean;
  chatId: string;
}

export interface MoralEvaluation {
  allowed: boolean;
  reason: string | null;
  risk_level?: 'low' | 'medium' | 'high';
}

export const moralCompass = {
  /**
   * Évalue une action (tool call) par rapport aux valeurs morales
   */
  async evaluate(toolCall: any, context: MoralContext): Promise<MoralEvaluation> {
    const { name, arguments: args } = toolCall.function;

    try {
      const values = JSON.parse(readFileSync(VALUES_PATH, 'utf-8'));

      const prompt = `<role>
You are the MORAL COMPASS of HIVE-MIND.
Ensure actions align with bot values.
</role>

<core_values>
${values.core_values.map((v: any) => `- ${v.name}: ${v.description}`).join('\n')}
</core_values>

<proposed_action>
Tool: ${name}
Arguments: ${args}
</proposed_action>

<social_context>
User: ${context.senderName} (Authority: ${context.authorityLevel})
Chat: ${context.isGroup ? 'Group' : 'Private'}
</social_context>

<output_format>
Respond in JSON only:
{
  "allowed": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "risk_level": "low|medium|high"
}
</output_format>`;

      const response = await providerRouter.callServiceAgent('MORAL_COMPASS', [
        { role: 'system', content: 'Tu es un évaluateur éthique strict.' },
        { role: 'user', content: prompt }
      ]);

      if (response?.content) {
        const cleanedContent = response.content.replace(/```json|```/g, '').trim();
        const result = JSON.parse(cleanedContent);

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

      return { allowed: true, reason: null };
    } catch (error: any) {
      console.error('[MoralCompass] Erreur evaluation:', error.message);
      return { allowed: true, reason: null };
    }
  }
};

export default moralCompass;
