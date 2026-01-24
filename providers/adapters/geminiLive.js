// providers/adapters/geminiLive.js
// Adapter pour Gemini 2.5 Flash Native Audio (Live API)
// PRIORITY 0: Provider principal pour TTS haute qualité

import { GeminiLiveProvider, HD_VOICES } from '../geminiLive.js';
import { oggToPcm, pcmToOgg, wavToOgg, cleanupTempFiles } from '../../utils/audioConverter.js';

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class GeminiLiveAdapter {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.options = options;
        this.provider = null;
        this.defaultVoice = options.voice || HD_VOICES.ZEPHYR;

        if (apiKey) {
            this.provider = new GeminiLiveProvider(apiKey, {
                voice: this.defaultVoice
            });
        }
    }

    /**
     * Vérifie si l'adapter est disponible
     */
    isAvailable() {
        return !!this.provider && !!this.apiKey;
    }

    /**
     * Liste des voix HD disponibles
     */
    getAvailableVoices() {
        return Object.values(HD_VOICES);
    }

    /**
     * Synthèse vocale TTS
     * @param {string} text - Texte à convertir
     * @param {Object} options - { voice: 'Zephyr' }
     * @returns {Promise<{ audioBuffer: Buffer, format: string, filePath: string }>}
     */
    async synthesize(text, options = {}) {
        if (!this.provider) {
            throw new Error('GeminiLive provider not initialized');
        }

        const voice = options.voice || this.defaultVoice;

        try {
            // Utiliser le provider Live pour TTS
            const result = await this.provider.textToSpeech(text, { voice });

            if (!result || !result.filePath) {
                throw new Error('No audio generated');
            }

            // Convertir WAV → OGG pour WhatsApp
            const oggPath = await wavToOgg(result.filePath);

            // Cleanup WAV temp
            cleanupTempFiles(result.filePath);

            return {
                audioBuffer: readFileSync(oggPath),
                format: 'ogg',
                filePath: oggPath,
                voice: voice,
                provider: 'gemini-live'
            };

        } catch (error) {
            console.error('[GeminiLiveAdapter] TTS Error:', error.message);
            throw error;
        }
    }

    /**
     * Transcription vocale STT
     * @param {string} audioPath - Chemin du fichier OGG
     * @returns {Promise<{ transcription: string, emotion: string | null }>}
     */
    async transcribe(audioPath, options = {}) {
        if (!this.provider) {
            throw new Error('GeminiLive provider not initialized');
        }

        try {
            // Convertir OGG → PCM pour Gemini
            const pcmBuffer = await oggToPcm(audioPath);

            // Envoyer au Live API
            const result = await this.provider.processAudio(pcmBuffer);

            return {
                transcription: result.transcription,
                emotion: result.emotion,
                provider: 'gemini-live'
            };

        } catch (error) {
            console.error('[GeminiLiveAdapter] STT Error:', error.message);
            throw error;
        }
    }
}

export default GeminiLiveAdapter;
