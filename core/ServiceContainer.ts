import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveApiKey } from '../config/keyResolver.js';
import { EmbeddingsService, EmbeddingConfig } from '../services/ai/EmbeddingsService.js';
import { SemanticMemory, SemanticMemoryDependencies } from '../services/memory/SemanticMemory.js';
import { logger } from '../utils/logger.js';
import db from '../services/supabase.js';
import { CredentialsSchema, Credentials } from '../config/credentials.schema.js';
import { ModelsConfigSchema, ModelsConfig } from '../config/config.schema.js';
import { config as appConfig } from '../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ServiceInstance = any;

interface ServiceEntry {
    factory: () => ServiceInstance;
    singleton: boolean;
    instance: ServiceInstance | null;
}

export interface ContainerInitOptions {
    mode: 'full' | 'minimal';
}

/**
 * Conteneur d'Injection de Dépendances
 * Gère le cycle de vie et l'accès aux services de l'application
 */
export class ServiceContainer {
    private services: Map<string, ServiceEntry> = new Map();
    private initialized: boolean = false;
    private mode: 'full' | 'minimal' = 'full';

    public async init(options: ContainerInitOptions = { mode: 'full' }): Promise<void> {
        if (this.initialized) return;
        this.mode = options.mode;

        // 1. Charger la Configuration
        const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
        const modelsPath = join(__dirname, '..', 'config', 'models_config.json');
        
        let rawCredentials, rawModelsConfig;
        try {
            rawCredentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
            rawModelsConfig = JSON.parse(readFileSync(modelsPath, 'utf-8'));
        } catch (e: any) {
            console.error('[ServiceContainer] Erreur lecture config:', e.message);
            throw e;
        }

        // Validation Zod
        const credentials = CredentialsSchema.parse(rawCredentials);
        const modelsConfig = ModelsConfigSchema.parse(rawModelsConfig);

        // 2. Enregistrer les Services de Base
        this.register('logger', logger);
        this.register('supabase', db);
        this.register('config', appConfig);

        // 2b. Services Dynamiques (ESM)
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
        const geminiKey = resolveApiKey(credentials.familles_ia?.gemini || '');
        const openaiKey = resolveApiKey(credentials.familles_ia?.openai || '');

        const primaryEmbedding = modelsConfig.reglages_generaux.embeddings.primary;

        const embeddingConfig: EmbeddingConfig = {
            geminiKey: geminiKey || undefined,
            openaiKey: openaiKey || undefined,
            model: primaryEmbedding.model || 'gemini-embedding-001',
            dimensions: primaryEmbedding.dimensions || 1024
        };
        
        this.register('embeddings', () => {
            console.log('[ServiceContainer] 🔄 Création EmbeddingsService singleton...');
            return new EmbeddingsService(embeddingConfig);
        }, { singleton: true });

        // 3b. Service Quotas
        const { quotaManager } = await import('../services/quotaManager.js');
        await quotaManager.init();
        this.register('quotaManager', quotaManager);

        // 3c. Voice Providers
        const { VoiceProvider } = await import('../services/voice/voiceProvider.js');
        const voiceProviderConfig = modelsConfig.voice_provider || {};
        const voiceProvider = new VoiceProvider(voiceProviderConfig, quotaManager as any);
        this.register('voiceProvider', voiceProvider);

        // Legacy Voice
        const { MinimaxVoiceService } = await import('../services/voice/minimax.js');
        const minimaxKey = resolveApiKey(credentials.familles_ia?.minimax || '');
        const voiceConfig = modelsConfig.voice_provider?.minimax_config || {};
        const voiceService = new MinimaxVoiceService(minimaxKey || '', voiceConfig);
        this.register('voiceService', voiceService);

        // Transcription
        const { GroqTranscriptionService } = await import('../services/transcription/groqSTT.js');
        const groqKey = resolveApiKey(credentials.familles_ia?.groq || '');
        const sttConfig = modelsConfig.voice_provider?.stt_models?.[0] || {};
        const sttService = new GroqTranscriptionService(groqKey || '', sttConfig);
        this.register('transcriptionService', sttService);

        // 4. Semantic Memory (RAG)
        const memoryDeps: SemanticMemoryDependencies = {
            supabase: this.get('supabase').client, // Needs the raw client
            embeddings: this.get('embeddings'),
            logger: this.get('logger')
        };
        const memory = new SemanticMemory(memoryDeps);
        this.register('memory', memory);

        // 5. Level 5 Services
        const { graphMemory } = await import('../services/graphMemory.js');
        this.register('graphMemory', graphMemory);

        const { knowledgeWeaver } = await import('../services/knowledgeWeaver.js');
        this.register('knowledgeWeaver', knowledgeWeaver);

        const { consolidationService } = await import('../services/consolidationService.js');
        this.register('consolidationService', consolidationService);

        const { GeminiLiveProvider } = await import('../services/audio/geminiLiveProvider.js');
        this.register('geminiLiveProvider', new GeminiLiveProvider({ apiKey: geminiKey || '' }));

        // 7. Reflection (Async)
        import('../services/dreamService.js').then(m => this.register('dream', m.dreamService));
        import('../services/moralCompass.js').then(m => this.register('moralCompass', m.moralCompass));

        const { factsMemory, workspaceMemory } = await import('../services/memory.js');
        this.register('facts', factsMemory);
        this.register('workspace', workspaceMemory);

        // [BROWSER] Browser Agent Service
        const { browserService } = await import('../services/browser/BrowserService.js');
        this.register('browser', browserService);

        // 8. Provider Router (singleton global — utilisé par ShoppingAgent, DeepResearch, JournalGenerator)
        const { providerRouter } = await import('../providers/index.js');
        this.register('providerRouter', providerRouter);

        this.initialized = true;
    }

    /**
     * Enregistre un service
     */
    public register(name: string, factory: any, options: { singleton?: boolean } = {}): this {
        const { singleton = false } = options;
        
        if (!factory) {
            console.error(`[ServiceContainer] ❌ Tentative d'enregistrement de service NULL: ${name}`);
            return this;
        }
        
        if (this.services.has(name)) {
            console.warn(`[ServiceContainer] Service ${name} déjà enregistré - remplacement`);
        }
        
        const factoryFn = typeof factory === 'function' ? factory : () => factory;
        
        this.services.set(name, {
            factory: factoryFn,
            singleton: singleton,
            instance: null
        });
        
        // Auto-injection si factory est une instance (pas singleton ici car instance est direct)
        if (!singleton && typeof factory.setContainer === 'function') {
            factory.setContainer(this);
        }
        
        return this;
    }

    /**
     * Récupère un service
     */
    public get(name: string): ServiceInstance {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`[ServiceContainer] Service non trouvé: ${name}`);
        }
        
        if (service.singleton) {
            if (!service.instance) {
                console.log(`[ServiceContainer] 🔄 Création singleton: ${name}`);
                service.instance = service.factory();
                
                if (service.instance && typeof service.instance.setContainer === 'function') {
                    service.instance.setContainer(this);
                }
            }
            return service.instance;
        }
        
        const instance = service.factory();
        if (instance && typeof instance.setContainer === 'function') {
            instance.setContainer(this);
        }
        return instance;
    }

    public has(name: string): boolean {
        return this.services.has(name);
    }

    public getStats(): any {
        const stats: any = {
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

export const container = new ServiceContainer();
