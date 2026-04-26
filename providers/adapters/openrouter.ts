// @ts-nocheck
// providers/adapters/openrouter.ts
// Adaptateur pour OpenRouter (https://openrouter.ai/api/v1)
// API OpenAI-compatible avec normalisation tool calling cross-provider.
// Raison d'existence: Alternative rapide à NVIDIA NIM pour les tests.

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Timeout réduit vs NVIDIA (60s vs 90s) — le but est la rapidité
const REQUEST_TIMEOUT_MS = 60_000;

export default {
    name: 'openrouter',

    /**
     * Appel chat completion via OpenRouter
     * Format 100% OpenAI-compatible (tools, tool_calls, tool_choice inclus)
     */
    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7 } = options;

        if (!apiKey) {
            throw new Error('[OpenRouter Adapter] Clé API manquante');
        }

        const body: Record<string, any> = {
            model: model || 'openrouter/auto',
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content || '',
                ...(m.tool_calls && { tool_calls: m.tool_calls }),
                ...(m.tool_call_id && { tool_call_id: m.tool_call_id })
            })),
            temperature,
            max_tokens: 16384,
            stream: false
        };

        // Tool calling — format OpenAI standard, normalisé par OpenRouter
        if (tools?.length) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const requestStart = Date.now();
        console.log(`[OpenRouter] 📡 Appel ${model || 'auto'} -> ${OPENROUTER_BASE_URL}`);
        console.log(`[OpenRouter] 📦 Payload size: ${JSON.stringify(body).length} chars`);
        if (tools?.length) console.log(`[OpenRouter] 🛠️ Tools: ${tools.map((t: any) => t.function?.name).join(', ')}`);

        try {
            const response = await fetch(OPENROUTER_BASE_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'HTTP-Referer': 'https://hive-mind.app',
                    'X-OpenRouter-Title': 'HIVE-MIND Agent'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            }).catch((e: any) => {
                const duration = Date.now() - requestStart;
                console.error(`[OpenRouter] ❌ Fetch Error after ${duration}ms: ${e.message}`);
                throw e;
            });

            clearTimeout(timeoutId);

            const duration = Date.now() - requestStart;
            console.log(`[OpenRouter] 📥 Réponse en ${duration}ms (Status: ${response.ok ? '✅' : '❌'} ${response.status})`);

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = 'Erreur OpenRouter API';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson?.error?.message || errorMessage;
                } catch { errorMessage = errorText; }
                throw new Error(`[OpenRouter Adapter] ${errorMessage} (${response.status})`);
            }

            const data = await response.json();

            if (!data.choices || data.choices.length === 0) {
                throw new Error('[OpenRouter Adapter] Réponse vide (no choices)');
            }

            const choice = data.choices[0];

            // Format standardisé attendu par le ProviderRouter
            return {
                content: choice.message?.content || '',
                toolCalls: choice.message?.tool_calls || null,
                reasoningContent: choice.message?.reasoning_content || null,
                finishReason: choice.finish_reason,
                usage: data.usage
            };
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`[OpenRouter Adapter] Timeout API (${REQUEST_TIMEOUT_MS / 1000}s dépassés)`);
            }
            throw err;
        }
    },

    /**
     * Génère un embedding via OpenRouter
     */
    async embed(text: any, options: any) {
        throw new Error('[OpenRouter Adapter] Embeddings non supportés. Utiliser Gemini/OpenAI directement.');
    }
};
