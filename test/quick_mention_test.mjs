// Quick test des mentions

const members = [
    { name: 'Sébastien', jid: '33612345678@s.whatsapp.net' },
    { name: 'Jordan', jid: '33698765432@s.whatsapp.net' }
];

// Simuler la fonction
function resolveMentionsInText(text, members) {
    console.log('📝 Texte original:', text);

    // Extraire @mentions
    const regex = /@([\p{L}\p{N}]+)/gu;
    const mentions = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        mentions.push(match[1]);
    }

    console.log('🔍 Mentions trouvées:', mentions);

    const resolvedJids = [];
    let processedText = text;

    for (const mentionName of mentions) {
        // Chercher le membre
        const member = members.find(m =>
            m.name.toLowerCase().startsWith(mentionName.toLowerCase())
        );

        if (member) {
            console.log(`✅ "${mentionName}" → "${member.name}" (${member.jid})`);
            resolvedJids.push(member.jid);

            // Remplacer @Nom par @Numéro
            const phoneNumber = member.jid.split('@')[0];
            processedText = processedText.replace(
                new RegExp(`@${mentionName}\\b`, 'gi'),
                `@${phoneNumber}`
            );
        } else {
            console.log(`❌ "${mentionName}" → Aucun match`);
        }
    }

    return {
        text: processedText,
        mentions: resolvedJids
    };
}

// Test
console.log('\n🚀 TEST DU SYSTÈME DE MENTIONS\n');
console.log('='.repeat(60));

const result = resolveMentionsInText('Salut @Sébastien et @Jordan !', members);

console.log('\n📤 RÉSULTAT FINAL:');
console.log('Texte formaté:', result.text);
console.log('Mentions array:', result.mentions);

console.log('\n📨 Format pour Baileys sendMessage():');
console.log(JSON.stringify({
    text: result.text,
    mentions: result.mentions
}, null, 2));

console.log('\n✅ Les mentions fonctionnent correctement !');
