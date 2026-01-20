import { ShoppingAgent } from './shopping_agent.js';

export default {
    name: 'shopping',
    description: 'Assistant Shopping Intelligent (Comparateur, Specs, Prix).',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'find_product',
                description: 'Cherche des produits à acheter en ligne. À utiliser pour des demandes comme "Je veux acheter...", "Trouve un prix pour...", "Quel est le meilleur...".',
                parameters: {
                    type: 'object',
                    properties: {
                        request: {
                            type: 'string',
                            description: 'La demande complète de l\'utilisateur (produit, budget, contraintes).'
                        }
                    },
                    required: ['request']
                }
            }
        }
    ],

    async execute(args, context, toolName) {
        const { chatId, sender, transport } = context;

        if (toolName === 'find_product') {
            const { request } = args;

            // 1. Démarrer
            await transport.sendText(chatId, `🛍️ **Mode Shopping Activé**\nRecherche en cours pour : "${request}"...`);
            await transport.setPresence(chatId, 'composing');

            // 2. Lancer l'agent
            const agent = new ShoppingAgent(sender, chatId);
            const result = await agent.start(request);

            return {
                success: true,
                message: result
            };
        }
        return { success: false, message: "Outil inconnu" };
    }
};
