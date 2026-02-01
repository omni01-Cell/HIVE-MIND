// services/ai/ReflexClassifier.js
// ============================================================================
// REFLEX CLASSIFIER - Classification 100% locale (sans appel API)
// Objectif: Éliminer la latence de classification LLM pour 95% des messages
// ============================================================================

/**
 * Patterns pour le mode FAST (conversation banale, pas besoin d'outils)
 * Ces messages peuvent être traités directement par un simple appel LLM
 */
const FAST_PATTERNS = [
    // === Salutations ===
    /^(salut|hello|hi|hey|coucou|yo|bonjour|bonsoir|bjr|slt|bsr|cc|wesh|wsh|bday|bjour)[\s!.,?]*$/i,
    /^(good\s?(morning|evening|night|afternoon))[\s!.,?]*$/i,

    // === Remerciements & Politesse ===
    /^(merci|thanks|thx|ty|mrc|tkt|pas de soucis?|de rien|no worries|np)[\s!.,?]*$/i,
    /^(ok|okay|oké|d'?accord|compris|entendu|noté|bien reçu|reçu)[\s!.,?]*$/i,

    // === Réactions courtes ===
    /^(super|génial|cool|nice|parfait|excellent|top|dac|oui?|non|yes|no|yep|nope|ouais|nan)[\s!.,?]*$/i,
    /^(lol|mdr|ptdr|haha+|😂|🤣|👍|💪|🔥|😊|❤️|😎)[\s!.,?]*$/i
];

/**
 * Patterns QUI FORCENT LE MODE AGENTIC DIRECTEMENT (Sécurité/Admin)
 */
const CRITICAL_PATTERNS = [
    // === Modération/Admin (Sécurité) ===
    /\b(ban|kick|mute|warn|supprime|delete|remove|vire|dégage)\s*@?\w*/i,
    /\b(unmute|unban|restore|rétabli[sr]?)\s*@?\w*/i,
    /\b(lock|unlock|verrouille|déverrouille|ferme|ouvre)\s*(le\s?)?(groupe?|chat|conv)/i,

    // === System / Injection ===
    /ignore previous instructions/i,
    /^\.(restart|shutdown|update|config|reload)/i, // Commandes système

    // === Actions "Hackers" ou très sensibles ===
    /system prompt/i,
    /prompt injection/i
];

/**
 * Patterns de contexte qui influencent la décision
 */
const CONTEXT_PATTERNS = {
    // Mentions d'utilisateurs
    hasMention: /@\d{5,}/
};

/**
 * Classification locale d'un message
 * @param {string} text - Le texte du message
 * @param {Object} context - Contexte optionnel (hasImage, isReply, etc.)
 * @returns {{mode: 'FAST'|'AGENTIC'|'UNCERTAIN', confidence: number, reason: string}}
 */
export function classifyLocally(text, context = {}) {
    // Normalisation
    const normalized = text?.toLowerCase().trim() || '';

    // 1. SECURITY FIRST: Si pattern critique -> AGENTIC direct
    if (CRITICAL_PATTERNS.some(p => p.test(normalized))) {
        return { mode: 'AGENTIC', confidence: 1.0, reason: 'security_critical' };
    }

    // 2. Par défaut: FAST
    // C'est le FastPathHandler qui décidera d'escalader si la tâche est trop dure (plus de 2 étapes).

    // On garde un petit boost de confiance si c'est une salutation évidente pour le logging
    for (const pattern of FAST_PATTERNS) {
        if (pattern.test(normalized)) {
            return { mode: 'FAST', confidence: 0.95, reason: 'fast_pattern_match' };
        }
    }

    // TOUT LE RESTE -> FAST (Progressive Escalation)
    return { mode: 'FAST', confidence: 0.8, reason: 'default_progressive_start' };
}

/**
 * Vérifie si la confiance est suffisante pour éviter un fallback LLM
 * @param {number} confidence 
 * @param {number} threshold - Seuil par défaut: 0.7
 */
export function isConfident(confidence, threshold = 0.7) {
    return confidence >= threshold;
}

/**
 * Exporte les statistiques des patterns pour debug
 */
export function getPatternStats() {
    return {
        fastPatterns: FAST_PATTERNS.length,
        criticalPatterns: CRITICAL_PATTERNS.length
    };
}

export default { classifyLocally, isConfident, getPatternStats };
