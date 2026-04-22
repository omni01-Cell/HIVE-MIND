// @ts-nocheck
// providers/adapters/openai.js
// Adaptateur pour OpenAI

export default {
    name: 'openai',

    /**
     * Appel chat completion
     */
    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7 } = options;

        const body = {
            model: model || 'gpt-4o-mini',
            messages,
            temperature,
            max_tokens: 1000
        };

        // Ajouter les outils si présents
        if (tools?.length) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Erreur OpenAI');
        }

        const data = await response.json();
        const choice = data.choices[0];

        return {
            content: choice.message.content,
            toolCalls: choice.message.tool_calls || null,
            finishReason: choice.finish_reason,
            usage: data.usage
        };
    },

    /**
     * Génère un embedding
     */
    async embed(text: any, options: any) {
        const { apiKey } = options;

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'text-embedding-ada-002',
                input: text.substring(0, 8000)
            })
        });

        if (!response.ok) {
            throw new Error('Erreur embedding OpenAI');
        }

        const data = await response.json();
        return data.data[0].embedding;
    }
};
