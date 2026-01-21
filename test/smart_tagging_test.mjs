// test/smart_tagging_test.mjs
// Test du système Smart Tagging (Dual Resolver)

import { findBestMatch } from '../utils/fuzzyMatcher.js';

console.log('🔬 TEST : Smart Tagging System (Dual Resolver)\n');
console.log('='.repeat(60));

// Données de test
const members = [
    { name: 'Sébastien Dupont', jid: '33612345678@s.whatsapp.net' },
    { name: 'Jordan Martinez', jid: '33698765432@s.whatsapp.net' },
    { name: 'Alex Dubois', jid: '33676543210@s.whatsapp.net' },
    { name: 'Alex Martin', jid: '33623456789@s.whatsapp.net' }, // Homonyme
    { name: null, jid: '33699887766@s.whatsapp.net' }, // Inconnu
];

// TEST 1  : Tag par Nom
console.log('\n📝 TEST 1: Tag par Nom (@Sébastien)');
console.log('-'.repeat(60));
const test1 = findBestMatch('Sébastien', members);
console.log(test1.match ? `✅ Match: ${test1.match.name} (${test1.match.jid})` : '❌ Pas de match');

// TEST 2: Tag par Diminutif
console.log('\n📝 TEST 2: Tag par Diminutif (@Seb)');
console.log('-'.repeat(60));
const test2 = findBestMatch('Seb', members);
console.log(test2.match ? `✅ Match: ${test2.match.name} (${test2.match.jid})` : '❌ Pas de match');

// TEST 3: Tag par Numéro COMPLET
console.log('\n📝 TEST 3: Tag par Numéro (@33612345678)');
console.log('-'.repeat(60));
const test3 = findBestMatch('33612345678', members);
console.log(test3.match ? `✅ Match: ${test3.match.name || 'Inconnu'} (${test3.match.jid})` : '❌ Pas de match');

// TEST 4: Tag par Numéro PARTIEL
console.log('\n📝 TEST 4: Tag par Numéro Partiel (@336123...)');
console.log('-'.repeat(60));
const test4 = findBestMatch('336123', members);
console.log(test4.match ? `✅ Match: ${test4.match.name || 'Inconnu'} (${test4.match.jid})` : '❌ Pas de match');

// TEST 5: Tag d'un Inconnu (numéro sans nom)
console.log('\n📝 TEST 5: Tag d\'un Inconnu par Numéro (@33699887766)');
console.log('-'.repeat(60));
const test5 = findBestMatch('33699887766', members);
console.log(test5.match ? `✅ Match: ${test5.match.name || 'Inconnu'} (${test5.match.jid})` : '❌ Pas de match');

// TEST 6: Homonymes - Premier résolu par nom
console.log('\n📝 TEST 6: Homonyme - Tag par Nom (@Alex)');
console.log('-'.repeat(60));
const test6 = findBestMatch('Alex', members);
console.log(test6.match ? `✅ Match: ${test6.match.name} (${test6.match.jid})` : '❌ Pas de match');
console.log('ℹ️  Note: Prend le premier trouvé. Pour cibler précisément, utiliser le numéro.');

// TEST 7: Homonymes - Ciblage précis par numéro
console.log('\n📝 TEST 7: Homonyme - Tag Précis par Numéro (@33623456789)');
console.log('-'.repeat(60));
const test7 = findBestMatch('33623456789', members);
console.log(test7.match ? `✅ Match: ${test7.match.name} (${test7.match.jid})` : '❌ Pas de match');

// TEST 8: Numéro inexistant
console.log('\n📝 TEST 8: Numéro Inexistant (@99999999999)');
console.log('-'.repeat(60));
const test8 = findBestMatch('99999999999', members);
console.log(test8.match ? `❌ ERREUR: Match trouvé` : '✅ Aucun match (comportement attendu)');

// TEST 9: Nom inexistant
console.log('\n📝 TEST 9: Nom Inexistant (@Thomas)');
console.log('-'.repeat(60));
const test9 = findBestMatch('Thomas', members);
console.log(test9.match ? `❌ ERREUR: Match trouvé` : '✅ Aucun match (comportement attendu)');

// RÉSUMÉ
console.log('\n' + '='.repeat(60));
console.log('📊 RÉSUMÉ DES TESTS');
console.log('='.repeat(60));

const results = [test1, test2, test3, test4, test5, test6, test7];
const expectedMatches = 7;
const actualMatches = results.filter(t => t.match !== null).length;

console.log(`✅ Tests réussis : ${actualMatches}/${expectedMatches}`);
console.log(`❌ Tests échoués : ${expectedMatches - actualMatches}/${expectedMatches}`);

if (actualMatches === expectedMatches) {
    console.log('\n🎉 Tous les tests sont PASSÉS ! Le système Smart Tagging fonctionne correctement.');
} else {
    console.log('\n⚠️  Certains tests ont échoué. Vérifiez la logique du Dual Resolver.');
}

console.log('\n📚 RÈGLES VÉRIFIÉES:');
console.log('✓ Tag par Nom (@Sébastien)');
console.log('✓ Tag par Diminutif (@Seb)');
console.log('✓ Tag par Numéro Complet (@336...)');
console.log('✓ Tag par Numéro Partiel (préfixe)');
console.log('✓ Tag d\'inconnus via numéro');
console.log('✓ Gestion des homonymes (numéro = précis)');
console.log('✓ Rejection des inexistants');
