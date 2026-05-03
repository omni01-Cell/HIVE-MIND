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
            description: 'Convert text to vocal audio using high-end Gemini 3.1 Flash TTS. Supports custom voices, emotional tags, and professional direction.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The text to vocalize. Support inline tags: [happy], [sad], [whispers], [shouts], [laughs], [sigh], [fast], [slow], [short pause], [long pause]. Example: "[laughs] That was funny! [short pause] But let\'s focus."'
                    },
                    voice: {
                        type: 'string',
                        enum: ['Aoede', 'Charon', 'Kore', 'Callirrhoe', 'Zephyr', 'Leda'],
                        description: 'Select voice: Aoede (Warm/Default), Charon (Deep/Mysterious), Kore (Clear/Engaging), Callirrhoe (Professional), Zephyr (Light/Fast), Leda (Soft/Calm).'
                    },
                    style_notes: {
                        type: 'string',
                        description: 'Director\'s Chair notes (High-level instructions): tone (e.g. "Sarcastic", "Warmly"), accent (e.g. "British", "French"), pace, or specific character vibes.'
                    },
                    send_as: {
                        type: 'string',
                        enum: ['voice_note', 'audio'],
                        description: 'Send format: "voice_note" (Bot\'s private voice bubble) or "audio" (Standard media file for saving/forwarding).'
                    }
                },
                required: ['text']
            }
        }
    },

    async execute(args: any, context: any, toolName?: string) {
        const { transport, chatId, message, container } = context || {};
        let { text, voice = 'Aoede', style_notes, send_as = 'voice_note' } = args;

        if (!transport || !chatId) {
            return { success: false, message: 'Transport or chatId missing from context' };
        }

        // Si pas de texte, tenter d'utiliser le message cité
        if (!text && message.quotedMsg?.text) {
            text = message.quotedMsg.text;
        }

        if (!text) {
            return { success: false, message: 'Please provide text to convert to audio.' };
        }

        try {
            const voiceProvider = container?.get('voiceProvider');
            if (!voiceProvider) throw new Error('VoiceProvider service not found.');

            // Options pour le TTS (Ciblées Gemini)
            const ttsOptions: any = {
                style: style_notes,
                voice: voice
            };
            
            // CRITICAL: We force the use of textToSpeechWithVoice which prioritizes Gemini
            // and handles the advanced features (tags, style_notes).
            // This tool MUST NOT use Minimax (reserved for persona).
            const result = await voiceProvider.textToSpeechWithVoice(text, voice, ttsOptions);

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
                    caption: style_notes ? `🔊 Style: ${style_notes}` : '🔊 HIVE-MIND Audio (Gemini 3.1)'
                });
            } else {
                const options = { duration: Math.min(text.length * 60, 30000) };
                await transport.sendVoiceNote(chatId, result.filePath || result.audioBuffer, options);
            }

            return {
                success: true,
                message: `Audio generated with voice ${voice} (${send_as})! 🔊`
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
