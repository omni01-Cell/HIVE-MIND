// Wikipedia search plugin

export default {
    name: 'search_wikipedia',
    description: 'Searches for information on Wikipedia.',
    version: '1.0.0',
    enabled: true,

    // TEXT MATCHER: [wiki:query] pattern for textual fallback
    textMatchers: [
        {
            pattern: /\[wiki[:\s]+([^\]]+)\]/i,
            handler: 'search_wikipedia',
            description: 'Wikipedia search via [wiki:subject]',
            extractArgs: (match: any) => ({ query: match[1].trim() })
        }
    ],

    toolDefinition: {
        type: 'function',
        function: {
            name: 'search_wikipedia',
            description: 'Search for information on Wikipedia. Use this function when the user asks for encyclopedic info.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The subject to search for'
                    },
                    lang: {
                        type: 'string',
                        description: 'Language code (en, fr, etc.). Default: en'
                    }
                },
                required: ['query']
            }
        }
    },

    async execute(args: any, context: any, toolName?: string) {
        const { query, lang = 'en' } = args;
        const { transport, chatId } = context || {};

        if (!query) {
            return {
                success: false,
                message: 'Tell me what you want to search for!'
            };
        }

        try {
            // Dynamic import of wikipedia
            const { default: wiki } = await import('wikipedia');

            // Set language
            wiki.setLang(lang);

            // Search
            const searchResults = await wiki.search(query);

            if (!searchResults.results || searchResults.results.length === 0) {
                return {
                    success: false,
                    message: `No results found for "${query}" on Wikipedia.`
                };
            }

            // Get summary of first page
            const page = await wiki.page(searchResults.results[0].title);
            const summary = await page.summary();

            // Limit text to 500 characters
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
            console.error('[Wikipedia Plugin] Error:', error);

            // Handle specific errors
            if (error.message?.includes('page does not exist')) {
                return {
                    success: false,
                    message: `The article "${query}" does not exist on Wikipedia.`
                };
            }

            return {
                success: false,
                message: `Search error: ${error.message}`
            };
        }
    }
};
