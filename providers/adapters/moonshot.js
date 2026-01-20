// providers/adapters/moonshot.js
// Adaptateur pour Moonshot AI (API standard)
// Compatible avec les clés sk-... via api.moonshot.cn

export default {
    name: 'moonshot',

    /**
     * Appel Moonshot AI (API standard)
     * API compatible OpenAI
     * Endpoint: https://api.moonshot.cn/v1
     */
    async chat(messages, options) {
        const { model, apiKey, familyConfig, temperature = 0.7 } = options;

        // Modèle par défaut pour Moonshot
        const modelId = model || 'moonshot-v1-8k';

        // URL Moonshot standard
        const baseUrl = familyConfig?.base_url || 'https://api.moonshot.cn/v1';

        // Debug: vérifier la clé API (masquée)
        const keyPreview = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'UNDEFINED';
        console.log(`[Moonshot] Appel: ${baseUrl} avec modèle ${modelId}`);
        console.log(`[Moonshot] Clé API: ${keyPreview} (longueur: ${apiKey?.length || 0})`);

        const body = {
            model: modelId,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            temperature,
            max_tokens: 8192,
            stream: false
        };

        // Support des Tools (Function Calling)
        if (options.tools?.length) {
            body.tools = options.tools;
            body.tool_choice = 'auto';
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage;
            try {
                const error = JSON.parse(errorText);
                errorMessage = error.error?.message || error.message || errorText;
            } catch {
                errorMessage = errorText;
            }
            console.error(`[Moonshot] Erreur ${response.status}: ${errorMessage}`);
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const choice = data.choices[0];

        console.log(`[Moonshot] ✓ Réponse reçue (${data.usage?.total_tokens || '?'} tokens)`);

        // Support des tool calls dans la réponse
        let toolCalls = null;
        if (choice.message.tool_calls?.length) {
            toolCalls = choice.message.tool_calls.map(tc => ({
                id: tc.id,
                type: tc.type,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                }
            }));
        }

        return {
            content: choice.message.content,
            toolCalls,
            finishReason: choice.finish_reason,
            usage: data.usage
        };
    }
};
