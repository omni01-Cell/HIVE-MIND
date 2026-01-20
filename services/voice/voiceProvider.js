// services/voice/voiceProvider.js
// Unified Voice Provider - Routes TTS/STT to appropriate adapters
// Features: Dynamic quota-based switching, multi-model support

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { MinimaxTTSAdapter } from './adapters/minimaxTTS.js';
import { GeminiTTSAdapter } from './adapters/geminiTTS.js';
import { GttsTTSAdapter } from './adapters/gttsTTS.js';
import { GeminiLiveAdapter } from './adapters/geminiLiveAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Charge les credentials
 */
function loadCredentials() {
    try {
        const credsPath = join(__dirname, '..', '..', 'config', 'credentials.json');
        const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
        const resolved = {};

        for (const [key, value] of Object.entries(creds.familles_ia || {})) {
            if (typeof value === 'string' && value.startsWith('VOTRE_')) {
                resolved[key] = process.env[value] || value;
            } else {
                resolved[key] = value;
            }
        }
        return resolved;
    } catch (e) {
        return {};
    }
}

export class VoiceProvider {
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
     * Initialise tous les adapters TTS disponibles
     */
    _initializeAdapters() {
        const ttsModels = this.config.tts_models || [];
        const minimaxConfig = this.config.minimax_config || {};

        // [PRIORITY 0] Gemini Live - Native Audio HD (PRIMARY)
        this.adapters.set('gemini-live', new GeminiLiveAdapter(
            this.credentials.gemini || process.env.VOTRE_CLE_GEMINI,
            { voice: 'Zephyr' }
        ));

        // [PRIORITY 1] Minimax TTS
        this.adapters.set('minimax', new MinimaxTTSAdapter(
            this.credentials.minimax || process.env.VOTRE_CLE_MINIMAX,
            minimaxConfig
        ));

        // [PRIORITY 2] Gemini TTS classique
        this.adapters.set('gemini', new GeminiTTSAdapter(
            this.credentials.gemini || process.env.VOTRE_CLE_GEMINI,
            { voice: 'Aoede' }
        ));

        // [PRIORITY 3] GTTS (Fallback ultime)
        this.adapters.set('gtts', new GttsTTSAdapter({ language: 'fr' }));
    }

    /**
     * TTS: Text → Audio Buffer
     * Itère sur tous les modèles par ordre de priorité jusqu'à succès
     * @param {string} text Texte à vocaliser
     * @param {Object} options Options (voice, language, style)
     * @returns {Promise<{audioBuffer: Buffer, format: string, provider: string} | null>}
     */
    async textToSpeech(text, options = {}) {
        if (!text || text.trim().length === 0) {
            console.warn('[VoiceProvider] Texte vide, TTS ignoré');
            return null;
        }

        // Trier les modèles par priorité
        const ttsModels = [...(this.config.tts_models || [])].sort((a, b) => a.priority - b.priority);

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
                const canUse = await this.quotaManager.canUse(provider, model);
                if (!canUse) {
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

            } catch (error) {
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
    async textToSpeechWithVoice(text, voiceName) {
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

        } catch (error) {
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
    async speechToText(audioPath, options = {}) {
        // Pour l'instant, déléguer au transcriptionService existant
        // TODO: Intégrer ici quand on aura plusieurs providers STT
        console.warn('[VoiceProvider] STT non implémenté ici, utiliser transcriptionService');
        return null;
    }

    /**
     * Voice-to-Voice: Audio → Transcribe → AI Response → TTS
     * @param {string} audioPath Chemin du fichier audio
     * @param {Function} aiCallback Fonction pour générer la réponse AI (text) => Promise<string>
     * @param {Object} options Options
     * @returns {Promise<{audioBuffer: Buffer, transcription: string, response: string} | null>}
     */
    async voiceToVoice(audioPath, aiCallback, options = {}) {
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
            status.tts[name] = adapter.isAvailable() ? 'available' : 'unavailable';
        }

        return status;
    }
}
