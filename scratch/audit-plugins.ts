import { pluginLoader } from '../plugins/loader.js';

async function auditPlugins() {
    console.log('Auditing plugins...');
    await pluginLoader.loadAll();
    
    const loaded = pluginLoader.list();
    console.log(`Successfully loaded: ${loaded.length} plugins`);
    loaded.forEach(p => console.log(` - ${p.name} v${p.version}`));

    if (pluginLoader._loadErrors && pluginLoader._loadErrors.length > 0) {
        console.error(`\nFailed to load: ${pluginLoader._loadErrors.length} plugins`);
        pluginLoader._loadErrors.forEach(err => console.error(` - ${err.name}: ${err.error}`));
    }

    const tools = pluginLoader.getToolDefinitions();
    console.log(`\nTotal tools exposed: ${tools.length}`);
    tools.forEach((t: any) => console.log(` - ${t.function?.name}`));
}

auditPlugins().catch(console.error);
