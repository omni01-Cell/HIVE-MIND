// bot.js
// Point d'entrée principal du Bot WhatsApp V2

import 'dotenv/config';
import { botCore } from './core/index.js';
import { userService } from './services/userService.js';

import { StateManager } from './services/state/StateManager.js';

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

    } catch (error) {
        console.error('❌ Erreur fatale:', error);
        process.exit(1);
    }
}

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('❌ Exception non capturée:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promesse rejetée:', reason);
});

// Gestion de l'arrêt propre avec synchronisation des buffers
process.on('SIGINT', async () => {
    console.log('\n👋 Arrêt du bot...');
    console.log('💾 Synchronisation des buffers...');
    await userService.flushAll(); // Déjà mappé vers StateManager.processSyncQueue
    console.log('✅ Buffers synchronisés. Au revoir !');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Arrêt du bot...');
    console.log('💾 Synchronisation des buffers...');
    await userService.flushAll();
    console.log('✅ Buffers synchronisés. Au revoir !');
    process.exit(0);
});

// Démarrage
main();

