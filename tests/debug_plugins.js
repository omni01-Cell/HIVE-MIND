
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const plugins = [
    'admin', 'crawlfire_web', 'daily_pulse', 'deep_research', 'dev_tools',
    'duckduck_search', 'goals', 'memory',
    'shopping', 'sticker', 'sys_interaction', 'system', 'translate',
    'tts', 'visual_reporter', 'wikipedia'
];

async function testPlugins() {
    console.log('START: Testing plugin imports...');
    for (const name of plugins) {
        process.stdout.write(`Loading ${name}... `);
        try {
            const path = `../plugins/${name}/index.js`;
            await import(path);
            console.log('OK');
        } catch (e) {
            console.log('FAIL');
            console.error(e);
        }
    }
    console.log('DONE');
    process.exit(0);
}

testPlugins();
