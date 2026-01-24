import { container } from '../../core/ServiceContainer.js';

export default {
    name: 'crawlfire_web',
    description: 'Plugin de crawling et scraping avancé via Firecrawl (v2). Permet de transformer des sites web en Markdown propre pour les LLM.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'firecrawl_scrape',
                description: 'Scrape une URL unique pour obtenir son contenu en Markdown propre.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'L\'URL à scraper' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_crawl',
                description: 'Crawl un site web et ses sous-pages pour en extraire le contenu.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL de base du site' },
                        limit: { type: 'integer', description: 'Nombre max de pages à crawler (défaut 10)' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_map',
                description: 'Obtient la liste de toutes les URLs d\'un site web.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL du site' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_search',
                description: 'Recherche sur le web et scrape les meilleurs résultats.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'La requête de recherche' },
                        limit: { type: 'integer', description: 'Nombre de résultats (défaut 3)' }
                    },
                    required: ['query']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_extract',
                description: 'Extrait des données structurées d\'un site web selon un prompt.',
                parameters: {
                    type: 'object',
                    properties: {
                        urls: { type: 'array', items: { type: 'string' }, description: 'Liste d\'URLs (supporte /*)' },
                        prompt: { type: 'string', description: 'Description des données à extraire' }
                    },
                    required: ['urls', 'prompt']
                }
            }
        }
    ],

    async execute(args, context, toolName) {
        const { transport, chatId } = context;

        let apiKey = process.env.FIRECRAWL_API_KEY;
        try {
            if (container.has('config')) {
                const configService = container.get('config');
                const pluginConfig = typeof configService.get === 'function'
                    ? configService.get('plugins')?.crawlfire_web
                    : configService.plugins?.crawlfire_web;
                if (pluginConfig?.apiKey) apiKey = pluginConfig.apiKey;
            }
        } catch (e) {
            // Silencieux
        }

        if (!apiKey || apiKey.startsWith('YOUR_') || apiKey === 'fc-YOUR-API-KEY' || apiKey === 'fc-YOUR-API-KEY-HERE') {
            return { success: false, message: "⚠️ Clé API Firecrawl non configurée. Veuillez configurer FIRECRAWL_API_KEY dans vos variables d'environnement." };
        }

        const baseUrl = "https://api.firecrawl.dev/v2";
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        };

        try {
            switch (toolName) {
                case 'firecrawl_scrape':
                    return await this.handleScrape(args.url, headers, baseUrl);
                case 'firecrawl_crawl':
                    return await this.handleCrawl(args.url, args.limit || 10, headers, baseUrl, transport, chatId);
                case 'firecrawl_map':
                    return await this.handleMap(args.url, headers, baseUrl);
                case 'firecrawl_search':
                    return await this.handleSearch(args.query, args.limit || 3, headers, baseUrl);
                case 'firecrawl_extract':
                    return await this.handleExtract(args.urls, args.prompt, headers, baseUrl, transport, chatId);
                default:
                    return { success: false, message: `Outil Firecrawl inconnu: ${toolName}` };
            }
        } catch (error) {
            console.error(`[CrawlFire] Error in ${toolName}:`, error.message);
            return { success: false, message: `❌ Erreur Firecrawl: ${error.message}` };
        }
    },

    async handleScrape(url, headers, baseUrl) {
        console.log(`[CrawlFire] 📄 Scraping: ${url}`);
        const res = await fetch(`${baseUrl}/scrape`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url, formats: ["markdown"] })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Échec du scraping");
        return { success: true, message: json.data.markdown };
    },

    async handleCrawl(url, limit, headers, baseUrl, transport, chatId) {
        console.log(`[CrawlFire] 🕸️ Crawling: ${url} (limit: ${limit})`);
        if (transport) await transport.sendText(chatId, `🕸️ Début du crawl sur ${url}...`);

        const startRes = await fetch(`${baseUrl}/crawl`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url, limit })
        });
        const startJson = await startRes.json();
        if (!startJson.success) throw new Error(startJson.error || "Échec du démarrage du crawl");

        const jobId = startJson.id;
        return await this.pollJob(jobId, 'crawl', headers, baseUrl, transport, chatId);
    },

    async handleMap(url, headers, baseUrl) {
        console.log(`[CrawlFire] 🗺️ Mapping: ${url}`);
        const res = await fetch(`${baseUrl}/map`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Échec du mapping");
        const links = json.links.map(l => `- ${l.url} (${l.title || 'sans titre'})`).join('\n');
        return { success: true, message: `🗺️ Plan du site ${url} :\n\n${links}` };
    },

    async handleSearch(query, limit, headers, baseUrl) {
        console.log(`[CrawlFire] 🔍 Searching: ${query}`);
        const res = await fetch(`${baseUrl}/search`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Échec de la recherche");

        const results = json.data.map(d => `### ${d.title}\nURL: ${d.url}\n\n${d.markdown?.substring(0, 800) || 'Pas de contenu markdown'}...\n---`).join('\n\n');
        return { success: true, message: `🔍 Résultats Firecrawl pour "${query}" :\n\n${results}` };
    },

    async handleExtract(urls, prompt, headers, baseUrl, transport, chatId) {
        console.log(`[CrawlFire] 🧪 Extracting from ${urls?.length} URLs`);
        if (transport) await transport.sendText(chatId, `🧪 Extraction de données structurées en cours...`);

        const res = await fetch(`${baseUrl}/extract`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ urls, prompt })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Échec de l'extraction");

        if (json.data && json.status === 'completed') {
            return { success: true, message: `🧪 Données extraites :\n\n\`\`\`json\n${JSON.stringify(json.data, null, 2)}\n\`\`\`` };
        }

        return await this.pollJob(json.id, 'extract', headers, baseUrl, transport, chatId);
    },

    async pollJob(jobId, type, headers, baseUrl, transport, chatId) {
        let attempts = 0;
        const maxAttempts = 30; // 5 mins max

        while (attempts < maxAttempts) {
            attempts++;
            await new Promise(r => setTimeout(r, 10000));

            console.log(`[CrawlFire] ⏳ Polling ${type} job ${jobId} (attente ${attempts})`);
            const res = await fetch(`${baseUrl}/${type}/${jobId}`, { headers });
            const json = await res.json();

            if (json.status === 'completed') {
                if (type === 'crawl') {
                    const count = json.data?.length || 0;
                    const summary = json.data?.slice(0, 3).map(d => `#### ${d.metadata.title || d.metadata.sourceURL}\n${d.markdown.substring(0, 500)}...`).join('\n\n');
                    return { success: true, message: `✅ Crawl terminé (${count} pages).\n\n${summary}\n\n[ID de job: ${jobId}]` };
                } else {
                    return { success: true, message: `✅ Extraction terminée :\n\n\`\`\`json\n${JSON.stringify(json.data, null, 2)}\n\`\`\`` };
                }
            }

            if (json.status === 'failed') {
                throw new Error(`${type} job failed: ${json.error || 'Unknown error'}`);
            }

            if (attempts % 6 === 0 && transport) {
                await transport.sendText(chatId, `⏳ Toujours en cours (${type})...`);
            }
        }

        return { success: false, message: `⌛ L'opération ${type} prend trop de temps. Job ID: ${jobId}` };
    }
};
