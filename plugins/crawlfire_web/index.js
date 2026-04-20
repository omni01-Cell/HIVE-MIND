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
                description: 'Scrape une URL unique pour obtenir son contenu en Markdown propre (max 25k caractères). Idéal pour lire un article, une documentation spécifique ou le contenu complet d\'une page web.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'L\'URL exacte à scraper' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_crawl',
                description: 'Crawl un site web complet à partir d\'une URL de base pour extraire en masse le contenu de toutes ses sous-pages liées (concaténé jusqu\'à 30k caractères). Très utile pour "ingurgiter" tout un centre d\'aide ou un petit site web.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL de base du site à crawler' },
                        limit: { type: 'integer', description: 'Nombre max de sous-pages à crawler (défaut 10)' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_map',
                description: 'Obtient le plan structurel d\'un site web sous forme de liste des URLs existantes (limité aux 100 premiers liens). Utile si tu cherches une page précise (ex: contact, tarifs) mais que tu ne connais pas son URL exacte.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL de base du site à mapper' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_search',
                description: 'Recherche votre requête sur le web (type moteur de recherche) et scrape automatiquement les meilleurs résultats sous forme de Markdown. Le meilleur outil pour s\'informer sur l\'actualité récente ou un sujet général.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'La requête de recherche sur Internet (ex: "Actualités IA 2026")' },
                        limit: { type: 'integer', description: 'Nombre de résultats web à scraper (défaut 3)' }
                    },
                    required: ['query']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'firecrawl_extract',
                description: 'Scrape une ou plusieurs URLs et en extrait intelligemment uniquement les données précises demandées dans le `prompt`, renvoyées sous un format structuré (JSON).',
                parameters: {
                    type: 'object',
                    properties: {
                        urls: { type: 'array', items: { type: 'string' }, description: 'Liste des URLs sources (supporte les wildcards comme /*)' },
                        prompt: { type: 'string', description: 'Description claire et explicite des données exactes que tu veux extraire (ex: "Extrait le prix, la surface et la ville")' }
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

    async apiFetch(url, options) {
        const res = await fetch(url, options);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error(`Erreur API: réponse non-JSON (Status ${res.status}). Service potentiellement indisponible.`);
        }
        return await res.json();
    },

    async handleScrape(url, headers, baseUrl) {
        console.log(`[CrawlFire] 📄 Scraping: ${url}`);
        const json = await this.apiFetch(`${baseUrl}/scrape`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url, formats: ["markdown"] })
        });
        if (!json.success) throw new Error(json.error || "Échec du scraping");
        
        const markdown = json.data.markdown || "";
        const truncated = markdown.length > 25000 ? markdown.substring(0, 25000) + "\n\n[...Contenu tronqué car trop long...]" : markdown;
        return { success: true, message: truncated };
    },

    async handleCrawl(url, limit, headers, baseUrl, transport, chatId) {
        console.log(`[CrawlFire] 🕸️ Crawling: ${url} (limit: ${limit})`);
        if (transport) await transport.sendText(chatId, `🕸️ Début du crawl sur ${url}...`);

        const startJson = await this.apiFetch(`${baseUrl}/crawl`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url, limit })
        });
        if (!startJson.success) throw new Error(startJson.error || "Échec du démarrage du crawl");

        const jobId = startJson.id;
        return await this.pollJob(jobId, 'crawl', headers, baseUrl, transport, chatId);
    },

    async handleMap(url, headers, baseUrl) {
        console.log(`[CrawlFire] 🗺️ Mapping: ${url}`);
        const json = await this.apiFetch(`${baseUrl}/map`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url })
        });
        if (!json.success) throw new Error(json.error || "Échec du mapping");
        
        const maxLinks = 100;
        const total = json.links?.length || 0;
        let linksDisp = json.links || [];
        if (linksDisp.length > maxLinks) {
            linksDisp = linksDisp.slice(0, maxLinks);
        }
        
        const linksTxt = linksDisp.map(l => `- ${l.url} (${l.title || 'sans titre'})`).join('\n');
        let msg = `🗺️ Plan du site ${url} (${total} liens trouvés) :\n\n${linksTxt}`;
        if (total > maxLinks) {
            msg += `\n\n[... ${total - maxLinks} autres liens non affichés car la liste est trop longue ...]`;
        }
        return { success: true, message: msg };
    },

    async handleSearch(query, limit, headers, baseUrl) {
        console.log(`[CrawlFire] 🔍 Searching: ${query}`);
        const json = await this.apiFetch(`${baseUrl}/search`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } })
        });
        if (!json.success) throw new Error(json.error || "Échec de la recherche");

        const results = json.data.map(d => {
            let md = d.markdown || 'Pas de contenu markdown';
            if (md.length > 5000) md = md.substring(0, 5000) + "...";
            return `### ${d.title}\nURL: ${d.url}\n\n${md}\n---`;
        }).join('\n\n');
        return { success: true, message: `🔍 Résultats Firecrawl pour "${query}" :\n\n${results}` };
    },

    async handleExtract(urls, prompt, headers, baseUrl, transport, chatId) {
        console.log(`[CrawlFire] 🧪 Extracting from ${urls?.length} URLs`);
        if (transport) await transport.sendText(chatId, `🧪 Extraction de données structurées en cours...`);

        const json = await this.apiFetch(`${baseUrl}/extract`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ urls, prompt })
        });
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
            const json = await this.apiFetch(`${baseUrl}/${type}/${jobId}`, { headers });

            if (json.status === 'completed') {
                if (type === 'crawl') {
                    const count = json.data?.length || 0;
                    let combinedMarkdown = json.data?.map(d => `#### ${d.metadata?.title || d.metadata?.sourceURL}\n${d.markdown || ''}`).join('\n\n---\n\n') || '';
                    if (combinedMarkdown.length > 30000) {
                        combinedMarkdown = combinedMarkdown.substring(0, 30000) + "\n\n[...Contenu tronqué car trop long...]";
                    }
                    return { success: true, message: `✅ Crawl terminé (${count} pages trouvées).\n\n${combinedMarkdown}\n\n[ID de job: ${jobId}]` };
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
