/**
 * utils/pidLock.ts
 * Système de verrouillage par PID pour éviter les instances multiples
 */

import fs from 'fs';
import path from 'path';

const PID_FILE = path.join(process.cwd(), '.hive-mind.pid');

/**
 * Acquiert un verrou PID pour empêcher l'exécution de plusieurs instances
 * @throws {Error} Si une autre instance est déjà en cours.
 */
export function acquireLock(): void {
  if (fs.existsSync(PID_FILE)) {
    let oldPid: number | undefined;
    try {
      oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    } catch (e) {
      // Si le fichier existe mais est illisible, on l'écrasera
    }

    if (oldPid) {
      // Vérifier si le processus est réellement en cours
      try {
        // Signal 0 ne tue pas le processus, mais vérifie s'il existe
        process.kill(oldPid, 0);
        console.error(`\x1b[31m[CRITICAL] Another instance of HIVE-MIND is already running (PID: ${oldPid}).\x1b[0m`);
        console.error(`\x1b[31m[CRITICAL] Starting a second instance would cause WhatsApp session conflicts.\x1b[0m`);
        process.exit(1);
      } catch (e: any) {
        // ESRCH signifie que le processus n'a pas été trouvé, donc le fichier PID est obsolète
        // EPERM signifie que le processus existe mais nous n'avons pas la permission de lui envoyer un signal
        if (e.code === 'EPERM') {
          console.error(`\x1b[31m[CRITICAL] Another instance is running (PID: ${oldPid}) but we lack permissions to signal it.\x1b[0m`);
          process.exit(1);
        }
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
 * Libère le verrou PID en supprimant le fichier .pid
 */
export function releaseLock(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const content = fs.readFileSync(PID_FILE, 'utf8');
      const currentPid = parseInt(content);
      if (currentPid === process.pid) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch (e) {
    // Échec silencieux lors de la fermeture
  }
}

/**
 * Vérifie si un verrou existe et est valide
 */
export function isLocked(): boolean {
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

export default {
  acquireLock,
  releaseLock,
  isLocked
};
