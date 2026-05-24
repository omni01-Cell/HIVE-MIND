// providers/adapters/codex.ts
// Adaptateur pour OpenAI Codex avec authentification OAuth officielle ChatGPT Plus/Pro.
// WHY: Permet de consommer les modèles SOTA (gpt-5.5, gpt-5.4, etc.) via l'abonnement Codex.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Buffer } from 'buffer';

const AUTH_FILE_PATH = '/home/omni/.codex/auth.json';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

/**
 * Décode un jeton JWT de manière sécurisée pour inspecter son expiration.
 */
function decodeJwt(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch {
        return null;
    }
}

/**
 * Récupère ou rafraîchit automatiquement le jeton d'accès OAuth.
 * Gère de manière transparente le fallback sur les variables d'environnement (Railway).
 */
async function getOrRefreshTokens(): Promise<{ accessToken: string; accountId: string }> {
    // 1. Tentative via les variables d'environnement (Production Railway)
    let accessToken = process.env.CODEX_ACCESS_TOKEN;
    let refreshToken = process.env.CODEX_REFRESH_TOKEN;
    let accountId = process.env.CODEX_ACCOUNT_ID;

    let authData: any = null;

    // 2. Lecture du fichier auth.json local (Développement)
    if (!refreshToken && existsSync(AUTH_FILE_PATH)) {
        try {
            authData = JSON.parse(readFileSync(AUTH_FILE_PATH, 'utf8'));
            if (authData?.tokens) {
                accessToken = authData.tokens.access_token;
                refreshToken = authData.tokens.refresh_token;
                accountId = authData.tokens.account_id;
            }
        } catch (err) {
            console.error('[Codex] Erreur lors de la lecture du fichier auth.json:', err);
        }
    }

    if (!refreshToken) {
        throw new Error('Jeton de rafraîchissement Codex introuvable (ni CODEX_REFRESH_TOKEN ni auth.json).');
    }

    // 3. Validation de la date d'expiration de l'access token
    let shouldRefresh = !accessToken;
    if (accessToken) {
        const payload = decodeJwt(accessToken);
        if (!payload || !payload.exp) {
            shouldRefresh = true;
        } else {
            const nowSec = Math.floor(Date.now() / 1000);
            // Si le jeton expire dans moins de 5 minutes, on le rafraîchit
            if (payload.exp - nowSec < 300) {
                shouldRefresh = true;
            }
        }
    }

    // 4. Rafraîchissement automatique si expiré
    if (shouldRefresh) {
        console.log('[Codex] Rafraîchissement automatique du jeton d\'accès OAuth OpenAI...');
        const res = await fetch('https://auth.openai.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: CLIENT_ID,
                refresh_token: refreshToken
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Échec du rafraîchissement OAuth : ${res.status} ${text}`);
        }

        const data = await res.json();
        accessToken = data.access_token;
        refreshToken = data.refresh_token || refreshToken;

        const decoded = decodeJwt(accessToken!);
        accountId = decoded?.['https://api.openai.com/auth']?.chatgpt_account_id || accountId;

        console.log('[Codex] Jeton d\'accès OAuth rafraîchi avec succès.');

        // Sauvegarde sur le disque si possible
        if (existsSync(AUTH_FILE_PATH) || authData) {
            try {
                const updatedAuthData = {
                    ...(authData || {}),
                    tokens: {
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        account_id: accountId
                    }
                };
                writeFileSync(AUTH_FILE_PATH, JSON.stringify(updatedAuthData, null, 4), 'utf8');
                console.log('[Codex] Tokens mis à jour sauvegardés dans auth.json.');
            } catch (err) {
                console.warn('[Codex] Échec d\'écriture de auth.json (système de fichiers en lecture seule ?) :', err);
            }
        }
    }

    return {
        accessToken: accessToken!,
        accountId: accountId || ''
    };
}

export default {
    name: 'codex',

    /**
     * Effectue une chat completion via le backend Codex ChatGPT
     */
    async chat(messages: any[], options: any) {
        const { model, temperature = 0.7 } = options;

        // Récupérer le token OAuth valide
        const { accessToken, accountId } = await getOrRefreshTokens();

        // 1. Extraire les instructions système
        let instructions = 'You are a helpful assistant.';
        const systemMsg = messages.find((m: any) => m.role === 'system');
        if (systemMsg) {
            instructions = systemMsg.content;
        }

        // 2. Aplatir et convertir les messages au format Codex Responses
        const input: any[] = [];
        for (const m of messages) {
            if (m.role === 'system') continue;

            if (m.role === 'user' || m.role === 'developer') {
                const textContent = Array.isArray(m.content)
                    ? m.content.map((c: any) => c.text || '').join('\n')
                    : m.content;

                input.push({
                    type: 'message',
                    role: m.role,
                    content: [
                        {
                            type: 'input_text',
                            text: textContent
                        }
                    ]
                });
            } else if (m.role === 'assistant') {
                if (m.content) {
                    input.push({
                        type: 'message',
                        role: 'assistant',
                        content: [
                            {
                                type: 'output_text',
                                text: m.content
                            }
                        ]
                    });
                }

                if (m.tool_calls && Array.isArray(m.tool_calls)) {
                    for (const tc of m.tool_calls) {
                        input.push({
                            type: 'function_call',
                            call_id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            name: tc.function.name,
                            arguments: typeof tc.function.arguments === 'string'
                                ? tc.function.arguments
                                : JSON.stringify(tc.function.arguments)
                        });
                    }
                }
            } else if (m.role === 'tool') {
                input.push({
                    type: 'function_call_output',
                    call_id: m.tool_call_id,
                    name: m.name,
                    output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                });
            }
        }

        // 3. Payload Codex Responses
        const resolvedModel = model || 'gpt-5.5';
        const body: any = {
            model: resolvedModel,
            store: false,
            stream: true,
            instructions,
            input,
            text: {
                verbosity: 'medium'
            },
            include: ['reasoning.encrypted_content']
        };

        // 4. Headers d'imitation exacts de codex_cli_rs
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'chatgpt-account-id': accountId,
            'OpenAI-Beta': 'responses=experimental',
            'originator': 'codex_cli_rs',
            'Content-Type': 'application/json',
            'accept': 'text/event-stream'
        };

        const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch {}
            const errorMsg = parsed?.error?.message || parsed?.detail || text || 'Erreur API Codex';
            throw new Error(`[Codex API Error] ${response.status} ${response.statusText}: ${errorMsg}`);
        }

        if (!response.body) {
            throw new Error('[Codex] La réponse ne contient pas de body lisible.');
        }

        // 5. Lecture complète du stream SSE
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }

        // 6. Extraction de l'objet de réponse final depuis le flux SSE
        const lines = fullText.split('\n');
        let responseObj: any = null;

        for (const line of lines) {
            if (line.trim().startsWith('data:')) {
                const jsonStr = line.substring(line.indexOf('{')).trim();
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'response.done' || parsed.type === 'response.completed') {
                        responseObj = parsed.response;
                    }
                } catch {}
            }
        }

        if (!responseObj) {
            throw new Error('[Codex] Aucun événement final de réponse trouvé dans le flux SSE.');
        }

        // 7. Reconstruction unifiée des données de retour
        let content = '';
        let toolCalls: any[] = [];
        let usage = null;
        let finishReason = 'stop';

        // Extraction pour format type standard OpenAI (au cas où le backend s'aligne)
        if (responseObj.choices && Array.isArray(responseObj.choices) && responseObj.choices.length > 0) {
            const choice = responseObj.choices[0];
            if (choice.message) {
                content = choice.message.content || '';
                if (choice.message.tool_calls) {
                    toolCalls = choice.message.tool_calls;
                }
            }
            finishReason = choice.finish_reason || 'stop';
        }
        // Extraction pour le format plat officiel Codex Responses
        else if (responseObj.output && Array.isArray(responseObj.output)) {
            for (const item of responseObj.output) {
                if (item.type === 'message' && item.role === 'assistant') {
                    if (Array.isArray(item.content)) {
                        for (const part of item.content) {
                            if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
                                content += part.text || '';
                            }
                        }
                    } else if (typeof item.content === 'string') {
                        content += item.content;
                    }
                } else if (item.type === 'function_call') {
                    toolCalls.push({
                        id: item.call_id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'function',
                        function: {
                            name: item.name,
                            arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments)
                        }
                    });
                }
            }
        }

        if (responseObj.usage) {
            usage = responseObj.usage;
        }

        return {
            content: content || null,
            toolCalls: toolCalls.length > 0 ? toolCalls : null,
            finishReason,
            usage
        };
    }
};
