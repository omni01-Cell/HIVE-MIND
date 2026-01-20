// providers/adapters/gemini.js
// Adaptateur pour Google Gemini

export default {
    name: 'gemini',

    /**
     * Appel Gemini
     */
    async chat(messages, options) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        const modelId = model || 'gemini-1.5-flash';

        // Convertir les messages au format Gemini
        // Convertir les messages au format Gemini
        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => {
                if (m.role === 'assistant' && m.tool_calls) {
                    return {
                        role: 'model',
                        parts: m.tool_calls.map(tc => {
                            const part = {
                                functionCall: {
                                    name: tc.function.name,
                                    args: JSON.parse(tc.function.arguments)
                                }
                            };
                            // Réinjecter le thought_signature (SIBLING de functionCall)
                            // La doc indique "thoughtSignature" (CamelCase) ou "thought_signature"
                            // On tente le CamelCase car Gemini utilise functionCall (CamelCase)
                            if (tc.thought_signature) {
                                part.thoughtSignature = tc.thought_signature;
                            }
                            return part;
                        })
                    };
                }

                // 2. Résultat d'outil (Role: tool)
                if (m.role === 'tool') {
                    return {
                        role: 'function',
                        parts: [{
                            functionResponse: {
                                name: m.name, // Nom de la fonction (stocké dans le message par le Core)
                                response: {
                                    name: m.name,
                                    content: m.content // Le contenu textuel ou JSON
                                }
                            }
                        }]
                    };
                }

                // 3. User & Assistant Standard
                return {
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                };
            });

        // Extraire le system prompt
        const systemInstruction = messages.find(m => m.role === 'system')?.content;

        const body = {
            contents,
            generationConfig: {
                temperature,
                maxOutputTokens: 1000
            }
        };

        if (systemInstruction) {
            body.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        // Convertir les tools au format Gemini
        if (tools?.length) {
            body.tools = [{
                functionDeclarations: tools.map(t => ({
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters
                }))
            }];
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Erreur Gemini');
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        if (!candidate) {
            console.error('[Gemini] RAW Response (No Candidate):', JSON.stringify(data, null, 2));
            throw new Error('Pas de réponse Gemini');
        }

        // DEBUG: Inspecter la réponse brute pour comprendre pourquoi "content" serait vide
        // console.log('[Gemini] Candidate Raw:', JSON.stringify(candidate, null, 2));

        // Extraire le contenu
        const parts = candidate.content?.parts || [];
        const textPart = parts.find(p => p.text);
        const functionCallPart = parts.find(p => p.functionCall);

        // Convertir functionCall au format OpenAI tool_calls
        let toolCalls = null;
        if (functionCallPart) {
            // Extraction robuste : peut être thoughtSignature (camel) ou thought_signature (snake)
            // SIBLING de functionCall
            const thoughtSig = functionCallPart.thoughtSignature ||
                functionCallPart.thought_signature ||
                functionCallPart.functionCall?.thoughtSignature ||
                functionCallPart.functionCall?.thought_signature;

            toolCalls = [{
                id: `call_${Date.now()}`,
                type: 'function',
                function: {
                    name: functionCallPart.functionCall.name,
                    arguments: JSON.stringify(functionCallPart.functionCall.args)
                },
                // On stocke cette signature secrète pour la renvoyer au prochain tour
                thought_signature: thoughtSig
            }];
        }

        return {
            content: textPart?.text || null,
            toolCalls,
            finishReason: candidate.finishReason,
            usage: data.usageMetadata
        };
    }
};
