// services/audio/geminiLiveProvider.js
// Provider pour Gemini 2.5 Flash Native Audio (Live API)
// Support: Audio streaming, Function calling, Émotions préservées

import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * GeminiLiveProvider
 * Gère les conversations audio en temps réel avec Gemini 2.5 Flash
 */
export class GeminiLiveProvider {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.GEMINI_API_KEY;
        this.model = config.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
        this.ws = null;
        this.isConnected = false;
        this.pendingTools = new Map(); // Stocke les tool calls en attente
        this.audioQueue = []; // Queue pour les chunks audio
        this.toolExecutor = config.toolExecutor; // Fonction pour exécuter les tools
    }

    /**
     * Connexion au Live API
     * @param {Object} sessionConfig - Configuration de session (system prompt, tools)
     */
    async connect(sessionConfig = {}) {
        return new Promise((resolve, reject) => {
            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

            console.log('[GeminiLive] 🔌 Connexion au Live API...');
            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                console.log('[GeminiLive] ✅ WebSocket connecté');
                this.isConnected = true;

                // Envoyer la configuration initiale
                this._sendSetup(sessionConfig);
                resolve();
            });

            this.ws.on('message', (data) => {
                this._handleMessage(data);
            });

            this.ws.on('error', (error) => {
                console.error('[GeminiLive] ❌ WebSocket error:', error.message);
                this.isConnected = false;
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('[GeminiLive] 🔌 WebSocket fermé');
                this.isConnected = false;
            });

            // Timeout de connexion
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Envoyer la configuration de session
     */
    _sendSetup(config) {
        const setupMessage = {
            setup: {
                model: `models/${this.model}`,
                generation_config: {
                    response_modalities: ['AUDIO'],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: config.voice || 'Aoede' // Voix féminine par défaut
                            }
                        }
                    }
                }
            }
        };

        // Ajouter system instruction si présent
        if (config.systemPrompt) {
            setupMessage.setup.system_instruction = {
                parts: [{ text: config.systemPrompt }]
            };
        }

        // Ajouter tools si présents
        if (config.tools && config.tools.length > 0) {
            setupMessage.setup.tools = [{
                function_declarations: config.tools.map(tool => ({
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
     * @param {Buffer} audioBuffer - PCM 16kHz mono
     */
    async sendAudio(audioBuffer) {
        if (!this.isConnected) {
            throw new Error('WebSocket not connected');
        }

        // Convertir en base64
        const base64Audio = audioBuffer.toString('base64');

        const message = {
            client_content: {
                turn_complete: true,
                turns: [{
                    role: 'user',
                    parts: [{
                        inline_data: {
                            mime_type: 'audio/pcm',
                            data: base64Audio
                        }
                    }]
                }]
            }
        };

        this._send(message);
        console.log('[GeminiLive] 🎤 Audio envoyé (', audioBuffer.length, 'bytes)');
    }

    /**
     * Attendre la réponse du modèle
     * @returns {Promise<Object>} { audioFile, toolCalls, transcribedText }
     */
    async waitForResponse(timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Response timeout'));
            }, timeoutMs);

            this.responseResolver = (response) => {
                clearTimeout(timeout);
                resolve(response);
            };
        });
    }

    /**
     * Gérer les messages du serveur
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            // Setup complete
            if (message.setupComplete) {
                console.log('[GeminiLive] ✓ Setup confirmed');
                return;
            }

            // Server content (réponse du modèle)
            if (message.serverContent) {
                this._handleServerContent(message.serverContent);
            }

            // Tool call response
            if (message.toolCallCancellation || message.toolCall) {
                console.log('[GeminiLive] 🛠️ Tool call detected');
                this._handleToolCall(message);
            }

        } catch (error) {
            console.error('[GeminiLive] Erreur parsing message:', error.message);
        }
    }

    /**
     * Gérer le contenu serveur (audio + text)
     */
    async _handleServerContent(content) {
        const parts = content.modelTurn?.parts || [];

        for (const part of parts) {
            // Audio reçu
            if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
                console.log('[GeminiLive] 🔊 Audio reçu');
                this.audioQueue.push(Buffer.from(part.inlineData.data, 'base64'));
            }

            // Texte (transcription)
            if (part.text) {
                console.log('[GeminiLive] 📝 Texte:', part.text.substring(0, 50), '...');
                this.transcribedText = part.text;
            }

            // Function call
            if (part.functionCall) {
                await this._handleFunctionCall(part.functionCall);
            }
        }

        // Si turn complete, résoudre la promesse
        if (content.turnComplete) {
            console.log('[GeminiLive] ✅ Turn complete');

            // Combiner les chunks audio
            const audioFile = await this._combineAudioChunks();

            if (this.responseResolver) {
                this.responseResolver({
                    audioFile,
                    transcribedText: this.transcribedText,
                    toolCalls: Array.from(this.pendingTools.values())
                });
                this.responseResolver = null;
            }
        }
    }

    /**
     * Gérer un function call
     */
    async _handleFunctionCall(functionCall) {
        console.log('[GeminiLive] 🛠️ Function call:', functionCall.name);

        if (!this.toolExecutor) {
            console.error('[GeminiLive] ❌ No tool executor defined');
            return;
        }

        try {
            // Exécuter le tool
            const result = await this.toolExecutor(functionCall.name, functionCall.args);

            // Envoyer le résultat au modèle
            const response = {
                tool_response: {
                    function_responses: [{
                        id: functionCall.id || `tool_${Date.now()}`,
                        name: functionCall.name,
                        response: result
                    }]
                }
            };

            this._send(response);
            console.log('[GeminiLive] ✓ Tool result sent');

        } catch (error) {
            console.error('[GeminiLive] ❌ Tool execution error:', error.message);
        }
    }

    /**
     * Combiner les chunks audio en un fichier
     */
    async _combineAudioChunks() {
        if (this.audioQueue.length === 0) {
            console.log('[GeminiLive] ⚠️ No audio received');
            return null;
        }

        // Concaténer tous les buffers
        const totalBuffer = Buffer.concat(this.audioQueue);
        this.audioQueue = []; // Reset queue

        // Sauvegarder en fichier temporaire
        const tempPath = join(process.cwd(), 'temp', 'stt', `gemini_live_${Date.now()}.pcm`);
        writeFileSync(tempPath, totalBuffer);

        console.log('[GeminiLive] 💾 Audio saved:', tempPath);
        return tempPath;
    }

    /**
     * Envoyer un message au serveur
     */
    _send(message) {
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Fermer la connexion
     */
    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            console.log('[GeminiLive] 👋 Disconnected');
        }
    }

    /**
     * Process audio avec tools (méthode principale)
     */
    async processAudioWithTools(options) {
        const { audioBuffer, systemPrompt, tools, conversationHistory, voice } = options;

        try {
            // 1. Connexion
            await this.connect({ systemPrompt, tools, voice });

            // 2. Envoyer l'audio
            await this.sendAudio(audioBuffer);

            // 3. Attendre la réponse
            const response = await this.waitForResponse();

            // 4. Fermer
            await this.disconnect();

            return response;

        } catch (error) {
            console.error('[GeminiLive] ❌ Process error:', error.message);
            await this.disconnect();
            throw error;
        }
    }
}

export default GeminiLiveProvider;
