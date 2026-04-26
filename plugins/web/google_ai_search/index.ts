// plugins/web/google_ai_search/index.ts
// Recherche web rapide via SerpApi Google AI Mode.
// Porte le skill Python "google-ai-researcher" en tant que tool natif HIVE-MIND.
// Renvoie des réponses synthétisées + sourcées par l'IA de Google.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXT_FILE = join(__dirname, 'conversation_context.json');

// Clé SerpApi résolue depuis .env (SERPAPI_KEY)
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const SERPAPI_BASE = 'https://serpapi.com/search';
const REQUEST_TIMEOUT_MS = 30_000;

interface SearchResult {
    success: boolean;
    message: string;
    sources?: Array<{ title: string; url: string }>;
    gracefulDegradation?: boolean;
}

/**
 * Charge le token de conversation sauvegardé (mode stateful)
 */
function loadConversationToken(): string | null {
    if (!existsSync(CONTEXT_FILE)) return null;
    try {
        const data = JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'));
        return data.subsequent_request_token || null;
    } catch {
        return null;
    }
}

/**
 * Sauvegarde le token de conversation (mode stateful)
 */
function saveConversationToken(token: string): void {
    try {
        writeFileSync(CONTEXT_FILE, JSON.stringify({ subsequent_request_token: token }));
    } catch (err: any) {
        console.warn(`[GoogleAI] ⚠️ Erreur sauvegarde contexte: ${err.message}`);
    }
}

export default {
    name: 'google_ai_search',
    description: 'Recherche web rapide via Google AI Mode (SerpApi). Réponses synthétisées, sourcées et à jour.',
    version: '1.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function' as const,
        function: {
            name: 'google_ai_search',
            description: 'Recherche web intelligente via Google AI Mode. Renvoie une synthèse sourcée. Idéal pour vérification de faits, actualités, veille technologique, questions nécessitant des données récentes.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'La question ou recherche à effectuer'
                    },
                    mode: {
                        type: 'string',
                        enum: ['standard', 'chat', 'new'],
                        description: 'standard = question isolée (défaut), chat = continuer la conversation précédente, new = démarrer un nouveau fil'
                    }
                },
                required: ['query']
            }
        }
    },

    async execute(args: any, _context: any): Promise<SearchResult> {
        const { query, mode = 'standard' } = args;

        console.log(`[GoogleAI] 🔍 Recherche Google AI Mode: "${query}" (mode: ${mode})`);

        return await this.searchGoogleAI(query, mode);
    },

    /**
     * Appelle SerpApi en mode Google AI
     */
    async searchGoogleAI(query: string, mode: string): Promise<SearchResult> {
        const useConversation = mode === 'chat' || mode === 'new';
        const resetContext = mode === 'new';

        // Construire les paramètres
        const params = new URLSearchParams({
            engine: 'google_ai_mode',
            q: query,
            api_key: SERPAPI_KEY
        });

        // Gestion du contexte conversationnel
        if (useConversation && !resetContext) {
            const token = loadConversationToken();
            if (token) {
                params.set('subsequent_request_token', token);
                console.log(`[GoogleAI] 💬 Continuation de conversation (token: ${token.substring(0, 15)}...)`);
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const requestStart = Date.now();

        try {
            const url = `${SERPAPI_BASE}?${params.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const duration = Date.now() - requestStart;
            console.log(`[GoogleAI] 📥 Réponse en ${duration}ms (Status: ${response.status})`);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`SerpApi ${response.status}: ${errorText.substring(0, 200)}`);
            }

            const data = await response.json();

            // Vérifier erreurs API
            if (data.error) {
                throw new Error(`SerpApi: ${data.error}`);
            }

            if (data.search_metadata?.status === 'Error') {
                return {
                    success: false,
                    message: "L'IA de Google n'a pas pu générer de réponse (délai dépassé ou erreur interne)."
                };
            }

            // Sauvegarder le token de conversation si mode stateful
            if (useConversation) {
                const newToken = data.search_metadata?.subsequent_request_token
                    || data.subsequent_request_token;
                if (newToken) {
                    saveConversationToken(newToken);
                }
            }

            // Extraire les blocs de texte
            const textBlocks: any[] = data.text_blocks || [];

            if (textBlocks.length === 0) {
                return {
                    success: false,
                    message: "Aucune réponse générée par Google AI pour cette requête."
                };
            }

            // Construire la réponse Markdown
            let answer = '';
            for (const block of textBlocks) {
                if (block.title) answer += `### ${block.title}\n`;
                const snippet = block.snippet || block.text;
                if (snippet) answer += `${snippet}\n\n`;
            }

            // Extraire les sources
            const references: any[] = data.references || [];
            const sources = references.slice(0, 5).map((r: any) => ({
                title: r.title || 'Source',
                url: r.link || r.url || ''
            }));

            if (sources.length > 0) {
                answer += '\n**Sources :**\n' + sources
                    .map((s: { title: string; url: string }) => `- [${s.title}](${s.url})`)
                    .join('\n');
            }

            return {
                success: true,
                message: `🔍 Résultat Google AI pour "${query}" :\n\n${answer}`,
                sources
            };

        } catch (err: any) {
            clearTimeout(timeoutId);

            if (err.name === 'AbortError') {
                return {
                    success: false,
                    message: `Timeout de la recherche Google AI (${REQUEST_TIMEOUT_MS / 1000}s dépassés). Réessaie avec une question plus courte.`,
                    gracefulDegradation: true
                };
            }

            console.error(`[GoogleAI] ❌ Erreur:`, err.message);
            return {
                success: false,
                message: `Erreur recherche Google AI : ${err.message}. Essaie de reformuler ou utilise DuckDuckGo.`,
                gracefulDegradation: true
            };
        }
    }
};
