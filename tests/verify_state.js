// tests/verify_state.js
import { StateManager } from '../services/state/StateManager.js';
import { IdentityMap } from '../services/state/IdentityMap.js';
import { LockManager } from '../services/state/LockManager.js';
import { redis } from '../services/redisClient.js';
import { delay } from '../utils/helpers.js'; // Assuming this exists or I'll stub it

const stubDelay = (ms) => new Promise(res => setTimeout(res, ms));

async function runTest() {
    console.log('🧪 Starting State Layer Verification...');

    if (!redis.isOpen) {
        console.log('Waiting for Redis...');
        await stubDelay(1000);
    }

    try {
        // 1. Test LockManager
        console.log('\n🔒 Testing LockManager...');
        const lock = new LockManager('test');
        const key = 'resource-1';

        const lock1 = await lock.acquire(key);
        console.log('Lock 1 acquired:', lock1 ? '✅' : '❌');

        const lock2 = await lock.acquire(key);
        console.log('Lock 2 (concurrent) failed as expected:', lock2 === null ? '✅' : '❌');

        await lock.release(key, lock1);
        console.log('Lock 1 released');

        const lock3 = await lock.acquire(key);
        console.log('Lock 3 (re-acquire) success:', lock3 ? '✅' : '❌');
        await lock.release(key, lock3);


        // 2. Test IdentityMap
        console.log('\n🆔 Testing IdentityMap...');
        const jid = '123456789@s.whatsapp.net';
        const lid = '987654321@lid';

        await IdentityMap.register(jid, lid);
        console.log('Registered LID mapping');

        const resolved = await IdentityMap.resolve(lid);
        console.log(`Resolved ${lid} -> ${resolved}`);
        console.log('Resolution correct:', resolved === jid ? '✅' : '❌');


        // 3. Test StateManager
        console.log('\n💾 Testing StateManager...');
        const testUser = '555555555@s.whatsapp.net';

        console.log('Updating interaction...');
        await StateManager.updateUserInteraction(testUser, 'Test User 1');
        await StateManager.updateUserInteraction(testUser, 'Test User 1'); // Incr again

        const user = await StateManager.getUser(testUser);
        console.log('Fetched User:', user);
        console.log('Interaction count >= 2:', user.interaction_count >= 2 ? '✅' : '❌');

        // Verify Sync Queue
        const queueSize = await redis.sCard('queue:sync:users');
        console.log('Sync Queue Size:', queueSize);
        console.log('Queue has items:', queueSize > 0 ? '✅' : '❌');

        // Process Queue (Mock Supabase will be called if configured, or it will just clear redis queue if fails silently or logs error)
        // Note: processSyncQueue logs errors but doesn't throw usually.
        await StateManager.processSyncQueue();
        console.log('Queue processed.');

        const queueSizeAfter = await redis.sCard('queue:sync:users');
        console.log('Sync Queue Size after process:', queueSizeAfter);
        console.log('Queue empty (or retried):', queueSizeAfter === 0 ? '✅' : '⚠️ (Might remain if DB fail)');

    } catch (e) {
        console.error('❌ Test Failed:', e);
    } finally {
        await redis.quit();
        process.exit(0);
    }
}

runTest();
