// providers/adapters/mistral.js
// Adaptateur pour Mistral AI

export default {
    name: 'mistral',

    /**
     * Appel Mistral
     */
    async chat(messages, options) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        // Default to mistral-small-latest if not specified
        const modelId = model || 'mistral-small-latest';

        const body = {
            model: modelId,
            messages: messages.map(m => {
                // 1. Gestion Assistant avec Tool Calls
                if (m.role === 'assistant') {
                    const msg = { role: 'assistant', content: m.content || "" }; // Contenu vide autorisé si tools
                    if (m.tool_calls && m.tool_calls.length > 0) {
                        msg.tool_calls = m.tool_calls.map(tc => ({
                            id: tc.id,
                            type: 'function',
                            function: tc.function
                        }));
                        // Si content est null/undefined, Mistral préfère parfois une chaine vide ou null explicite
                        // Si tool_calls est là, content peut être null. Mais "" est plus safe.
                    }
                    return msg;
                }

                // 2. Gestion Tool Responses
                if (m.role === 'tool') {
                    return {
                        role: 'tool',
                        tool_call_id: m.tool_call_id,
                        name: m.name,
                        content: m.content
                    };
                }

                // 3. System & User
                // Mistral supporte le role 'system'
                return {
                    role: m.role,
                    content: m.content
                };
            }),
            temperature,
            max_tokens: 1000
        };

        // Mistral utilise le même format de tools qu'OpenAI
        if (tools?.length) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur Mistral');
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
