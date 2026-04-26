import * as readline from 'readline';

export const cliTransport = {
    rl: null as readline.Interface | null,
    messageCallback: null as any,
    groupEventCallback: null as any,

    /**
     * Connecte au service de messagerie (ici le terminal)
     */
    connect: async () => {
        cliTransport.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'YOU > '
        });

        console.log('\n======================================');
        console.log('🤖 HIVE-MIND CLI Transport Connecté');
        console.log('Tapez vos messages. Tapez .exit pour quitter.');
        console.log('======================================\n');

        cliTransport.rl.prompt();

        cliTransport.rl.on('line', (line) => {
            const text = line.trim();
            if (text === '.exit') {
                process.exit(0);
            }
            if (text && cliTransport.messageCallback) {
                // Simuler un objet MessageData
                const messageObj = {
                    id: 'cli_' + Date.now(),
                    chatId: 'cli_chat',
                    sender: 'cli_user',
                    senderName: 'Admin CLI',
                    text: text,
                    isGroup: false,
                    isSystem: false,
                    raw: { text }
                };
                cliTransport.messageCallback(messageObj);
            }
        });
    },

    /**
     * Déconnecte du service
     */
    disconnect: async () => {
        if (cliTransport.rl) {
            cliTransport.rl.close();
            console.log('CLI Transport déconnecté.');
        }
    },

    /**
     * Envoie un message texte
     */
    sendText: async (chatId: string, text: string, options: any = {}) => {
        console.log(`\n🤖 HIVE-MIND > ${text}\n`);
        if (cliTransport.rl) {
            cliTransport.rl.prompt();
        }
        return { id: 'sent_' + Date.now() };
    },

    /**
     * Envoie une réponse universelle formatée pour le Terminal
     */
    sendUniversalResponse: async (chatId: string, response: any, options: any = {}) => {
        const text = response.markdown;
        
        // Pour le moment on affiche juste le markdown
        // On pourrait ajouter des couleurs ici si chalk était installé
        console.log(`\n🤖 HIVE-MIND [CLI] >\n${text}\n`);
        
        if (cliTransport.rl) {
            cliTransport.rl.prompt();
        }
        return { id: 'sent_' + Date.now() };
    },

    /**
     * Envoie un média
     */
    sendMedia: async (chatId: string, media: any, options: any = {}) => {
        console.log(`\n🤖 HIVE-MIND > [MÉDIA ENVOYÉ: ${options.caption || 'Sans légende'}]\n`);
        if (cliTransport.rl) {
            cliTransport.rl.prompt();
        }
        return { id: 'sent_media_' + Date.now() };
    },

    /**
     * Envoie un sticker
     */
    sendSticker: async (chatId: string, stickerBuffer: any) => {
        console.log(`\n🤖 HIVE-MIND > [STICKER ENVOYÉ]\n`);
        if (cliTransport.rl) {
            cliTransport.rl.prompt();
        }
        return { id: 'sent_sticker_' + Date.now() };
    },

    /**
     * Récupère les métadonnées d'un groupe
     */
    getGroupMetadata: async (groupId: string) => {
        return {
            id: groupId,
            subject: 'CLI Group',
            participants: ['cli_user'],
            admins: ['cli_user']
        };
    },

    /**
     * Télécharge un média depuis un message
     */
    downloadMedia: async (message: any) => {
        return Buffer.from('');
    },

    /**
     * Définit le callback pour les nouveaux messages
     */
    onMessage: (callback: any) => {
        cliTransport.messageCallback = callback;
    },

    /**
     * Définit le callback pour les événements de groupe
     */
    onGroupEvent: (callback: any) => {
        cliTransport.groupEventCallback = callback;
    },

    /**
     * Met à jour la présence (typing, online, etc.)
     */
    setPresence: async (chatId: string, presence: string) => {
        // En CLI on peut simuler un indicateur de frappe, mais c'est cosmétique
        if (presence === 'composing') {
            process.stdout.write('🤖 HIVE-MIND écrit...\r');
        } else {
            process.stdout.write('                     \r');
        }
    },

    /**
     * Vérifie si un utilisateur est admin d'un groupe
     */
    isAdmin: async (groupId: string, userId: string) => {
        return true; // En CLI, l'utilisateur est toujours admin
    },

    /**
     * Envoie une réaction (emoji) sur un message
     */
    sendReaction: async (chatId: string, key: any, emoji: string) => {
        console.log(`\n🤖 HIVE-MIND > [RÉACTION: ${emoji}]\n`);
        if (cliTransport.rl) {
            cliTransport.rl.prompt();
        }
        return true;
    }
};
