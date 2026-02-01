
import { findBestMatch } from '../utils/fuzzyMatcher.js';

console.log('=== VERIFICATION: Fuzzy Match Fix ===');

// Scénario Corrigé:
// Le membre a maintenant le champ phoneNumber, peuplé par GroupService
const correctedMembers = [
    {
        name: "Test User (LID Only)",
        jid: "999999999@lid",
        phoneNumber: "1234567890@s.whatsapp.net" // Champ ajouté par le fix GroupService
    },
    {
        name: "Standard User",
        jid: "555555555@s.whatsapp.net",
        phoneNumber: "555555555@s.whatsapp.net" // Identique pour les users normaux
    }
];

// Test 1: Recherche par numéro LID (ne devrait PAS matcher idéalement, ou on s'en fiche)
// Mais surtout le Test 2

// Test 2: Recherche par Vrai Numéro (12345)
console.log('\n[TEST 2] Recherche avec "12345" sur un profil LID avec phoneNumber renseigné');
const match = findBestMatch("12345", correctedMembers);

if (match.match && match.match.name === "Test User (LID Only)") {
    console.log(`✅ SUCCÈS: Trouvé ${match.match.name} via son numéro !`);
} else {
    console.log(`❌ ÉCHEC: Pas de match trouvé. Résultat:`, match);
}

// Test 3: Recherche standard
console.log('\n[TEST 3] Recherche Standard "Standard"');
const matchStd = findBestMatch("Standard", correctedMembers);
console.log(`Result: ${matchStd.match ? matchStd.match.name : 'NULL'}`);
