// plugins/sys_interaction/index.js
export default {
    name: 'sys_interaction',
    description: 'Management of advanced human interactions (Reactions, Polls, Contacts)',
    version: '1.1.0',
    enabled: true,

    // Définitions multiples pour function calling
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'react_to_message',
                description: 'Adds a reaction (emoji) to the message. Use to confirm (👍), like (❤️), or laugh (😂) instead of replying with text.',
                parameters: {
                    type: 'object',
                    properties: {
                        emoji: { type: 'string', description: 'The emoji to use (e.g., 👍, ❤️, 😂)' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optional. The destination network. Defaults to the current network.' }
                    },
                    required: ['emoji']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'create_poll',
                description: 'Creates a native poll. If the destination network does not support native polls, the transport will adapt the format.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'The question or title of the poll' },
                        options: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'List of possible choices (e.g., ["Monday", "Tuesday", "Never"])'
                        },
                        allowMultipleAnswers: { type: 'boolean', description: 'If true, users can choose multiple options (default: false)' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optional. The target network.' },
                        target_chat_id: { type: 'string', description: 'Optional. The target conversation ID.' }
                    },
                    required: ['title', 'options']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_contact',
                description: 'Sends a contact card (VCard). If the network does not support it, it will send formatted text.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Displayed contact name' },
                        phone: { type: 'string', description: 'Full phone number (international format without +)' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optional.' },
                        target_chat_id: { type: 'string', description: 'Optional. Destination ID.' }
                    },
                    required: ['name', 'phone']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_message',
                description: 'Sends a message. Can be used to speak on the current network, OR to send a message to another network to another user (omni-channel).',
                parameters: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'The text of the message to send.' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'The destination network. Defaults to the current conversation network.' },
                        target_chat_id: { type: 'string', description: 'The destination chat/user ID. Essential if you change the target_channel.' }
                    },
                    required: ['text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_file',
                description: 'Sends a file (image, video, document) to the target network. Universal (Discord, Telegram, WhatsApp).',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'The absolute path or URL of the file to send.' },
                        caption: { type: 'string', description: 'Optional text accompanying the file.' },
                        target_channel: { type: 'string', enum: ['whatsapp', 'telegram', 'discord', 'cli'], description: 'Optional. The destination network. Defaults to current network.' },
                        target_chat_id: { type: 'string', description: 'Optional. The destination chat/user ID.' }
                    },
                    required: ['filePath']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_my_capabilities',
                description: 'Lists ALL features, plugins, and tools available to me. Use when the user asks "What can you do?" or "List your functions", as your current memory might be incomplete.',
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
                description: 'Meta-Executive tool. Allows executing ANY tool from your capabilities list (retrieved via get_my_capabilities), even if that tool is not active in your current context. Use this to bypass memory limitations.',
                parameters: {
                    type: 'object',
                    properties: {
                        tool_name: {
                            type: 'string',
                            description: 'The exact name of the function to execute (e.g., "react_to_message", "search_wikipedia")'
                        },
                        args: {
                            type: 'object',
                            description: 'The arguments required by the target tool, in JSON format.'
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
        // Import dynamique pour éviter les cycles
        const { pluginLoader } = await import('../../loader.js');
        const { transport, message, chatId } = context || {};

        if (!transport) {
            return { success: false, message: 'Transport not available' };
        }

        try {
            switch (toolName) {
                case 'get_my_capabilities':
                    const plugins = pluginLoader.list();
                    const tools = pluginLoader.getToolDefinitions();

                    // Formatter properly for AI
                    let summary = "Here is the exhaustive list of my capabilities:\n\n";

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

                    // [PTC] Manually add dynamic code_execution meta-tool
                    const ptcEnabled = process.env.PTC_ENABLED !== 'false';
                    if (ptcEnabled) {
                        summary += `\n📂 **Meta-Features (System)**\n`;
                        summary += `   - 🛠️ code_execution: Executes JavaScript code to orchestrate MULTIPLE tool calls at once (Programmatic Tool Calling).\n`;
                    }

                    return {
                        success: true,
                        message: summary,
                        data: { plugins, tools: tools.map((t: any) => t.function.name).concat(ptcEnabled ? ['code_execution'] : []) }
                    };

                case 'react_to_message':
                    const emoji = args.emoji || args.reaction;
                    if (!emoji || emoji.length > 5) return { success: false, message: 'Invalid emoji.' };

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
                            console.log(`[Vibe] 😡 Negative reaction (${emoji}) -> Annoyance +15`);
                        } else if (positiveEmojis.includes(emoji)) {
                            await consciousness.updateAnnoyance(chatId, message.sender, -5);
                            console.log(`[Vibe] ❤️ Positive reaction (${emoji}) -> Annoyance -5`);
                        }

                        return { success: true, message: `[ACTION] Reaction ${emoji} added on ${targetChannel}.` };
                    }
                    return { success: false, message: 'No target message.' };

                case 'create_poll':
                    const { title, options, allowMultipleAnswers } = args;
                    const selectableCount = allowMultipleAnswers ? options.length : 1;
                    const pollTargetChannel = args.target_channel || context.sourceChannel;
                    const pollTargetChatId = args.target_chat_id || chatId;

                    await transport.sendPoll(pollTargetChatId, title, options, selectableCount, pollTargetChannel);
                    return { success: true, message: `[ACTION] Poll "${title}" created on ${pollTargetChannel} in chat ${pollTargetChatId}.` };

                case 'send_contact':
                    const { name, phone } = args;
                    // Nettoyage sommaire du numéro
                    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');
                    const contactTargetChannel = args.target_channel || context.sourceChannel;
                    const contactTargetChatId = args.target_chat_id || chatId;

                    await transport.sendContact(contactTargetChatId, name, cleanPhone, contactTargetChannel);
                    return { success: true, message: `[ACTION] Contact ${name} (${cleanPhone}) sent on ${contactTargetChannel}.` };

                case 'send_message':
                    const { text } = args;
                    if (!text) return { success: false, message: 'Empty text.' };
                    
                    const msgTargetChannel = args.target_channel || context.sourceChannel;
                    const msgTargetChatId = args.target_chat_id || chatId;

                    // Send directly via transport
                    // Use sendText to benefit from auto formatting and splitting
                    await transport.sendText(msgTargetChatId, text, {}, msgTargetChannel);
                    return { success: true, message: `[ACTION] Message sent on ${msgTargetChannel} to chat ${msgTargetChatId}.` };

                case 'send_file':
                case 'send_files': {
                    const { filePath, caption } = args;
                    if (!filePath) return { success: false, message: 'File path (filePath) required.' };

                    const fileTargetChannel = args.target_channel || context.sourceChannel;
                    const fileTargetChatId = args.target_chat_id || chatId;

                    // Universal support via sendMedia
                    // The transport will adapt the send based on its own capabilities
                    await transport.sendMedia(fileTargetChatId, filePath, { caption }, fileTargetChannel);
                    return { success: true, message: `[ACTION] File sent on ${fileTargetChannel} to chat ${fileTargetChatId}.` };
                }

                default:
                    return { success: false, message: `Unknown tool: ${toolName}` };
            }
        } catch (error: any) {
            console.error(`[Interaction] Error ${toolName}:`, error);
            return {
                success: false,
                message: `Error during execution of ${toolName}: ${error.message}`,
                gracefulDegradation: true
            };
        }
    }
};

};
