/**
 * utils/toolValidator.ts
 *
 * Global Tool validation logic to verify required parameters against
 * JSON Schema before allowing tool execution.
 */

export function validateToolArgs(
    toolName: string,
    toolArgs: string,
    toolDefs: Array<{ function?: { name?: string; parameters?: { required?: string[]; properties?: Record<string, unknown> } } }>
): { valid: boolean; missing: string[]; schema: unknown } {
    const toolDef = toolDefs.find((t) => t.function?.name === toolName);

    if (!toolDef?.function?.parameters?.required) {
        return { valid: true, missing: [], schema: null };
    }

    let parsedArgs: Record<string, unknown> = {};
    try {
        parsedArgs = JSON.parse(toolArgs || '{}');
    } catch {
        return { valid: false, missing: ['(unparseable JSON)'], schema: toolDef.function.parameters };
    }

    let required: string[] = toolDef.function.parameters.required;
    
    // [FALLBACK] Dynamically remove 'name' constraint for browser_screenshot,
    // as it falls back robustly to document title or default capture name at runtime.
    if (toolName === 'browser_screenshot') {
        required = required.filter(param => param !== 'name');
    }

    const missing = required.filter(param =>
        parsedArgs[param] === undefined || parsedArgs[param] === null || parsedArgs[param] === ''
    );

    return { valid: missing.length === 0, missing, schema: toolDef.function.parameters };
}
