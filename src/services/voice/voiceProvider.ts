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

function stripInlineAudioTags(text: string) {
    return String(text || '')
        .replace(/\[[^\]\n]{1,80}\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

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
        // 1. Minimax (HIVE-MIND)
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
            const { provider, model } = modelConfig;
            const adapter = this.adapters.get(provider);

            if (!adapter) {
                console.warn(`[VoiceProvider] Adapter "${provider}" non trouvé, skip`);
                continue;
            }

            // [ROBUSTESSE] Sauter immédiatement si la clé est manquante ou invalide
            if (!adapter.isAvailable()) {
                // On ne log qu'en debug pour ne pas polluer, sauf si c'est le seul
                if (this.config.debug) console.log(`[VoiceProvider] ${provider}/${model} non disponible (clé manquante/invalide)`);
                continue;
            }

            // Vérifier quota et sélectionner la meilleure clé si QuotaManager disponible
            let selectedKeyIndex = 1;
            if (this.quotaManager) {
                const bestKey = await this.quotaManager.getAvailableKeyForModel(model, provider);
                if (bestKey === null) {
                    console.log(`[VoiceProvider] ${provider}/${model} toutes clés épuisées, fallback...`);
                    continue;
                }
                selectedKeyIndex = bestKey;
            }

            try {
                // Fusionner les options avec le config du modèle
                const synthesizeOptions = {
                    ...modelConfig,
                    ...options,
                    model
                };

                const result = await adapter.synthesize(text, synthesizeOptions);

                // Enregistrer l'utilisation avec le bon keyIndex
                if (this.quotaManager) {
                    await this.quotaManager.recordUsage(provider, model, 0, selectedKeyIndex);
                }

                console.log(`[VoiceProvider] ✅ TTS réussi via ${provider}/${model}`);

                return {
                    ...result,
                    provider,
                    model
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
     * @param {Object} options Options supplémentaires (style, etc.)
     * @returns {Promise<{audioBuffer: Buffer, format: string, provider: string} | null>}
     */
    async textToSpeechWithVoice(text: any, voiceName: any, options: any = {}) {
        const geminiAdapter = this.adapters.get('gemini');

        // Si Gemini n'a pas de clé, on ne peut pas utiliser de voix spécifique
        if (!geminiAdapter || !geminiAdapter.isAvailable()) {
            console.warn('[VoiceProvider] Gemini non disponible pour voix spécifique, repli sur TTS standard');
            return this.textToSpeech(text, options);
        }

        // Vérifier que la voix existe
        const availableVoices = geminiAdapter.getAvailableVoices();
        if (voiceName && !availableVoices.includes(voiceName)) {
            console.warn(`[VoiceProvider] Voix "${voiceName}" inconnue, fallback sur Aoede`);
            voiceName = 'Aoede';
        }

        try {
            const result = await geminiAdapter.synthesize(text, {
                ...options,
                voice: voiceName || 'Aoede'
            });

            console.log(`[VoiceProvider] ✅ TTS Gemini réussi avec voix "${voiceName || 'Aoede'}"`);

            return {
                ...result,
                provider: 'gemini',
                voice: voiceName || 'Aoede'
            };

        } catch (error: any) {
            console.error(`[VoiceProvider] ❌ Erreur voix "${voiceName}":`, error.message);
            // Fallback sur TTS standard (qui essaiera minimax puis gtts)
            return this.textToSpeech(text, options);
        }
    }

    /**
     * TTS dédié au plugin public: Gemini 3.1 Flash TTS en priorité, GTTS en fallback strict.
     * Les options avancées Gemini ne sont jamais envoyées à GTTS.
     */
    async textToSpeechGeminiFirst(text: any, options: any = {}) {
        if (!text || String(text).trim().length === 0) {
            console.warn('[VoiceProvider] Texte vide, TTS plugin ignoré');
            return null;
        }

        const cleanText = String(text).trim();
        const geminiAdapter = this.adapters.get('gemini');
        const gttsAdapter = this.adapters.get('gtts');
        const geminiModel = options.model || 'gemini-3.1-flash-tts-preview';

        if (geminiAdapter?.isAvailable()) {
            // WHY: getAvailableKeyForModel checks all keys, not just k1.
            let geminiKeyIndex = 1;
            let keysAvailable = true;

            if (this.quotaManager) {
                const bestKey = await this.quotaManager.getAvailableKeyForModel(geminiModel, 'gemini');
                if (bestKey === null) {
                    keysAvailable = false;
                    console.log(`[VoiceProvider] gemini/${geminiModel} toutes clés épuisées, fallback GTTS`);
                } else {
                    geminiKeyIndex = bestKey;
                }
            }

            if (keysAvailable) {
                const availableVoices = geminiAdapter.getAvailableVoices();
                const voice = availableVoices.includes(options.voice) ? options.voice : 'Aoede';

                try {
                    const result = await geminiAdapter.synthesize(cleanText, {
                        model: geminiModel,
                        voice,
                        style: options.style,
                        tone: options.tone,
                        accent: options.accent,
                        pace: options.pace,
                        language: options.language,
                        speaker_1: options.speaker_1,
                        speaker_2: options.speaker_2
                    });

                    if (this.quotaManager) {
                        await this.quotaManager.recordUsage('gemini', geminiModel, 0, geminiKeyIndex);
                    }

                    console.log(`[VoiceProvider] ✅ Plugin TTS via gemini/${geminiModel}`);
                    return {
                        ...result,
                        provider: 'gemini',
                        model: geminiModel,
                        voice,
                        fallbackUsed: false
                    };
                } catch (error: any) {
                    console.error('[VoiceProvider] ❌ Plugin TTS Gemini échoué:', error.message);
                }
            }
        }

        return this.textToSpeechGttsOnly(cleanText, {
            language: options.fallback_language || options.language || 'fr',
            fallbackUsed: true
        });
    }

    /**
     * GTTS simple uniquement: nettoie les tags Gemini et ignore voix/style/director notes.
     */
    async textToSpeechGttsOnly(text: any, options: any = {}) {
        const gttsAdapter = this.adapters.get('gtts');
        const cleanText = String(text || '').trim();

        if (!cleanText) {
            console.warn('[VoiceProvider] Texte vide, GTTS ignoré');
            return null;
        }

        if (!gttsAdapter?.isAvailable()) {
            console.error('[VoiceProvider] ❌ GTTS indisponible');
            return null;
        }

        try {
            const fallbackText = stripInlineAudioTags(cleanText);
            const result = await gttsAdapter.synthesize(fallbackText || cleanText, {
                language: options.language || 'fr'
            });

            console.log('[VoiceProvider] ✅ Plugin TTS via gtts');
            return {
                ...result,
                provider: 'gtts',
                model: 'gtts',
                fallbackUsed: options.fallbackUsed ?? false
            };
        } catch (error: any) {
            console.error('[VoiceProvider] ❌ Plugin TTS GTTS échoué:', error.message);
            return null;
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
