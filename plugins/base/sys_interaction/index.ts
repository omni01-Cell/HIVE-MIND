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
                        emoji: { type: 'string', description: 'L\'emoji à utiliser (ex: 👍, ❤️, 😂)' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optionnel. Le réseau de destination. Par défaut, utilise le réseau courant.' }
                    },
                    required: ['emoji']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'create_poll',
                description: 'Crée un sondage natif. Si le réseau de destination ne supporte pas les sondages natifs, le transport adaptera le format.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'La question ou le titre du sondage' },
                        options: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Liste des choix possibles (ex: ["Lundi", "Mardi", "Jamais"])'
                        },
                        allowMultipleAnswers: { type: 'boolean', description: 'Si vrai, les utilisateurs peuvent choisir plusieurs options (défaut: false)' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optionnel. Le réseau cible.' },
                        target_chat_id: { type: 'string', description: 'Optionnel. L\'ID de la conversation cible.' }
                    },
                    required: ['title', 'options']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_contact',
                description: 'Envoie une fiche contact (VCard). Si le réseau ne le supporte pas, il enverra du texte formaté.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Nom affiché du contact' },
                        phone: { type: 'string', description: 'Numéro de téléphone complet (format international sans +)' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optionnel.' },
                        target_chat_id: { type: 'string', description: 'Optionnel. ID de destination.' }
                    },
                    required: ['name', 'phone']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_message',
                description: 'Envoie un message. Peut être utilisé pour parler sur le réseau courant, OU pour envoyer un message sur un autre réseau à un autre utilisateur (omni-channel).',
                parameters: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'Le texte du message à envoyer.' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Le réseau de destination. Par défaut, le réseau actuel de la conversation.' },
                        target_chat_id: { type: 'string', description: 'L\'ID du chat/utilisateur de destination. Indispensable si tu changes de target_channel.' }
                    },
                    required: ['text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_file',
                description: 'Envoie un fichier (image, vidéo, document) sur le réseau cible. Universel (Discord, Telegram, WhatsApp).',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'Le chemin absolu ou l\'URL du fichier à envoyer.' },
                        caption: { type: 'string', description: 'Texte optionnel accompagnant le fichier.' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optionnel. Le réseau de destination. Par défaut, le réseau actuel.' },
                        target_chat_id: { type: 'string', description: 'Optionnel. L\'ID du chat/utilisateur de destination.' }
                    },
                    required: ['filePath']
                }
            }
        },
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
                            description: 'Les arguments requis par l\'outil cible, au format JSON.'
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
    async execute(args: any, context: any, toolName: any) {
        // Import dynamique pour éviter cycles
        const { pluginLoader } = await import('../../loader.js');
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

                    plugins.forEach((p: any) => {
                        summary += `📂 **Plugin: ${p.name}** (v${p.version})\n   Description: ${p.description}\n`;
                        // Trouver les outils de ce plugin
                        const pluginTools = tools
                            .filter((t: any) => pluginLoader.toolToPlugin.get(t.function.name) === p.name)
                            .map((t: any) => `   - 🛠️ ${t.function.name}: ${t.function.description.substring(0, 100)}...`);

                        if (pluginTools.length) {
                            summary += pluginTools.join('\n') + '\n';
                        }
                        summary += '\n';
                    });

                    if (plugins.length === 0 && tools.length > 0) {
                        // Cas fallback si list() est vide mais tools défini
                        summary += tools.map((t: any) => `- ${t.function.name}: ${t.function.description}`).join('\n');
                    }

                    // [PTC] Ajouter manuellement le meta-tool dynamique code_execution
                    const ptcEnabled = process.env.PTC_ENABLED !== 'false';
                    if (ptcEnabled) {
                        summary += `\n📂 **Meta-Fonctionnalités (Système)**\n`;
                        summary += `   - 🛠️ code_execution: Exécute du code JavaScript pour orchestrer PLUSIEURS appels d'outils en une seule fois (Programmatic Tool Calling).\n`;
                    }

                    return {
                        success: true,
                        message: summary,
                        data: { plugins, tools: tools.map((t: any) => t.function.name).concat(ptcEnabled ? ['code_execution'] : []) }
                    };

                case 'react_to_message':
                    const emoji = args.emoji || args.reaction;
                    if (!emoji || emoji.length > 5) return { success: false, message: 'Emoji invalide.' };

                    const targetKey = message.raw?.key; // Message actuel par défaut
                    if (targetKey) {
                        const targetChannel = args.target_channel || context.sourceChannel;
                        await transport.sendReaction(chatId, targetKey, emoji, targetChannel);

                        // [VIBE CODING] Trigger émotionnel
                        // Si le bot réagit négativement, son agacement monte
                        const { consciousness } = await import('../../../services/consciousnessService.js');
                        const negativeEmojis = ['🤮', '🤢', '😡', '🤬', '🤦‍♂️', '🤦‍♀️', '🤡', '😒'];
                        const positiveEmojis = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💓', '🥰', '😍', '🤩', '😘', '😗', '😙', '😚', '🤗', '👍', '👌', '🤝', '🙌', '👏', '🫶', '👐', '🤲', '🙏', '🕊️', '🌸', '💐', '🌹', '🌺', '🌻', '🌼', '🌷', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙'];

                        if (negativeEmojis.includes(emoji)) {
                            await consciousness.updateAnnoyance(chatId, message.sender, 15);
                            console.log(`[Vibe] 😡 Réaction négative (${emoji}) -> Agacement +15`);
                        } else if (positiveEmojis.includes(emoji)) {
                            await consciousness.updateAnnoyance(chatId, message.sender, -5);
                            console.log(`[Vibe] ❤️ Réaction positive (${emoji}) -> Agacement -5`);
                        }

                        return { success: true, message: `[ACTION] Réaction ${emoji} ajoutée sur ${targetChannel}.` };
                    }
                    return { success: false, message: 'Pas de message cible.' };

                case 'create_poll':
                    const { title, options, allowMultipleAnswers } = args;
                    const selectableCount = allowMultipleAnswers ? options.length : 1;
                    const pollTargetChannel = args.target_channel || context.sourceChannel;
                    const pollTargetChatId = args.target_chat_id || chatId;

                    await transport.sendPoll(pollTargetChatId, title, options, selectableCount, pollTargetChannel);
                    return { success: true, message: `[ACTION] Sondage "${title}" créé sur ${pollTargetChannel} dans le chat ${pollTargetChatId}.` };

                case 'send_contact':
                    const { name, phone } = args;
                    // Nettoyage sommaire du numéro
                    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');
                    const contactTargetChannel = args.target_channel || context.sourceChannel;
                    const contactTargetChatId = args.target_chat_id || chatId;

                    await transport.sendContact(contactTargetChatId, name, cleanPhone, contactTargetChannel);
                    return { success: true, message: `[ACTION] Contact ${name} (${cleanPhone}) envoyé sur ${contactTargetChannel}.` };

                case 'send_message':
                    const { text } = args;
                    if (!text) return { success: false, message: 'Texte vide.' };
                    
                    const msgTargetChannel = args.target_channel || context.sourceChannel;
                    const msgTargetChatId = args.target_chat_id || chatId;

                    // Envoi direct via le transport
                    // Utiliser sendText pour bénéficier du formatage auto et splitting
                    await transport.sendText(msgTargetChatId, text, {}, msgTargetChannel);
                    return { success: true, message: `[ACTION] Message envoyé sur ${msgTargetChannel} au chat ${msgTargetChatId}.` };

                case 'send_file':
                case 'send_files': {
                    const { filePath, caption } = args;
                    if (!filePath) return { success: false, message: 'Chemin de fichier (filePath) requis.' };

                    const fileTargetChannel = args.target_channel || context.sourceChannel;
                    const fileTargetChatId = args.target_chat_id || chatId;

                    // Support universel via sendMedia
                    // Le transport adaptera l'envoi en fonction de ses propres capacités
                    await transport.sendMedia(fileTargetChatId, filePath, { caption }, fileTargetChannel);
                    return { success: true, message: `[ACTION] Fichier envoyé sur ${fileTargetChannel} au chat ${fileTargetChatId}.` };
                }

                default:
                    return { success: false, message: `Outil inconnu: ${toolName}` };
            }
        } catch (error: any) {
            console.error(`[Interaction] Erreur ${toolName}:`, error);
            return {
                success: false,
                message: `Erreur lors de l'exécution de ${toolName}: ${error.message}`,
                gracefulDegradation: true
            };
        }
    }
};
