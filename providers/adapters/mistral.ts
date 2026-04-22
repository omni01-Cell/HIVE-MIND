// @ts-nocheck
// providers/adapters/mistral.js
// Adaptateur pour Mistral AI

export default {
    name: 'mistral',

    /**
     * Appel Mistral
     */
    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        // Default to mistral-small-latest if not specified
        const modelId = model || 'mistral-small-latest';

        // Map pour sanitizer les IDs (Provider ID -> 9-char Mistral ID)
        const idMap = new Map();

        const cleanMessages = messages.flatMap((m: any) => {
            // 1. Gestion Assistant avec Tool Calls
            if (m.role === 'assistant') {
                const results = [];

                // Si on a du contenu ET des tools, il faut splitter en 2 messages
                // car Mistral interdit d'avoir content + tool_calls dans le même message
                if (m.content && m.tool_calls && m.tool_calls.length > 0) {
                    // Message 1: Texte (Pensée)
                    results.push({ role: 'assistant', content: m.content });

                    // Message 2: Tools (Sans contenu)
                    const sanitizedTools = m.tool_calls.map((tc: any) => {
                        // Sanitizer l'ID (9 chars exactly)
                        let safeId = tc.id;
                        if (!/^[a-zA-Z0-9]{9}$/.test(tc.id)) {
                            // Générer un ID safe déterministe ou random (ici random suffisant si map utilisée)
                            // [IMPORTANT] On map l'ancien ID vers le nouveau pour les réponses 'tool'
                            safeId = Math.random().toString(36).substring(2, 11);
                            idMap.set(tc.id, safeId);
                        }
                        return {
                            id: safeId,
                            type: 'function',
                            function: tc.function
                        };
                    });

                    results.push({ role: 'assistant', tool_calls: sanitizedTools, content: null });
                } else if (m.tool_calls && m.tool_calls.length > 0) {
                    // Cas Tools sans contenu
                    const sanitizedTools = m.tool_calls.map((tc: any) => {
                        let safeId = tc.id;
                        if (!/^[a-zA-Z0-9]{9}$/.test(tc.id)) {
                            safeId = Math.random().toString(36).substring(2, 11);
                            idMap.set(tc.id, safeId);
                        }
                        return {
                            id: safeId,
                            type: 'function',
                            function: tc.function
                        };
                    });
                    results.push({ role: 'assistant', tool_calls: sanitizedTools, content: null });
                } else {
                    // Cas standard (Texte seul)
                    results.push({ role: 'assistant', content: m.content || "" });
                }

                return results;
            }

            // 2. Gestion Tool Responses
            if (m.role === 'tool') {
                // Récupérer l'ID sanitizé si disponible, sinon garder l'original
                const safeId = idMap.get(m.tool_call_id) || m.tool_call_id;

                return [{
                    role: 'tool',
                    tool_call_id: safeId,
                    name: m.name,
                    content: m.content
                }];
            }

            // 3. System & User
            return [{
                role: m.role,
                content: m.content
            }];
        });

        const body = {
            model: modelId,
            messages: cleanMessages,
            temperature,
            max_tokens: 1000,
            safe_prompt: true // Option Mistral recommandée
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
