/**
 * utils/toolValidator.ts
 *
 * Global Tool validation logic to verify parameters against JSON Schema
 * before allowing tool execution. Employs Ajv for strict validation
 * and formats errors in a clear, natural language format for the LLM.
 */

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateToolArgs(
    toolName: string,
    toolArgs: string,
    toolDefs: Array<{ function?: { name?: string; parameters?: { required?: string[]; properties?: Record<string, unknown> } } }>
): { valid: boolean; missing: string[]; schema: unknown; formattedError?: string } {
    const toolDef = toolDefs.find((t) => t.function?.name === toolName);

    if (!toolDef?.function?.parameters) {
        return { valid: true, missing: [], schema: null };
    }

    let parsedArgs: Record<string, unknown> = {};
    if (toolArgs && toolArgs.trim() !== '') {
        try {
            parsedArgs = JSON.parse(toolArgs);
            // Preprocess to strip empty strings and nulls, forcing 'required' to fail
            for (const key of Object.keys(parsedArgs)) {
                if (parsedArgs[key] === '' || parsedArgs[key] === null) {
                    delete parsedArgs[key];
                }
            }
        } catch {
            return {
                valid: false,
                missing: ['(unparseable JSON)'],
                schema: toolDef.function.parameters,
                formattedError: '<tool_use_error>InputValidationError: Failed to parse tool arguments as JSON.</tool_use_error>'
            };
        }
    } else if (Array.isArray(toolDef.function.parameters.required) && toolDef.function.parameters.required.length > 0) {
        // missing all required because empty string
        parsedArgs = {};
    }

    const schema = { ...toolDef.function.parameters } as any;

    // [FALLBACK] Dynamically remove 'name' constraint for browser_screenshot
    if (toolName === 'browser_screenshot' && Array.isArray(schema.required)) {
        schema.required = schema.required.filter((param: string) => param !== 'name');
    }

    // Enforce no additional properties to detect LLM hallucinations
    if (schema.type === 'object' && schema.additionalProperties === undefined) {
        schema.additionalProperties = false;
    }

    const validate = ajv.compile(schema);
    const valid = validate(parsedArgs);

    if (valid) {
        return { valid: true, missing: [], schema };
    }

    const missing: string[] = [];
    const errorMessages: string[] = [];

    for (const err of validate.errors || []) {
        if (err.keyword === 'required') {
            const prop = err.params.missingProperty;
            missing.push(prop);
            errorMessages.push(`The required parameter '${prop}' is missing.`);
        } else if (err.keyword === 'additionalProperties') {
            const prop = err.params.additionalProperty;
            errorMessages.push(`An unexpected parameter '${prop}' was provided.`);
        } else if (err.keyword === 'type') {
            const prop = err.instancePath.replace(/^\//, '');
            const expectedType = err.params.type;
            const providedType = prop && parsedArgs[prop] !== undefined ? typeof parsedArgs[prop] : 'undefined';
            errorMessages.push(`The parameter '${prop}' type is expected as '${expectedType}' but provided as '${providedType}'.`);
        } else {
            errorMessages.push(`Parameter error at '${err.instancePath}': ${err.message}.`);
        }
    }

    const formattedError = `<tool_use_error>InputValidationError: ${errorMessages.join(' ')}</tool_use_error>`;

    return { valid: false, missing, schema, formattedError };
}
