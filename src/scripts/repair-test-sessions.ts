import { existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

const sessions = ['./session_test_admin', './session_test_user'];

sessions.forEach(sessionDir => {
    const dir = join(process.cwd(), sessionDir);
    console.log(`🔧 [Repair] Repairing ${sessionDir}...`);

    if (!existsSync(dir)) {
        console.warn(`⚠️ ${sessionDir} not found.`);
        return;
    }

    const files = readdirSync(dir);
    let cleanedCount = 0;

    files.forEach(file => {
        if (file === 'creds.json') return;
        const filePath = join(dir, file);
        try {
            if (statSync(filePath).isFile()) {
                unlinkSync(filePath);
                cleanedCount++;
            }
        } catch (e: any) {
            console.warn(`⚠️ Failed to delete ${file}: ${e.message}`);
        }
    });

    console.log(`✅ ${sessionDir} repaired. ${cleanedCount} cache files removed.`);
});
