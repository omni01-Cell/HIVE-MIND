// core/ServiceContainer.js
// ============================================================================
// Conteneur d'Injection de Dépendances (DI) - v2
// ============================================================================
// Résout les dépendances circulaires et gère l'initialisation des services

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EmbeddingsService } from '../services/ai/EmbeddingsService.js';
import { SemanticMemory } from '../services/memory/SemanticMemory.js';
import * as logger from '../utils/logger.js';
import { supabase } from '../services/supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// JSDoc Type Definitions
// ============================================================================

/**
 * @typedef {Object} ServiceInstance
 * @description Any service that can be registered in the container
 */

/**
 * @typedef {Object} EmbeddingConfig
 * @property {string} [geminiKey] - Clé API Gemini
 * @property {string} [openaiKey] - Clé API OpenAI
 * @property {string} model - Modèle d'embedding à utiliser
 * @property {number} dimensions - Dimensions du vecteur
 */

/**
 * @typedef {Object} VoiceConfig
 * @property {number} [speed] - Vitesse de lecture (default: 1.0)
 * @property {number} [pitch] - Pitch de la voix
 * @property {number} [vol] - Volume (default: 1.0)
 */

// ============================================================================
// Service Container Implementation
// ============================================================================

/**
 * Conteneur d'Injection de Dépendances
 * @class ServiceContainer
 * @description Gère le cycle de vie et l'accès aux services de l'application
 */
export class ServiceContainer {
    /**
     * @constructor
     */
    constructor() {
        /** @type {Map<string, ServiceInstance>} */
        this.services = new Map();
        /** @type {boolean} */
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Initialisation silencieuse pour ne pas casser la barre de progression

        // 1. Charger la Configuration
        const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
        const modelsPath = join(__dirname, '..', 'config', 'models_config.json');
        let credentials, modelsConfig;
        try {
            credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
            modelsConfig = JSON.parse(readFileSync(modelsPath, 'utf-8'));
        } catch (e) {
            console.error('[ServiceContainer] Erreur lecture config:', e.message);
            throw e;
        }

        // 2. Enregistrer les Services de Base
        this.register('logger', logger.logger);
        this.register('supabase', supabase);

        // 3. Service Embeddings
        // On extrait les clés API nécessaires
        let geminiKey = credentials.familles_ia?.gemini;
        let openaiKey = credentials.familles_ia?.openai;

        // Resolve Env Vars
        if (geminiKey && geminiKey.startsWith('VOTRE_') && process.env[geminiKey]) geminiKey = process.env[geminiKey];
        if (openaiKey && openaiKey.startsWith('VOTRE_') && process.env[openaiKey]) openaiKey = process.env[openaiKey];

        const primaryEmbedding = modelsConfig?.reglages_generaux?.embeddings?.primary || {};

        const embeddingConfig = {
            geminiKey,
            openaiKey,
            model: primaryEmbedding.model || 'gemini-embedding-001',
            dimensions: primaryEmbedding.dimensions || 1024
        };
        const embeddings = new EmbeddingsService(embeddingConfig);
        this.register('embeddings', embeddings);

        // 3b. Service Quotas (Level 2)
        const { quotaManager } = await import('../services/quotaManager.js');
        await quotaManager.init();
        this.register('quotaManager', quotaManager);

        // 3c. Service Voix Unifié (VoiceProvider) - V3
        const { VoiceProvider } = await import('../services/voice/voiceProvider.js');
        const voiceProviderConfig = modelsConfig?.voice_provider || {};
        const voiceProvider = new VoiceProvider(voiceProviderConfig, quotaManager);
        this.register('voiceProvider', voiceProvider);

        // Legacy: garder voiceService pour compatibilité
        const { MinimaxVoiceService } = await import('../services/voice/minimax.js');
        let minimaxKey = credentials.familles_ia?.minimax;
        if (minimaxKey && minimaxKey.startsWith('VOTRE_') && process.env[minimaxKey]) minimaxKey = process.env[minimaxKey];
        const voiceConfig = modelsConfig?.voice_provider?.minimax_config || {};
        const voiceService = new MinimaxVoiceService(minimaxKey, voiceConfig);
        this.register('voiceService', voiceService);

        // 3d. Service Transcription (Groq Whisper) - V4
        const { GroqTranscriptionService } = await import('../services/transcription/groqSTT.js');

        let groqKey = credentials.familles_ia?.groq;
        if (groqKey && groqKey.startsWith('VOTRE_') && process.env[groqKey]) groqKey = process.env[groqKey];

        const sttConfig = modelsConfig?.voice_provider?.stt_models?.[0] || {};
        const sttService = new GroqTranscriptionService(groqKey, sttConfig);
        this.register('transcriptionService', sttService);

        // 4. Service Mémoire (RAG)
        const memoryDeps = {
            supabase: this.get('supabase'),
            embeddings: this.get('embeddings'),
            logger: this.get('logger')
        };
        const memory = new SemanticMemory(memoryDeps);
        this.register('memory', memory);

        // 5. [LEVEL 5] Knowledge Graph & Consolidation
        const { graphMemory } = await import('../services/graphMemory.js');
        this.register('graphMemory', graphMemory);

        const { knowledgeWeaver } = await import('../services/knowledgeWeaver.js');
        this.register('knowledgeWeaver', knowledgeWeaver);

        const { consolidationService } = await import('../services/consolidationService.js');
        this.register('consolidationService', consolidationService);

        // Initialisation terminée (silencieux)
        this.initialized = true;
    }


    /**
     * Enregistre un service
     * @param {string} name 
     * @param {Object} instance 
     */
    register(name, instance) {
        if (!instance) {
            console.error(`[ServiceContainer] ❌ Tentative d'enregistrement de service NULL: ${name}`);
            return this;
        }
        if (this.services.has(name)) {
            // console.warn(`[ServiceContainer] Avertissement: Service ${name} écrasé`);
        }
        this.services.set(name, instance);
        // Injection du container dans le service s'il le supporte
        if (typeof instance.setContainer === 'function') {
            instance.setContainer(this);
        }
        return this;
    }

    /**
     * Récupère un service
     * @param {string} name 
     */
    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`[ServiceContainer] Service non trouvé: ${name}`);
        }
        return this.services.get(name);
    }

    /**
     * Vérifie si un service existe
     */
    has(name) {
        return this.services.has(name);
    }
}

// Singleton global pour accès facile si besoin (mais préférer l'injection)
export const container = new ServiceContainer();
