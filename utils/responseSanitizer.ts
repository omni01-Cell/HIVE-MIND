/**
 * utils/responseSanitizer.ts
 *
 * 2-Layer defense against weak LLMs that leak tool call syntax,
 * skip mandatory <thought> tags, or emit raw code as text responses.
 *
 * Layer 1 (in-loop): detectResponseDefects() — decides whether to retry
 * Layer 2 (post-loop): sanitizeResponse() — strips anything that slipped through
 */

// WHY: Known tool names are checked to distinguish real tool-call leaks from
// user-facing code examples. Only patterns matching actual system tools trigger.
const KNOWN_TOOL_PREFIXES = [
    'tool_code_execution', 'code_execution',
    'tool_browser_', 'tool_send_', 'tool_workspace_',
    'tool_read_file', 'tool_edit_file', 'tool_grep_search',
    'tool_google_ai_search', 'tool_firecrawl_',
    'browser_screenshot', 'browser_open', 'browser_snapshot',
    'browser_click', 'browser_fill', 'browser_eval',
    'send_message', 'send_file', 'send_sticker',
    'db_document_save', 'db_document_read', 'db_document_search',
    'read_file', 'edit_file', 'grep_search',
    'google_ai_search', 'firecrawl_scrape',
    'get_file_skeleton', 'get_function',
    'get_my_capabilities', 'use_tool', 'spawn_sub_agent',
];

export interface ResponseDefects {
    /** No <thought>/<think>/<thinking> tags found anywhere in the response */
    hasNoThoughts: boolean;
    /** tool_<name>(...) or <name>(...) patterns found in text */
    hasLeakedToolCalls: boolean;
    /** >80% of the response is a single code block with no surrounding explanation */
    hasRawCodeDominance: boolean;
    /** {"name": "<tool>", "arguments": ...} JSON object in text */
    hasJsonToolObject: boolean;
    /** Total defect count */
    defectCount: number;
    /** Human-readable defect descriptions for logging */
    details: string[];
}

export interface SanitizeResult {
    /** Cleaned text safe for the user */
    cleaned: string;
    /** Whether any modifications were made */
    wasModified: boolean;
    /** List of what was stripped (for logging) */
    strippedItems: string[];
}

const FALLBACK_MESSAGE = "J'ai rencontré un problème technique en traitant cette tâche. Peux-tu reformuler ta demande ?";

/**
 * Layer 1: Detect structural defects in a model's text response.
 * Used inside the ReAct loop to decide whether to ask the model to retry.
 *
 * Invariant: returns a defects object with accurate counts. Never throws.
 */
export function detectResponseDefects(text: string | null | undefined): ResponseDefects {
    const defects: ResponseDefects = {
        hasNoThoughts: false,
        hasLeakedToolCalls: false,
        hasRawCodeDominance: false,
        hasJsonToolObject: false,
        defectCount: 0,
        details: [],
    };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return defects;
    }

    // 1. Check for missing <thought> tags
    const thoughtPattern = /<(think|thought|thinking)>/i;
    if (!thoughtPattern.test(text)) {
        defects.hasNoThoughts = true;
        defects.defectCount++;
        defects.details.push('Missing mandatory <thought> tags');
    }

    // 2. Check for leaked tool call syntax: tool_<name>(...) or <toolName>(...)
    if (hasLeakedToolCallPatterns(text)) {
        defects.hasLeakedToolCalls = true;
        defects.defectCount++;
        defects.details.push('Leaked tool call syntax in text');
    }

    // 3. Check for raw code dominance (>80% code block, no surrounding explanation)
    if (hasRawCodeDominance(text)) {
        defects.hasRawCodeDominance = true;
        defects.defectCount++;
        defects.details.push('Raw code block dominates response (>80%)');
    }

    // 4. Check for JSON tool call objects
    if (hasJsonToolObject(text)) {
        defects.hasJsonToolObject = true;
        defects.defectCount++;
        defects.details.push('JSON tool call object in response text');
    }

    return defects;
}

/**
 * Layer 2: Strip leaked tool calls, orphan code blocks, and JSON tool objects
 * from the final response. Last line of defense before sending to user.
 *
 * Invariant: returned `cleaned` is always a non-empty string (fallback if empty).
 */
export function sanitizeResponse(text: string | null | undefined): SanitizeResult {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { cleaned: FALLBACK_MESSAGE, wasModified: true, strippedItems: ['empty_response'] };
    }

    let cleaned = text;
    const strippedItems: string[] = [];

    // 1. Strip tool_<name>(code="""...""") — triple-quote Python style
    const tripleQuoteToolPattern = /(?:tool_)?(?:code_execution)\s*\(\s*(?:code\s*=\s*)?"""[\s\S]*?"""\s*\)/g;
    if (tripleQuoteToolPattern.test(cleaned)) {
        strippedItems.push('triple_quote_tool_call');
        cleaned = cleaned.replace(tripleQuoteToolPattern, '');
    }

    // 2. Strip tool_<name>(code="...") — single-quote style
    const singleQuoteToolPattern = /(?:tool_)?(?:code_execution)\s*\(\s*(?:code\s*=\s*)?(?:"[^"]*"|'[^']*')\s*\)/g;
    if (singleQuoteToolPattern.test(cleaned)) {
        strippedItems.push('single_quote_tool_call');
        // Reset lastIndex since test() advances it
        singleQuoteToolPattern.lastIndex = 0;
        cleaned = cleaned.replace(singleQuoteToolPattern, '');
    }

    // 3. Strip any tool_<name>(...) or known_tool(...) with arbitrary content
    // WHY: Match known tool names followed by parenthesized content
    const toolCallTextPattern = buildToolCallPattern();
    const toolCallMatches = cleaned.match(toolCallTextPattern);
    if (toolCallMatches) {
        strippedItems.push(`tool_call_text(${toolCallMatches.length})`);
        cleaned = cleaned.replace(toolCallTextPattern, '');
    }

    // 4. Strip JSON tool call objects: {"name": "<tool>", "arguments": {...}}
    const jsonToolPattern = /\{[\s\n]*"name"\s*:\s*"[a-zA-Z_]+"\s*,[\s\n]*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g;
    const jsonMatches = cleaned.match(jsonToolPattern);
    if (jsonMatches) {
        // Only strip if the "name" value matches a known tool
        for (const jsonMatch of jsonMatches) {
            const nameMatch = jsonMatch.match(/"name"\s*:\s*"([a-zA-Z_]+)"/);
            if (nameMatch && isKnownTool(nameMatch[1])) {
                strippedItems.push(`json_tool_object(${nameMatch[1]})`);
                cleaned = cleaned.replace(jsonMatch, '');
            }
        }
    }

    // 5. Strip orphan code blocks that dominate the response
    // Only if the remaining text is >80% code block with no natural language around it
    if (hasRawCodeDominance(cleaned)) {
        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlocks = cleaned.match(codeBlockRegex);
        if (codeBlocks) {
            const nonCodeText = cleaned.replace(codeBlockRegex, '').trim();
            // Only strip if there's essentially no natural language outside the code blocks
            if (nonCodeText.length < 50) {
                strippedItems.push(`orphan_code_blocks(${codeBlocks.length})`);
                cleaned = nonCodeText;
            }
        }
    }

    // Final cleanup: collapse excessive whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    // If everything was stripped, use fallback
    if (!cleaned || cleaned.length < 5) {
        cleaned = FALLBACK_MESSAGE;
        if (!strippedItems.includes('empty_after_strip')) {
            strippedItems.push('empty_after_strip');
        }
    }

    return {
        cleaned,
        wasModified: strippedItems.length > 0,
        strippedItems,
    };
}

// ──────────────────── Internal helpers ────────────────────

/**
 * Detects tool call patterns like `tool_code_execution(code=...)` or `browser_screenshot(...)`.
 * WHY: Only matches known tool names to avoid false positives on regular function calls
 * the model might be discussing.
 */
function hasLeakedToolCallPatterns(text: string): boolean {
    // Pattern 1: tool_<name>(...) or <known_tool>(...)
    for (const prefix of KNOWN_TOOL_PREFIXES) {
        // Match the tool name followed by opening parenthesis with content
        const pattern = new RegExp(`(?:^|\\s|\\n)${escapeRegex(prefix)}\\s*\\(`, 'm');
        if (pattern.test(text)) {
            return true;
        }
    }

    // Pattern 2: Generic tool_<word>( pattern (catches tool_anything)
    if (/(?:^|\s|\n)tool_[a-zA-Z_]+\s*\(/m.test(text)) {
        return true;
    }

    return false;
}

/**
 * Detects when >80% of the response is enclosed in fenced code blocks
 * AND there's minimal natural language explanation around it.
 */
function hasRawCodeDominance(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 100) return false; // Too short to judge

    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = trimmed.match(codeBlockRegex);
    if (!codeBlocks || codeBlocks.length === 0) return false;

    const totalCodeLength = codeBlocks.reduce((sum, block) => sum + block.length, 0);
    const codeRatio = totalCodeLength / trimmed.length;

    if (codeRatio < 0.8) return false;

    // Check if the non-code text is meaningful (>50 chars of natural language)
    const nonCodeText = trimmed.replace(codeBlockRegex, '').trim();
    // WHY: A response like "Here's how:\n```python\n...```" has meaningful intro text.
    // We only flag when the surrounding text is trivially short.
    return nonCodeText.length < 50;
}

/**
 * Detects JSON objects that look like structured tool calls.
 */
function hasJsonToolObject(text: string): boolean {
    const jsonToolPattern = /\{[\s\n]*"name"\s*:\s*"([a-zA-Z_]+)"\s*,[\s\n]*"arguments"\s*:/;
    const match = text.match(jsonToolPattern);
    if (!match) return false;
    return isKnownTool(match[1]);
}

/**
 * Checks if a tool name matches any known tool in the system.
 */
function isKnownTool(name: string): boolean {
    return KNOWN_TOOL_PREFIXES.some(prefix =>
        name === prefix || name.startsWith(prefix.replace(/^tool_/, ''))
    );
}

/**
 * Builds a regex that matches any known tool name followed by parenthesized content.
 * WHY: Uses alternation over all known prefixes for comprehensive matching.
 */
function buildToolCallPattern(): RegExp {
    const escaped = KNOWN_TOOL_PREFIXES.map(p => escapeRegex(p));
    // Match with optional tool_ prefix, then the name, then (...) with balanced content
    // Use a greedy match on parenthesized content (it's imperfect for nested parens,
    // but good enough for the sanitization use case — Layer 2 is a safety net, not a parser)
    return new RegExp(
        `(?:tool_)?(?:${escaped.join('|')})\\s*\\([\\s\\S]*?\\)(?:\\s*\\))?`,
        'g'
    );
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
