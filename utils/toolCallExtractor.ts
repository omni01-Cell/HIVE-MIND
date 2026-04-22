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

/**
 * Extrait les appels d'outils depuis du texte
 * Supporte deux formats:
 * - Avec sys_interaction: sys_interaction.toolName(params)
 * - Sans sys_interaction: toolName(params)
 */
export function extractToolCallsFromText(text: string | null | undefined, includeSystemInteraction = true): ToolCallRaw[] {
  if (!text || typeof text !== 'string') return [];

  try {
    const pattern = includeSystemInteraction
      ? /(?:print\()?sys_interaction\.\)?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<tool_call>\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*<\/tool_call>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\6>/g
      : /(?:print\()?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\4>/g;

    const matches: ToolCallRaw[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      let toolName: string | undefined;
      let argsText: string | undefined;
      const EXCLUDED_TAGS = ['thought', 'think', 'thought_process'];

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
          if (EXCLUDED_TAGS.includes(match[6].toLowerCase())) continue;
          toolName = match[6];
          argsText = match[7];
        }
      } else {
        if (match[1]) {
          toolName = match[1];
          argsText = match[2];
        } else if (match[3]) {
          toolName = match[3];
          argsText = '{}';
        } else if (match[4]) { // Generic XML
          if (EXCLUDED_TAGS.includes(match[4].toLowerCase())) continue;
          toolName = match[4];
          argsText = match[5];
        }
      }

      if (toolName && argsText !== undefined) {
        matches.push({
          name: toolName,
          arguments: argsText.trim(),
          raw: match[0],
          index: match.index
        });
      }
    }

    return matches;
  } catch (error: any) {
    console.error('[ToolCallExtractor] Erreur extraction:', error.message);
    return [];
  }
}

/**
 * Extrait les appels d'outils depuis des tool_calls OpenAI
 */
export function extractToolCallsFromOpenAI(toolCalls: any[]): ToolCall[] {
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
 */
export function isValidToolCall(toolCall: Partial<ToolCall>): boolean {
  if (!toolCall || typeof toolCall !== 'object') return false;
  if (!toolCall.name || typeof toolCall.name !== 'string') return false;
  if (toolCall.name.length === 0 || toolCall.name.length > 100) return false;
  if (!toolCall.arguments || typeof toolCall.arguments !== 'string') return false;

  // Vérifier que le nom ne contient que des caractères valides
  if (!/^[a-zA-Z0-9_]+$/.test(toolCall.name)) return false;

  return true;
}

/**
 * Parse les arguments JSON d'un appel d'outil
 */
export function parseToolArguments<T = any>(argsText: string | null | undefined): T | null {
  if (!argsText || typeof argsText !== 'string') return null;

  let preCleaned = argsText.trim();

  if (!preCleaned.startsWith('{')) {
    const jsonMatch = preCleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      preCleaned = jsonMatch[0];
    }
  }

  try {
    return JSON.parse(preCleaned);
  } catch (e) {
    console.warn('[ToolCallExtractor] Arguments JSON invalides, tentative de réparation...');

    try {
      // Nettoyage agressif pour les LLMs
      const cleaned = preCleaned
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1');

      return JSON.parse(cleaned);
    } catch (repairError) {
      console.error('[ToolCallExtractor] Impossible de réparer les arguments:', argsText.substring(0, 50));
      
      if (!preCleaned.includes('{')) {
        // Fallback: Enrobage du texte brut
        return { text: preCleaned, message: preCleaned, query: preCleaned } as any;
      }
      
      return null;
    }
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
 */
export function getToolCallStats(toolCalls: Partial<ToolCall>[]): ToolCallStats {
  if (!Array.isArray(toolCalls)) return { total: 0, valid: 0, unique: 0, byName: {} };

  const validCalls = toolCalls.filter(call => isValidToolCall(call)) as ToolCall[];
  const byName: Record<string, number> = {};

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
