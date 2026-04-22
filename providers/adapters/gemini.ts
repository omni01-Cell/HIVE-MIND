// @ts-nocheck
// providers/adapters/gemini.js
// Adaptateur pour Google Gemini

export default {
    name: 'gemini',

    /**
     * Appel Gemini
     */
    async chat(messages: any, options: any) {
        const { model, apiKey, tools, temperature = 0.7 } = options;
        const modelId = model || 'gemini-1.5-flash';

        // Convertir les messages au format Gemini
        // Convertir les messages au format Gemini
        const contents = messages
            .filter((m: any) => m.role !== 'system')
            .map((m: any) => {
                if (m.role === 'assistant') {
                    const parts = [];

                    // 1. D'abord le texte/pensée (S'il existe)
                    // C'est CRUCIAL pour les modèles "Thinking" (Gemini 2.0/3.0)
                    // Le texte contient le cheminement de pensée qui justifie l'appel de fonction
                    if (m.content) {
                        parts.push({ text: m.content });
                    }

                    // 2. Ensuite les appels de fonction
                    if (m.tool_calls && m.tool_calls.length > 0) {
                        m.tool_calls.forEach((tc: any) => {
                            const part = {
                                functionCall: {
                                    name: tc.function.name,
                                    args: JSON.parse(tc.function.arguments)
                                }
                            };

                            // Réinjecter le thought_signature
                            // [FIX] Envoyer sous les deux formats pour être sûr (Camel et Snake)
                            // L'erreur mentionnait spécifiquement "thought_signature"
                            if (tc.thought_signature) {
                                part.thoughtSignature = tc.thought_signature; // Standard SDK
                                part['thought_signature'] = tc.thought_signature; // Raw REST fallback
                            }
                            parts.push(part);
                        });
                    }

                    // Si on a des parts (texte ou tools), on retourne le message modèle
                    if (parts.length > 0) {
                        return { role: 'model', parts };
                    }
                    // Sinon (cas rare message vide), on renvoie un texte vide pour éviter erreur
                    return { role: 'model', parts: [{ text: '' }] };
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

                // 3. User & Assistant Standard (Texte OU Multimodal)
                // Gemini supporte le multimodal via parts: [{ text: "..." }, { inline_data: {...} }]
                let parts: any;

                if (Array.isArray(m.content)) {
                    // MULTIMODAL : Convertir le format OpenAI vers Gemini
                    parts = m.content.map((block: any) => {
                        if (block.type === 'text') {
                            return { text: block.text };
                        } else if (block.type === 'image_url') {
                            // Extraire le base64 de data:image/jpeg;base64,xxx
                            const base64Match = block.image_url.url.match(/^data:image\/(\w+);base64,(.+)$/);
                            if (base64Match) {
                                return {
                                    inline_data: {
                                        mime_type: `image/${base64Match[1]}`,
                                        data: base64Match[2]
                                    }
                                };
                            }
                        }
                        return { text: JSON.stringify(block) }; // Fallback
                    });
                } else {
                    // TEXTE SIMPLE
                    parts = [{ text: m.content }];
                }

                return {
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts
                };
            });

        // Extraire le system prompt
        const systemInstruction = messages.find((m: any) => m.role === 'system')?.content;

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
                functionDeclarations: tools.map((t: any) => ({
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

        // Extraire le contenu (Extraction multi-parts)
        const parts = candidate.content?.parts || [];

        // 1. Concaténer tout le contenu texte
        const textContent = parts
            .filter((p: any) => p.text)
            .map((p: any) => p.text)
            .join('\n')
            .trim();

        // 2. Chercher les appels de fonction
        const functionCallPart = parts.find((p: any) => p.functionCall);

        // Convertir functionCall au format OpenAI tool_calls
        let toolCalls: any = null;
        if (functionCallPart) {
            // Extraction robuste de la pensée (thought)
            const thoughtSig = functionCallPart.thoughtSignature ||
                functionCallPart.thought_signature ||
                functionCallPart.thought ||
                functionCallPart.functionCall?.thoughtSignature ||
                functionCallPart.functionCall?.thought_signature;

            toolCalls = [{
                id: `call_${Date.now()}`,
                type: 'function',
                function: {
                    name: functionCallPart.functionCall.name,
                    arguments: JSON.stringify(functionCallPart.functionCall.args)
                },
                thought_signature: thoughtSig
            }];
        }

        return {
            content: textContent || null,
            toolCalls,
            finishReason: candidate.finishReason,
            usage: data.usageMetadata
        };
    }
};
