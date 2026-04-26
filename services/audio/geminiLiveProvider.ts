// @ts-nocheck
// services/audio/geminiLiveProvider.ts
// Provider pour Gemini 2.5 Flash Native Audio (Live API)
// Support: Audio streaming, Function calling, Émotions préservées

import WebSocket from 'ws';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { convertOggToPcm } from './audioConverter.js';

/**
 * GeminiLiveProvider
 * Gère les conversations audio en temps réel avec Gemini 2.5 Flash
 * 
 * Flux: OGG/Opus (WhatsApp) → PCM 16kHz (Gemini) → PCM 24kHz (réponse) → OGG (WhatsApp)
 */
export class GeminiLiveProvider {
    apiKey: any;
    model: any;
    ws: any;
    isConnected: any;
    pendingTools: any;
    audioQueue: any;
    toolExecutor: any;
    responseResolver: any;
    responseRejector: any;
    transcribedText: any;

    constructor(config: any = {}) {
        this.apiKey = config.apiKey || process.env.GEMINI_API_KEY;
        this.model = config.model || 'gemini-3.1-flash-live-preview';
        this.ws = null;
        this.isConnected = false;
        this.pendingTools = new Map();
        this.audioQueue = [];
        this.toolExecutor = config.toolExecutor;
        this.responseResolver = null;
        this.responseRejector = null;
        this.transcribedText = null;
    }

    /**
     * Connexion au Live API
     * Attend la confirmation setupComplete avant de résoudre la promesse
     */
    async connect(sessionConfig: any = {}): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

            console.log('[GeminiLive] 🔌 Connexion au Live API...');
            this.ws = new WebSocket(url);

            // Reset state for new session
            this.audioQueue = [];
            this.transcribedText = null;
            this.pendingTools.clear();

            let setupReceived = false;

            this.ws.on('open', () => {
                console.log('[GeminiLive] ✅ WebSocket connecté');
                this.isConnected = true;
                this._sendSetup(sessionConfig);
                // Ne PAS resolve ici — on attend setupComplete
            });

            this.ws.on('message', (data: any) => {
                try {
                    const message = JSON.parse(data.toString());

                    // Intercept setupComplete pour résoudre connect()
                    if (message.setupComplete && !setupReceived) {
                        setupReceived = true;
                        console.log('[GeminiLive] ✓ Setup confirmed — session prête');
                        resolve();
                        return;
                    }

                    // Tous les autres messages passent par le handler normal
                    this._handleMessage(message);

                } catch (error: any) {
                    console.error('[GeminiLive] Erreur parsing message:', error.message);
                }
            });

            this.ws.on('error', (error: any) => {
                console.error('[GeminiLive] ❌ WebSocket error:', error.message);
                this.isConnected = false;
                reject(error);
            });

            this.ws.on('close', (code: number, reason: Buffer) => {
                const reasonStr = reason?.toString() || 'unknown';
                console.log(`[GeminiLive] 🔌 WebSocket fermé (code=${code}, reason=${reasonStr})`);
                this.isConnected = false;

                // Rejeter la promesse de réponse en cours si le WS se ferme inopinément
                if (this.responseRejector) {
                    this.responseRejector(new Error(`WebSocket closed unexpectedly (code=${code})`));
                    this.responseResolver = null;
                    this.responseRejector = null;
                }

                // Rejeter connect si pas encore setup
                if (!setupReceived) {
                    reject(new Error(`WebSocket closed before setup (code=${code})`));
                }
            });

            // Timeout de connexion + setup
            setTimeout(() => {
                if (!setupReceived) {
                    reject(new Error('Setup timeout (15s)'));
                    this.disconnect().catch(() => {});
                }
            }, 15000);
        });
    }

    /**
     * Envoyer la configuration de session (camelCase requis par l'API Gemini)
     */
    _sendSetup(config: any) {
        const setupMessage: any = {
            setup: {
                model: `models/${this.model}`,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: config.voice || 'Aoede'
                            }
                        }
                    }
                }
            }
        };

        console.log(`[GeminiLive] 📋 Setup: model=${this.model}`);

        // System instruction
        if (config.systemPrompt) {
            setupMessage.setup.systemInstruction = {
                parts: [{ text: config.systemPrompt }]
            };
        }

        // Tools (function declarations)
        if (config.tools && config.tools.length > 0) {
            setupMessage.setup.tools = [{
                functionDeclarations: config.tools.map((tool: any) => ({
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }))
            }];
        }

        this._send(setupMessage);
        console.log('[GeminiLive] ⚙️ Session configurée (tools:', config.tools?.length || 0, ')');
    }

    /**
     * Envoyer de l'audio au modèle
     * Accepte un buffer OGG/Opus (WhatsApp) OU un buffer PCM brut.
     * La conversion OGG→PCM est gérée automatiquement.
     * 
     * Utilise `realtimeInput.mediaChunks` (format requis par le Live API).
     * Puis signale `turnComplete` via `clientContent`.
     */
    async sendAudio(audioBuffer: any) {
        if (!this.isConnected) {
            throw new Error('WebSocket not connected');
        }

        let pcmBuffer: Buffer;

        // Détecter le format : OGG commence par "OggS" (0x4F676753)
        const isOgg = audioBuffer.length >= 4 &&
            audioBuffer[0] === 0x4F &&
            audioBuffer[1] === 0x67 &&
            audioBuffer[2] === 0x67 &&
            audioBuffer[3] === 0x53;

        if (isOgg) {
            console.log('[GeminiLive] 🔄 Conversion OGG→PCM...');
            const tempDir = join(process.cwd(), 'temp', 'stt');
            if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
            const tempOgg = join(tempDir, `live_input_${Date.now()}.ogg`);
            writeFileSync(tempOgg, audioBuffer);

            try {
                pcmBuffer = await convertOggToPcm(tempOgg);
            } finally {
                import('fs/promises').then(fsp => fsp.unlink(tempOgg).catch(() => {}));
            }
        } else {
            pcmBuffer = audioBuffer;
        }

        const base64Audio = pcmBuffer.toString('base64');

        // Envoyer l'audio via realtimeInput.audio (format documenté par Google)
        // La VAD côté serveur détecte automatiquement la fin du tour
        this._send({
            realtimeInput: {
                audio: {
                    data: base64Audio,
                    mimeType: 'audio/pcm;rate=16000'
                }
            }
        });

        console.log(`[GeminiLive] 🎤 Audio envoyé (${pcmBuffer.length} bytes PCM, original: ${audioBuffer.length} bytes)`);
    }

    /**
     * Attendre la réponse du modèle
     */
    async waitForResponse(timeoutMs: any = 30000): Promise<any> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.responseResolver = null;
                this.responseRejector = null;
                reject(new Error('Response timeout'));
            }, timeoutMs);

            this.responseResolver = (response: any) => {
                clearTimeout(timeout);
                this.responseResolver = null;
                this.responseRejector = null;
                resolve(response);
            };

            this.responseRejector = (error: any) => {
                clearTimeout(timeout);
                this.responseResolver = null;
                this.responseRejector = null;
                reject(error);
            };
        });
    }

    /**
     * Gérer les messages du serveur (après setup)
     */
    _handleMessage(message: any) {
        // Server content (réponse du modèle)
        if (message.serverContent) {
            this._handleServerContent(message.serverContent);
        }

        // Tool call
        if (message.toolCall) {
            console.log('[GeminiLive] 🛠️ Tool call detected');
            this._handleToolCall(message.toolCall);
        }

        // Tool call cancellation
        if (message.toolCallCancellation) {
            console.log('[GeminiLive] ⚠️ Tool call cancelled by server');
        }
    }

    /**
     * Gérer le contenu serveur (audio + text)
     */
    async _handleServerContent(content: any) {
        const parts = content.modelTurn?.parts || [];

        for (const part of parts) {
            // Audio reçu (PCM 24kHz du serveur)
            if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/')) {
                this.audioQueue.push(Buffer.from(part.inlineData.data, 'base64'));
            }

            // Texte (transcription de la réponse audio)
            if (part.text) {
                console.log('[GeminiLive] 📝 Texte:', part.text.substring(0, 80), '...');
                this.transcribedText = (this.transcribedText || '') + part.text;
            }

            // Function call inline
            if (part.functionCall) {
                await this._handleFunctionCall(part.functionCall);
            }
        }

        // Si turn complete, résoudre la promesse
        if (content.turnComplete) {
            console.log(`[GeminiLive] ✅ Turn complete (${this.audioQueue.length} audio chunks, text: ${this.transcribedText ? 'yes' : 'no'})`);

            const audioFile = await this._combineAudioChunks();

            if (this.responseResolver) {
                this.responseResolver({
                    audioFile,
                    transcribedText: this.transcribedText,
                    toolCalls: Array.from(this.pendingTools.values())
                });
            }
        }
    }

    /**
     * Gérer un function call
     */
    async _handleFunctionCall(functionCall: any) {
        console.log('[GeminiLive] 🛠️ Function call:', functionCall.name);

        if (!this.toolExecutor) {
            console.error('[GeminiLive] ❌ No tool executor defined');
            return;
        }

        try {
            const result = await this.toolExecutor(functionCall.name, functionCall.args);

            const response = {
                toolResponse: {
                    functionResponses: [{
                        id: functionCall.id || `tool_${Date.now()}`,
                        name: functionCall.name,
                        response: result
                    }]
                }
            };

            this._send(response);
            console.log('[GeminiLive] ✓ Tool result sent');

        } catch (error: any) {
            console.error('[GeminiLive] ❌ Tool execution error:', error.message);

            // Envoyer une réponse d'erreur pour débloquer le modèle
            const errorResponse = {
                toolResponse: {
                    functionResponses: [{
                        id: functionCall.id || `tool_${Date.now()}`,
                        name: functionCall.name,
                        response: { error: error.message }
                    }]
                }
            };
            this._send(errorResponse);
        }
    }

    /**
     * Gérer un toolCall (format alternatif du serveur)
     */
    async _handleToolCall(toolCall: any) {
        const calls = toolCall.functionCalls || [];
        for (const fc of calls) {
            await this._handleFunctionCall(fc);
        }
    }

    /**
     * Combiner les chunks audio PCM en un fichier
     */
    async _combineAudioChunks(): Promise<string | null> {
        if (this.audioQueue.length === 0) {
            console.log('[GeminiLive] ⚠️ No audio received');
            return null;
        }

        const totalBuffer = Buffer.concat(this.audioQueue);
        this.audioQueue = [];

        const tempDir = join(process.cwd(), 'temp', 'stt');
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const tempPath = join(tempDir, `gemini_live_${Date.now()}.pcm`);
        writeFileSync(tempPath, totalBuffer);

        console.log(`[GeminiLive] 💾 Audio saved: ${tempPath} (${totalBuffer.length} bytes)`);
        return tempPath;
    }

    /**
     * Envoyer un message JSON au serveur
     */
    _send(message: any) {
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Fermer la connexion proprement
     */
    async disconnect(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            console.log('[GeminiLive] 👋 Disconnected');
        }
    }

    /**
     * Process audio avec tools (méthode principale — point d'entrée depuis le Core)
     */
    async processAudioWithTools(options: any): Promise<any> {
        const { audioBuffer, systemPrompt, tools, conversationHistory, voice } = options;

        try {
            // 1. Connexion + setup (attend setupComplete)
            await this.connect({ systemPrompt, tools, voice });

            // 2. Envoyer l'audio (conversion OGG→PCM automatique)
            await this.sendAudio(audioBuffer);

            // 3. Attendre la réponse (timeout 30s, rejeté aussi si WS ferme)
            const response = await this.waitForResponse();

            // 4. Fermer proprement
            await this.disconnect();

            return response;

        } catch (error: any) {
            console.error('[GeminiLive] ❌ Process error:', error.message);
            await this.disconnect();
            throw error;
        }
    }
}

export default GeminiLiveProvider;
