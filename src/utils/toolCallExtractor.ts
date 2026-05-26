/**
 * utils/toolCallExtractor.ts
 * Utilitaire centralisé pour l'extraction des appels d'outils
 * Évite la duplication de code et maintient une logique cohérente
 */

export interface ToolCall {
  id?: string;
  name: string;
  arguments: string;
  type?: string;
}

export interface ToolCallRaw extends ToolCall {
  raw: string;
  index: number;
}

export interface ToolCallStats {
  total: number;
  valid: number;
  unique: number;
  byName: Record<string, number>;
}

interface ExtractMatchResult {
  toolName: string;
  argsText: string;
}

interface OpenAIFunction {
  name: string;
  arguments: string;
}

interface OpenAIToolCall {
  id?: string;
  type?: string;
  function?: OpenAIFunction;
}

function parseSystemMatchXml(match: RegExpExecArray): ExtractMatchResult | null {
    const EXCLUDED_TAGS = ['thought', 'think', 'thought_process'];
    if (match[6]) {
        if (EXCLUDED_TAGS.includes(match[6].toLowerCase())) return null;
        return { toolName: match[6], argsText: match[7] ?? '' };
    }
    return null;
}

function parseSystemMatch(match: RegExpExecArray): ExtractMatchResult | null {
    if (match[1]) return { toolName: match[1], argsText: match[2] ?? '' };
    if (match[3]) return { toolName: match[3], argsText: '{}' };
    if (match[4]) return { toolName: match[4], argsText: match[5] ?? '' };
    return parseSystemMatchXml(match);
}

function parseNonSystemMatchXml(match: RegExpExecArray): ExtractMatchResult | null {
    const EXCLUDED_TAGS = ['thought', 'think', 'thought_process'];
    if (match[4]) {
        if (EXCLUDED_TAGS.includes(match[4].toLowerCase())) return null;
        return { toolName: match[4], argsText: match[5] ?? '' };
    }
    return null;
}

function parseNonSystemMatch(match: RegExpExecArray): ExtractMatchResult | null {
    if (match[1]) return { toolName: match[1], argsText: match[2] ?? '' };
    if (match[3]) return { toolName: match[3], argsText: '{}' };
    return parseNonSystemMatchXml(match);
}

function getPattern(includeSystemInteraction: boolean): RegExp {
    return includeSystemInteraction
        ? /(?:print\()?sys_interaction\.\)?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<tool_call>\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*<\/tool_call>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\6>/g
        : /(?:print\()?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\4>/g;
}

/**
 * Extrait les appels d'outils depuis du texte
 * Supporte deux formats:
 * - Avec sys_interaction: sys_interaction.toolName(params)
 * - Sans sys_interaction: toolName(params)
 */
export function extractToolCallsFromText(text: string | null | undefined, includeSys = true): ToolCallRaw[] {
    if (!text || typeof text !== 'string') return [];
    try {
        const pattern = getPattern(includeSys);
        const matches: ToolCallRaw[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const res = includeSys ? parseSystemMatch(match) : parseNonSystemMatch(match);
            if (res) {
                matches.push({ name: res.toolName, arguments: res.argsText.trim(), raw: match[0], index: match.index });
            }
        }
        return matches;
    } catch {
        return [];
    }
}

function toToolCall(call: Partial<OpenAIToolCall>): ToolCall | null {
    const fn = call.function;
    if (!fn || !fn.name || !fn.arguments) return null;
    return {
        id: call.id,
        name: fn.name,
        arguments: fn.arguments,
        type: call.type ?? 'function'
    };
}

/**
 * Extrait les appels d'outils depuis des tool_calls OpenAI
 */
export function extractToolCallsFromOpenAI(toolCalls: unknown[] | null | undefined): ToolCall[] {
    if (!Array.isArray(toolCalls)) return [];
    const results: ToolCall[] = [];
    for (const call of toolCalls) {
        const res = toToolCall(call as Partial<OpenAIToolCall>);
        if (res) results.push(res);
    }
    return results;
}

function isValidName(name: unknown): name is string {
    return typeof name === 'string' && name.length > 0 && name.length <= 100 && /^[a-zA-Z0-9_]+$/.test(name);
}

/**
 * Valide qu'un appel d'outil est bien formé
 */
export function isValidToolCall(toolCall: Partial<ToolCall>): boolean {
    if (!toolCall || typeof toolCall !== 'object') return false;
    return isValidName(toolCall.name) && typeof toolCall.arguments === 'string';
}

function attemptRepairArguments<T>(text: string): T | null {
    try {
        const cleaned = text
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
            .replace(/'/g, '"')
            .replace(/,\s*([}\]])/g, '$1');

        return JSON.parse(cleaned) as T;
    } catch {
        console.error('[ToolCallExtractor] Impossible de réparer les arguments:', text.substring(0, 50));
        if (!text.includes('{')) {
            return { text, message: text, query: text } as unknown as T;
        }
        return null;
    }
}

/**
 * Parse les arguments JSON d'un appel d'outil
 */
export function parseToolArguments<T = unknown>(argsText: string | null | undefined): T | null {
    if (!argsText || typeof argsText !== 'string') return null;

    let preCleaned = argsText.trim();
    if (!preCleaned.startsWith('{')) {
        const jsonMatch = preCleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) preCleaned = jsonMatch[0];
    }

    try {
        return JSON.parse(preCleaned) as T;
    } catch {
        console.warn('[ToolCallExtractor] Arguments JSON invalides, tentative de réparation...');
        return attemptRepairArguments<T>(preCleaned);
    }
}

/**
 * Formate un appel d'outil pour l'affichage/debug
 */
export function formatToolCall(toolCall: Partial<ToolCall>): string {
    if (!toolCall) return 'Invalid tool call';

    const name = toolCall.name || 'unknown';
    const args = toolCall.arguments || '{}';
    const MAX_DISPLAY_LENGTH = 50;

    const truncatedArgs = args.length > MAX_DISPLAY_LENGTH
        ? args.substring(0, MAX_DISPLAY_LENGTH) + '...'
        : args;

    return `${name}(${truncatedArgs})`;
}

/**
 * Déduplique une liste d'appels d'outils
 */
export function deduplicateToolCalls<T extends ToolCall>(toolCalls: T[]): T[] {
    if (!Array.isArray(toolCalls)) return [];

    const seen = new Set<string>();
    return toolCalls.filter((call: T) => {
        if (!call || !call.name) return false;

        const key = `${call.name}:${call.arguments}`;
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

/**
 * Statistiques sur les appels d'outils extraits
 */
export function getToolCallStats(toolCalls: Partial<ToolCall>[]): ToolCallStats {
    if (!Array.isArray(toolCalls)) return { total: 0, valid: 0, unique: 0, byName: {} };

    const validCalls = toolCalls.filter((call: Partial<ToolCall>): call is ToolCall => isValidToolCall(call));
    const byName: Record<string, number> = {};

    validCalls.forEach((call: ToolCall) => {
        byName[call.name] = (byName[call.name] || 0) + 1;
    });

    return {
        total: toolCalls.length,
        valid: validCalls.length,
        unique: Object.keys(byName).length,
        byName
    };
}
