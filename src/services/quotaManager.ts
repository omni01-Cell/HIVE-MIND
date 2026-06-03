// services/quotaManager.js

import { redis as redisClient } from './redisClient.js';
import { envResolver } from './envResolver.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// WHY: 2-second TTL avoids redundant Redis GETs within a single routing cycle
// while the 20% RPM safety margin absorbs any staleness.
const L0_CACHE_TTL_MS = 2000;

interface ModelConfigItem {
    id?: string;
    quota?: QuotaLimits;
    types?: string[];
}

interface ProviderConfig {
    modeles?: ModelConfigItem[];
    models?: ModelConfigItem[];
}

interface ModelsConfig {
    familles?: Record<string, ProviderConfig>;
}

interface QuotaLimits {
    rpm?: number;
    tpm?: number;
    rpd?: number;
}

interface MarginConfig {
    rpm: number;
    tpm: number;
    rpd: number;
}

interface HealthResult {
    healthy: boolean;
    blocked: boolean;
    rpmUsed: number;
    rpmLimit: number;
    tpmUsed: number;
    tpmLimit: number;
    rpdUsed: number;
    rpdLimit: number;
    reason: string | null;
}

interface StatsResult {
    rpm: number;
    tpm: number;
    rpd: number;
}

interface ModelWithId {
    id?: string;
}

interface FamilyHealthResult {
    familyName: string;
    healthy: boolean;
}

interface ModelHealthEntry {
    modelId: string;
    healthy: boolean;
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}

class QuotaManager {
    private client: typeof redisClient;
    private quotas: Record<string, QuotaLimits>;
    private localRateLimit: Map<string, number>;
    private redisDownSince: number | null;
    /** Reverse map: modelId → providerName (populated from models_config.json) */
    private modelToProvider: Map<string, string>;
    /** L0 in-memory cache: redisKey → { value, expiresAt } */
    private _l0Cache: Map<string, { value: string | null, expiresAt: number }>;

    constructor() {
        this.client = redisClient;
        this.quotas = {};
        this.modelToProvider = new Map();
        this._l0Cache = new Map();
        this._loadConfig();

        // Mode dégradé : tracking local en cas de Redis down
        this.localRateLimit = new Map(); // chatId → lastRequestTime
        this.redisDownSince = null; // Timestamp de la panne Redis
    }

    private _loadConfig(): void {
        try {
            const configPath = join(__dirname, '..', 'config', 'models_config.json');
            const config: ModelsConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

            // Flatten quotas: modelId -> quota + build reverse map modelId -> providerName
            this.quotas = {};
            this.modelToProvider = new Map();

            if (config.familles) {
                for (const [providerName, providerConfig] of Object.entries(config.familles)) {
                    const allModels: ModelConfigItem[] = [
                        ...(providerConfig.modeles || []),
                        ...(providerConfig.models || [])  // HuggingFace structure variant
                    ];
                    for (const model of allModels) {
                        if (!model.id) continue;
                        this.modelToProvider.set(model.id, providerName);
                        if (model.quota) {
                            this.quotas[model.id] = model.quota;
                        }
                    }
                }
            }
            // Chargement silencieux
        } catch (error: unknown) {
            console.warn('[QuotaManager] Impossible de charger les quotas:', extractErrorMessage(error));
        }
    }

    /**
     * Initialse le manager (compatibilité interface service)
     */
    async init(): Promise<void> {
        // Initialisé (silencieux)
    }

    // =========================================================================
    // L0 IN-MEMORY CACHE — avoids redundant Redis GETs within a routing cycle
    // =========================================================================

    /** Read from L0 cache. Returns undefined on miss (not null — null is a valid cached value). */
    private _l0Get(key: string): string | null | undefined {
        const entry = this._l0Cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this._l0Cache.delete(key);
            return undefined;
        }
        return entry.value;
    }

    /** Write to L0 cache with TTL. */
    private _l0Set(key: string, value: string | null): void {
        this._l0Cache.set(key, { value, expiresAt: Date.now() + L0_CACHE_TTL_MS });
        // Prevent unbounded growth: evict expired entries when cache is large
        if (this._l0Cache.size > 200) {
            const now = Date.now();
            for (const [k, entry] of this._l0Cache.entries()) {
                if (now > entry.expiresAt) this._l0Cache.delete(k);
            }
        }
    }

    /** Read a Redis key, checking L0 cache first. */
    private async _cachedGet(key: string): Promise<string | null> {
        const cached = this._l0Get(key);
        if (cached !== undefined) return cached;
        const value = await this.client.get(key);
        this._l0Set(key, value);
        return value;
    }

    /**
     * Enregistre l'utilisation d'un modèle après un appel réussi.
     * WHY: Keys include keyIndex so getModelHealth() reads the same keys we write.
     * @param {string} _provider - Nom du provider (pour compatibilité/logging, non utilisé)
     * @param {string} modelId - ID du modèle utilisé
     * @param {number} estimatedTokens - Estimation des tokens
     * @param {number} keyIndex - Index de la clé API utilisée (défaut: 1)
     */
    async recordUsage(_provider: string, modelId: string, estimatedTokens = 0, keyIndex = 1): Promise<void> {
        if (!this.client.isReady) return;
        if (!modelId) return;

        const date = new Date().toISOString().split('T')[0];

        // WHY: Keys MUST match the pattern used in getModelHealth() — `k${keyIndex}` segment
        // ensures per-key tracking for multi-key rotation (Smart Router V2).
        const quotaKeyRPM = `quota:${modelId}:k${keyIndex}:rpm`;
        const quotaKeyTPM = `quota:${modelId}:k${keyIndex}:tpm`;
        const quotaKeyRPD = `quota:${modelId}:k${keyIndex}:rpd:${date}`;

        try {
            const multi = this.client.multi();

            // RPM (Expire après 60s)
            multi.incr(quotaKeyRPM);
            multi.expire(quotaKeyRPM, 60);

            // TPM (Expire après 60s)
            if (estimatedTokens > 0) {
                multi.incrBy(quotaKeyTPM, estimatedTokens);
                multi.expire(quotaKeyTPM, 60);
            }

            // RPD (Expire après 48h)
            multi.incr(quotaKeyRPD);
            multi.expire(quotaKeyRPD, 48 * 3600);

            await multi.exec();

            // L0 write-through: update local cache so next getModelHealth() sees fresh counters
            const cachedRpm = this._l0Get(quotaKeyRPM);
            this._l0Set(quotaKeyRPM, String(parseInt(cachedRpm || '0') + 1));
            this._l0Set(quotaKeyRPD, String(parseInt(this._l0Get(quotaKeyRPD) || '0') + 1));
            if (estimatedTokens > 0) {
                this._l0Set(quotaKeyTPM, String(parseInt(this._l0Get(quotaKeyTPM) || '0') + estimatedTokens));
            }
        } catch (error: unknown) {
            console.error('[QuotaManager] Erreur Redis:', error);
        }
    }

    /**
     * Vérifie si un modèle spécifique est disponible
     * @param {string} modelId - ID du modèle
     * @param {number} _estimatedCost - Coût estimé en tokens pour cette requête (non utilisé)
     * @returns {Promise<boolean>} - true si disponible, false sinon
     */
    async isModelAvailable(modelId: string, _estimatedCost = 0): Promise<boolean> {
        // ⚠️ FAIL CLOSED avec mode dégradé si Redis down
        if (!this.client.isReady) {
            console.warn('[QuotaManager] ⚠️ Redis indisponible - Mode dégradé actif (1 req/min max)');

            // Tracking de la durée de panne
            if (!this.redisDownSince) {
                this.redisDownSince = Date.now();
            }

            const downMinutes = (Date.now() - this.redisDownSince) / 60000;

            // Si Redis down > 5 minutes, c'est critique
            if (downMinutes > 5) {
                console.error('[QuotaManager] 🚨 Redis down depuis > 5 min - BLOCAGE TOTAL');
                return false; // Fail CLOSED total
            }

            // Mode dégradé : 1 requête par minute par modèle (très conservateur)
            return this._allowWithLocalRateLimit(modelId);
        }

        // Redis OK - reset le tracker de panne
        this.redisDownSince = null;

        if (!modelId) return true;

        if (!this.quotas[modelId]) return true; // Pas de quota défini = illimité

        // WHY: We iterate ALL available keys for this model's provider.
        // The old code hardcoded k1, which caused the model to be declared
        // unavailable even when keys 2-7 had remaining quota.
        const providerName = this.modelToProvider.get(modelId);
        const indices = providerName
            ? envResolver.getAvailableKeysForProvider(providerName)
            : [1];
        const keyIndices = indices.length > 0 ? indices : [1];

        for (const keyIndex of keyIndices) {
            const health = await this.getModelHealth(modelId, { rpm: 0.20, tpm: 0.10, rpd: 0.05 }, keyIndex);
            if (health.healthy) return true;
        }

        return false;
    }

    /**
     * Recherche la première clé saine (avec marges) pour un modèle donné.
     * @param {string} modelId - ID du modèle
     * @param {string} providerName - Nom du fournisseur (pour résoudre les clés existantes)
     * @param {MarginConfig} margins - Marges de sécurité { rpm: 0.2, tpm: 0.1, rpd: 0.05 }
     * @returns {Promise<number|null>} - Index de la clé saine, ou null si aucune clé n'est dispo
     */
    async getAvailableKeyForModel(modelId: string, providerName: string, margins: MarginConfig = { rpm: 0.20, tpm: 0.10, rpd: 0.05 }): Promise<number | null> {
        if (!this.client.isReady) return 1; // Fail open en dégradé, on prend la clé 1 par défaut

        const availableIndices = envResolver.getAvailableKeysForProvider(providerName);

        if (!availableIndices || availableIndices.length === 0) {
            return 1; // Fallback sécurisé
        }

        // On teste les clés une par une, de la 1 à la N
        // On pourrait optimiser avec des pipelines MGET massif, mais comme c'est séquentiel (on s'arrête au premier sain), un `await` par clé est acceptable et évite de charger des infos inutiles si la clé 1 est souvent bonne.
        for (const index of availableIndices) {
            const health = await this.getModelHealth(modelId, margins, index);
            if (health.healthy) {
                return index; // On a trouvé une clé qui n'a pas atteint ses limites
            }
        }

        // Si on arrive ici, toutes les clés connues pour ce modèle ont dépassé leur quota.
        console.warn(`[QuotaManager] 🚨 Toutes les clés de ${providerName} sont épuisées pour le modèle ${modelId} !`);
        return null;
    }

    /**
     * Bloque temporairement un modèle suite à une erreur de quota (429)
     * @param {string} modelId - ID du modèle
     * @param {number} timeoutSeconds - Durée du blocage en secondes
     * @param {number} keyIndex - Index de la clé utilisée (défaut: 1)
     */
    async recordQuotaExceeded(modelId: string, timeoutSeconds = 60, keyIndex = 1): Promise<void> {
        if (!modelId) return;

        const blockKey = `quota:${modelId}:k${keyIndex}:blocked`;

        // L0 write-through FIRST: ensures the next getAvailableKeyForModel()
        // within the same routing cycle won't re-select this blocked key,
        // even if the Redis write hasn't propagated yet.
        this._l0Set(blockKey, '1');

        if (!this.client.isReady) return;

        try {
            await this.client.setEx(blockKey, timeoutSeconds, '1');
            console.log(`[QuotaManager] 🥶 Modèle ${modelId} (Clé ${keyIndex}) mis au frigo pour ${timeoutSeconds}s (Quota Exceeded)`);
        } catch (error: unknown) {
            console.error('[QuotaManager] Erreur recordQuotaExceeded:', error);
        }
    }

    /**
     * Filtre une liste de modèles pour ne garder que ceux disponibles
     * @param {Array<ModelWithId | string>} models - Liste d'objets modèles ou IDs
     * @returns {Promise<Array<ModelWithId | string>>} - Liste filtrée
     */
    async filterAvailableModels(models: Array<ModelWithId | string>): Promise<Array<ModelWithId | string>> {
        const available: Array<ModelWithId | string> = [];
        for (const model of models) {
            const id = typeof model === 'string' ? model : model.id;
            if (id && await this.isModelAvailable(id)) {
                available.push(model);
            }
        }
        return available;
    }

    // filterAvailableProviders removed — no callers found (audit L2)

    /**
     * Récupère l'état actuel des quotas pour un provider (Debug)
     */
    async getStats(provider: string): Promise<StatsResult | null> {
        if (!this.client.isReady) return null;
        const date = new Date().toISOString().split('T')[0];

        const [rpm, tpm, rpd] = await Promise.all([
            this.client.get(`quota:${provider}:k1:rpm`),
            this.client.get(`quota:${provider}:k1:tpm`),
            this.client.get(`quota:${provider}:k1:rpd:${date}`)
        ]);

        return {
            rpm: parseInt(rpm || '0'),
            tpm: parseInt(tpm || '0'),
            rpd: parseInt(rpd || '0')
        };
    }

    // =========================================================================
    // ZERO-429 PROACTIVE HEALTH CHECK SYSTEM
    // =========================================================================

    /**
     * Récupère l'état de santé détaillé d'un modèle avec marges de sécurité
     * @param {string} modelId - ID du modèle
     * @param {MarginConfig} margins - Marges de sécurité { rpm: 0.2, tpm: 0.1, rpd: 0.05 }
     * @param {number} keyIndex - Index de la clé utilisée (défaut: 1)
     * @returns {Promise<HealthResult>}
     */
    async getModelHealth(modelId: string, margins: MarginConfig = { rpm: 0.20, tpm: 0.10, rpd: 0.05 }, keyIndex = 1): Promise<HealthResult> {
        const result: HealthResult = {
            healthy: true,
            blocked: false,
            rpmUsed: 0,
            rpmLimit: Infinity,
            tpmUsed: 0,
            tpmLimit: Infinity,
            rpdUsed: 0,
            rpdLimit: Infinity,
            reason: null
        };

        if (!this.client.isReady) return result; // Fail open
        if (!modelId) return result;

        const date = new Date().toISOString().split('T')[0];
        const blockKey = `quota:${modelId}:k${keyIndex}:blocked`;

        try {
            // 1. Vérifier blocage explicite (Circuit Breaker) — L0 cache-aware
            const isBlocked = await this._cachedGet(blockKey);
            if (isBlocked) {
                result.healthy = false;
                result.blocked = true;
                result.reason = 'BLOCKED (429 antérieur)';
                return result;
            }

            // 2. Si pas de quota défini, le modèle est illimité/sain
            if (!this.quotas[modelId]) {
                return result;
            }

            const limits = this.quotas[modelId];
            result.rpmLimit = limits.rpm || Infinity;
            result.tpmLimit = limits.tpm || Infinity;
            result.rpdLimit = limits.rpd || Infinity;

            const keyRPM = `quota:${modelId}:k${keyIndex}:rpm`;
            const keyTPM = `quota:${modelId}:k${keyIndex}:tpm`;
            const keyRPD = `quota:${modelId}:k${keyIndex}:rpd:${date}`;

            // L0 cache-aware reads: avoids redundant Redis GETs within a single routing cycle
            const [rpm, tpm, rpd] = await Promise.all([
                this._cachedGet(keyRPM),
                this._cachedGet(keyTPM),
                this._cachedGet(keyRPD)
            ]);

            result.rpmUsed = parseInt(rpm || '0');
            result.tpmUsed = parseInt(tpm || '0');
            result.rpdUsed = parseInt(rpd || '0');

            // 3. Vérification avec MARGES DE SÉCURITÉ
            // RPM: Marge par défaut 20% (ne pas dépasser 80% de la limite)
            const rpmThreshold = Math.floor(result.rpmLimit * (1 - margins.rpm));
            if (limits.rpm && result.rpmUsed >= rpmThreshold) {
                result.healthy = false;
                result.reason = `RPM proche limite (${result.rpmUsed}/${result.rpmLimit}, seuil=${rpmThreshold})`;
                return result;
            }

            // TPM: Marge par défaut 10% (ne pas dépasser 90% de la limite)
            const tpmThreshold = Math.floor(result.tpmLimit * (1 - margins.tpm));
            if (limits.tpm && result.tpmUsed >= tpmThreshold) {
                result.healthy = false;
                result.reason = `TPM proche limite (${result.tpmUsed}/${result.tpmLimit}, seuil=${tpmThreshold})`;
                return result;
            }

            // RPD: Marge par défaut 5% (ne pas dépasser 95% de la limite)
            const rpdThreshold = Math.floor(result.rpdLimit * (1 - margins.rpd));
            if (limits.rpd && result.rpdUsed >= rpdThreshold) {
                result.healthy = false;
                result.reason = `RPD proche limite (${result.rpdUsed}/${result.rpdLimit}, seuil=${rpdThreshold})`;
                return result;
            }

            return result;

        } catch (error: unknown) {
            console.error(`[QuotaManager] Erreur getModelHealth ${modelId}:`, error);
            return result; // Fail open
        }
    }

    /**
     * Filtre une liste de modèles pour ne garder que ceux "sains" (avec marge de sécurité)
     * @param {Array<string>} modelIds - Liste des IDs de modèles
     * @param {MarginConfig} margins - Marges de sécurité { rpm: 0.2, tpm: 0.1, rpd: 0.05 }
     * @returns {Promise<Array<string>>} - Liste filtrée des IDs sains
     */
    async filterHealthyModels(modelIds: Array<string>, margins: MarginConfig = { rpm: 0.20, tpm: 0.10, rpd: 0.05 }): Promise<Array<string>> {
        if (!this.client.isReady) return modelIds; // Fail open

        const results = await Promise.all(modelIds.map(async (modelId: string) => {
            // WHY: Check ALL keys for this model's provider, not just k1.
            // A model is healthy if at least one key passes the health check.
            const providerName = this.modelToProvider.get(modelId);
            const indices = providerName
                ? envResolver.getAvailableKeysForProvider(providerName)
                : [1];
            const keyIndices = indices.length > 0 ? indices : [1];

            for (const keyIndex of keyIndices) {
                const health = await this.getModelHealth(modelId, margins, keyIndex);
                if (health.healthy) return { modelId, healthy: true };
            }
            return { modelId, healthy: false };
        }));

        return results.filter((r: ModelHealthEntry) => r.healthy).map((r: ModelHealthEntry) => r.modelId);
    }

    /**
     * Récupère les familles qui ont au moins un modèle sain
     * @param {Record<string, ProviderConfig>} familiesConfig - Configuration des familles
     * @param {MarginConfig} margins - Marges de sécurité
     * @returns {Promise<Array<string>>} - Liste des noms de familles saines
     */
    async getHealthyFamilies(familiesConfig: Record<string, ProviderConfig>, margins: MarginConfig = { rpm: 0.20, tpm: 0.10, rpd: 0.05 }): Promise<Array<string>> {
        const familyResults = await Promise.all(Object.entries(familiesConfig).map(async ([familyName, familyConfig]: [string, ProviderConfig]) => {
            const models: ModelConfigItem[] = familyConfig.modeles || familyConfig.models || [];
            // Exclure les modèles d'embedding du check chat
            const chatModels = models
                .filter((m: ModelConfigItem) => !m.id?.includes('embedding') && !m.types?.includes('embedding'))
                .map((m: ModelConfigItem) => m.id)
                .filter((id): id is string => id !== undefined);

            if (chatModels.length === 0) return { familyName, healthy: false };

            const healthyModels = await this.filterHealthyModels(chatModels, margins);
            return { familyName, healthy: healthyModels.length > 0 };
        }));

        return familyResults.filter((r: FamilyHealthResult) => r.healthy).map((r: FamilyHealthResult) => r.familyName);
    }

    /**
     * Mode dégradé : Rate limiting local si Redis down
     * Limite stricte : 1 requête par minute par modèle
     * @param {string} modelId - ID du modèle
     * @returns {boolean} - true si autorisé
     */
    private _allowWithLocalRateLimit(modelId: string): boolean {
        const key = `local:${modelId}`;
        const lastSeen = this.localRateLimit.get(key);
        const now = Date.now();

        // Limite : 60 secondes entre chaque requête
        if (lastSeen && (now - lastSeen) < 60000) {
            const waitTime = Math.ceil((60000 - (now - lastSeen)) / 1000);
            console.log(`[QuotaManager] ❄️ Mode dégradé: ${modelId} doit attendre ${waitTime}s`);
            return false;
        }

        // Autoriser et enregistrer
        this.localRateLimit.set(key, now);

        // Cleanup : supprimer les entrées > 5 minutes (éviter memory leak)
        if (this.localRateLimit.size > 100) {
            for (const [k, timestamp] of this.localRateLimit.entries()) {
                if (now - timestamp > 300000) { // 5 min
                    this.localRateLimit.delete(k);
                }
            }
        }

        return true;
    }
}

export const quotaManager = new QuotaManager();
