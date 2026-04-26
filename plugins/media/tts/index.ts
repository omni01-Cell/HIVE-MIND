// @ts-nocheck
// plugins/tts/index.js
// Plugin Text-to-Speech - Utilise le VoiceProvider unifié

export default {
    name: 'text_to_speech',
    description: 'Convertit du texte en audio avec choix de voix.',
    version: '2.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'text_to_speech',
            description: 'Convertir du texte en audio vocal. Supporte plusieurs voix (Gemini: Aoede, Charon, Kore, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Le texte à convertir en audio'
                    },
                    language: {
                        type: 'string',
                        description: 'Code langue (fr, en, es, de, etc.). Par défaut: fr'
                    },
                    voice: {
                        type: 'string',
                        description: 'Nom de la voix Gemini à utiliser (Aoede, Charon, Kore, Fenrir, etc.). Si non spécifié, utilise la voix Erina par défaut.'
                    }
                },
                required: ['text']
            }
        }
    },

    async execute(args: any, context: any) {
        const { transport, chatId, message, container } = context;
        let { text, language = 'fr', voice } = args;

        // Si pas de texte, essayer le message cité
        if (!text && message.quotedMsg?.text) {
            text = message.quotedMsg.text;
        }

        if (!text) {
            return {
                success: false,
                message: 'Dis-moi ce que tu veux que je prononce !'
            };
        }

        // Limite la longueur du texte
        if (text.length > 1000) {
            text = text.substring(0, 1000);
        }

        try {
            // Récupérer le VoiceProvider depuis le container ou fallback
            let voiceProvider = container?.get('voiceProvider');

            if (!voiceProvider) {
                console.warn('[TTS Plugin] VoiceProvider manquant dans le contexte, tentative import direct...');
                try {
                    const { VoiceProvider } = await import('../../../services/voice/voiceProvider.js');
                    const { config: appConfig } = await import('../../../config/index.js');
                    const { quotaManager: qm } = await import('../../../services/quotaManager.js');
                    voiceProvider = new VoiceProvider(appConfig.voice, qm);
                } catch (e: any) {
                    console.error('[TTS Plugin] Echec import fallback:', e.message);
                }
            }

            if (!voiceProvider) {
                throw new Error('VoiceProvider non disponible (Service introuvable)');
            }

            let result: any;

            // Si une voix spécifique est demandée, utiliser Gemini
            if (voice) {
                result = await voiceProvider.textToSpeechWithVoice(text, voice);
            } else {
                result = await voiceProvider.textToSpeech(text, { language });
            }

            if (!result || !result.audioBuffer) {
                return {
                    success: false,
                    message: 'Aucun provider TTS disponible actuellement 😔'
                };
            }

            // Envoyer comme note vocale (PTT) via sendVoiceNote
            // Cela affiche correctement comme un vocal WhatsApp
            if (result.filePath) {
                await transport.sendVoiceNote(chatId, result.filePath, {
                    duration: Math.min(text.length * 50, 3000) // Simulation durée
                });
            } else {
                await transport.sendVoiceNote(chatId, result.audioBuffer, {
                    duration: Math.min(text.length * 50, 3000)
                });
            }

            const providerInfo = voice ? `voix ${voice}` : `provider ${result.provider}`;
            return {
                success: true,
                message: `Audio envoyé ! 🔊 (${providerInfo})`
            };

        } catch (error: any) {
            console.error('[TTS Plugin] Erreur:', error);
            return {
                success: false,
                message: `Erreur TTS: ${error.message}`
            };
        }
    }
};
