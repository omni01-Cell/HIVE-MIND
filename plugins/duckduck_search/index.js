// plugins/duckduck_search/index.js

export default {
    name: 'duckduck_search',
    description: 'Effectue des recherches web via DuckDuckGo (scraping) pour obtenir des informations à jour.',
    version: '2.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'duckduck_search',
            description: 'Recherche sur le web via DuckDuckGo pour vérifier des faits, actualités, etc.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'La recherche à effectuer'
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

        console.log(`[DuckDuckSearch] 🦆 Recherche DuckDuckGo: "${query}"`);

        return await this.searchDuckDuckGo(query, num_results);
    },

    /**
     * Recherche via DuckDuckGo HTML (scraping)
     */
    async searchDuckDuckGo(query, num_results) {
        try {
            const url = "https://html.duckduckgo.com/html/";
            const body = new URLSearchParams({ q: query, b: "" }); // POST form data

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Upgrade-Insecure-Requests": "1",
                    "Origin": "https://html.duckduckgo.com",
                    "Referer": "https://html.duckduckgo.com/"
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
            console.error('[DuckDuckSearch] ❌ Erreur DuckDuckGo:', e.message);
            return {
                success: false,
                message: `Erreur technique lors de la recherche web (${e.message}). Essaye de reformuler ou demande-moi autre chose.`,
                gracefulDegradation: true
            };
        }
    }
};
