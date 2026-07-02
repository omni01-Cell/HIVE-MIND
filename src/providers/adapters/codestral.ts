// providers/adapters/codestral.ts
// Adaptateur pour Codestral (Mistral AI) — Endpoint dédié coding & agentic
// Endpoint: https://codestral.mistral.ai/v1/chat/completions
// Limites: 30 RPM, 2 000 RPD

// WHY (Tool ID sanitization): L'API Codestral impose le même format que Mistral —
// les IDs de tool_call doivent être exactement 9 caractères alphanumériques.
// WHY (Split content/tool_calls): Codestral interdit de combiner du contenu texte ET
// des tool_calls dans le même message assistant.

/** Format minimal d'un message entrant depuis le BotCore */
interface IncomingMessage {
    role: string;
    content?: string | null;
    tool_calls?: {
        id: string;
        type?: string;
        function: { name: string; arguments: string };
    }[];
    tool_call_id?: string;
    name?: string;
}

/** Format d'un outil OpenAI-compatible */
interface ToolDefinition {
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

/** Réponse brute de l'API Codestral */
interface CodestralApiResponse {
    choices: {
        message: {
            content: string | null;
            tool_calls?: {
                id: string;
                type: string;
                function: { name: string; arguments: string };
            }[];
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

/**
 * Génère un ID de tool_call valide pour Codestral (9 caractères alphanumériques).
 * INVARIANT: Le résultat est toujours exactement 9 caractères dans [a-zA-Z0-9].
 */
function generateSafeToolId(): string {
    return Math.random().toString(36).substring(2, 11);
}

/**
 * Vérifie si un ID est conforme au format Codestral/Mistral.
 * INVARIANT: Retourne true ssi la chaîne est exactement 9 chars alphanumériques.
 */
function isValidToolId(id: string): boolean {
    return /^[a-zA-Z0-9]{9}$/.test(id);
}

export default {
    name: 'codestral',

    /**
     * Appel Codestral chat completion.
     * INVARIANT: Aucun message assistant ne combine content + tool_calls.
     * INVARIANT: Tous les IDs de tool_call sont sur exactement 9 chars alphanumériques.
     */
    async chat(messages: unknown[], options: Record<string, unknown>) {
        const {
            model,
            apiKey,
            tools,
            temperature = 0.7,
            max_tokens,
        } = options as {
            model?: string;
            apiKey?: string;
            tools?: ToolDefinition[];
            temperature?: number;
            max_tokens?: number;
        };

        if (!apiKey) {
            throw new Error('[Codestral] Clé API manquante. Vérifiez CODESTRAL_KEY dans .env');
        }

        const modelId = model || 'codestral-latest';

        // Mapping des anciens IDs vers les IDs sanitizés (pour retrouver les bonnes
        // correspondances dans les réponses tool ultérieures).
        const idMap = new Map<string, string>();

        const cleanMessages = (messages as IncomingMessage[]).flatMap((m): IncomingMessage[] => {
            // 1. Messages assistant
            if (m.role === 'assistant') {
                const hasContent = m.content != null && m.content !== '';
                const hasToolCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;

                if (hasContent && hasToolCalls) {
                    // WHY: Codestral interdit la combinaison content + tool_calls.
                    // On éclate en 2 messages séparés.
                    const sanitizedTools = (m.tool_calls ?? []).map((tc) => {
                        const safeId = isValidToolId(tc.id) ? tc.id : generateSafeToolId();
                        if (safeId !== tc.id) idMap.set(tc.id, safeId);
                        return { id: safeId, type: 'function', function: tc.function };
                    });

                    return [
                        { role: 'assistant', content: m.content },
                        { role: 'assistant', tool_calls: sanitizedTools, content: null },
                    ];
                }

                if (hasToolCalls) {
                    const sanitizedTools = (m.tool_calls ?? []).map((tc) => {
                        const safeId = isValidToolId(tc.id) ? tc.id : generateSafeToolId();
                        if (safeId !== tc.id) idMap.set(tc.id, safeId);
                        return { id: safeId, type: 'function', function: tc.function };
                    });

                    return [{ role: 'assistant', tool_calls: sanitizedTools, content: null }];
                }

                // Cas standard : texte seul
                return [{ role: 'assistant', content: m.content ?? '' }];
            }

            // 2. Réponses tool — aligner l'ID sur le mapping sanitizé si applicable
            if (m.role === 'tool') {
                const safeId = (m.tool_call_id && idMap.get(m.tool_call_id)) || m.tool_call_id;
                return [{ role: 'tool', tool_call_id: safeId, name: m.name, content: m.content }];
            }

            // 3. Messages system et user : passage direct
            return [{ role: m.role, content: m.content }];
        });

        const requestBody: Record<string, unknown> = {
            model: modelId,
            messages: cleanMessages,
            temperature,
            max_tokens: max_tokens ?? 8192,
            safe_prompt: false,
        };

        if (Array.isArray(tools) && tools.length > 0) {
            // Codestral utilise le même format de tools qu'OpenAI/Mistral
            requestBody.tools = tools.map((t) => ({
                type: 'function',
                function: t.function,
            }));
            requestBody.tool_choice = 'auto';
        }

        const response = await fetch('https://codestral.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ message: 'Réponse non-JSON' })) as { message?: string };
            throw new Error(
                `[Codestral] API Error ${response.status}: ${errorBody.message ?? response.statusText}`
            );
        }

        const data = await response.json() as CodestralApiResponse;

        // Précondition : l'API doit retourner au moins un choice.
        if (!data.choices || data.choices.length === 0) {
            throw new Error('[Codestral] Réponse invalide : aucun "choice" retourné par l\'API.');
        }

        const choice = data.choices[0];

        return {
            content: choice.message.content ?? null,
            toolCalls: choice.message.tool_calls ?? null,
            finishReason: choice.finish_reason,
            usage: data.usage,
        };
    },
};
