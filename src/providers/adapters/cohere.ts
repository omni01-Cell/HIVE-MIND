// providers/adapters/cohere.ts
// Adaptateur pour Cohere (Command A, Aya)
// Base URL: https://api.cohere.com/v2

export default {
    name: 'cohere',

    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        const modelId = model || 'command-a-03-2025';

        // Cohere v2 utilise un format natif différent d'OpenAI
        const systemMsgs = messages.filter((m: any) => m.role === 'system');
        const chatMsgs = messages.filter((m: any) => m.role !== 'system');

        const body: any = {
            model: modelId,
            messages: chatMsgs.map((m: any) => ({
                role: m.role,
                content: m.content
            })),
            temperature,
            max_tokens: 4096
        };

        if (systemMsgs.length > 0) {
            body.system = systemMsgs.map((m: any) => m.content).join('\n');
        }

        if (tools?.length) {
            body.tools = tools.map((t: any) => ({
                type: 'function',
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters
                }
            }));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch('https://api.cohere.com/v2/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(error.message || `Erreur Cohere (${response.status})`);
            }

            const data = await response.json();

            // Cohere v2 retourne un format différent
            const message = data.message;
            const toolCalls = message.tool_calls || null;
            const content = message.content?.map((c: any) => c.text).join('') || '';

            return {
                content,
                toolCalls,
                finishReason: data.finish_reason || 'stop',
                usage: data.usage ? {
                    prompt_tokens: data.usage.input_tokens,
                    completion_tokens: data.usage.output_tokens,
                    total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
                } : undefined
            };
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw new Error('[Cohere] Timeout (60s)');
            throw err;
        }
    }
};
