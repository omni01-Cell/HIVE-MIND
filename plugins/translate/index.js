// plugins/translate/index.js
// Plugin de traduction de texte

export default {
    name: 'translate_text',
    description: 'Traduit du texte d\'une langue à une autre.',
    version: '1.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'translate_text',
            description: 'Traduire du texte d\'une langue à une autre. Peut traduire un message cité ou du texte fourni.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Le texte à traduire'
                    },
                    source_lang: {
                        type: 'string',
                        description: 'Langue source (ex: fr, en, auto). Par défaut: auto'
                    },
                    target_lang: {
                        type: 'string',
                        description: 'Langue cible (ex: en, es, ja)'
                    }
                },
                required: ['text', 'target_lang']
            }
        }
    },

    async execute(args, context) {
        const { text, source_lang = 'auto', target_lang } = args;
        const { message } = context;

        // Si pas de texte fourni, essayer le message cité
        let textToTranslate = text;
        if (!textToTranslate && message.quotedMsg?.text) {
            textToTranslate = message.quotedMsg.text;
        }

        if (!textToTranslate) {
            return {
                success: false,
                message: 'Aucun texte à traduire. Fournis un texte ou réponds à un message.'
            };
        }

        try {
            // Import dynamique pour éviter les problèmes de chargement
            const translate = (await import('@vitalets/google-translate-api')).default;

            const result = await translate(textToTranslate, {
                from: source_lang,
                to: target_lang
            });

            const langNames = {
                'fr': '🇫🇷 Français',
                'en': '🇬🇧 Anglais',
                'es': '🇪🇸 Espagnol',
                'de': '🇩🇪 Allemand',
                'it': '🇮🇹 Italien',
                'pt': '🇵🇹 Portugais',
                'ja': '🇯🇵 Japonais',
                'ko': '🇰🇷 Coréen',
                'zh': '🇨🇳 Chinois',
                'ar': '🇸🇦 Arabe',
                'ru': '🇷🇺 Russe'
            };

            const sourceName = langNames[result.from?.language?.iso] || result.from?.language?.iso || 'Auto';
            const targetName = langNames[target_lang] || target_lang;

            return {
                success: true,
                message: `${sourceName} → ${targetName}\n\n${result.text}`,
                data: {
                    original: textToTranslate,
                    translated: result.text,
                    from: result.from?.language?.iso,
                    to: target_lang
                }
            };

        } catch (error) {
            console.error('[Translate Plugin] Erreur:', error);
            return {
                success: false,
                message: `Erreur de traduction: ${error.message}`
            };
        }
    }
};
