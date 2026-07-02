// providers/adapters/vercel.ts
// Adaptateur pour Vercel AI Gateway (OpenAI-compatible)
// Base URL: https://api.vercel.com/v1/ai

export default {
    name: 'vercel',

    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        const modelId = model || 'openai/gpt-4o';

        const body: any = {
            model: modelId,
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content,
                ...(m.tool_calls && { tool_calls: m.tool_calls }),
                ...(m.tool_call_id && { tool_call_id: m.tool_call_id })
            })),
            temperature,
            max_tokens: 4096
        };

        if (tools?.length) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch('https://api.vercel.com/v1/ai/chat/completions', {
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
                const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
                throw new Error(error.error?.message || `Erreur Vercel (${response.status})`);
            }

            const data = await response.json();
            const choice = data.choices[0];

            return {
                content: choice.message.content,
                toolCalls: choice.message.tool_calls || null,
                finishReason: choice.finish_reason,
                usage: data.usage
            };
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw new Error('[Vercel] Timeout (60s)');
            throw err;
        }
    }
};
