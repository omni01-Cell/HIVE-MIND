// @ts-nocheck
// plugins/tts/index.js
// Text-to-Speech Plugin - Uses unified VoiceProvider

export default {
    name: 'text_to_speech',
    description: 'Converts text to audio with choice of voice.',
    version: '2.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'text_to_speech',
            description: 'Convert text to vocal audio. Supports multiple voices (Gemini: Aoede, Charon, Kore, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The text to convert to audio'
                    },
                    language: {
                        type: 'string',
                        description: 'Language code (en, fr, es, de, etc.). Default: en'
                    },
                    voice: {
                        type: 'string',
                        description: 'Name of the Gemini voice to use (Aoede, Charon, Kore, Fenrir, etc.). If not specified, uses the default Erina voice.'
                    }
                },
                required: ['text']
            }
        }
    },

    async execute(args: any, context: any, toolName?: string) {
        const { transport, chatId, message, container } = context || {};
        let { text, language = 'en', voice } = args;

        if (!transport || !chatId) {
            return { success: false, message: 'Transport or chatId missing from context' };
        }

        // If no text, try quoted message
        if (!text && message.quotedMsg?.text) {
            text = message.quotedMsg.text;
        }

        if (!text) {
            return {
                success: false,
                message: 'Tell me what you want me to say!'
            };
        }

        // Limit text length
        if (text.length > 1000) {
            text = text.substring(0, 1000);
        }

        try {
            // Retrieve VoiceProvider from container or fallback
            let voiceProvider = container?.get('voiceProvider');

            if (!voiceProvider) {
                console.warn('[TTS Plugin] VoiceProvider missing from context, attempting direct import...');
                try {
                    const { VoiceProvider } = await import('../../../services/voice/voiceProvider.js');
                    const { config: appConfig } = await import('../../../config/index.js');
                    const { quotaManager: qm } = await import('../../../services/quotaManager.js');
                    voiceProvider = new VoiceProvider(appConfig.voice, qm);
                } catch (e: any) {
                    console.error('[TTS Plugin] Fallback import failed:', e.message);
                }
            }

            if (!voiceProvider) {
                throw new Error('VoiceProvider not available (Service not found)');
            }

            let result: any;

            // If a specific voice is requested, use Gemini
            if (voice) {
                result = await voiceProvider.textToSpeechWithVoice(text, voice);
            } else {
                result = await voiceProvider.textToSpeech(text, { language });
            }

            if (!result || !result.audioBuffer) {
                return {
                    success: false,
                    message: 'No TTS provider available at the moment 😔'
                };
            }

            // Send as voice note (PTT) via sendVoiceNote
            // This correctly displays as a WhatsApp voice message
            if (result.filePath) {
                await transport.sendVoiceNote(chatId, result.filePath, {
                    duration: Math.min(text.length * 50, 3000) // Simulated duration
                });
            } else {
                await transport.sendVoiceNote(chatId, result.audioBuffer, {
                    duration: Math.min(text.length * 50, 3000)
                });
            }

            const providerInfo = voice ? `voice ${voice}` : `provider ${result.provider}`;
            return {
                success: true,
                message: `Audio sent! 🔊 (${providerInfo})`
            };

        } catch (error: any) {
            console.error('[TTS Plugin] Error:', error);
            return {
                success: false,
                message: `TTS Error: ${error.message}`
            };
        }
    }
};
