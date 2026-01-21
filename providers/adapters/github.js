
// providers/adapters/github.js
// Adaptateur pour GitHub Models (OpenAI Compatible)
// Base URL: https://models.inference.ai.azure.com

export default {
    name: 'github',

    /**
     * Appel GitHub Models
     */
    async chat(messages, options) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        const modelId = model || 'gpt-4o-mini'; // Default fallback

        const body = {
            model: modelId,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            temperature,
            max_tokens: 4096 // Standard limit for most models
        };

        if (tools?.length) {
            body.tools = tools;
            // Phi-4 et Llama sur Azure rejettent "tool_choice: auto" (Erreur 400)
            // On ne l'ajoute que pour les modèles OpenAI officiels (gpt-4o, etc.)
            if (modelId.startsWith('gpt')) {
                body.tool_choice = 'auto';
            }
        }

        // Utiliser le base_url de la config ou le défaut d'Azure
        const baseUrl = options.familyConfig?.base_url || 'https://models.inference.ai.azure.com';
        const url = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Erreur GitHub Models (${response.status})`);
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
