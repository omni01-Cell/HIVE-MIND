// core/ServiceContainer.js
// ============================================================================
// Conteneur d'Injection de Dépendances (DI) - v2
// ============================================================================
// Résout les dépendances circulaires et gère l'initialisation des services

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveApiKey } from '../config/keyResolver.js';
import { EmbeddingsService } from '../services/ai/EmbeddingsService.js';

import { SemanticMemory } from '../services/memory/SemanticMemory.js';
import * as logger from '../utils/logger.js';
import db from '../services/supabase.js';

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
        /** @type {Map<string, {instance: ServiceInstance, singleton: boolean, factory: Function}>} */
        this.services = new Map();
        /** @type {boolean} */
        this.initialized = false;
        /** @type {string} */
        this.mode = 'full';
    }

    async init(options = { mode: 'full' }) {
        if (this.initialized) return;
        this.mode = options.mode;

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
        this.register('supabase', db);

        // 2b. Redis & Admins
        const { redis } = await import('../services/redisClient.js');
        this.register('redis', redis);

        const { adminService } = await import('../services/adminService.js');
        await adminService.init();
        this.register('adminService', adminService);

        const { userService } = await import('../services/userService.js');
        this.register('userService', userService);

        const { agentMemory } = await import('../services/agentMemory.js');
        this.register('agentMemory', agentMemory);

        const { actionMemory } = await import('../services/memory/ActionMemory.js');
        this.register('actionMemory', actionMemory);

        const { groupService } = await import('../services/groupService.js');
        this.register('groupService', groupService);

        const { workingMemory } = await import('../services/workingMemory.js');
        this.register('workingMemory', workingMemory);

        const { consciousness } = await import('../services/consciousnessService.js');
        this.register('consciousness', consciousness);

        const { moderationService } = await import('../services/moderationService.js');
        this.register('moderation', moderationService);

        // 3. Service Embeddings

        // On extrait les clés API nécessaires
        let geminiKey = resolveApiKey(credentials.familles_ia?.gemini);
        let openaiKey = resolveApiKey(credentials.familles_ia?.openai);

        const primaryEmbedding = modelsConfig?.reglages_generaux?.embeddings?.primary || {};


        // 3. Service Embeddings (Singleton pour éviter duplications)
        const embeddingConfig = {
            geminiKey,
            openaiKey,
            model: primaryEmbedding.model || 'gemini-embedding-001',
            dimensions: primaryEmbedding.dimensions || 1024
        };
        
        // Factory function pour singleton
        this.register('embeddings', () => {
            console.log('[ServiceContainer] 🔄 Création EmbeddingsService singleton...');
            return new EmbeddingsService(embeddingConfig);
        }, { singleton: true });

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
        let minimaxKey = resolveApiKey(credentials.familles_ia?.minimax);
        const voiceConfig = modelsConfig?.voice_provider?.minimax_config || {};

        const voiceService = new MinimaxVoiceService(minimaxKey, voiceConfig);
        this.register('voiceService', voiceService);

        // 3d. Service Transcription (Groq Whisper) - V4
        const { GroqTranscriptionService } = await import('../services/transcription/groqSTT.js');

        let groqKey = resolveApiKey(credentials.familles_ia?.groq);

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

        // 6. [AUDIO] Providers Additionnels
        const { GeminiLiveProvider } = await import('../services/audio/geminiLiveProvider.js');
        this.register('geminiLiveProvider', new GeminiLiveProvider({ apiKey: geminiKey }));

        // 7. [LEVEL 5] Services de Reflection et Morale (Asynchrones)
        import('../services/dreamService.js').then(m => this.register('dream', m.dreamService));
        import('../services/moralCompass.js').then(m => this.register('moralCompass', m.moralCompass));

        const { factsMemory } = await import('../services/memory.js');
        this.register('facts', factsMemory);

        // Initialisation terminée (silencieux)
        this.initialized = true;
    }


    /**
     * Enregistre un service (avec support singleton)
     * @param {string} name 
     * @param {Function|Object} factory - Factory function ou instance directe
     * @param {Object} options - {singleton: boolean}
     */
    register(name, factory, options = {}) {
        const { singleton = false } = options;
        
        if (!factory) {
            console.error(`[ServiceContainer] ❌ Tentative d'enregistrement de service NULL: ${name}`);
            return this;
        }
        
        if (this.services.has(name)) {
            console.warn(`[ServiceContainer] Service ${name} déjà enregistré - remplacement`);
        }
        
        // Si factory est déjà une instance, on la wrappe
        const factoryFn = typeof factory === 'function' ? factory : () => factory;
        
        this.services.set(name, {
            factory: factoryFn,
            singleton: singleton,
            instance: null // Créé à la demande
        });
        
        // Injection du container dans le service s'il le supporte
        if (!singleton && typeof factory.setContainer === 'function') {
            factory.setContainer(this);
        }
        
        return this;
    }

    /**
     * Récupère un service (avec support singleton)
     * @param {string} name 
     * @returns {ServiceInstance}
     */
    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`[ServiceContainer] Service non trouvé: ${name}`);
        }
        
        const service = this.services.get(name);
        
        // Singleton: créer une seule instance
        if (service.singleton) {
            if (!service.instance) {
                console.log(`[ServiceContainer] 🔄 Création singleton: ${name}`);
                service.instance = service.factory();
                
                // Injection du container si nécessaire
                if (typeof service.instance.setContainer === 'function') {
                    service.instance.setContainer(this);
                }
            }
            return service.instance;
        }
        
        // Non-singleton: créer nouvelle instance à chaque appel
        const instance = service.factory();
        if (typeof instance.setContainer === 'function') {
            instance.setContainer(this);
        }
        return instance;
    }

    /**
     * Vérifie si un service existe
     */
    has(name) {
        return this.services.has(name);
    }

    /**
     * Retourne les statistiques des services
     */
    getStats() {
        const stats = {
            total: this.services.size,
            singletons: 0,
            instances: 0,
            services: {}
        };

        for (const [name, service] of this.services.entries()) {
            stats.services[name] = {
                singleton: service.singleton,
                created: !!service.instance
            };
            if (service.singleton) stats.singletons++;
            if (service.instance) stats.instances++;
        }

        return stats;
    }
}

// Singleton global pour accès facile si besoin (mais préférer l'injection)
export const container = new ServiceContainer();
