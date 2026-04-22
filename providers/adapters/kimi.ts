// @ts-nocheck
// providers/adapters/kimi.js
// Adaptateur pour Kimi K2 Turbo (API Kimi Code)
// Compatible avec les clés sk-kimi-... via api.kimi.com/coding/v1
// Supporte le Function Calling natif (100% accuracy on tool calls)

import { fetchWithIPv4Fallback, forceIPv4ForUrl } from '../../utils/dnsHelpers.js';

export default {
    name: 'kimi',

    /**
     * Appel Kimi K2 Turbo
     * API compatible OpenAI avec support Function Calling
     * Endpoint: https://api.kimi.com/coding/v1
     */
    async chat(messages: any, options: any) {
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
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content,
                // [FIX] Kimi K2 : Injecter reasoning_content si présent
                ...(m.reasoning_content && { reasoning_content: m.reasoning_content }),
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

        // 🛡️ IPv4 forcing ciblé pour Kimi (résout problèmes Node 17+)
        const url = `${baseUrl}/chat/completions`;
        const needsIPv4 = forceIPv4ForUrl(url);

        if (needsIPv4) {
            console.log(`[Kimi] 🌐 IPv4 forcing activé pour ${url}`);
        }

        const fetchOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                // Headers pour s'identifier comme un agent de coding
                'User-Agent': 'claude-code/1.0.0',
                'X-Client-Name': 'claude-code'
            },
            body: JSON.stringify(body)
        };

        const response = await fetchWithIPv4Fallback(url, fetchOptions, 2); // 2 retries max

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage: any;
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
        let toolCalls: any = null;
        if (message.tool_calls && message.tool_calls.length > 0) {
            toolCalls = message.tool_calls.map((tc: any) => ({
                id: tc.id,
                type: tc.type || 'function',
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                }
            }));
            console.log(`[Kimi] ✅ ${toolCalls.length} tool calls reçus`);
        }

        return {
            content: message.content,
            // [FIX] Extraire le reasoning_content pour l'historique
            reasoningContent: message.reasoning_content || null,
            toolCalls: toolCalls,
            usage: data.usage
        };
    },

    /**
     * Génération d'embeddings via Kimi avec IPv4 fallback
     */
    async embed(text: any, options: any) {
        const { model, apiKey } = options;
        const modelId = model || 'kimi-text-embedding';
        const baseUrl = options.base_url || 'https://api.kimi.com/coding/v1';

        const body = {
            input: text,
            model: modelId
        };

        // 🛡️ IPv4 forcing pour embeddings aussi
        const url = `${baseUrl}/embeddings`;
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        };

        const response = await fetchWithIPv4Fallback(url, fetchOptions, 2);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kimi Embedding Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Structure compatible avec OpenAI
        return {
            embedding: data.data[0].embedding,
            usage: {
                total_tokens: data.usage?.total_tokens || Math.ceil(text.length / 4)
            }
        };
    }
};