// utils/toolCallExtractor.js
// ============================================================================
// Utilitaire centralisé pour l'extraction des appels d'outils
// ============================================================================
// Évite la duplication de code et maintient une logique cohérente

/**
 * Extrait les appels d'outils depuis du texte
 * Supporte deux formats:
 * - Avec sys_interaction: sys_interaction.toolName(params)
 * - Sans sys_interaction: toolName(params)
 * 
 * @param {string} text - Texte à analyser
 * @param {boolean} includeSystemInteraction - Inclure sys_interaction dans le matching
 * @returns {Array} - [{name, arguments, raw}, ...]
 */
export function extractToolCallsFromText(text, includeSystemInteraction = true) {
    if (!text || typeof text !== 'string') return [];

    try {
        // Définir le pattern selon le format souhaité (Support étendu: sys_interaction, function tag, generic XML tag)
        // [MODIF] Ajout du pattern générique <([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1> pour tout outil halluciné
        // Attention: l'ordre compte. On met le générique à la fin pour ne pas casser les spécifiques si besoin.
        const pattern = includeSystemInteraction
            ? /(?:print\()?sys_interaction\.\)?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<tool_call>\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*<\/tool_call>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\6>/g
            : /(?:print\()?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\4>/g;

        const matches = [];
        let match;

        while ((match = pattern.exec(text)) !== null) {
            // Groupe 1/2: sys_interaction
            // Groupe 3: <function> (args vide par défaut)
            // Groupe 4/5: <tool_call>
            // Groupe 6/7: Generic XML tag (name match[6], args match[7])

            let toolName, argsText;

            if (includeSystemInteraction) {
                if (match[1]) {
                    toolName = match[1];
                    argsText = match[2];
                } else if (match[3]) {
                    toolName = match[3];
                    argsText = '{}';
                } else if (match[4]) {
                    toolName = match[4];
                    argsText = match[5];
                } else if (match[6]) { // Generic XML
                    toolName = match[6];
                    argsText = match[7];
                }
            } else {
                // Pour le mode simple
                // Groupe 1/2: func(args)
                // Groupe 3: <function>name</function>
                // Groupe 4/5: <tag>args</tag>
                if (match[1]) {
                    toolName = match[1];
                    argsText = match[2];
                } else if (match[3]) {
                    toolName = match[3];
                    argsText = '{}';
                } else if (match[4]) { // Generic XML
                    toolName = match[4];
                    argsText = match[5];
                }
            }

            const fullMatch = match[0];

            // Éviter les doublons et les matches vides
            if (toolName && argsText !== undefined) {
                matches.push({
                    name: toolName,
                    arguments: argsText.trim(),
                    raw: fullMatch,
                    index: match.index
                });
            }
        }

        return matches;

    } catch (error) {
        console.error('[ToolCallExtractor] Erreur extraction:', error.message);
        return [];
    }
}

/**
 * Extrait les appels d'outils depuis des tool_calls OpenAI
 * @param {Array} toolCalls - Array d'objets tool_call OpenAI
 * @returns {Array} - [{name, arguments, id}, ...]
 */
export function extractToolCallsFromOpenAI(toolCalls) {
    if (!Array.isArray(toolCalls)) return [];

    return toolCalls
        .filter(call => call?.function)
        .map(call => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
            type: call.type || 'function'
        }));
}

/**
 * Valide qu'un appel d'outil est bien formé
 * @param {Object} toolCall - {name, arguments}
 * @returns {boolean}
 */
export function isValidToolCall(toolCall) {
    if (!toolCall || typeof toolCall !== 'object') return false;
    if (!toolCall.name || typeof toolCall.name !== 'string') return false;
    if (toolCall.name.length === 0 || toolCall.name.length > 100) return false; // Limites raisonnables
    if (!toolCall.arguments || typeof toolCall.arguments !== 'string') return false;

    // Vérifier que le nom ne contient que des caractères valides
    if (!/^[a-zA-Z0-9_]+$/.test(toolCall.name)) return false;

    return true;
}

/**
 * Parse les arguments JSON d'un appel d'outil
 * @param {string} argsText - Texte des arguments
 * @returns {Object|null} - Arguments parsés ou null si échec
 */
export function parseToolArguments(argsText) {
    if (!argsText || typeof argsText !== 'string') return null;

    try {
        // Tenter de parser comme JSON
        return JSON.parse(argsText.trim());
    } catch (e) {
        console.warn('[ToolCallExtractor] Arguments JSON invalides, tentative de réparation...');

        try {
            // Nettoyage basique
            let cleaned = argsText.trim()
                .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Guillemets clés
                .replace(/'/g, '"') // Simple quotes
                .replace(/,\s*([}\]])/g, '$1'); // Virgules traînantes

            return JSON.parse(cleaned);
        } catch (repairError) {
            console.error('[ToolCallExtractor] Impossible de réparer les arguments:', repairError.message);
            return null;
        }
    }
}

/**
 * Formate un appel d'outil pour l'affichage/debug
 * @param {Object} toolCall - {name, arguments}
 * @returns {string}
 */
export function formatToolCall(toolCall) {
    if (!toolCall) return 'Invalid tool call';

    const args = toolCall.arguments || '{}';
    const maxLength = 50;

    const truncatedArgs = args.length > maxLength
        ? args.substring(0, maxLength) + '...'
        : args;

    return `${toolCall.name}(${truncatedArgs})`;
}

/**
 * Déduplique une liste d'appels d'outils
 * @param {Array} toolCalls - Array de tool calls
 * @returns {Array} - Tool calls uniques
 */
export function deduplicateToolCalls(toolCalls) {
    if (!Array.isArray(toolCalls)) return [];

    const seen = new Set();
    return toolCalls.filter(call => {
        if (!call || !call.name) return false;

        const key = `${call.name}:${call.arguments}`;
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

/**
 * Statistiques sur les appels d'outils extraits
 * @param {Array} toolCalls - Array de tool calls
 * @returns {Object} - Statistiques
 */
export function getToolCallStats(toolCalls) {
    if (!Array.isArray(toolCalls)) return { total: 0, unique: 0, byName: {} };

    const validCalls = toolCalls.filter(isValidToolCall);
    const byName = {};

    validCalls.forEach(call => {
        byName[call.name] = (byName[call.name] || 0) + 1;
    });

    return {
        total: toolCalls.length,
        valid: validCalls.length,
        unique: Object.keys(byName).length,
        byName
    };
}