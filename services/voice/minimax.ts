// @ts-nocheck

// services/voice/minimax.js
// Service d'intégration vocale Minimax (T2A)
// Documentation: https://platform.minimax.io/docs/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Configurer ffmpeg avec le binaire installé
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = dirname(fileURLToPath(import.meta.url));

export class MinimaxVoiceService {
    apiKey: any;
    baseUrl: any;
    config: any;
    cacheDir: any;

    constructor(apiKey, config = {}) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.minimax.io/v1/t2a_v2';
        this.config = config; // { voice_id, model, speed, ... }

        // Cache directory
        this.cacheDir = path.join(__dirname, '..', '..', 'temp', 'voice_cache');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Génère un fichier audio (MP3 -> OGG Opus)
     * @param {string} text Le texte à vocaliser
     * @param {string} [voiceId] ID de voix spécifique (optionnel)
     * @returns {Promise<string>} Chemin du fichier OGG généré
     */
    async generateAudio(text: any, voiceId: any = null) {
        if (!this.apiKey || this.apiKey.includes('VOTRE_CLE')) {
            throw new Error('Clé API Minimax manquante ou invalide');
        }

        const model = this.config.model || 'speech-02-hd';
        const selectedVoiceId = voiceId || this.config.voice_id || 'female-01'; // Fallback

        // TODO: Implémenter le cache ici (MD5 du texte + voiceId)

        const payload = {
            model: model,
            text: text,
            stream: false,
            voice_setting: {
                voice_id: selectedVoiceId,
                speed: this.config.speed || 1.0,
                vol: this.config.vol || 1.0,
                pitch: this.config.pitch || 0
            },
            audio_setting: {
                sample_rate: 32000,
                bitrate: 128000,
                format: "mp3", // Minimax output format
                channel: 1
            }
        };

        try {
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

            // Minimax retourne de l'audio en Hex string
            if (!data.data || !data.data.audio) {
                throw new Error('Réponse invalide: pas de données audio');
            }

            const audioHex = data.data.audio;
            const audioBuffer = Buffer.from(audioHex, 'hex');

            // Sauvegarder MP3 temporaire
            const tempMp3Path = path.join(this.cacheDir, `temp_${Date.now()}.mp3`);
            fs.writeFileSync(tempMp3Path, audioBuffer);

            // Convertir en OGG Opus pour WhatsApp
            const outputOggPath = tempMp3Path.replace('.mp3', '.ogg');

            await this.convertToOgg(tempMp3Path, outputOggPath);

            // Cleanup MP3
            try { fs.unlinkSync(tempMp3Path); } catch (e: any) { }

            return outputOggPath;

        } catch (error: any) {
            console.error('❌ Erreur génération vocale Minimax:', error);
            throw error;
        }
    }

    /**
     * Convertit MP3 vers OGG Opus via FFmpeg
     */
    convertToOgg(inputPath: any, outputPath: any) {
        return new Promise((resolve: any, reject: any) => {
            ffmpeg(inputPath)
                .audioCodec('libopus')
                .audioBitrate('32k') // Suffisant pour la voix
                .format('ogg')
                .on('end', () => resolve(outputPath))
                .on('error', (err: any) => reject(new Error(`FFmpeg error: ${err.message}`)))
                .save(outputPath);
        });
    }
}
