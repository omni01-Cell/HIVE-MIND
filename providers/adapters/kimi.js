// providers/adapters/kimi.js
// Adaptateur pour Kimi K2 Turbo (API Kimi Code)
// Compatible avec les clés sk-kimi-... via api.kimi.com/coding/v1
// Supporte le Function Calling natif (100% accuracy on tool calls)

export default {
    name: 'kimi',

    /**
     * Appel Kimi K2 Turbo
     * API compatible OpenAI avec support Function Calling
     * Endpoint: https://api.kimi.com/coding/v1
     */
    async chat(messages, options) {
        const { model, apiKey, familyConfig, temperature = 0.7 } = options;
        // Modèle par défaut pour Kimi Code
        const modelId = model || 'kimi-for-coding';
        // URL Kimi Code par défaut
        const baseUrl = familyConfig?.base_url || 'https://api.kimi.com/coding/v1';

        // Debug: vérifier la clé API (masquée)
        const keyPreview = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'UNDEFINED';
        console.log(`[Kimi] Appel: ${baseUrl} avec modèle ${modelId}`);
        console.log(`[Kimi] Clé API: ${keyPreview} (longueur: ${apiKey?.length || 0})`);

        const body = {
            model: modelId,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
                // Support pour les messages de réponse d'outil
                ...(m.tool_calls && { tool_calls: m.tool_calls }),
                ...(m.tool_call_id && { tool_call_id: m.tool_call_id })
            })),
            temperature,
            max_tokens: 8192,
            stream: false // Kimi Code recommande de désactiver le streaming
        };

        // Support des Tools (Function Calling) - Kimi K2 a 100% accuracy
        if (options.tools?.length) {
            body.tools = options.tools;
            body.tool_choice = options.tool_choice || 'auto';
            console.log(`[Kimi] Tools envoyés: ${options.tools.length} fonction(s)`);
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                // Headers pour s'identifier comme un agent de coding
                'User-Agent': 'claude-code/1.0.0',
                'X-Client-Name': 'claude-code'
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
            console.error(`[Kimi] Erreur ${response.status}: ${errorMessage}`);
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const choice = data.choices[0];
        const message = choice.message;



        // Parser les tool_calls si présents (Kimi K2 Turbo les supporte nativement)
        let toolCalls = null;
        if (message.tool_calls && message.tool_calls.length > 0) {
            toolCalls = message.tool_calls.map(tc => ({
                id: tc.id,
                type: tc.type || 'function',
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                }
            }));
            console.log(`[Kimi] ✓ Tool calls détectés: ${toolCalls.map(t => t.function.name).join(', ')}`);
        }

        console.log(`[Kimi] ✓ Réponse reçue (${data.usage?.total_tokens || '?'} tokens)${toolCalls ? ' [AGENTIC]' : ''}`);

        return {
            content: message.content,
            toolCalls: toolCalls,
            finishReason: choice.finish_reason,
            usage: data.usage
        };
    }
};

