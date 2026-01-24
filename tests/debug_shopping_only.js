
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

async function testShopping() {
    console.log('START: Testing shopping plugin import...');
    try {
        const path = '../plugins/shopping/index.js';
        console.log('IMPORTING...');
        const mod = await import(path);
        console.log('OK: Loaded', mod.default?.name);
    } catch (e) {
        console.log('FAIL');
        console.error(e);
    }
    console.log('DONE');
    process.exit(0);
}

testShopping();
