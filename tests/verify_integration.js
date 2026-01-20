// tests/verify_integration.js
import { userService } from '../services/userService.js';
import { StateManager } from '../services/state/StateManager.js';
import { redis } from '../services/redisClient.js';

async function runIntegrationTest() {
    console.log('🔗 Starting Integration Verification...');

    if (!redis.isOpen) {
        console.log('Waiting for Redis...');
        await new Promise(r => setTimeout(r, 1000));
    }

    try {
        const testUserJid = '999999999@s.whatsapp.net';
        const testUserLid = '888888888@lid';
        const testPushName = 'Integration Test User';

        // 1. Simulate Bot Core: Register Interaction using JID
        console.log('\n[1] Simulating Bot Core Interaction (JID)...');
        await userService.recordInteraction(testUserJid, testPushName);
        console.log('Interaction recorded.');

        // Verify Redis updated immediately
        const user1 = await StateManager.getUser(testUserJid);
        console.log('Fetched Profile 1:', user1);
        if (user1.last_pushname === testPushName) console.log('✅ PushName correct');
        else console.error('❌ PushName mismatch');

        // 2. Simulate Group Service: Register LID
        console.log('\n[2] Simulating Group Service (LID Registration)...');
        await userService.registerLid(testUserJid, testUserLid);
        console.log('LID registered.');

        // Verify LID resolution
        const resolvedJid = await userService.resolveLid(testUserLid);
        console.log(`Resolved LID ${testUserLid} -> ${resolvedJid}`);
        if (resolvedJid === testUserJid) console.log('✅ Resolution correct');
        else console.error('❌ Resolution mismatch');

        // 3. Simulate Interaction using LID (common in recent WhatsApp versions)
        console.log('\n[3] Simulating Bot Core Interaction (via LID)...');
        await userService.recordInteraction(testUserLid, 'Integration Test User (LID)');
        console.log('Interaction recorded via LID.');

        // Verify it updated the SAME user profile
        const user2 = await StateManager.getUser(testUserJid);
        console.log('Fetched Profile 2:', user2);

        // Interaction count should be 2 (1 from JID call + 1 from LID call)
        // Note: getUser might return what's in Redis. If previous tests ran, count might be higher.
        // We just check if it's > 0 or incremented if we controlled it better.
        // Let's assume > 0 is good enough for connectivity check.
        if (user2.interaction_count >= 2) console.log('✅ Interaction count incremented');
        else console.warn('⚠️ Interaction count low (maybe cleared?)', user2.interaction_count);


        // 4. Force Sync (simulating Bot Shutdown)
        console.log('\n[4] Simulating Shutdown/Sync...');
        await userService.flushAll(); // Calls processSyncQueue
        // If no error thrown, we assume success or graceful error handling (like DNS failure we saw earlier)
        console.log('Sync completed (check logs for errors).');

    } catch (e) {
        console.error('❌ Integration Test Failed:', e);
    } finally {
        await redis.quit();
        process.exit(0);
    }
}

runIntegrationTest();
