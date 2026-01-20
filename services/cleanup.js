
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CleanupService {
    constructor() {
        // Paths relative to services/
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.thresholdMs = 60 * 60 * 1000; // 1 Hour
    }

    async run() {
        console.log('[Cleanup] 🧹 Démarrage du nettoyage temp...');
        if (!fs.existsSync(this.tempDir)) return;

        try {
            const now = Date.now();
            this._cleanRecursive(this.tempDir, now);
        } catch (error) {
            console.error('[Cleanup] Erreur:', error.message);
        }
    }

    _cleanRecursive(directory, now) {
        try {
            const files = fs.readdirSync(directory);

            for (const file of files) {
                if (file === '.gitkeep') continue;

                const filePath = path.join(directory, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    this._cleanRecursive(filePath, now);
                } else {
                    if (now - stat.mtimeMs > this.thresholdMs) {
                        try {
                            fs.unlinkSync(filePath);
                            // console.log(`[Cleanup] Supprimé: ${file}`);
                        } catch (e) {
                            console.warn(`[Cleanup] Echec suppression ${file}: ${e.message}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`[Cleanup] Erreur lecture dossier ${directory}: ${e.message}`);
        }
    }
}
