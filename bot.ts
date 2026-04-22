// bot.js
// Point d'entrée principal du Bot WhatsApp V2

import 'dotenv/config';
import { acquireLock, releaseLock } from './utils/pidLock.js';
import { botCore } from './core/index.js';
import { userService } from './services/userService.js';
import { eventBus } from './core/events.js';

import { StateManager } from './services/state/StateManager.js';

// Verrouillage PID immédiat
acquireLock();

/**
 * Point d'entrée principal

 * Lance le bot et gère les erreurs globales
 */
async function main() {
    try {
        // Initialiser le bot (avec affichage ASCII)
        await botCore.init();

        // Worker Loop: Sync DB toutes les 30s (silencieux)
        setInterval(() => {
            StateManager.processSyncQueue().catch(() => { });
        }, 30000);

    } catch (error: any) {
        console.error('❌ Erreur fatale:', error);
        process.exit(1);
    }
}

// Gestion des erreurs non capturées
process.on('uncaughtException', (error: any) => {
    console.error('❌ Exception non capturée:', error);
});

process.on('unhandledRejection', (reason: any) => {
    console.error('❌ Promesse rejetée:', reason);
});

// Gestion de l'arrêt propre avec synchronisation des buffers
process.on('SIGINT', async () => {
    console.log('\n👋 Arrêt du bot (SIGINT)...');
    
    // Protection contre les blocages lors de l'arrêt
    const forceExitTimeout = setTimeout(() => {
        console.warn('⚠️ Shutdown timeout reached. Force exiting...');
        process.exit(1);
    }, 5000);

    try {
        console.log('💾 Synchronisation des buffers...');
        await userService.flushAll();
        
        console.log('🔌 Fermeture de la connexion WhatsApp...');
        await botCore.transport.disconnect();
        
        console.log('✅ Nettoyage terminé. Au revoir !');
        eventBus.removeAllListeners();
        releaseLock();
        clearTimeout(forceExitTimeout);
        process.exit(0);
    } catch (err: any) {
        console.error('❌ Erreur pendant le shutdown:', err.message);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Arrêt du bot (SIGTERM)...');
    try {
        await userService.flushAll();
        await botCore.transport.disconnect();
        eventBus.removeAllListeners();
        releaseLock();
        process.exit(0);
    } catch (err: any) {
        process.exit(1);
    }
});

process.on('exit', () => {
    eventBus.removeAllListeners();
    releaseLock();
});


// Démarrage
main();

