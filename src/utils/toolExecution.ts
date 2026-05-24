// src/utils/toolExecution.ts

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolExecutionError, ValidationRetryError } from './toolErrors.js';

export interface ToolDefinition<T extends z.ZodTypeAny> {
    name: string;
    description: string;
    schema: T;
    execute: (args: z.infer<T>, context: any) => Promise<any>;
}

/**
 * Creates a standard JSON Schema tool definition from a Zod schema.
 */
export function defineZodTool<T extends z.ZodTypeAny>(toolDef: ToolDefinition<T>) {
    const jsonSchema = zodToJsonSchema(toolDef.schema as any, { target: 'jsonSchema7' }) as any;

    // Ensure the schema doesn't allow additional properties (strict mode)
    if (jsonSchema.type === 'object') {
        (jsonSchema as any).additionalProperties = false;
    }

    return {
        type: 'function',
        function: {
            name: toolDef.name,
            description: toolDef.description,
            parameters: jsonSchema
        },
        _zodSchema: toolDef.schema,
        _execute: toolDef.execute
    };
}

/**
 * Wraps tool execution with strict Zod validation.
 * If validation fails, throws ValidationRetryError to trigger the prompt retry loop.
 */
export async function executeZodTool(tool: any, rawArgs: string | object, context: any) {
    if (!tool._zodSchema || !tool._execute) {
        throw new Error(`[toolExecution] Tool ${tool.function?.name || 'unknown'} is not a Zod-defined tool.`);
    }

    let parsedArgs: any;
    if (typeof rawArgs === 'string') {
        try {
            parsedArgs = JSON.parse(rawArgs);
        } catch (e: any) {
            throw new ValidationRetryError(`<tool_use_error>JSONParseError: Invalid JSON format. ${e.message}</tool_use_error>`);
        }
    } else {
        parsedArgs = rawArgs;
    }

    try {
        // Strict runtime validation
        const validArgs = tool._zodSchema.parse(parsedArgs);

        // Execute the tool
        return await tool._execute(validArgs, context);
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            // Format precise error message for the LLM
            const errors = e.issues.map((err: any) => `- ${err.path.join('.')}: ${err.message}`).join('\\n');
            const formatted = `<tool_use_error>InputValidationError: Parameter constraints violated.\\n${errors}</tool_use_error>`;
            throw new ValidationRetryError(formatted);
        }

        throw new ToolExecutionError(e.message, tool.function?.name, parsedArgs);
    }
}
