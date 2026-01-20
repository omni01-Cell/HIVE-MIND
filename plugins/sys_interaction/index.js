// plugins/sys_interaction/index.js
export default {
    name: 'sys_interaction',
    description: 'Gestion des interactions humaines avancées (Réactions, Sondages, Contacts)',
    version: '1.1.0',
    enabled: true,

    // Définitions multiples pour function calling
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'react_to_message',
                description: 'Met une réaction (emoji) sur le message. À utiliser pour confirmer (👍), aimer (❤️) ou rire (😂) au lieu de répondre par du texte.',
                parameters: {
                    type: 'object',
                    properties: {
                        emoji: {
                            type: 'string',
                            description: 'L\'emoji à utiliser (ex: 👍, ❤️, 😂)'
                        }
                    },
                    required: ['emoji']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'create_poll',
                description: 'Crée un sondage natif WhatsApp. Utile pour demander l\'avis du groupe, organiser quelque chose, ou faire des choix.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'La question ou le titre du sondage' },
                        options: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Liste des choix possibles (ex: ["Lundi", "Mardi", "Jamais"])'
                        },
                        allowMultipleAnswers: {
                            type: 'boolean',
                            description: 'Si vrai, les utilisateurs peuvent choisir plusieurs options (défaut: false)'
                        }
                    },
                    required: ['title', 'options']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_contact',
                description: 'Envoie une fiche contact (VCard) native.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Nom affiché du contact' },
                        phone: { type: 'string', description: 'Numéro de téléphone complet (format international sans +)' }
                    },
                    required: ['name', 'phone']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_message',
                description: 'Envoie un message intermédiaire à l\'utilisateur PENDANT que tu réfléchis ou travailles. Utile pour dire "Je cherche..." ou "Veuillez patienter...".',
                parameters: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'Le message à envoyer maintenant.' }
                    },
                    required: ['text']
                }
            }
        }
        {
            type: 'function',
            function: {
                name: 'get_my_capabilities',
                description: 'Liste TOUTES les fonctionnalités, plugins et outils dont je dispose. À utiliser quand l\'utilisateur demande "Que sais-tu faire ?" ou "Liste tes fonctions", car ta mémoire courante peut être incomplète.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'use_tool',
                description: 'Outil Méta-Exécutif. Permet d\'exécuter N\'IMPORTE QUEL outil de ta liste de capacités (récupérée via get_my_capabilities), même si cet outil n\'est pas actif dans ton contexte actuel. Utilise ceci pour contourner les limitations de mémoire.',
                parameters: {
                    type: 'object',
                    properties: {
                        tool_name: {
                            type: 'string',
                            description: 'Le nom exact de la fonction à exécuter (ex: "react_to_message", "search_wikipedia")'
                        },
                        args: {
                            type: 'object',
                            description: 'Les arguments requis par l\'outil cible, au format JSON.',
                            additionalProperties: true
                        }
                    },
                    required: ['tool_name', 'args']
                }
            }
        }
    ],

    /**
     * Exécution des outils
     */
    async execute(args, context, toolName) {
        // Import dynamique pour éviter cycles
        const { pluginLoader } = await import('../loader.js');
        const { transport, message, chatId } = context;

        if (!transport) {
            return { success: false, message: 'Transport non disponible' };
        }

        try {
            switch (toolName) {
                case 'get_my_capabilities':
                    const plugins = pluginLoader.list();
                    const tools = pluginLoader.getToolDefinitions();

                    // Formatter proprement pour l'IA
                    let summary = "Voici la liste exhaustive de mes capacités :\n\n";

                    plugins.forEach(p => {
                        summary += `📂 **Plugin: ${p.name}** (v${p.version})\n   Description: ${p.description}\n`;
                        // Trouver les outils de ce plugin
                        const pluginTools = tools
                            .filter(t => pluginLoader.toolToPlugin.get(t.function.name) === p.name)
                            .map(t => `   - 🛠️ ${t.function.name}: ${t.function.description.substring(0, 100)}...`);

                        if (pluginTools.length) {
                            summary += pluginTools.join('\n') + '\n';
                        }
                        summary += '\n';
                    });

                    if (plugins.length === 0 && tools.length > 0) {
                        // Cas fallback si list() est vide mais tools défini
                        summary += tools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n');
                    }

                    return {
                        success: true,
                        message: summary,
                        data: { plugins, tools: tools.map(t => t.function.name) }
                    };

                case 'react_to_message':
                    const { emoji } = args;
                    if (!emoji || emoji.length > 5) return { success: false, message: 'Emoji invalide.' };

                    const targetKey = message.raw?.key; // Message actuel par défaut
                    if (targetKey) {
                        await transport.sendReaction(chatId, targetKey, emoji);

                        // [VIBE CODING] Trigger émotionnel
                        // Si le bot réagit négativement, son agacement monte
                        const { consciousness } = await import('../../services/consciousnessService.js');
                        const negativeEmojis = ['🤮', '🤢', '😡', '🤬', '🤦‍♂️', '🤦‍♀️', '🤡', '😒'];
                        const positiveEmojis = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💓', '🥰', '😍', '🤩', '😘', '😗', '😙', '😚', '🤗', '👍', '👌', '🤝', '🙌', '👏', '🫶', '👐', '🤲', '🙏', '🕊️', '🌸', '💐', '🌹', '🌺', '🌻', '🌼', '🌷', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙'];

                        if (negativeEmojis.includes(emoji)) {
                            await consciousness.updateAnnoyance(chatId, message.sender, 15);
                            console.log(`[Vibe] 😡 Réaction négative (${emoji}) -> Agacement +15`);
                        } else if (positiveEmojis.includes(emoji)) {
                            await consciousness.updateAnnoyance(chatId, message.sender, -5);
                            console.log(`[Vibe] ❤️ Réaction positive (${emoji}) -> Agacement -5`);
                        }

                        return { success: true, message: `[ACTION] Réaction ${emoji} ajoutée.` };
                    }
                    return { success: false, message: 'Pas de message cible.' };

                case 'create_poll':
                    const { title, options, allowMultipleAnswers } = args;
                    const selectableCount = allowMultipleAnswers ? options.length : 1;

                    await transport.sendPoll(chatId, title, options, selectableCount);
                    return { success: true, message: `[ACTION] Sondage "${title}" créé avec ${options.length} options.` };

                case 'send_contact':
                    const { name, phone } = args;
                    // Nettoyage sommaire du numéro
                    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');

                    await transport.sendContact(chatId, name, cleanPhone);
                    return { success: true, message: `[ACTION] Contact ${name} (${cleanPhone}) envoyé.` };

                case 'send_message':
                    const { text } = args;
                    if (!text) return { success: false, message: 'Texte vide.' };

                    // Envoi direct via le transport
                    await transport.sendMessage(chatId, { text });
                    return { success: true, message: `[ACTION] Message intermédiaire envoyé: "${text}"` };

                default:
                    return { success: false, message: `Outil inconnu: ${toolName}` };
            }
        } catch (error) {
            console.error(`[Interaction] Erreur ${toolName}:`, error);
            return {
                success: false,
                message: `Erreur lors de l'exécution de ${toolName}: ${error.message}`,
                gracefulDegradation: true
            };
        }
    }
};
