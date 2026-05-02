// Text translation plugin

export default {
    name: 'translate_text',
    description: 'Translates text from one language to another.',
    version: '1.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'translate_text',
            description: 'Translate text from one language to another. Can translate a quoted message or provided text.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The text to translate'
                    },
                    source_lang: {
                        type: 'string',
                        description: 'Source language (e.g. fr, en, auto). Default: auto'
                    },
                    target_lang: {
                        type: 'string',
                        description: 'Target language (e.g. en, es, ja)'
                    }
                },
                required: ['text', 'target_lang']
            }
        }
    },

    async execute(args: any, context: any, toolName?: string) {
        const { text, source_lang = 'auto', target_lang } = args;
        const { message } = context || {};

        if (!message) {
            return { success: false, message: 'CONTEXT_ERROR: message is required for translation context.' };
        }

        // If no text provided, try quoted message
        let textToTranslate = text;
        if (!textToTranslate && message.quotedMsg?.text) {
            textToTranslate = message.quotedMsg.text;
        }

        if (!textToTranslate) {
            return {
                success: false,
                message: 'No text to translate. Provide text or reply to a message.'
            };
        }

        try {
            // Dynamic import to avoid loading issues
            const { translate } = await import('@vitalets/google-translate-api');

            const result: any = await translate(textToTranslate, {
                from: source_lang,
                to: target_lang
            });

            const langNames: Record<string, string> = {
                'fr': '🇫🇷 French',
                'en': '🇬🇧 English',
                'es': '🇪🇸 Spanish',
                'de': '🇩🇪 German',
                'it': '🇮🇹 Italian',
                'pt': '🇵🇹 Portuguese',
                'ja': '🇯🇵 Japanese',
                'ko': '🇰🇷 Korean',
                'zh': '🇨🇳 Chinese',
                'ar': '🇸🇦 Arabic',
                'ru': '🇷🇺 Russian'
            };

            const sourceName = langNames[result.from?.language?.iso] || result.from?.language?.iso || 'Auto';
            const targetName = langNames[target_lang as string] || target_lang;

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

        } catch (error: any) {
            console.error('[Translate Plugin] Error:', error);
            return {
                success: false,
                message: `Translation error: ${error.message}`
            };
        }
    }
};
