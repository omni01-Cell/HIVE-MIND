import { workspaceMemory } from '../services/memory.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    console.log('=== VERIFICATION END-TO-END : AGENT WORKSPACE ===');
    const testChatId = 'test_workspace_user_' + Date.now();
    const testKey = 'plan_test_e2e';
    const testContent = 'Ceci est un document de test de la mémoire épistémique. Il contient un plan détaillé pour vérifier la persistance.';
    const testTags = ['test', 'e2e', 'plan'];

    try {
        console.log(`1. Ecriture (Write) du document [${testKey}]...`);
        const writeSuccess = await workspaceMemory.write(testChatId, testKey, testContent, testTags);
        console.log(`-> Succès: ${writeSuccess}`);
        if (!writeSuccess) throw new Error("Echec de l'écriture");

        console.log(`\n2. Lecture (Read) du document [${testKey}]...`);
        const readDoc = await workspaceMemory.read(testChatId, testKey);
        console.log('-> Résultat:', readDoc);
        if (!readDoc) throw new Error("Echec de la lecture");

        console.log(`\n3. Recherche sémantique (Search) pour "plan"...`);
        const searchResults = await workspaceMemory.search(testChatId, 'plan détaillé', ['test']);
        console.log(`-> Nombre de résultats trouvés: ${searchResults.length}`);
        if (searchResults.length > 0) {
             console.log(`-> Top résultat: [${searchResults[0].key}] Score: ${searchResults[0].similarity}`);
        } else {
             console.log("-> Aucun résultat trouvé (normal si le service d'embeddings n'est pas up ou si le mock est utilisé).");
        }

        console.log(`\n4. Récupération des clés (GetKeys)...`);
        const keys = await workspaceMemory.getKeys(testChatId);
        console.log('-> Clés trouvées:', keys);
        if (keys.length === 0) throw new Error("Aucune clé trouvée alors qu'on vient d'écrire");

        console.log(`\n5. Suppression (Delete) du document [${testKey}]...`);
        const deleteSuccess = await workspaceMemory.delete(testChatId, testKey);
        console.log(`-> Succès: ${deleteSuccess}`);
        if (!deleteSuccess) throw new Error("Echec de la suppression");

        console.log(`\n6. Vérification suppression...`);
        const verifyDeleted = await workspaceMemory.read(testChatId, testKey);
        console.log(`-> Document après suppression: ${verifyDeleted === null ? 'null (OK)' : 'Toujours présent (ERREUR)'}`);
        if (verifyDeleted !== null) throw new Error("Le document n'a pas été supprimé");

        console.log('\n✅ TOUS LES TESTS WORKSPACE ONT REUSSI !');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ ERREUR LORS DU TEST:', e);
        process.exit(1);
    }
}

run();
