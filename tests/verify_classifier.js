// tests/verify_classifier.js
import { providerRouter } from '../providers/index.js';

async function testRouting() {
    console.log('🧪 [Test] Vérification du Classifier Expert...\n');

    const testCases = [
        { query: "Peux-tu m'écrire un script Python pour scraper un site web ?", expected: "code/logic" },
        { query: "Bonjour, ça va ?", expected: "simple/fast" },
        { query: "Écris-moi un poème romantique sur la lune.", expected: "creativity" }
    ];

    for (const test of testCases) {
        console.log(`📝 Test: "${test.query}"`);
        try {
            // On appelle chat sans forcer de famille pour laisser le classifier décider
            // On limite maxTokens pour le test
            const result = await providerRouter.chat([
                { role: 'user', content: test.query }
            ], { maxTokens: 50 });

            console.log(`🎯 Choisi par Router: ${result.usedFamily} (${result.usedModel})`);
            console.log(`--------------------------------------------------`);
        } catch (error) {
            console.error(`❌ Erreur: ${error.message}`);
        }
    }

    process.exit(0);
}

testRouting();
