// @ts-nocheck
// services/voice/voiceProvider.js
// Unified Voice Provider - Routes TTS/STT to appropriate adapters
// Features: Dynamic quota-based switching, multi-model support

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveCredentials } from '../../config/keyResolver.js';

import { MinimaxTTSAdapter } from '../../providers/adapters/minimaxTTS.js';
import { GeminiTTSAdapter } from '../../providers/adapters/geminiTTS.js';
import { GttsTTSAdapter } from '../../providers/adapters/gttsTTS.js';
import { GeminiLiveAdapter } from '../../providers/adapters/geminiLive.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Charge les credentials
 */
function loadCredentials() {
    try {
        const credsPath = join(__dirname, '..', '..', 'config', 'credentials.json');
        const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
        const resolved = resolveCredentials(creds);
        return resolved.familles_ia || {};
    } catch (e: any) {
        return {};
    }
}


export class VoiceProvider {
    config: any;
    quotaManager: any;
    adapters: any;
    credentials: any;

    /**
     * @param {Object} config Configuration from models_config.json voice_provider section
     * @param {Object} quotaManager Reference to QuotaManager instance (optional)
     */
    constructor(config, quotaManager = null) {
        this.config = config || {};
        this.quotaManager = quotaManager;
        this.adapters = new Map();
        this.credentials = loadCredentials();

        this._initializeAdapters();

        // Initialisé silencieusement
    }

    /**
     * Initialise les adaptateurs pour les différents providers
     * @private
     */
    _initializeAdapters() {
        // 1. Minimax (Erina)
        const minimaxKey = this.credentials.minimax;
        const minimaxConfig = this.config.minimax_config || {};
        this.adapters.set('minimax', new MinimaxTTSAdapter(minimaxKey, minimaxConfig));

        // 2. Gemini TTS
        const geminiKey = this.credentials.gemini;
        this.adapters.set('gemini', new GeminiTTSAdapter(geminiKey, {}));

        // 3. Google TTS (Fallback)
        this.adapters.set('gtts', new GttsTTSAdapter({}));

        // 4. Gemini Live (Native Audio)
        this.adapters.set('gemini_live', new GeminiLiveAdapter(geminiKey, {}));
        
        console.log(`[VoiceProvider] 🎙️ ${this.adapters.size} adaptateurs initialisés`);
    }

    /**
    /**
     * TTS: Text → Audio Buffer
     * Itère sur tous les modèles par ordre de priorité jusqu'à succès
     * @param {string} text Texte à vocaliser
     * @param {Object} options Options (voice, language, style)
     * @returns {Promise<{audioBuffer: Buffer, format: string, provider: string} | null>}
     */
    async textToSpeech(text: any, options: any = {}) {
        if (!text || text.trim().length === 0) {
            console.warn('[VoiceProvider] Texte vide, TTS ignoré');
            return null;
        }

        // Trier les modèles par priorité
        const ttsModels = [...(this.config.tts_models || [])].sort((a: any, b: any) => a.priority - b.priority);

        if (ttsModels.length === 0) {
            console.error('[VoiceProvider] ❌ Aucun modèle TTS configuré');
            return null;
        }

        for (const modelConfig of ttsModels) {
            const { provider, model, priority } = modelConfig;
            const adapter = this.adapters.get(provider);

            if (!adapter) {
                console.warn(`[VoiceProvider] Adapter "${provider}" non trouvé, skip`);
                continue;
            }

            // Vérifier disponibilité de l'adapter
            if (!adapter.isAvailable()) {
                console.log(`[VoiceProvider] ${provider}/${model} non disponible (clé manquante)`);
                continue;
            }

            // Vérifier quota si QuotaManager disponible
            if (this.quotaManager) {
                const isAvailable = await this.quotaManager.isModelAvailable(model);
                if (!isAvailable) {
                    console.log(`[VoiceProvider] ${provider}/${model} quota épuisé, fallback...`);
                    continue;
                }
            }

            try {
                // Fusionner les options avec le config du modèle
                const synthesizeOptions = {
                    ...modelConfig,
                    ...options,
                    model: model
                };

                // Si l'utilisateur demande une voix spécifique (Gemini)
                if (options.voice && provider === 'gemini') {
                    synthesizeOptions.voice = options.voice;
                }

                const result = await adapter.synthesize(text, synthesizeOptions);

                // Enregistrer l'utilisation si QuotaManager disponible
                if (this.quotaManager) {
                    await this.quotaManager.recordUsage(provider, model);
                }

                console.log(`[VoiceProvider] ✅ TTS réussi via ${provider}/${model}`);

                return {
                    ...result,
                    provider: provider,
                    model: model
                };

            } catch (error: any) {
                console.error(`[VoiceProvider] ❌ Erreur ${provider}/${model}:`, error.message);
                // Continue vers le prochain modèle
            }
        }

        console.error('[VoiceProvider] ❌ Aucun provider TTS disponible (tous épuisés ou en erreur)');
        return null;
    }

    /**
     * TTS avec voix spécifique (pour "Change de voix X et dis: ...")
     * Force l'utilisation de Gemini pour les voix personnalisées
     * @param {string} text Texte à vocaliser
     * @param {string} voiceName Nom de la voix (Aoede, Charon, etc.)
     * @returns {Promise<{audioBuffer: Buffer, format: string, provider: string} | null>}
     */
    async textToSpeechWithVoice(text: any, voiceName: any) {
        const geminiAdapter = this.adapters.get('gemini');

        if (!geminiAdapter || !geminiAdapter.isAvailable()) {
            console.warn(`[VoiceProvider] Gemini non disponible pour voix "${voiceName}"`);
            // Fallback sur TTS standard
            return this.textToSpeech(text);
        }

        // Vérifier que la voix existe
        const availableVoices = geminiAdapter.getAvailableVoices();
        if (!availableVoices.includes(voiceName)) {
            console.warn(`[VoiceProvider] Voix "${voiceName}" inconnue, fallback sur Aoede`);
            voiceName = 'Aoede';
        }

        try {
            const result = await geminiAdapter.synthesize(text, { voice: voiceName });

            console.log(`[VoiceProvider] ✅ TTS avec voix "${voiceName}" réussi`);

            return {
                ...result,
                provider: 'gemini',
                voice: voiceName
            };

        } catch (error: any) {
            console.error(`[VoiceProvider] ❌ Erreur voix "${voiceName}":`, error.message);
            // Fallback sur TTS standard
            return this.textToSpeech(text);
        }
    }

    /**
     * STT: Audio → Text
     * @param {string} audioPath Chemin du fichier audio
     * @param {Object} options Options (language)
     * @returns {Promise<string | null>}
     */
    async speechToText(audioPath: any, options: any = {}) {
        // Pour l'instant, déléguer au transcriptionService existant
        // TODO: Intégrer ici quand on aura plusieurs providers STT
        console.warn('[VoiceProvider] STT non implémenté ici, utiliser transcriptionService');
        return null;
    }

    /**
     * Voice-to-Voice: Audio → Transcribe → AI Response → TTS
     * @param {string} audioPath Chemin du fichier audio
     * @param {Function} aiCallback Fonction pour générer la réponse AI (text: any) => Promise<string>
     * @param {Object} options Options
     * @returns {Promise<{audioBuffer: Buffer, transcription: string, response: string} | null>}
     */
    async voiceToVoice(audioPath: any, aiCallback: any, options: any = {}) {
        // 1. Transcrire l'audio
        const transcription = await this.speechToText(audioPath, options);
        if (!transcription) {
            console.error('[VoiceProvider] V2V: Échec transcription');
            return null;
        }

        // 2. Générer la réponse AI
        const response = await aiCallback(transcription);
        if (!response) {
            console.error('[VoiceProvider] V2V: Échec réponse AI');
            return null;
        }

        // 3. Synthétiser la réponse
        const ttsResult = await this.textToSpeech(response, options);
        if (!ttsResult) {
            console.error('[VoiceProvider] V2V: Échec TTS');
            return null;
        }

        return {
            ...ttsResult,
            transcription,
            response
        };
    }

    /**
     * Liste les voix Gemini disponibles
     */
    getGeminiVoices() {
        return this.config.gemini_voices || [];
    }

    /**
     * Liste tous les modèles TTS configurés
     */
    getTTSModels() {
        return this.config.tts_models || [];
    }

    /**
     * Vérifie l'état de santé du provider
     */
    async healthCheck() {
        const status = {
            tts: {},
            stt: {}
        };

        for (const [name, adapter] of this.adapters) {
            (status.tts as any)[name] = adapter.isAvailable() ? 'available' : 'unavailable';
        }

        return status;
    }
}
