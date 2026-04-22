/**
 * services/cleanup.ts
 * Service de nettoyage des fichiers temporaires
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Service pour nettoyer périodiquement le dossier temp
 */
export class CleanupService {
  private tempDir: string;
  private thresholdMs: number;

  constructor() {
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.thresholdMs = 60 * 60 * 1000; // 1 Heure
  }

  /**
   * Lance le processus de nettoyage
   */
  public async run(): Promise<void> {
    console.log('[Cleanup] 🧹 Démarrage du nettoyage temp...');
    if (!fs.existsSync(this.tempDir)) return;

    try {
      const now = Date.now();
      this._cleanRecursive(this.tempDir, now);
    } catch (error: any) {
      console.error('[Cleanup] Erreur:', error.message);
    }
  }

  /**
   * Parcours récursif pour supprimer les fichiers expirés
   */
  private _cleanRecursive(directory: string, now: number): void {
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
            } catch (e: any) {
              console.warn(`[Cleanup] Echec suppression ${file}: ${e.message}`);
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Cleanup] Erreur lecture dossier ${directory}: ${e.message}`);
    }
  }
}
