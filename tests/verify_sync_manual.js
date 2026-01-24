
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pluginLoader } from '../plugins/loader.js';

async function verifySync() {
    console.log('🔍 Starting Plugin Sync Verification...');

    // 1. Initialize Supabase Client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for admin rights (deletion)

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized.');

    try {
        // 2. Load Plugins
        console.log('📦 Loading plugins...');
        await pluginLoader.loadAll();
        const tools = pluginLoader.getToolDefinitions();
        console.log(`✅ Loaded ${tools.length} existing tools.`);

        // 3. Check Sync Status
        console.log('🔄 Checking sync status...');
        const status = await pluginLoader.checkSyncStatus(supabase);

        console.log('\n📊 Sync Status Report:');
        console.log(`   - 🗑️  Deleted (Obsolete): ${status.deleted}`);
        console.log(`   - 🆕 New: ${status.new}`);
        console.log(`   - 📝 Modified: ${status.modified}`);

        if (status.new > 0 || status.modified > 0) {
            console.log('\n💡 Recommendation: Run "npm run cli tools:index" to update embeddings.');
        } else {
            console.log('\n✅ System is in sync.');
        }

    } catch (error) {
        console.error('❌ Verification failed:', error);
    }
}

verifySync();
