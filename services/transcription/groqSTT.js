
// services/transcription/groqSTT.js
// Service de transcription audio via Groq Whisper (OpenAI Compatible)
// Base URL: https://api.groq.com/openai/v1/audio/transcriptions

import fs from 'fs';
import FormData from 'form-data'; // Built-in in Node 18+ fetch? No, need manual boundary or fetch-blob/form-data polyfill usually. 
// Actually Node 18+ has native fetch but constructing multipart/form-data for file upload is tricky without a lib or pure construction.
// Let's use 'fluent-ffmpeg' for conversion if needed, but for upload we need to send the file.

export class GroqTranscriptionService {
    constructor(apiKey, config = {}) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
        this.config = config; // { model: 'whisper-large-v3' }
    }

    /**
     * Transcrit un fichier audio
     * @param {string} filePath Chemin absolu du fichier audio
     * @returns {Promise<string>} Le texte transcrit
     */
    async transcribe(filePath) {
        if (!this.apiKey) {
            throw new Error('Clé API Groq manquante pour le STT');
        }

        const model = this.config.model || 'whisper-large-v3';

        // Construction du Multipart (Node.js native approach usually requires 'form-data' package or Blob/File from buffer)
        // Since we are in an ES Module env with recent Node, we can use `fetch` with `FormData` if available, 
        // BUT Node's native FormData is limited. 
        // Let's manually construct the body using 'form-data' package if available or just import it.
        // CHECK: package.json didn't list 'form-data'. It's standard to install it or use the one from 'undici' (node built-in).
        // Let's try Node 20+ style 'openAsBlob' (fs) -> FormData.

        try {
            // Lazy load SDK to avoid startup overhead
            const { Groq } = await import('groq-sdk');
            const groq = new Groq({ apiKey: this.apiKey });

            console.log(`[Groq] Transcription démarrage: ${filePath} (${model})`);

            const transcription = await groq.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: model,
                language: this.config.language || 'fr',
                response_format: 'json'
            });

            return transcription.text;

        } catch (error) {
            console.error('❌ Erreur Transcription Groq:', error);
            throw error;
        }
    }
}
