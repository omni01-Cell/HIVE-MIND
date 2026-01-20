// utils/audioConverter.js
// Utilitaires de conversion audio pour Gemini Live API
// Formats: OGG (WhatsApp) ↔ PCM (Gemini)

import { spawn } from 'child_process';
import { createReadStream, createWriteStream, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Formats audio pour Gemini Live API
 */
export const AUDIO_FORMATS = {
    INPUT: {
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        format: 'pcm_s16le'
    },
    OUTPUT: {
        sampleRate: 24000,
        channels: 1,
        bitDepth: 16,
        format: 'pcm_s16le'
    }
};

/**
 * Convertit un fichier OGG (WhatsApp) en PCM pour Gemini
 * @param {string} oggPath - Chemin du fichier OGG
 * @returns {Promise<Buffer>} - Audio PCM 16-bit, 16kHz, Mono
 */
export async function oggToPcm(oggPath) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        const ffmpeg = spawn('ffmpeg', [
            '-i', oggPath,
            '-f', 's16le',           // PCM 16-bit signed little-endian
            '-acodec', 'pcm_s16le',
            '-ar', '16000',          // 16kHz (Gemini input)
            '-ac', '1',              // Mono
            '-'                       // Output to stdout
        ]);

        ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
        ffmpeg.stderr.on('data', () => { }); // Ignorer les logs ffmpeg

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(Buffer.concat(chunks));
            } else {
                reject(new Error(`ffmpeg exit code: ${code}`));
            }
        });

        ffmpeg.on('error', reject);
    });
}

/**
 * Convertit un buffer PCM (Gemini output) en fichier OGG pour WhatsApp
 * @param {Buffer} pcmBuffer - Audio PCM 16-bit, 24kHz, Mono
 * @param {Object} options - { sampleRate: 24000 }
 * @returns {Promise<string>} - Chemin du fichier OGG
 */
export async function pcmToOgg(pcmBuffer, options = {}) {
    const sampleRate = options.sampleRate || 24000;
    const outputPath = join(tmpdir(), `gemini_audio_${randomUUID()}.ogg`);

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',           // Input format: PCM 16-bit
            '-ar', sampleRate.toString(),
            '-ac', '1',              // Mono
            '-i', '-',               // Input from stdin
            '-c:a', 'libopus',       // Opus codec (WhatsApp compatible)
            '-b:a', '64k',           // Bitrate
            '-vbr', 'on',
            '-compression_level', '10',
            '-y',                    // Overwrite
            outputPath
        ]);

        ffmpeg.stdin.write(pcmBuffer);
        ffmpeg.stdin.end();

        ffmpeg.stderr.on('data', () => { }); // Ignorer les logs

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`ffmpeg exit code: ${code}`));
            }
        });

        ffmpeg.on('error', reject);
    });
}

/**
 * Convertit un fichier WAV en OGG pour WhatsApp
 * @param {string} wavPath - Chemin du fichier WAV
 * @returns {Promise<string>} - Chemin du fichier OGG
 */
export async function wavToOgg(wavPath) {
    const outputPath = join(tmpdir(), `gemini_audio_${randomUUID()}.ogg`);

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', wavPath,
            '-c:a', 'libopus',
            '-b:a', '64k',
            '-vbr', 'on',
            '-y',
            outputPath
        ]);

        ffmpeg.stderr.on('data', () => { });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`ffmpeg exit code: ${code}`));
            }
        });

        ffmpeg.on('error', reject);
    });
}

/**
 * Nettoie les fichiers temporaires
 * @param {...string} paths - Chemins des fichiers à supprimer
 */
export function cleanupTempFiles(...paths) {
    for (const path of paths) {
        try {
            if (path && existsSync(path)) {
                unlinkSync(path);
            }
        } catch (e) {
            console.warn('[AudioConverter] Cleanup failed:', path);
        }
    }
}

/**
 * Vérifie si ffmpeg est disponible
 * @returns {Promise<boolean>}
 */
export async function checkFfmpeg() {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-version']);
        ffmpeg.on('close', (code) => resolve(code === 0));
        ffmpeg.on('error', () => resolve(false));
    });
}

export default {
    oggToPcm,
    pcmToOgg,
    wavToOgg,
    cleanupTempFiles,
    checkFfmpeg,
    AUDIO_FORMATS
};
