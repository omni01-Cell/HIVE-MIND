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

function buildDirectorNotes(options: any = {}) {
    const notes = [
        options.style,
        options.tone ? `Tone: ${options.tone}` : null,
        options.accent ? `Accent: ${options.accent}` : null,
        options.pace ? `Pace: ${options.pace}` : null,
        options.language ? `Language or dialect: ${options.language}` : null,
        options.speaker_1 ? `Speaker 1: ${options.speaker_1}` : null,
        options.speaker_2 ? `Speaker 2: ${options.speaker_2}` : null
    ].filter(Boolean);

    return notes.length > 0 ? notes.join('. ') : '';
}

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
            'Aoede', 'Zephyr', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Leda', 'Kore', 'Vindemiatrix',
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
     * Synthétise du texte en audio via Gemini 3.1 Flash TTS
     * @param {string} text Texte à vocaliser
     * @param {Object} options Options (voice, style, model)
     * @returns {Promise<{audioBuffer: Buffer, format: string, filePath?: string}>}
     */
    async synthesize(text: any, options: any = {}) {
        if (!this.isAvailable()) {
            throw new Error('Clé API Gemini manquante ou invalide');
        }

        const model = options.model || this.config.model || 'gemini-3.1-flash-tts-preview';
        const voice = options.voice || this.config.voice || 'Aoede';

        // Valider la voix
        if (!this.availableVoices.includes(voice)) {
            console.warn(`[GeminiTTS] Voix "${voice}" inconnue, utilisation de "Aoede"`);
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

        // Construction du contenu avec Director's Notes (style)
        // Les instructions de haut niveau sont placées entre parenthèses au début selon la doc
        const directorNotes = buildDirectorNotes(options);
        const finalText = directorNotes ? `(${directorNotes}) ${text}` : text;

        const body = {
            contents: [{ 
                role: "user", 
                parts: [{ text: finalText }] 
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
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
        if (directorNotes) console.log(`[GeminiTTS] 🎬 Director notes: ${directorNotes}`);

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
            throw new Error('Pas de données audio dans la réponse. Vérifiez que le modèle supporte le mode AUDIO.');
        }

        // Décoder l'audio Base64
        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = audioPart.inlineData.mimeType || 'audio/pcm';

        // Sauvegarde temporaire du fichier brut
        const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('pcm') ? 'pcm' : 'mp3';
        const tempPath = path.join(this.cacheDir, `gemini_${Date.now()}.${ext}`);
        fs.writeFileSync(tempPath, audioBuffer);

        // Convertir en OGG pour WhatsApp (Opus)
        const outputOggPath = tempPath.replace(`.${ext}`, '.ogg');
        
        try {
            await this._convertToOgg(tempPath, outputOggPath, ext === 'pcm');
        } catch (convErr: any) {
            console.error('[GeminiTTS] Conversion error:', convErr.message);
            // Fallback: si conversion échoue, on renvoie le buffer tel quel s'il est MP3/WAV
            if (ext !== 'pcm') {
                return { audioBuffer, format: ext, filePath: tempPath };
            }
            throw convErr;
        }

        // Cleanup original
        try { fs.unlinkSync(tempPath); } catch (e: any) { }

        const oggBuffer = fs.readFileSync(outputOggPath);

        return {
            audioBuffer: oggBuffer,
            format: 'ogg',
            filePath: outputOggPath,
            provider: 'gemini',
            model: model
        };
    }

    /**
     * Liste les voix disponibles
     */
    getAvailableVoices() {
        return this.availableVoices;
    }

    /**
     * Convertit vers OGG Opus
     * @param {boolean} isRawPcm - Si vrai, spécifie les paramètres PCM pour FFmpeg
     */
    _convertToOgg(inputPath: any, outputPath: any, isRawPcm: boolean = false) {
        return new Promise((resolve: any, reject: any) => {
            let command = ffmpeg(inputPath);
            
            if (isRawPcm) {
                // Gemini TTS renvoie du PCM 16-bit little-endian mono à 24kHz
                command = command.inputOptions([
                    '-f s16le',
                    '-ar 24000',
                    '-ac 1'
                ]);
            }

            command
                .audioCodec('libopus')
                .audioBitrate('32k')
                .format('ogg')
                .on('end', () => resolve(outputPath))
                .on('error', (err: any) => reject(new Error(`FFmpeg error: ${err.message}`)))
                .save(outputPath);
        });
    }
}
