
import 'dotenv/config';
console.log('Step 1: Environment check');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Found' : 'Missing');

try {
    console.log('Step 2: Importing PluginLoader...');
    const { pluginLoader } = await import('../plugins/loader.js');
    console.log('Step 3: PluginLoader imported successfully.');

    // Check if we can instantiate it if it wasn't already
    console.log('Step 4: Checking pluginLoader instance:', !!pluginLoader);

} catch (e) {
    console.error('Import failed:', e);
}
