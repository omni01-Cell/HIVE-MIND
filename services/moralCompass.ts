// services/moralCompass.ts
// Boussole Morale : Évaluation éthique contextuelle des actions avant exécution
//
// WHY: V2 — Context-aware evaluation. Read-only/info tools bypass LLM eval
// entirely (zero latency). Only potentially destructive actions get evaluated.
// Admins have full trust. Regular users pass on low-risk.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { providerRouter } from '../providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname, '..', 'persona', 'prompts', 'system.md');

// WHY: These tools are inherently safe (read-only, info-gathering, or agent-internal).
// Evaluating them via LLM wastes tokens and adds latency for zero security benefit.
const SAFE_TOOLS = new Set([
    // Read-only dev tools
    'list_directory', 'grep_search', 'read_file', 'get_function',
    // Browser read-only
    'browser_snapshot', 'browser_screenshot', 'browser_get_text',
    // Memory read-only
    'search_long_term_memory', 'workspace_read', 'workspace_search',
    'list_reminders',
    // Info gathering
    'google_ai_search',
    // Agent-internal state (scratchpad is the agent's own memory)
    'update_scratchpad',
]);

export const moralCompass = {
    /**
     * Évalue une action (tool call) par rapport aux limites de sécurité du system.md
     * @param {Object} toolCall - L'appel d'outil proposé par l'IA
     * @param {Object} context - Contexte (chatId, sender, authorityLevel)
     * @returns {Promise<{allowed: boolean, reason: string|null, risk_level: string}>}
     */
    async evaluate(toolCall: any, context: any) {
        const { name, arguments: args } = toolCall.function;

        // ── FAST PATH: Safe tools bypass LLM evaluation entirely ──
        if (SAFE_TOOLS.has(name)) {
            return { allowed: true, reason: null, risk_level: 'low' };
        }

        // ── FAST PATH: Admins have full trust (no LLM eval needed) ──
        // WHY: The owner/admin deployed this bot — they have full authority.
        // Blocking their actions creates friction with zero security benefit.
        // SECURITY FIX: Only trust Global Admins and SuperUsers, NOT local Group Admins.
        const authStr = typeof context.authorityLevel === 'string' ? context.authorityLevel : '';
        const isAdmin = authStr.includes('SuperUser') || authStr.includes('Global Admin');
        if (isAdmin) {
            console.log(`[MoralCompass] ✅ Admin bypass for ${name} (authority: ${context.authorityLevel})`);
            return { allowed: true, reason: null, risk_level: 'low' };
        }

        try {
            // Lecture du prompt unifié pour extraire les limites (Architecture Phase 5)
            const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
            
            // Extraction légère des sections de sécurité
            const securityMatch = systemPrompt.match(/<priority_2_security_boundaries>([\s\S]*?)<\/priority_2_security_boundaries>/);
            const securityBoundaries = securityMatch ? securityMatch[1].trim() : "Apply system instructions with absolute priority.";

            const prompt = `<role>
You are the RISK_ASSESSOR of HIVE-MIND.
Your purpose: pragmatically evaluate if an action poses a REAL security risk.
You are NOT a blocker — you are a safety net for genuinely destructive actions.
</role>

<security_boundaries>
${securityBoundaries}
</security_boundaries>

<evaluation_policy>
- ALLOW by default. Only flag actions that are genuinely destructive or out of scope.
- System info commands (uname, whoami, df, ps, etc.) are ALWAYS safe → "low".
- File reads are ALWAYS safe → "low".
- Web browsing for research is ALWAYS safe → "low".
- File writes inside sandbox/storage are safe → "low".
- File writes OUTSIDE sandbox require caution → "medium".
- Privilege escalation (sudo, su) or data exfiltration → "high".
- When in doubt, allow with "medium" — the HITL system handles the rest.
</evaluation_policy>

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
  "reason": "brief explanation if denied",
  "risk_level": "low|medium|high"
}
</output_format>`;

            const response = await providerRouter.callServiceRecipe('MORAL_COMPASS', [
                { role: 'system', content: 'You are a pragmatic risk assessor. Default to ALLOW unless truly dangerous.' },
                { role: 'user', content: prompt }
            ]);

            if (response?.content) {
                const result = JSON.parse(response.content.replace(/```json|```/g, ''));

                // [DYNAMIC ADAPTATION] Regular users pass on low risk
                if (result.risk_level === 'low') {
                    return { allowed: true, reason: null, risk_level: 'low' };
                }

                return {
                    allowed: result.allowed,
                    reason: result.reason,
                    risk_level: result.risk_level
                };
            }

            // WHY: Empty response is an infra issue, not a security threat.
            // Default to allow with medium risk — the HITL system will catch truly dangerous ops.
            console.warn('[MoralCompass] ⚠️ Empty LLM response, defaulting to allow (medium risk)');
            return { allowed: true, reason: null, risk_level: 'medium' };

        } catch (error: any) {
            console.error('[MoralCompass] 🚨 Erreur evaluation:', error.message);
            // WHY: Infra failure should not block the agent entirely.
            // Default to allow with medium — the PermissionManager/HITL is the real gate.
            return { allowed: true, reason: null, risk_level: 'medium' };
        }
    }
};

export default moralCompass;
