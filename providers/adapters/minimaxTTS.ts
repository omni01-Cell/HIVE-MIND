// @ts-nocheck
// providers/adapters/minimaxTTS.js
// Minimax TTS Adapter - Voix Erina (Primary)
// Documentation: https://platform.minimax.io/docs/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = dirname(fileURLToPath(import.meta.url));

export class MinimaxTTSAdapter {
    name: any;
    apiKey: any;
    baseUrl: any;
    config: any;
    cacheDir: any;

    constructor(apiKey, config = {}) {
        this.name = 'minimax';
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.minimax.io/v1/t2a_v2';
        this.config = config;
        this.cacheDir = path.join(__dirname, '..', '..', 'temp', 'voice_cache');


        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Vérifie si l'adapter est disponible
     */
    isAvailable() {
        return this.apiKey && !this.apiKey.includes('VOTRE_CLE');
    }

    /**
     * Synthétise du texte en audio
     * @param {string} text Texte à vocaliser
     * @param {Object} options Options (voice_id, speed, etc.)
     * @returns {Promise<{audioBuffer: Buffer, format: string, filePath?: string}>}
     */
    async synthesize(text: any, options: any = {}) {
        if (!this.isAvailable()) {
            throw new Error('Clé API Minimax manquante ou invalide');
        }

        const model = options.model || this.config.model || 'speech-02-hd';
        const voiceId = options.voice_id || this.config.voice_id || 'female-01';

        const payload = {
            model: model,
            text: text,
            stream: false,
            voice_setting: {
                voice_id: voiceId,
                speed: options.speed || this.config.speed || 1.0,
                vol: options.vol || this.config.vol || 1.0,
                pitch: options.pitch || this.config.pitch || 0
            },
            audio_setting: {
                sample_rate: 32000,
                bitrate: 128000,
                format: "mp3",
                channel: 1
            }
        };

        console.log(`[MinimaxTTS] Synthèse: "${text.substring(0, 50)}..." (voice: ${voiceId})`);

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Minimax API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        if (data.base_resp && data.base_resp.status_code !== 0) {
            throw new Error(`Minimax Error: ${data.base_resp.status_msg}`);
        }

        if (!data.data || !data.data.audio) {
            throw new Error('Réponse invalide: pas de données audio');
        }

        const audioBuffer = Buffer.from(data.data.audio, 'hex');

        // Sauvegarder temporairement et convertir en OGG pour WhatsApp
        const tempMp3Path = path.join(this.cacheDir, `minimax_${Date.now()}.mp3`);
        fs.writeFileSync(tempMp3Path, audioBuffer);

        const outputOggPath = tempMp3Path.replace('.mp3', '.ogg');
        await this._convertToOgg(tempMp3Path, outputOggPath);

        // Cleanup MP3
        try { fs.unlinkSync(tempMp3Path); } catch (e: any) { }

        const oggBuffer = fs.readFileSync(outputOggPath);

        return {
            audioBuffer: oggBuffer,
            format: 'ogg',
            filePath: outputOggPath
        };
    }

    /**
     * Convertit MP3 vers OGG Opus
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
