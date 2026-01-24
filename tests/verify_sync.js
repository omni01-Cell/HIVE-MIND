
import 'dotenv/config';

async function verifySync() {
    console.log('START: Script initialized.');

    try {
        console.log('IMPORT: Importing Supabase...');
        const { createClient } = await import('@supabase/supabase-js');

        console.log('IMPORT: Importing PluginLoader...');
        const { pluginLoader } = await import('../plugins/loader.js');

        console.log('INIT: Checking Env...');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
            return;
        }

        console.log('INIT: Creating Supabase Client...');
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false } // Optimization for server-side
        });

        console.log('ACTION: Loading plugins...');
        await pluginLoader.loadAll();
        const tools = pluginLoader.getToolDefinitions();
        console.log(`✅ Loaded ${tools.length} existing tools.`);

        console.log('ACTION: Checking sync status...');
        const status = await pluginLoader.checkSyncStatus(supabase);

        console.log('\n📊 Sync Status Report:');
        console.log(`   - 🗑️  Deleted: ${status.deleted}`);
        console.log(`   - 🆕 New: ${status.new}`);
        console.log(`   - 📝 Modified: ${status.modified}`);

    } catch (error) {
        console.error('❌ Verification failed:', error);
    }

    console.log('END: Script finished.');
    process.exit(0);
}

verifySync();
