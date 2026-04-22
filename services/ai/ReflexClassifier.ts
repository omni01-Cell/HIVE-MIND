/**
 * services/ai/ReflexClassifier.ts
 * 100% Local Classification (no API calls).
 * Aim: Eliminate LLM classification latency for 95% of messages.
 */

/**
 * Patterns for FAST mode (common conversation, no tools needed).
 * These messages can be handled directly by a simple LLM call.
 */
const FAST_PATTERNS: RegExp[] = [
  // === Greetings ===
  /^(salut|hello|hi|hey|coucou|yo|bonjour|bonsoir|bjr|slt|bsr|cc|wesh|wsh|bday|bjour)[\s!.,?]*$/i,
  /^(good\s?(morning|evening|night|afternoon))[\s!.,?]*$/i,

  // === Thanks & Politeness ===
  /^(merci|thanks|thx|ty|mrc|tkt|pas de soucis?|de rien|no worries|np)[\s!.,?]*$/i,
  /^(ok|okay|oké|d'?accord|compris|entendu|noté|bien reçu|reçu)[\s!.,?]*$/i,

  // === Short Reactions ===
  /^(super|génial|cool|nice|parfait|excellent|top|dac|oui?|non|yes|no|yep|nope|ouais|nan)[\s!.,?]*$/i,
  /^(lol|mdr|ptdr|haha+|😂|🤣|👍|💪|🔥|😊|❤️|😎)[\s!.,?]*$/i
];

/**
 * Patterns that FORCE AGENTIC mode directly (Security/Admin).
 */
const CRITICAL_PATTERNS: RegExp[] = [
  // === Moderation/Admin (Security) ===
  /\b(ban|kick|mute|warn|supprime|delete|remove|vire|dégage)\s*@?\w*/i,
  /\b(unmute|unban|restore|rétabli[sr]?)\s*@?\w*/i,
  /\b(lock|unlock|verrouille|déverrouille|ferme|ouvre)\s*(le\s?)?(groupe?|chat|conv)/i,

  // === System / Injection ===
  /ignore previous instructions/i,
  /^\.(restart|shutdown|update|config|reload)/i, // System commands

  // === High Sensitivity / Hackers ===
  /system prompt/i,
  /prompt injection/i
];

export type ClassificationMode = 'FAST' | 'AGENTIC' | 'UNCERTAIN';

export interface ClassificationResult {
  mode: ClassificationMode;
  confidence: number;
  reason: string;
}

export interface ReflexContext {
  hasImage?: boolean;
  isReply?: boolean;
  [key: string]: any;
}

/**
 * Locally classifies a message.
 * @param text The message text.
 * @param context Optional context (hasImage, isReply, etc.).
 * @returns Classification result.
 */
export function classifyLocally(text: string | undefined, context: ReflexContext = {}): ClassificationResult {
  // Normalization
  const normalized = text?.toLowerCase().trim() || '';

  // 1. SECURITY FIRST: If critical pattern matches -> direct AGENTIC
  if (CRITICAL_PATTERNS.some((p: any) => p.test(normalized))) {
    return { mode: 'AGENTIC', confidence: 1.0, reason: 'security_critical' };
  }

  // 2. Default: FAST
  // FastPathHandler will decide to escalate if the task is too complex (more than 2 steps).

  // Boost confidence if it's an obvious greeting
  for (const pattern of FAST_PATTERNS) {
    if (pattern.test(normalized)) {
      return { mode: 'FAST', confidence: 0.95, reason: 'fast_pattern_match' };
    }
  }

  // ALL THE REST -> FAST (Progressive Escalation)
  return { mode: 'FAST', confidence: 0.8, reason: 'default_progressive_start' };
}

/**
 * Checks if confidence is high enough to skip LLM fallback.
 * @param confidence Confidence score.
 * @param threshold Default threshold: 0.7.
 */
export function isConfident(confidence: number, threshold: number = 0.7): boolean {
  return confidence >= threshold;
}

/**
 * Exports pattern statistics for debugging.
 */
export function getPatternStats(): { fastPatterns: number; criticalPatterns: number } {
  return {
    fastPatterns: FAST_PATTERNS.length,
    criticalPatterns: CRITICAL_PATTERNS.length
  };
}

export default { classifyLocally, isConfident, getPatternStats };
