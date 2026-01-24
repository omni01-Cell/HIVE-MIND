import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { acquireLock, releaseLock, isLocked } from '../../../utils/pidLock.js';

const PID_FILE = path.join(process.cwd(), '.hive-mind.pid');

test('PID Lock Utility', async (t) => {
    // Cleanup before test
    if (fs.existsSync(PID_FILE)) {
        try {
            fs.unlinkSync(PID_FILE);
        } catch (e) {}
    }

    await t.test('should acquire lock when no lock exists', () => {
        acquireLock();
        assert.strictEqual(fs.existsSync(PID_FILE), true);
        assert.strictEqual(parseInt(fs.readFileSync(PID_FILE, 'utf8')), process.pid);
    });

    await t.test('isLocked should return true if locked', () => {
        assert.strictEqual(isLocked(), true);
    });

    await t.test('releaseLock should remove the pid file', () => {
        releaseLock();
        assert.strictEqual(fs.existsSync(PID_FILE), false);
    });

    await t.test('isLocked should return false if not locked', () => {
        assert.strictEqual(isLocked(), false);
    });

    await t.test('acquireLock should handle stale pid files', () => {
        // Create a fake stale PID file with a PID that is likely not running
        // On most systems, very high PIDs are not in use
        const stalePid = '99999'; 
        fs.writeFileSync(PID_FILE, stalePid);
        
        // This should not exit the process because stalePid is not running
        // It should log "Found stale PID file" and overwrite it
        acquireLock();
        assert.strictEqual(parseInt(fs.readFileSync(PID_FILE, 'utf8')), process.pid);
        releaseLock();
    });
});
