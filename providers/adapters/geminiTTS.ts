// @ts-nocheck
// providers/adapters/geminiTTS.js
// Gemini 2.5 Flash TTS Adapter
// Features: Natural prompt control, 30 voices, <300ms latency, 80+ locales

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = dirname(fileURLToPath(import.meta.url));

export class GeminiTTSAdapter {
    name: any;
    apiKey: any;
    config: any;
    cacheDir: any;
    availableVoices: any;

    constructor(apiKey, config = {}) {
        this.name = 'gemini';
        this.apiKey = apiKey;
        this.config = config;
        this.cacheDir = path.join(__dirname, '..', '..', 'temp', 'voice_cache');


        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        // Voix disponibles (30 voix officielles)
        this.availableVoices = [
            'Aoede', 'Zephyr', 'Callirhoe', 'Autonoe', 'Despina', 'Erinome', 'Leda', 'Kore', 'Vindemiatrix',
            'Charon', 'Puck', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Zubenelgenubi', 'Achernar',
            'Algieba', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
            'Achird', 'Sadachbia', 'Sadaltager', 'Sulafar'
        ];
    }

    /**
     * Vérifie si l'adapter est disponible
     */
    isAvailable() {
        return this.apiKey && !this.apiKey.includes('VOTRE_CLE');
    }

    /**
     * Synthétise du texte en audio via Gemini 2.5 Flash TTS
     * @param {string} text Texte à vocaliser
     * @param {Object} options Options (voice, style, model)
     * @returns {Promise<{audioBuffer: Buffer, format: string, filePath?: string}>}
     */
    async synthesize(text: any, options: any = {}) {
        if (!this.isAvailable()) {
            throw new Error('Clé API Gemini manquante ou invalide');
        }

        const model = options.model || this.config.model || 'gemini-2.5-flash-tts';
        const voice = options.voice || this.config.voice || 'Aoede';

        // Valider la voix
        if (!this.availableVoices.includes(voice)) {
            console.warn(`[GeminiTTS] Voix "${voice}" inconnue, utilisation de "Aoede"`);
        }

        // Appliquer les instructions de style si présentes
        const finalText = options.style ? this._formatWithStyle(text, options.style) : text;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

        const body = {
            contents: [{ role: "user", parts: [{ text: finalText }] }],
            generationConfig: {
                responseModalities: ["audio"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voice
                        }
                    }
                }
            }
        };

        console.log(`[GeminiTTS] Synthèse: "${text.substring(0, 50)}..." (voice: ${voice}, model: ${model})`);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `Gemini TTS Error (${response.status})`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        if (!candidate) {
            throw new Error('Pas de réponse Gemini TTS');
        }

        // Trouver la partie audio
        const audioPart = candidate.content?.parts?.find((p: any) => p.inlineData);

        if (!audioPart) {
            throw new Error('Pas de données audio dans la réponse');
        }

        // Décoder l'audio Base64
        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = audioPart.inlineData.mimeType || 'audio/mp3';

        // Déterminer l'extension
        const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('pcm') ? 'pcm' : 'mp3';
        const tempPath = path.join(this.cacheDir, `gemini_${Date.now()}.${ext}`);
        fs.writeFileSync(tempPath, audioBuffer);

        // Convertir en OGG pour WhatsApp
        const outputOggPath = tempPath.replace(`.${ext}`, '.ogg');
        await this._convertToOgg(tempPath, outputOggPath);

        // Cleanup
        try { fs.unlinkSync(tempPath); } catch (e: any) { }

        const oggBuffer = fs.readFileSync(outputOggPath);

        return {
            audioBuffer: oggBuffer,
            format: 'ogg',
            filePath: outputOggPath
        };
    }

    /**
     * Formate le texte avec des instructions de style
     * Exemples: "[excitedly]", "[whispering]", "[slowly]"
     */
    _formatWithStyle(text: any, style: any) {
        return `[${style}] ${text}`;
    }

    /**
     * Liste les voix disponibles
     */
    getAvailableVoices() {
        return this.availableVoices;
    }

    /**
     * Convertit vers OGG Opus
     */
    _convertToOgg(inputPath: any, outputPath: any) {
        return new Promise((resolve: any, reject: any) => {
            ffmpeg(inputPath)
                .audioCodec('libopus')
                .audioBitrate('32k')
                .format('ogg')
                .on('end', () => resolve(outputPath))
                .on('error', (err: any) => reject(new Error(`FFmpeg error: ${err.message}`)))
                .save(outputPath);
        });
    }
}
