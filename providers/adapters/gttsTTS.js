// providers/adapters/gttsTTS.js
// Google TTS (Free Tier) Adapter
// Uses node-gtts - Last resort fallback

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = dirname(fileURLToPath(import.meta.url));

export class GttsTTSAdapter {
    constructor(config = {}) {
        this.name = 'gtts';
        this.config = config;
        this.cacheDir = path.join(__dirname, '..', '..', 'temp', 'voice_cache');


        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * GTTS est toujours disponible (gratuit, pas de quota)
     */
    isAvailable() {
        return true;
    }

    /**
     * Synthétise du texte en audio via Google TTS (node-gtts)
     * @param {string} text Texte à vocaliser
     * @param {Object} options Options (language)
     * @returns {Promise<{audioBuffer: Buffer, format: string, filePath?: string}>}
     */
    async synthesize(text, options = {}) {
        const language = options.language || this.config.language || 'fr';

        console.log(`[GTTS] Synthèse: "${text.substring(0, 50)}..." (lang: ${language})`);

        try {
            // Import dynamique
            const gtts = (await import('node-gtts')).default;
            const ttsInstance = gtts(language);

            // Générer l'audio en buffer
            const audioBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                const stream = ttsInstance.stream(text);

                stream.on('data', chunk => chunks.push(chunk));
                stream.on('end', () => resolve(Buffer.concat(chunks)));
                stream.on('error', reject);
            });

            // Sauvegarder temporairement
            const tempMp3Path = path.join(this.cacheDir, `gtts_${Date.now()}.mp3`);
            fs.writeFileSync(tempMp3Path, audioBuffer);

            // Convertir en OGG pour WhatsApp
            const outputOggPath = tempMp3Path.replace('.mp3', '.ogg');
            await this._convertToOgg(tempMp3Path, outputOggPath);

            // Cleanup
            try { fs.unlinkSync(tempMp3Path); } catch (e) { }

            const oggBuffer = fs.readFileSync(outputOggPath);

            return {
                audioBuffer: oggBuffer,
                format: 'ogg',
                filePath: outputOggPath
            };

        } catch (error) {
            console.error('[GTTS] Erreur:', error.message);
            throw error;
        }
    }

    /**
     * Convertit vers OGG Opus
     */
    _convertToOgg(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('libopus')
                .audioBitrate('32k')
                .format('ogg')
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
                .save(outputPath);
        });
    }
}
