
import { container } from './core/ServiceContainer.js';

async function test() {
    try {
        console.log('--- Container Init ---');
        await container.init();
        console.log('--- Container Init DONE ---');

        const db = container.get('supabase');
        console.log('Supabase service:', typeof db);
        console.log('CheckHealth function:', typeof db.checkHealth);
        
        if (typeof db.checkHealth === 'function') {
            const health = await db.checkHealth();
            console.log('Health:', health);
        } else {
            console.error('ERROR: checkHealth is not a function');
            console.log('Available keys:', Object.keys(db));
        }

    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
