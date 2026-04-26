// @ts-nocheck
// providers/adapters/nvidia.js
// Adaptateur pour l'API NVIDIA NIM (integrate.api.nvidia.com)
// Supporte: moonshotai/kimi-k2.5, z-ai/glm-5.1, minimaxai/minimax-m2.7

// Paramètres spécifiques par modèle
const MODEL_CONFIG = {
    'moonshotai/kimi-k2.5': {
        max_tokens: 16384,
        chat_template_kwargs: { thinking: true }
    },
    'z-ai/glm-5.1': {
        max_tokens: 16384,
        chat_template_kwargs: { enable_thinking: true, clear_thinking: false }
    },
    'minimaxai/minimax-m2.7': {
        max_tokens: 8192,
        top_p: 0.95
        // Pas de thinking mode
    }
};

export default {
    name: 'nvidia',

    /**
     * Appel chat completion
     */
    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 1.00 } = options;

        const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

        // Récupérer les paramètres spécifiques au modèle
        const modelCfg = MODEL_CONFIG[model] || { max_tokens: 16384 };

        const body = {
            model: model || 'moonshotai/kimi-k2.5',
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content || '',
                ...(m.tool_calls && { tool_calls: m.tool_calls }),
                ...(m.tool_call_id && { tool_call_id: m.tool_call_id })
            })),
            temperature,
            top_p: modelCfg.top_p ?? 1.00,
            max_tokens: modelCfg.max_tokens,
            stream: false
        };

        // Ajouter les paramètres spécifiques au modèle (thinking, etc.)
        if (modelCfg.chat_template_kwargs) {
            body.chat_template_kwargs = modelCfg.chat_template_kwargs;
        }

        // Ajouter les outils si présents
        if (tools?.length) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout (Safe for slow NIMs)

        const requestStart = Date.now();
        console.log(`[NVIDIA] 📡 Appel ${model || 'default'} -> ${invokeUrl}`);
        console.log(`[NVIDIA] 📦 Payload size: ${JSON.stringify(body).length} chars`);
        if (tools?.length) console.log(`[NVIDIA] 🛠️ Tools detected: ${tools.map((t) => t.function?.name).join(', ')}`);
        console.log(`[NVIDIA] 🔑 API Key (prefix): ${apiKey?.substring(0, 10)}...`);

        try {
            const response = await fetch(invokeUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            }).catch(e => {
                const duration = Date.now() - requestStart;
                console.error(`[NVIDIA] ❌ Fetch Error after ${duration}ms: ${e.message}`);
                throw e;
            });
            
            clearTimeout(timeoutId);

            const duration = Date.now() - requestStart;
            console.log(`[NVIDIA] 📥 Réponse reçue en ${duration}ms (Status: ${response.ok ? '✅' : '❌'} ${response.status})`);

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = 'Erreur NVIDIA API';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson?.error?.message || errorMessage;
                } catch (e: any) {
                    errorMessage = errorText;
                }
                throw new Error(`[NVIDIA Adapter] ${errorMessage} (${response.status})`);
            }

            const data = await response.json();
            
            if (!data.choices || data.choices.length === 0) {
                throw new Error('[NVIDIA Adapter] Réponse vide de l\'API (no choices)');
            }

            const choice = data.choices[0];

            // Format standardisé attendu par le routeur
            return {
                content: choice.message?.content || '',
                toolCalls: choice.message?.tool_calls || null,
                // Certains modèles (GLM5, Kimi) exposent leur "pensée" dans reasoning_content
                reasoningContent: choice.message?.reasoning_content || null,
                finishReason: choice.finish_reason,
                usage: data.usage
            };
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('[NVIDIA Adapter] Timeout API (90s dépassés)');
            }
            throw err;
        }
    },

    /**
     * Génère un embedding (Non supporté sur cet endpoint)
     */
    async embed(text: any, options: any) {
        throw new Error('[NVIDIA Adapter] Embeddings non implémentés pour cette API.');
    }
};

