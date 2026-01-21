// test/live_mention_test.js
// Test en production pour vérifier que les mentions/tags fonctionnent vraiment dans WhatsApp

/**
 * INSTRUCTIONS POUR TESTER EN PRODUCTION:
 * 
 * 1. Assurez-vous que le bot est connecté à WhatsApp
 * 2. Envoyez un message dans un groupe de test avec :
 *    "Test @[Prénom d'un membre]"
 * 
 * 3. Vérifiez que :
 *    ✅ La mention est cliquable (lien bleu)
 *    ✅ L'utilisateur mentionné reçoit une notification
 *    ✅ Le nom s'affiche correctement
 * 
 * 4. Testez aussi avec des diminutifs :
 *    "@Seb" pour "Sébastien"
 *    "@Alex" pour "Alexandre"
 * 
 * Le bot devrait automatiquement résoudre via fuzzy matching !
 */

// Si vous voulez tester manuellement via code:
import { baileysTransport } from '../core/transport/baileys.js';

async function testMentionInProduction() {
    // CHANGEZ CES VALEURS
    const TEST_GROUP_JID = '120363123456789@g.us'; // Remplacer par votre groupe de test
    const TEST_MESSAGE = 'Test @Jordan, tu reçois la notification ?';

    try {
        console.log('📨 Envoi du message de test avec mention...');

        await baileysTransport.sendText(TEST_GROUP_JID, TEST_MESSAGE);

        console.log('✅ Message envoyé !');
        console.log('🔍 Vérifiez dans WhatsApp :');
        console.log('   1. La mention est-elle cliquable ?');
        console.log('   2. L\'utilisateur a-t-il reçu une notification ?');
        console.log('   3. Le nom s\'affiche-t-il correctement ?');

    } catch (error) {
        console.error('❌ Erreur:', error.message);
    }
}

// Pour lancer le test, décommentez cette ligne et remplacez le JID du groupe
// testMentionInProduction();

console.log('ℹ️  Pour tester, éditez ce fichier et configurez TEST_GROUP_JID');
