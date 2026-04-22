// @ts-nocheck

// providers/adapters/groq.js
// Adaptateur pour Groq (LPU Inference Engine)
// Base URL: https://api.groq.com/openai/v1

export default {
    name: 'groq',

    /**
     * Appel Groq Cloud
     */
    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7, version = 'latest' } = options;
        // Default to Llama 3.1 8B Instant (Fastest/Cheapest)
        const modelId = model || 'llama-3.1-8b-instant';

        const body = {
            model: modelId,
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content,
                // Support des Tools et du Reasoning
                ...(m.tool_calls && { tool_calls: m.tool_calls }),
                ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
                // Support DeepSeek R1 via Groq
                ...(m.reasoning_content && { reasoning_content: m.reasoning_content })
            })),
            temperature,
            max_tokens: 4096 // Some models support up to 8k or 32k
        };

        // Note: Building tools are only for groq/compound models
        // Custom tools are not supported yet according to docs
        if (tools?.length && !modelId.includes('compound')) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };

        // Header spécial pour Groq Compound
        if (modelId.includes('compound')) {
            headers['Groq-Model-Version'] = version;
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Erreur Groq (${response.status})`);
        }

        const data = await response.json();
        const choice = data.choices[0];

        return {
            content: choice.message.content,
            toolCalls: choice.message.tool_calls || null,
            executedTools: choice.message.executed_tools || null, // Nouveauté Groq Compound
            finishReason: choice.finish_reason,
            usage: data.usage,
            usageBreakdown: data.usage_breakdown || null // Détails des modèles sous-jacents
        };
    }
};
