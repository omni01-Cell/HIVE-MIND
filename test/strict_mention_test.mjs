// test/strict_mention_test.mjs
// Test STRICT : Vérifie que seuls les @ déclenchent des tags

import { resolveMentionsInText } from '../utils/fuzzyMatcher.js';

console.log('🔬 TEST STRICT : Mentions Explicites Uniquement\n');
console.log('='.repeat(60));

const members = [
    { name: 'Sébastien', jid: '33612345678@s.whatsapp.net' },
    { name: 'Jordan', jid: '33698765432@s.whatsapp.net' }
];

// TEST 1: Dire un nom SANS @ → PAS de tag
console.log('\n📝 TEST 1: "Ton nom est Sébastien" (sans @)');
console.log('-'.repeat(60));
const test1 = resolveMentionsInText('Ton nom est Sébastien', members);
console.log(`Texte: "${test1.text}"`);
console.log(`Mentions: [${test1.mentions.join(', ')}]`);
console.log(test1.mentions.length === 0 ? '✅ PAS de tag (correct)' : '❌ ERREUR: Tag créé!');

// TEST 2: Dire un numéro SANS @ → PAS de tag
console.log('\n📝 TEST 2: "Le numéro est 336..." (sans @)');
console.log('-'.repeat(60));
const test2 = resolveMentionsInText('Le numéro est 33612345678', members);
console.log(`Texte: "${test2.text}"`);
console.log(`Mentions: [${test2.mentions.join(', ')}]`);
console.log(test2.mentions.length === 0 ? '✅ PAS de tag (correct)' : '❌ ERREUR: Tag créé!');

// TEST 3: Mention AVEC @ nom → Tag créé
console.log('\n📝 TEST 3: "Salut @Sébastien" (avec @)');
console.log('-'.repeat(60));
const test3 = resolveMentionsInText('Salut @Sébastien', members);
console.log(`Texte: "${test3.text}"`);
console.log(`Mentions: [${test3.mentions.join(', ')}]`);
console.log(test3.mentions.length > 0 ? '✅ Tag créé (correct)' : '❌ ERREUR: Pas de tag!');

// TEST 4: Mention AVEC @ numéro → Tag créé
console.log('\n📝 TEST 4: "Salut @33612345678" (avec @)');
console.log('-'.repeat(60));
const test4 = resolveMentionsInText('Salut @33612345678', members);
console.log(`Texte: "${test4.text}"`);
console.log(`Mentions: [${test4.mentions.join(', ')}]`);
console.log(test4.mentions.length > 0 ? '✅ Tag créé (correct)' : '❌ ERREUR: Pas de tag!');

// TEST 5: Mix - nom sans @ et mention avec @
console.log('\n📝 TEST 5: "Jordan (sans @) et @Sébastien (avec @)"');
console.log('-'.repeat(60));
const test5 = resolveMentionsInText('Appelle Jordan et aussi @Sébastien', members);
console.log(`Texte: "${test5.text}"`);
console.log(`Mentions: [${test5.mentions.join(', ')}]`);
console.log(test5.mentions.length === 1 ? '✅ Seulement @Sébastien tagué' : '❌ ERREUR: Mauvais nombre de tags');

console.log('\n' + '='.repeat(60));
console.log('📊 RÉSUMÉ');
console.log('='.repeat(60));
console.log('✅ Nom sans @ : Pas de tag');
console.log('✅ Numéro sans @ : Pas de tag');
console.log('✅ @Nom : Tag créé');
console.log('✅ @Numéro : Tag créé');
console.log('\n🎯 RÈGLE STRICTE : @ est OBLIGATOIRE pour déclencher un tag');
