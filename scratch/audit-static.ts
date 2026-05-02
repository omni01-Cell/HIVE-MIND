import fs from 'fs';
import path from 'path';

const pluginsDir = path.join(process.cwd(), 'plugins');

function validatePlugin(plugin: any, name: string) {
    const required = ['name', 'description', 'version', 'execute'];
    for (const prop of required) {
        if (!plugin[prop]) {
            throw new Error(`Missing property: ${prop}`);
        }
    }
    if (typeof plugin.execute !== 'function') {
        throw new Error(`'execute' must be a function`);
    }
}

async function run() {
    const categories = fs.readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const cat of categories) {
        const catPath = path.join(pluginsDir, cat.name);
        const plugins = fs.readdirSync(catPath, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const p of plugins) {
            const pluginPath = path.join(catPath, p.name, 'index.ts');
            if (fs.existsSync(pluginPath)) {
                try {
                    console.log(`Loading ${cat.name}/${p.name}...`);
                    const module = await import(pluginPath);
                    const plugin = module.default || module;
                    validatePlugin(plugin, p.name);
                    console.log(`✅ [OK] ${cat.name}/${p.name}`);
                } catch (e: any) {
                    console.log(`❌ [FAIL] ${cat.name}/${p.name} - ${e.message}`);
                }
            } else {
                console.log(`⚠️ [WARN] ${cat.name}/${p.name} - No index.ts`);
            }
        }
    }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
