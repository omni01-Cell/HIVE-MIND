// providers/adapters/anthropic.js
// Adaptateur pour Anthropic Claude

export default {
    name: 'anthropic',

    /**
     * Appel Claude
     */
    async chat(messages, options) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        const modelId = model || 'claude-3-haiku-20240307';

        // Séparer le system des messages
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const chatMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role,
                content: Array.isArray(m.content)
                    ? m.content.map(c => {
                        if (c.type === 'image_url') {
                            // Transformation du format OpenAI vers Anthropic
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/jpeg', // Par défaut pour le bot
                                    data: c.image_url.url.replace(/^data:image\/\w+;base64,/, '')
                                }
                            };
                        }
                        return c;
                    })
                    : m.content
            }));

        const body = {
            model: modelId,
            max_tokens: 1000,
            system: systemMessage,
            messages: chatMessages
        };

        // Convertir les tools au format Anthropic
        if (tools?.length) {
            body.tools = tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters
            }));
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Erreur Anthropic');
        }

        const data = await response.json();

        // Extraire le contenu
        let content = null;
        let toolCalls = null;

        for (const block of data.content) {
            if (block.type === 'text') {
                content = block.text;
            } else if (block.type === 'tool_use') {
                // Convertir au format OpenAI
                toolCalls = toolCalls || [];
                toolCalls.push({
                    id: block.id,
                    type: 'function',
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input)
                    }
                });
            }
        }

        return {
            content,
            toolCalls,
            finishReason: data.stop_reason,
            usage: data.usage
        };
    }
};
