// @ts-nocheck
// providers/geminiLive.js
// Provider pour Gemini 2.5 Flash Native Audio via Live API (WebSocket)
// Supporte: Transcription vocale, Réponses HD, Détection d'émotion, Tool calling

import { GoogleGenAI, Modality } from '@google/genai';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Voix HD disponibles (30 voix, 24 langues)
 */
export const HD_VOICES = {
    // Voix principales
    ZEPHYR: 'Zephyr',       // Neutre, professionnel
    PUCK: 'Puck',           // Joueur, énergique
    KORE: 'Kore',           // Doux, empathique
    ACHERNAR: 'Achernar',   // Profond, autoritaire
    ACHIRD: 'Achird',       // Clair, articulé
    ALGENIB: 'Algenib',     // Chaleureux, amical
    // ... autres voix disponibles via l'API
};

/**
 * Provider Gemini Live Audio
 * Utilise le WebSocket Live API pour l'audio natif
 */
export class GeminiLiveProvider {
    ai: any;
    model: any;
    defaultVoice: any;
    tools: any;
    onToolCall: any;

    constructor(apiKey, options = {}) {
        this.ai = new GoogleGenAI({ apiKey });
        this.model = options.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
        this.defaultVoice = options.voice || HD_VOICES.ZEPHYR;
        this.tools = options.tools || [];
        this.onToolCall = options.onToolCall || null;
    }

    /**
     * Configure les outils disponibles pour le modèle
     * @param {Array} tools - Déclarations de fonctions
     */
    setTools(tools: any) {
        this.tools = tools;
    }

    /**
     * Définit le callback pour les appels d'outils
     * @param {Function} callback - (toolCall: any) => Promise<result>
     */
    setToolCallback(callback: any) {
        this.onToolCall = callback;
    }

    /**
     * Traite un message audio et retourne une réponse audio
     * @param {Buffer} audioBuffer - Audio PCM 16-bit, 16kHz, Mono
     * @param {Object} options - Configuration
     * @returns {Promise<Object>} - { audioBuffer, transcription, emotion }
     */
    async processAudio(audioBuffer: any, options: any = {}) {
        const voice = options.voice || this.defaultVoice;
        const responseQueue = [];
        let session: any;

        try {
            const config = {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voice
                        }
                    }
                },
                contextWindowCompression: {
                    triggerTokens: '25600',
                    slidingWindow: { targetTokens: '12800' }
                }
            };

            // Ajouter les outils si configurés
            if (this.tools.length > 0) {
                config.tools = [{ functionDeclarations: this.tools }];
            }

            // Connexion WebSocket
            session = await this.ai.live.connect({
                model: this.model,
                config,
                callbacks: {
                    onopen: () => console.log('[GeminiLive] Session ouverte'),
                    onmessage: (message) => responseQueue.push(message),
                    onerror: (e) => console.error('[GeminiLive] Erreur:', e.message),
                    onclose: () => console.log('[GeminiLive] Session fermée')
                }
            });

            // Envoyer l'audio
            session.sendRealtimeInput({
                media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: audioBuffer.toString('base64')
                }
            });

            // Attendre la réponse complète
            const response = await this._waitForResponse(responseQueue, session);

            session.close();
            return response;

        } catch (error: any) {
            console.error('[GeminiLive] Erreur processAudio:', error);
            if (session) session.close();
            throw error;
        }
    }

    /**
     * Génère une réponse audio à partir de texte (TTS HD)
     * @param {string} text - Texte à convertir en audio
     * @param {Object} options - { voice: 'Zephyr' }
     * @returns {Promise<Object>} - { audioBuffer, filePath }
     */
    async textToSpeech(text: any, options: any = {}) {
        const voice = options.voice || this.defaultVoice;
        const responseQueue = [];
        let session: any;

        try {
            const config = {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voice
                        }
                    }
                }
            };

            session = await this.ai.live.connect({
                model: this.model,
                config,
                callbacks: {
                    onmessage: (message) => responseQueue.push(message),
                    onerror: (e) => console.error('[GeminiLive] TTS Error:', e.message)
                }
            });

            // Envoyer le texte
            session.sendClientContent({
                turns: [text]
            });

            // Attendre l'audio
            const response = await this._waitForResponse(responseQueue, session);

            session.close();

            // Sauvegarder en fichier WAV
            if (response.audioBuffer) {
                const filePath = join(tmpdir(), `gemini_tts_${randomUUID()}.wav`);
                const wavBuffer = this._createWavBuffer(response.audioParts, 24000);
                writeFileSync(filePath, wavBuffer);
                response.filePath = filePath;
            }

            return response;

        } catch (error: any) {
            console.error('[GeminiLive] Erreur TTS:', error);
            if (session) session.close();
            throw error;
        }
    }

    /**
     * Attend la réponse complète du modèle
     * @private
     */
    async _waitForResponse(queue: any, session: any) {
        const audioParts = [];
        let transcription = '';
        let emotion: any = null;
        let done = false;

        while (!done) {
            const message = queue.shift();

            if (!message) {
                await new Promise(r => setTimeout(r, 100));
                continue;
            }

            // Traiter le contenu du serveur
            if (message.serverContent) {
                const content = message.serverContent;

                // Fin du tour
                if (content.turnComplete) {
                    done = true;
                    continue;
                }

                // Parties du modèle
                if (content.modelTurn?.parts) {
                    for (const part of content.modelTurn.parts) {
                        // Audio inline
                        if (part.inlineData) {
                            audioParts.push(part.inlineData.data);
                        }
                        // Texte (transcription ou réponse)
                        if (part.text) {
                            transcription += part.text;
                        }
                    }
                }
            }

            // Appel d'outil
            if (message.toolCall && this.onToolCall) {
                console.log('[GeminiLive] Tool call:', message.toolCall.functionCalls);

                const results = [];
                for (const call of message.toolCall.functionCalls) {
                    const result = await this.onToolCall(call);
                    results.push({
                        name: call.name,
                        id: call.id,
                        response: result
                    });
                }

                // Envoyer les résultats
                session.sendToolResponse({ functionResponses: results });
            }
        }

        return {
            audioParts,
            audioBuffer: audioParts.length > 0
                ? Buffer.concat(audioParts.map((d: any) => Buffer.from(d, 'base64')))
                : null,
            transcription: transcription.trim(),
            emotion
        };
    }

    /**
     * Crée un buffer WAV à partir de données PCM
     * @private
     */
    _createWavBuffer(pcmParts: any, sampleRate: any = 24000) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;

        const pcmBuffer = Buffer.concat(pcmParts.map((d: any) => Buffer.from(d, 'base64')));
        const dataLength = pcmBuffer.length;

        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataLength, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataLength, 40);

        return Buffer.concat([header, pcmBuffer]);
    }
}

/**
 * Factory function pour créer le provider
 */
export function createGeminiLiveProvider(credentials, options = {}) {
    const apiKey = credentials.familles_ia?.gemini;
    if (!apiKey) {
        throw new Error('[GeminiLive] Clé API Gemini manquante');
    }
    return new GeminiLiveProvider(apiKey, options);
}

export default GeminiLiveProvider;
