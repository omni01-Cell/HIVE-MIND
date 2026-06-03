import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveApiKey } from '../config/keyResolver.js';
import { EmbeddingsService, EmbeddingConfig } from '../services/ai/EmbeddingsService.js';
import { SemanticMemory, SemanticMemoryDependencies } from '../services/memory/SemanticMemory.js';
import { logger } from '../utils/logger.js';
import db from '../services/supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CredentialsSchema, Credentials } from '../config/credentials.schema.js';
import { ModelsConfigSchema, ModelsConfig } from '../config/config.schema.js';
import { config as appConfig } from '../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceInstance = any;

interface ServiceEntry {
    factory: () => ServiceInstance;
    singleton: boolean;
    instance: ServiceInstance | null;
}

export interface ContainerInitOptions {
    mode: 'full' | 'minimal';
}

interface ServiceStats {
    total: number;
    singletons: number;
    instances: number;
    services: Record<string, { singleton: boolean; created: boolean }>;
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

        const { credentials, modelsConfig } = this.loadConfig();

        await this.registerBaseServices();
        await this.registerCoreMemoriesAndConsciousness();

        this.registerEmbeddingService(credentials, modelsConfig);

        await this.registerVoiceServices(credentials, modelsConfig);
        await this.registerMemoryServices();

        const geminiKey = resolveApiKey(credentials.familles_ia?.gemini || '', 'gemini');
        await this.registerLiveAndDreamServices(geminiKey);
        await this.registerBrowserAndProviderRouter();

        this.initialized = true;
    }

    private loadConfig(): { credentials: Credentials; modelsConfig: ModelsConfig } {
        const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
        const modelsPath = join(__dirname, '..', 'config', 'models_config.json');

        try {
            const rawCredentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
            const rawModelsConfig = JSON.parse(readFileSync(modelsPath, 'utf-8'));
            return {
                credentials: CredentialsSchema.parse(rawCredentials),
                modelsConfig: ModelsConfigSchema.parse(rawModelsConfig)
            };
        } catch (e) {
            console.error('[ServiceContainer] Erreur lecture config:', e instanceof Error ? e.message : String(e));
            throw e;
        }
    }

    private async registerBaseServices() {
        this.register('logger', logger);
        this.register('supabase', db);
        this.register('config', appConfig);

        const { redis } = await import('../services/redisClient.js');
        this.register('redis', redis);

        const { adminService } = await import('../services/adminService.js');
        await adminService.init();
        this.register('adminService', adminService);

        const { userService } = await import('../services/userService.js');
        this.register('userService', userService);

        const { agentMemory } = await import('../services/agentMemory.js');
        this.register('agentMemory', agentMemory);
    }

    private async registerCoreMemoriesAndConsciousness() {
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
    }

    private registerEmbeddingService(credentials: Credentials, modelsConfig: ModelsConfig) {
        const keyGemini = credentials.familles_ia?.gemini ?? '';
        const keyOpenai = credentials.familles_ia?.openai ?? '';
        const cfg = modelsConfig.reglages_generaux.embeddings.primary;

        const embeddingConfig: EmbeddingConfig = {
            geminiKey: resolveApiKey(keyGemini, 'gemini') ?? undefined,
            openaiKey: resolveApiKey(keyOpenai, 'openai') ?? undefined,
            model: cfg.model,
            dimensions: cfg.dimensions
        };

        this.register('embeddings', () => new EmbeddingsService(embeddingConfig), { singleton: true });
    }

    private async registerVoiceServices(credentials: Credentials, modelsConfig: ModelsConfig) {
        const { quotaManager } = await import('../services/quotaManager.js');
        await quotaManager.init();
        this.register('quotaManager', quotaManager);

        const { VoiceProvider } = await import('../services/voice/voiceProvider.js');
        const voiceProviderConfig = modelsConfig.voice_provider || {};
        const voiceProvider = new VoiceProvider(voiceProviderConfig, quotaManager as unknown as ConstructorParameters<typeof VoiceProvider>[1]);
        this.register('voiceProvider', voiceProvider);

        await this.registerMinimaxVoice(credentials, modelsConfig);
        await this.registerGroqSTT(credentials, modelsConfig);
    }

    private async registerMinimaxVoice(credentials: Credentials, modelsConfig: ModelsConfig) {
        const { MinimaxVoiceService } = await import('../services/voice/minimax.js');
        const rawKey = credentials.familles_ia?.minimax ?? '';
        const minimaxKey = resolveApiKey(rawKey, 'minimax') ?? '';
        const voiceConfig = modelsConfig.voice_provider?.minimax_config ?? {};
        this.register('voiceService', new MinimaxVoiceService(minimaxKey, voiceConfig));
    }

    private async registerGroqSTT(credentials: Credentials, modelsConfig: ModelsConfig) {
        const { GroqTranscriptionService } = await import('../services/transcription/groqSTT.js');
        const rawKey = credentials.familles_ia?.groq ?? '';
        const groqKey = resolveApiKey(rawKey, 'groq') ?? '';
        const sttConfig = modelsConfig.voice_provider?.stt_models?.[0] ?? {};
        this.register('transcriptionService', new GroqTranscriptionService(groqKey, sttConfig));
    }

    private async registerMemoryServices() {
        const memoryDeps: SemanticMemoryDependencies = {
            supabase: this.get('supabase') as SupabaseClient,
            embeddings: this.get('embeddings') as EmbeddingsService,
            logger: this.get('logger') as typeof logger
        };
        const memory = new SemanticMemory(memoryDeps);
        this.register('memory', memory);

        const { graphMemory } = await import('../services/graphMemory.js');
        this.register('graphMemory', graphMemory);

        const { knowledgeWeaver } = await import('../services/knowledgeWeaver.js');
        this.register('knowledgeWeaver', knowledgeWeaver);

        const { consolidationService } = await import('../services/consolidationService.js');
        this.register('consolidationService', consolidationService);
    }

    private async registerLiveAndDreamServices(geminiKey: string | null) {
        const { GeminiLiveProvider } = await import('../services/audio/geminiLiveProvider.js');
        this.register('geminiLiveProvider', new GeminiLiveProvider({ apiKey: geminiKey || '' }));

        const [dreamModule, runtimeModule] = await Promise.all([
            import('../services/dreamService.js'),
            import('../services/runtime/RuntimeInfrastructure.js')
        ]);
        this.register('dream', dreamModule.dreamService);
        this.register('runtime', () => new runtimeModule.AIRuntimeInfrastructure(), { singleton: true });

        const { factsMemory, workspaceMemory } = await import('../services/memory.js');
        this.register('facts', factsMemory);
        this.register('workspace', workspaceMemory);
    }

    private async registerBrowserAndProviderRouter() {
        const { browserService } = await import('../services/browser/BrowserService.js');
        this.register('browser', browserService);

        const providerModule = await import('../providers/index.js');
        if (typeof providerModule.loadAdapters === 'function') {
            await providerModule.loadAdapters();
        }
        this.register('providerRouter', providerModule.providerRouter);
    }

    /**
     * Enregistre un service
     */
    public register(name: string, factory: unknown, options: { singleton?: boolean } = {}): this {
        const { singleton = false } = options;
        if (!factory) {
            console.error(`[ServiceContainer] ❌ Tentative d'enregistrement de service NULL: ${name}`);
            return this;
        }
        if (this.services.has(name)) {
            console.warn(`[ServiceContainer] Service ${name} déjà enregistré - remplacement`);
        }
        const factoryFn = typeof factory === 'function' ? (factory as () => ServiceInstance) : () => factory;
        this.services.set(name, { factory: factoryFn, singleton, instance: null });
        const factoryObj = factory as { setContainer?: (container: ServiceContainer) => void };
        if (!singleton && typeof factoryObj.setContainer === 'function') {
            factoryObj.setContainer(this);
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
            return this.getSingleton(name, service);
        }
        const instance = service.factory();
        const instObj = instance as { setContainer?: (container: ServiceContainer) => void } | null;
        if (instObj && typeof instObj.setContainer === 'function') {
            instObj.setContainer(this);
        }
        return instance;
    }

    private getSingleton(name: string, service: ServiceEntry): ServiceInstance {
        if (!service.instance) {
            console.log(`[ServiceContainer] 🔄 Création singleton: ${name}`);
            service.instance = service.factory();
            const instObj = service.instance as { setContainer?: (container: ServiceContainer) => void } | null;
            if (instObj && typeof instObj.setContainer === 'function') {
                instObj.setContainer(this);
            }
        }
        return service.instance;
    }

    public has(name: string): boolean {
        return this.services.has(name);
    }

    public getStats(): ServiceStats {
        const stats: ServiceStats = {
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
export default container;
