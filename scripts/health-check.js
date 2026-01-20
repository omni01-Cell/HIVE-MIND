
// scripts/health-check.js
import { ServiceContainer } from '../core/ServiceContainer.js';
import { providerRouter } from '../providers/index.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runHealthCheck() {
    console.log('🏥 Lancement du Diagnostic Système Complet (V3/V4)...\n');
    const report = {
        config: {},
        credentials: {},
        services: {},
        providers: {},
        infrastructure: {}
    };

    // 1. CONFIGURATION
    console.log('--- 1. Configuration & Credentials ---');
    try {
        const modelsConfig = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'models_config.json')));
        const credentials = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'credentials.json')));

        report.config.status = '✅ Loaded';
        report.config.providers_defined = Object.keys(modelsConfig.familles).join(', ');

        const keys = credentials.familles_ia || {};
        const maskedKeys = {};
        for (const [k, v] of Object.entries(keys)) {
            maskedKeys[k] = v && v.length > 10 && !v.startsWith('VOTRE') ? '✅ Present' : '❌ Missing/Placeholder';
        }
        report.credentials = maskedKeys;
        console.table(maskedKeys);
    } catch (e) {
        console.error('❌ Config Error:', e.message);
        process.exit(1);
    }

    // 2. SERVICES (Container)
    console.log('\n--- 2. Services Initialization ---');
    const container = new ServiceContainer();
    try {
        await container.init();
        report.services.supabase = container.has('supabase') ? '✅ Ready' : '❌ Failed';
        report.services.memory = container.has('memory') ? '✅ Ready' : '❌ Failed';
        report.services.quota = container.has('quotaManager') ? '✅ Ready' : '❌ Failed';
        report.services.voice = container.has('voiceService') ? '✅ Ready' : '❌ Failed';
        report.services.transcription = container.has('transcriptionService') ? '✅ Ready' : '❌ Failed';

        // PING Supabase
        const supabase = container.get('supabase');
        const { data, error } = await supabase.from('logs').select('count').limit(1);
        report.infrastructure.supabase_ping = error ? `❌ Error: ${error.message}` : '✅ Connected';

    } catch (e) {
        console.error('❌ Service Init Error:', e.message);
    }
    console.table(report.services);

    // 3. PROVIDERS (Connectivity)
    console.log('\n--- 3. AI Providers Connectivity ---');

    // Attendre le chargement des adaptateurs (async)
    console.log('⏳ Waiting for adapters to load...');
    await new Promise(r => setTimeout(r, 2000));

    const providersToTest = ['mistral', 'github', 'groq']; // Focus on new ones
    for (const p of providersToTest) {
        try {
            const res = await providerRouter.chat(
                [{ role: 'user', content: 'Ping' }],
                { family: p, model: null }
            );
            report.providers[p] = res.content ? '✅ OK' : '⚠️ No Content';
        } catch (e) {
            report.providers[p] = `❌ Failed: ${e.message.slice(0, 50)}...`;
        }
    }
    console.table(report.providers);

    // 4. SUMMARY
    console.log('\n--- 🏁 DIAGNOSTIC SUMMARY 🏁 ---');
    console.log(JSON.stringify(report, null, 2));
}

runHealthCheck();
