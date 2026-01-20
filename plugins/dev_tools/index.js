// plugins/dev_tools/index.js
export default {
    name: 'dev_tools',
    description: 'Outils de développement et commandes système',
    version: '1.0.0',
    enabled: true,

    // Matchers textuels pour commandes rapides (sans LLM)
    textMatchers: [
        {
            pattern: /^\.shutdown$/i,
            handler: 'shutdown_bot',
            description: 'Arrête le processus du bot'
        },
        {
            pattern: /^\.devcontact$/i,
            handler: 'send_dev_contact',
            description: 'Envoie la fiche contact du développeur'
        }
    ],

    // Définition vide car ce sont des commandes "Admin" cachées, pas des outils pour l'IA
    // L'IA ne doit pas pouvoir s'éteindre elle-même par erreur
    toolDefinition: null,

    /**
     * Exécution des outils/commandes
     */
    async execute(args, context, toolName) {
        const { transport, message, chatId, sender } = context;

        // Sécurité : Seule permet au "God Mode" ou au créateur d'utiliser .shutdown 
        // (A implémenter: check founder)
        // Pour l'instant c'est ouvert pour tester, mais à sécuriser.

        switch (toolName) {
            case 'shutdown_bot':
                console.log('🛑 Arrêt demandé via commande .shutdown');
                if (transport) {
                    await transport.sendText(chatId, '🛑 Arrêt du système en cours...');
                    await transport.sendPresenceUpdate('unavailable');
                }

                // Petit délai pour l'envoi du message
                setTimeout(() => {
                    process.exit(0);
                }, 1000);

                return { success: true, message: 'Bot éteint' };

            case 'send_dev_contact':
                if (transport) {
                    // Christ-Léandre +2250150618253
                    await transport.sendContact(chatId, 'Christ-Léandre', '2250150618253');
                    return { success: true, message: 'Contact envoyé' };
                }
                return { success: false, message: 'Transport indisponible' };

            default:
                return { success: false, message: 'Commande inconnue' };
        }
    }
};
