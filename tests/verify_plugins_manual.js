import 'dotenv/config';
import duckPlug from '../plugins/duckduck_search/index.js';
import firePlug from '../plugins/crawlfire_web/index.js';
import { container } from '../core/container.js';

// Configuration minimale pour le test
container.register('config', {
    plugins: {
        crawlfire_web: {
            apiKey: process.env.FIRECRAWL_API_KEY
        }
    }
});

async function runTests() {
    console.log("=== Début des tests des plugins ===");

    // 1. Test DuckDuckSearch (rapide)
    console.log("\n--- Test DuckDuckSearch ---");
    if (duckPlug.name === 'duckduck_search') console.log("✅ Nom du plugin: OK");

    // 2. Test CrawlFire avec Clé API
    console.log("\n--- Test CrawlFire ---");
    console.log("Nom du plugin:", firePlug.name);

    // Injection d'un transport mocké pour éviter les erreurs
    const context = {
        chatId: 'test-user',
        transport: {
            sendText: (id, msg) => console.log(`[Transport Mock] ${msg}`)
        }
    };

    console.log("Tentative de CrawlFire Map sur firecrawl.dev...");
    try {
        const result = await firePlug.execute({ url: 'https://firecrawl.dev' }, context, 'firecrawl_map');

        if (result.success) {
            console.log("✅ SUCCÈS ! Réponse de l'API reçue.");
            console.log("Aperçu:", result.message.substring(0, 100).replace(/\n/g, ' ') + "...");
        } else {
            console.error("❌ ÉCHEC:", result.message);
        }
    } catch (e) {
        console.error("❌ CRASH:", e.message);
    }

    console.log("\n=== Fin des tests ===");
    process.exit(0);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
