
// scripts/test_models.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { providerRouter } from '../providers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Charger la config pour avoir le détail des modèles (types)
const modelsConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'models_config.json'), 'utf-8')
);

async function runTests() {
    console.log('🔍 [Diagnostic] Démarrage du test COMPLET des modèles...\n');

    const families = providerRouter.listFamilies();
    const results = [];

    for (const familyInfo of families) {
        if (!familyInfo.hasApiKey) {
            console.log(`⚪ [${familyInfo.id}] Ignoré (Pas de clé API valide)`);
            continue;
        }

        // Récupérer la config complète de cette famille
        const familyConfig = modelsConfig.familles[familyInfo.id];
        if (!familyConfig || !familyConfig.modeles) continue;

        // Filtrer uniquement les modèles de type 'chat'
        const chatModels = familyConfig.modeles.filter(m => m.types?.includes('chat'));

        if (chatModels.length === 0) {
            console.log(`⚪ [${familyInfo.id}] Aucun modèle de type 'chat' à tester.`);
            continue;
        }

        for (const model of chatModels) {
            console.log(`🚀 [${familyInfo.id}] Test du modèle: ${model.id}...`);
            try {
                const response = await providerRouter.chat([
                    { role: 'user', content: 'Réponds uniquement par "OK" si tu reçois ce message.' }
                ], {
                    family: familyInfo.id,
                    model: model.id,
                    maxTokens: 10
                });

                const content = response.content?.trim() || '';
                if (content.toUpperCase().includes('OK') || content.length > 0) {
                    console.log(`✅ [${familyInfo.id}] ${model.id}: Succès !`);
                    results.push({ family: familyInfo.id, model: model.id, status: 'SUCCESS' });
                } else {
                    console.warn(`⚠️  [${familyInfo.id}] ${model.id}: Réponse vide`);
                    results.push({ family: familyInfo.id, model: model.id, status: 'WARNING', error: 'Empty response' });
                }
            } catch (error) {
                console.error(`❌ [${familyInfo.id}] ${model.id}: Échec: ${error.message}`);
                results.push({ family: familyInfo.id, model: model.id, status: 'FAILED', error: error.message });
            }
        }
    }

    // Affichage du résumé
    console.log('\n======================================================================');
    console.log('📊 RÉSUMÉ DES TESTS COMPLETS');
    console.log('======================================================================');
    console.log(`${'FAMILLE'.padEnd(12)} | ${'MODÈLE'.padEnd(30)} | ${'STATUT'.padEnd(10)} | ${'MESSAGE'}`);
    console.log('----------------------------------------------------------------------');

    results.forEach(r => {
        const icon = r.status === 'SUCCESS' ? '✅' : (r.status === 'WARNING' ? '⚠️ ' : '❌');
        console.log(`${icon} ${r.family.padEnd(10)} | ${r.model.padEnd(30)} | ${r.status.padEnd(10)} | ${r.error || 'OK'}`);
    });
    console.log('======================================================================\n');

    process.exit(0);
}

runTests().catch(err => {
    console.error('Erreur fatale lors du test:', err);
    process.exit(1);
});
