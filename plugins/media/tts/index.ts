// @ts-nocheck
// plugins/tts/index.js
// Text-to-Speech Plugin - Uses unified VoiceProvider

export default {
    name: 'text_to_speech',
    description: 'Gemini-first text-to-speech with GTTS fallback.',
    version: '2.0.0',
    enabled: true,

    textMatchers: [
        {
            pattern: /^\.tts\s+([\s\S]+)$/i,
            handler: 'text_to_speech',
            description: 'Convert text to speech via Gemini TTS first, then GTTS fallback',
            extractArgs: (match: any) => ({ text: match[1].trim(), provider: 'auto' })
        },
        {
            pattern: /^\.gtts\s+([\s\S]+)$/i,
            handler: 'text_to_speech',
            description: 'Convert text to speech with GTTS only',
            extractArgs: (match: any) => ({ text: match[1].trim(), provider: 'gtts' })
        }
    ],

    toolDefinition: {
        type: 'function',
        function: {
            name: 'text_to_speech',
            description: 'Convert text directly to audio. Prefer Gemini 3.1 Flash TTS for expressive speech, voices, Director Chair notes, accents, pace, language/dialect, and inline audio tags. If Gemini quota/API fails, fallback is GTTS and Gemini-only controls are ignored instead of being passed to GTTS.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Text to vocalize. Gemini supports inline tags inside the text: [happy], [excited], [sad], [angry], [whispers], [laughs], [sigh], [slow], [fast], [short pause], [long pause], etc. Do not put two tags back-to-back without text or punctuation between them.'
                    },
                    voice: {
                        type: 'string',
                        enum: [
                            'Aoede', 'Zephyr', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Leda', 'Kore', 'Vindemiatrix',
                            'Charon', 'Puck', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Zubenelgenubi', 'Achernar',
                            'Algieba', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
                            'Achird', 'Sadachbia', 'Sadaltager', 'Sulafar'
                        ],
                        description: 'Gemini prebuilt voice name. Ignored by GTTS fallback.'
                    },
                    style_notes: {
                        type: 'string',
                        description: 'Gemini Director Chair high-level instruction, e.g. "deliver warmly and slowly", "professional narrator", "casual conversational". Ignored by GTTS fallback.'
                    },
                    tone: {
                        type: 'string',
                        description: 'Gemini tone or emotion direction, e.g. warm, sarcastic, calm, dramatic, professional. Ignored by GTTS fallback.'
                    },
                    accent: {
                        type: 'string',
                        description: 'Gemini accent direction, e.g. British accent, French accent, Southern US accent. Ignored by GTTS fallback.'
                    },
                    pace: {
                        type: 'string',
                        description: 'Gemini pace direction, e.g. slow, fast, measured, energetic. Ignored by GTTS fallback.'
                    },
                    language: {
                        type: 'string',
                        description: 'Language or dialect hint for Gemini; also used as GTTS language fallback when provider is GTTS (prefer ISO code like fr, en, ja for GTTS).'
                    },
                    speaker_1: {
                        type: 'string',
                        description: 'Gemini multi-speaker guidance for speaker 1 when the text identifies speakers. Ignored by GTTS fallback.'
                    },
                    speaker_2: {
                        type: 'string',
                        description: 'Gemini multi-speaker guidance for speaker 2 when the text identifies speakers. Ignored by GTTS fallback.'
                    },
                    provider: {
                        type: 'string',
                        enum: ['auto', 'gemini', 'gtts'],
                        description: 'auto/gemini: use Gemini first with GTTS fallback. gtts: force simple GTTS only.'
                    },
                    send_as: {
                        type: 'string',
                        enum: ['voice_note', 'audio'],
                        description: 'Send directly as "voice_note" (WhatsApp PTT) or "audio" (standard media audio). The plugin sends the file itself; no extra send_file tool is needed.'
                    }
                },
                required: ['text']
            }
        }
    },

    async execute(args: any, context: any, toolName?: string) {
        const { transport, chatId, message, container } = context || {};
        let {
            text,
            voice = 'Aoede',
            style_notes,
            tone,
            accent,
            pace,
            language = 'fr',
            speaker_1,
            speaker_2,
            provider = 'auto',
            send_as = 'voice_note'
        } = args;

        if (!transport || !chatId) {
            return { success: false, message: 'Transport or chatId missing from context' };
        }

        // Si pas de texte, tenter d'utiliser le message cité
        if (!text && message?.quotedMsg?.text) {
            text = message.quotedMsg.text;
        }

        if (!text) {
            return { success: false, message: 'Please provide text to convert to audio.' };
        }
        text = String(text).trim();
        if (!text) {
            return { success: false, message: 'Please provide text to convert to audio.' };
        }

        try {
            const voiceProvider = container?.get('voiceProvider');
            if (!voiceProvider) throw new Error('VoiceProvider service not found.');

            const result = provider === 'gtts'
                ? await voiceProvider.textToSpeechGttsOnly(text, { language })
                : await voiceProvider.textToSpeechGeminiFirst(text, {
                    model: 'gemini-3.1-flash-tts-preview',
                    voice,
                    style: style_notes,
                    tone,
                    accent,
                    pace,
                    language,
                    speaker_1,
                    speaker_2,
                    fallback_language: language
                });

            if (!result || !result.audioBuffer) {
                return {
                    success: false,
                    message: 'Could not generate audio. Please check if the Gemini TTS service is available.'
                };
            }

            // Envoi selon le type demandé
            if (send_as === 'audio') {
                await transport.sendMedia(chatId, result.filePath || result.audioBuffer, {
                    type: 'audio',
                    mimetype: result.format === 'ogg' ? 'audio/ogg; codecs=opus' : undefined,
                    caption: result.provider === 'gemini'
                        ? 'HIVE-MIND Audio (Gemini 3.1 TTS)'
                        : 'HIVE-MIND Audio (GTTS fallback)'
                });
            } else {
                const options = {
                    duration: Math.min(text.length * 60, 30000),
                    mimetype: result.format === 'ogg' ? 'audio/ogg; codecs=opus' : undefined
                };
                await transport.sendVoiceNote(chatId, result.filePath || result.audioBuffer, options);
            }

            return {
                success: true,
                message: `Audio generated via ${result.provider} (${send_as}).`
            };

        } catch (error: any) {
            console.error('[TTS Plugin] Execution error:', error);
            return {
                success: false,
                message: `Failed to generate audio: ${error.message}`
            };
        }
    }
};
