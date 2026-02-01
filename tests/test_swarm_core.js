// tests/test_swarm_core.js
import swarm from '../core/concurrency/SwarmDispatcher.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    console.log('🧪 Starting Swarm Core Test');

    // Mock Concurrency Limit pour le test
    swarm.getMaxConcurrency = () => 2;
    console.log('⚡ Concurrency mocked to 2');

    const tasks = [];
    // Scenario: 5 tâches indépendantes (JIDs différents)
    // Devrait traiter 2 par 2
    for (let i = 1; i <= 5; i++) {
        const id = `Task_${i}`;
        tasks.push(swarm.dispatch(`JID_${i}`, { id, content: 'standard' }, async () => {
            console.log(`   Worker ${id} starting...`);
            await sleep(500); // 500ms
            console.log(`   Worker ${id} DONE`);
            return id;
        }));
    }

    // Task 6: PRIORITAIRE (FastPath)
    // On attend un peu pour que la file soit pleine (tasks 3, 4, 5 throttled)
    await sleep(50);
    console.log('⚡ Injecting HIGH PRIORITY task');
    // Note: signature has changed to dispatch(jid, messageObj, factory)
    // We mock messageObj as { id: 'PRIO', content: '!ping' }
    tasks.push(swarm.dispatch('JID_PRIO', { id: 'PRIO', content: '!ping' }, async () => {
        console.log('   🚀 PRIORITY Worker executing...');
        await sleep(100);
        console.log('   🚀 PRIORITY Worker DONE');
        return 'PRIO';
    }));

    await Promise.all(tasks);
    console.log('🧪 Test Finished');
    console.log('Metrics:', swarm.getMetrics());
}

runTest().catch(console.error);
