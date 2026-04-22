// @ts-nocheck
// services/audio/audioConverter.js
// Convertit les formats audio entre WhatsApp (OGG Opus) et Gemini (PCM 16kHz mono)

import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { unlink } from 'fs/promises';

/**
 * Convertir OGG Opus vers PCM 16kHz mono (format Gemini)
 * @param {string} inputPath - Chemin du fichier OGG
 * @returns {Promise<Buffer>} Buffer PCM
 */
export async function convertOggToPcm(inputPath) {
    return new Promise((resolve: any, reject: any) => {
        const chunks = [];

        ffmpeg(inputPath)
            .audioCodec('pcm_s16le') // PCM 16-bit little endian
            .audioFrequency(16000)    // 16kHz
            .audioChannels(1)         // Mono
            .format('s16le')          // Raw PCM
            .on('error', (err: any) => {
                console.error('[AudioConverter] ❌ OGG→PCM error:', err.message);
                reject(err);
            })
            .on('end', () => {
                const buffer = Buffer.concat(chunks);
                console.log(`[AudioConverter] ✅ OGG→PCM (${buffer.length} bytes)`);
                resolve(buffer);
            })
            .pipe()
            .on('data', (chunk: any) => chunks.push(chunk));
    });
}

/**
 * Convertir PCM vers OGG Opus (format WhatsApp)
 * @param {string} inputPath - Chemin du fichier PCM
 * @param {string} outputPath - Chemin de sortie OGG
 * @returns {Promise<string>} Chemin du fichier OGG
 */
export async function convertPcmToOgg(inputPath, outputPath) {
    return new Promise((resolve: any, reject: any) => {
        ffmpeg(inputPath)
            .inputFormat('s16le')
            .inputOptions([
                '-ar 16000',   // Sample rate
                '-ac 1'        // Mono
            ])
            .audioCodec('libopus')
            .audioBitrate('64k')
            .format('ogg')
            .on('error', (err: any) => {
                console.error('[AudioConverter] ❌ PCM→OGG error:', err.message);
                reject(err);
            })
            .on('end', () => {
                console.log(`[AudioConverter] ✅ PCM→OGG: ${outputPath}`);
                resolve(outputPath);
            })
            .save(outputPath);
    });
}

/**
 * Convertir et nettoyer (tout-en-un)
 * @param {string} inputOgg - Fichier OGG WhatsApp
 * @param {string} outputOgg - Fichier OGG de sortie
 * @param {Function} processCallback - Fonction de traitement (reçoit PCM buffer)
 */
export async function processAudioPipeline(inputOgg, outputOgg, processCallback) {
    let pcmBuffer: any = null;
    let tempPcmPath: any = null;

    try {
        // 1. OGG → PCM
        console.log('[AudioConverter] 🔄 Pipeline: OGG → PCM');
        pcmBuffer = await convertOggToPcm(inputOgg);

        // 2. Traiter (ex: envoyer à Gemini)
        console.log('[AudioConverter] ⚙️ Processing audio...');
        tempPcmPath = await processCallback(pcmBuffer);

        // 3. PCM → OGG
        console.log('[AudioConverter] 🔄 Pipeline: PCM → OGG');
        await convertPcmToOgg(tempPcmPath, outputOgg);

        return outputOgg;

    } finally {
        // Cleanup
        if (tempPcmPath) {
            await unlink(tempPcmPath).catch(() => { });
        }
    }
}

export default {
    convertOggToPcm,
    convertPcmToOgg,
    processAudioPipeline
};
