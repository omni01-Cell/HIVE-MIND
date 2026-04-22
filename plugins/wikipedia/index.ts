// plugins/wikipedia/index.js
// Plugin de recherche Wikipedia

export default {
    name: 'search_wikipedia',
    description: 'Recherche des informations sur Wikipedia.',
    version: '1.0.0',
    enabled: true,

    // TEXT MATCHER : Pattern [wiki:query] pour fallback textuel
    textMatchers: [
        {
            pattern: /\[wiki[:\s]+([^\]]+)\]/i,
            handler: 'search_wikipedia',
            description: 'Recherche Wikipedia via [wiki:sujet]',
            extractArgs: (match: any) => ({ query: match[1].trim() })
        }
    ],

    toolDefinition: {
        type: 'function',
        function: {
            name: 'search_wikipedia',
            description: 'Rechercher des informations sur Wikipedia. Utilise cette fonction quand l\'utilisateur demande des infos encyclopédiques.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Le sujet à rechercher'
                    },
                    lang: {
                        type: 'string',
                        description: 'Code langue (fr, en, etc.). Par défaut: fr'
                    }
                },
                required: ['query']
            }
        }
    },

    async execute(args: any, context: any) {
        const { query, lang = 'fr' } = args;

        if (!query) {
            return {
                success: false,
                message: 'Dis-moi ce que tu veux rechercher !'
            };
        }

        try {
            // Import dynamique de wikipedia (méthode corrigée)
            const { default: wiki } = await import('wikipedia');

            // Définir la langue
            wiki.setLang(lang);

            // Recherche
            const searchResults = await wiki.search(query);

            if (!searchResults.results || searchResults.results.length === 0) {
                return {
                    success: false,
                    message: `Aucun résultat trouvé pour "${query}" sur Wikipedia.`
                };
            }

            // Récupère le résumé de la première page
            const page = await wiki.page(searchResults.results[0].title);
            const summary = await page.summary();

            // Limite le texte à 500 caractères
            const shortExtract = summary.extract.length > 500
                ? summary.extract.substring(0, 500) + '...'
                : summary.extract;

            return {
                success: true,
                message: `📚 *${summary.title}*\n\n${shortExtract}\n\n🔗 ${summary.content_urls?.desktop?.page || ''}`,
                data: {
                    title: summary.title,
                    extract: summary.extract,
                    url: summary.content_urls?.desktop?.page
                }
            };

        } catch (error: any) {
            console.error('[Wikipedia Plugin] Erreur:', error);

            // Gère les erreurs spécifiques
            if (error.message?.includes('page does not exist')) {
                return {
                    success: false,
                    message: `L'article "${query}" n'existe pas sur Wikipedia.`
                };
            }

            return {
                success: false,
                message: `Erreur lors de la recherche: ${error.message}`
            };
        }
    }
};
