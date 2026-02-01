
import { findBestMatch } from '../utils/fuzzyMatcher.js';
import { strict as assert } from 'assert';

console.log('=== TEST REPRODUCTION: Fuzzy Match with LID ===');

// Scénario: Le JID stocké est un LID (ce qui arrive actuellement)
// Le numéro de téléphone réel est '1234567890'
// Le LID est '999999999@lid'

const mockMembers = [
    {
        name: "Test User",
        jid: "999999999@lid", // LID (Ne contient pas le numéro de téléphone)
        // phoneNumber: "1234567890" // Ce champ manque actuellement
    },
    {
        name: "Valid User",
        jid: "555555555@s.whatsapp.net" // Phone JID standard
    }
];

// 1. Recherche via Numéro de LID (Ce qui se passe quand on split le LID)
console.log('\n[TEST 1] Recherche avec le numéro du LID (999999999)');
const lidMatch = findBestMatch("999999999", mockMembers);
console.log(`Result: ${lidMatch.match ? 'FOUND' : 'NULL'}`);
// Ce test devrait passer (mais ce n'est pas ce qu'on veut, l'utilisateur cherche par TEL)

// 2. Recherche via Vrai Numéro de téléphone (1234567890)
console.log('\n[TEST 2] Recherche avec le vrai numéro de téléphone (1234567890)');
const phoneMatch = findBestMatch("1234567890", mockMembers);
console.log(`Result: ${phoneMatch.match ? 'FOUND' : 'NULL'}`);

if (!phoneMatch.match) {
    console.log("❌ ÉCHEC: Impossible de trouver l'utilisateur via son numéro de téléphone car le JID est un LID.");
} else {
    console.log("✅ SUCCÈS: Utilisateur trouvé.");
}

// 3. Simulation avec la correction (Champ phoneNumber explicite)
console.log('\n[TEST 3] Simulation avec champ phoneNumber explicite');
const correctedMembers = [
    {
        name: "Test User",
        jid: "999999999@lid",
        phoneNumber: "1234567890" // Le champ qu'on va ajouter
    }
];

/*
// Ce test échouera tant qu'on n'a pas modifié fuzzyMatcher.js
const fixedMatch = findBestMatch("1234567890", correctedMembers);
console.log(`Result Pending Fix: ${fixedMatch.match ? 'FOUND' : 'NULL'}`);
*/
