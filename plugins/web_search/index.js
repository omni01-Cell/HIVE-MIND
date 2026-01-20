// plugins/web_search/index.js
import fs from 'fs';
import path from 'path';

export default {
    name: 'web_search',
    description: 'Effectue des recherches Google pour obtenir des informations à jour.',
    version: '1.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'search_web',
            description: 'Effectue une recherche sur Internet. À utiliser quand tu ne connais pas la réponse ou pour des informations d\'actualité (météo, sport, news).',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'La recherche à effectuer (ex: "Météo Abidjan", "Qui est le président du Brésil ?")'
                    },
                    num_results: {
                        type: 'integer',
                        description: 'Nombre de résultats (défaut: 3, max: 5)'
                    }
                },
                required: ['query']
            }
        }
    },

    async execute(args, context) {
        const { query, num_results = 3 } = args;
        const { transport, chatId } = context;

        // Feedback visuel optionnel
        if (transport) {
            // transport.sendPresenceUpdate(chatId, 'composing'); 
        }

        console.log(`[WebSearch] Recherche: "${query}"`);

        // 1. Tenter Google Search (Prioritaire)
        try {
            const credPath = path.join(process.cwd(), 'config', 'credentials.json');
            let apiKey, cseId;

            if (fs.existsSync(credPath)) {
                const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
                const apiKeyKey = creds.google_search?.apiKey;
                const cseIdKey = creds.google_search?.cseId;
                apiKey = process.env[apiKeyKey] || process.env.GOOGLE_SEARCH_API_KEY || apiKeyKey;
                cseId = process.env[cseIdKey] || process.env.GOOGLE_SEARCH_CSE_ID || cseIdKey;
            } else {
                apiKey = process.env.GOOGLE_SEARCH_API_KEY;
                cseId = process.env.GOOGLE_SEARCH_CSE_ID;
            }

            if (!apiKey || !cseId || apiKey.includes('VOTRE_')) {
                throw new Error("Clés Google manquantes (passage au fallback)");
            }

            const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${Math.min(num_results, 5)}`;
            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 429 || response.status === 403) {
                    console.warn(`[WebSearch] Quota Google atteint (${response.status}), bascule sur DuckDuckGo.`);
                    throw new Error("Quota Google");
                }
                const errText = await response.text();
                throw new Error(`Google API Error: ${response.status} - ${errText}`);
            }

            const data = await response.json();
            if (!data.items || data.items.length === 0) {
                return { success: true, message: `Aucun résultat Google pour "${query}".` };
            }

            const results = data.items.map(item => {
                return `Titre: ${item.title}\nLien: ${item.link}\nExtrait: ${item.snippet}\n---`;
            }).join('\n');

            return {
                success: true,
                message: `🔎 Résultats Google pour "${query}":\n\n${results}`
            };

        } catch (error) {
            console.warn(`[WebSearch] Echec Google (${error.message}). Tentative DuckDuckGo...`);
            return await this.searchDuckDuckGo(query, num_results);
        }
    },

    /**
     * Fallback gratuit via DuckDuckGo HTML
     */
    async searchDuckDuckGo(query, num_results) {
        try {
            const url = "https://html.duckduckgo.com/html/";
            const body = new URLSearchParams({ q: query, b: "" }); // POST form data

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                },
                body: body
            });

            if (!response.ok) throw new Error(`DDG Status ${response.status}`);
            const html = await response.text();

            // Regex simple pour extraire Titres et Liens depuis la structure HTML de DDG
            // <a class="result__a" href="...">Titre</a>
            // <a class="result__snippet" ...>Snippet</a>

            const results = [];
            const resultRegex = /<div class="result__body".*?<a class="result__a" href="([^"]+)".*?>(.*?)<\/a>.*?<a class="result__snippet".*?>(.*?)<\/a>/gs;

            let match;
            let count = 0;
            while ((match = resultRegex.exec(html)) !== null && count < num_results) {
                const link = match[1];
                // Nettoyer les balises HTML restantes dans le titre/snippet
                const title = match[2].replace(/<[^>]+>/g, "").trim();
                const snippet = match[3].replace(/<[^>]+>/g, "").trim();

                results.push(`Titre: ${title}\nLien: ${link}\nExtrait: ${snippet}\n---`);
                count++;
            }

            if (results.length === 0) {
                return { success: false, message: "Aucun résultat trouvé sur DuckDuckGo." };
            }

            return {
                success: true,
                message: `🦆 Résultats DuckDuckGo pour "${query}":\n\n${results.join('\n')}`
            };

        } catch (e) {
            console.error('[WebSearch] Fallback DDG échoué:', e);
            return {
                success: false,
                message: "Désolé, la recherche a échoué sur Google et DuckDuckGo.",
                gracefulDegradation: true
            };
        }
    }
};
