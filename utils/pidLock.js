import fs from 'fs';
import path from 'path';

const PID_FILE = path.join(process.cwd(), '.hive-mind.pid');

/**
 * Acquires a PID lock to prevent multiple instances from running.
 * @returns {void}
 * @throws {Error} If another instance is already running.
 */
export function acquireLock() {
    if (fs.existsSync(PID_FILE)) {
        let oldPid;
        try {
            oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
        } catch (e) {
            // If file exists but is unreadable, we'll try to overwrite it
        }

        if (oldPid) {
            // Check if the process is actually running
            try {
                // Signal 0 doesn't kill the process, but checks if it exists
                process.kill(oldPid, 0);
                console.error(`\x1b[31m[CRITICAL] Another instance of HIVE-MIND is already running (PID: ${oldPid}).\x1b[0m`);
                console.error(`\x1b[31m[CRITICAL] Starting a second instance would cause WhatsApp session conflicts.\x1b[0m`);
                process.exit(1);
            } catch (e) {
                // ESRCH means the process was not found, so the PID file is stale
                if (e.code !== 'ESRCH') {
                    throw e;
                }
                console.log(`[Startup] Found stale PID file (PID: ${oldPid}). Cleaning up...`);
            }
        }
    }
    
    fs.writeFileSync(PID_FILE, process.pid.toString());
}

/**
 * Releases the PID lock by deleting the .pid file.
 */
export function releaseLock() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const content = fs.readFileSync(PID_FILE, 'utf8');
            const currentPid = parseInt(content);
            if (currentPid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (e) {
        // Silently fail during exit
    }
}

/**
 * Checks if a lock exists and is valid.
 * @returns {boolean}
 */
export function isLocked() {
    if (!fs.existsSync(PID_FILE)) return false;
    try {
        const content = fs.readFileSync(PID_FILE, 'utf8');
        const oldPid = parseInt(content);
        process.kill(oldPid, 0);
        return true;
    } catch (e) {
        return false;
    }
}
