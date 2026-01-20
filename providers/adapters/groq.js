
// providers/adapters/groq.js
// Adaptateur pour Groq (LPU Inference Engine)
// Base URL: https://api.groq.com/openai/v1

export default {
    name: 'groq',

    /**
     * Appel Groq Cloud
     */
    async chat(messages, options) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        // Default to Llama 3.1 8B Instant (Fastest/Cheapest)
        const modelId = model || 'llama-3.1-8b-instant';

        const body = {
            model: modelId,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            temperature,
            max_tokens: 4096 // Some models support up to 8k or 32k
        };

        if (tools?.length) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
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
            finishReason: choice.finish_reason,
            usage: data.usage
        };
    }
};
