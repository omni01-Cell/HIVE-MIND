// @ts-nocheck

import { redis as redisClient } from './redisClient.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class QuotaManager {
    client: any;
    quotas: any;
    localRateLimit: any;
    redisDownSince: any;

    constructor() {
        this.client = redisClient;
        this.quotas = {};
        this._loadConfig();
        
        // Mode dégradé : tracking local en cas de Redis down
        this.localRateLimit = new Map(); // chatId → lastRequestTime
        this.redisDownSince = null; // Timestamp de la panne Redis
    }

    _loadConfig() {
        try {
            const configPath = join(__dirname, '..', 'config', 'models_config.json');
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));

            // Flatten quotas: modelId -> quota
            this.quotas = {};

            if (config.familles) {
                for (const [providerName, providerConfig] of Object.entries(config.familles)) {
                    if (providerConfig.modeles) {
                        for (const model of providerConfig.modeles) {
                            if (model.quota && model.id) {
                                this.quotas[model.id] = model.quota;
                            }
                        }
                    }
                    if (providerConfig.models) { // Handle HuggingFace typo/structure diff if exists
                        for (const model of providerConfig.models) {
                            if (model.quota && model.id) {
                                this.quotas[model.id] = model.quota;
                            }
                        }
                    }
                }
            }
            // Chargement silencieux
        } catch (e: any) {
            console.warn('[QuotaManager] Impossible de charger les quotas:', e.message);
        }
    }

    /**
     * Initialse le manager (compatibilité interface service)
     */
    async init() {
        // Initialisé (silencieux)
    }

    /**
     * Enregistre l'utilisation d'un modèle après un appel réussi
     * @param {string} provider - Nom du provider (pour compatibilité/logging)
     * @param {string} modelId - ID du modèle utilisé
     * @param {number} estimatedTokens - Estimation des tokens
     */
    async recordUsage(provider: any, modelId: any, estimatedTokens: any = 0) {
        if (!this.client.isReady) return;
        if (!modelId) return;

        const date = new Date().toISOString().split('T')[0];

        // Quota key is now based on MODEL ID
        const quotaKeyRPM = `quota:${modelId}:rpm`;
        const quotaKeyTPM = `quota:${modelId}:tpm`;
        const quotaKeyRPD = `quota:${modelId}:rpd:${date}`;

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
        } catch (error: any) {
            console.error('[QuotaManager] Erreur Redis:', error);
        }
    }

    /**
     * Vérifie si un modèle spécifique est disponible
     * @param {string} modelId - ID du modèle
     * @param {number} estimatedCost - Coût estimé en tokens pour cette requête (optionnel)
     * @returns {Promise<boolean>} - true si disponible, false sinon
     */
    async isModelAvailable(modelId: any, estimatedCost: any = 0) {
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

        const date = new Date().toISOString().split('T')[0];
        const blockKey = `quota:${modelId}:blocked`;

        // 1. Vérifier si le modèle est explicitement bloqué (Circuit Breaker)
        const isBlocked = await this.client.get(blockKey);
        if (isBlocked) {
            // console.log(`[QuotaManager] ⛔ Modèle ${modelId} bloqué temporairement (Cooldown actif)`);
            return false;
        }

        if (!this.quotas[modelId]) return true; // Pas de quota défini = illimité

        const limits = this.quotas[modelId];

        const keyRPM = `quota:${modelId}:rpm`;
        const keyTPM = `quota:${modelId}:tpm`;
        const keyRPD = `quota:${modelId}:rpd:${date}`;

        try {
            const [rpm, tpm, rpd] = await Promise.all([
                this.client.get(keyRPM),
                this.client.get(keyTPM),
                this.client.get(keyRPD)
            ]);

            const currentRPM = parseInt(rpm || '0');
            const currentTPM = parseInt(tpm || '0');
            const currentRPD = parseInt(rpd || '0');

            // Vérification RPM (Requêtes par minute)
            // On ajoute +1 virtuellement pour voir si ça passerait
            if (limits.rpm && (currentRPM + 1) > limits.rpm) return false;

            // Vérification TPM (Tokens par minute)
            // On ajoute le coût estimé du prompt pour ne pas dépasser PENDANT la génération
            if (limits.tpm && (currentTPM + estimatedCost) > limits.tpm) return false;

            // Vérification RPD (Requêtes par jour)
            if (limits.rpd && (currentRPD + 1) > limits.rpd) return false;

            return true;

        } catch (error: any) {
            console.error(`[QuotaManager] Erreur lecture quota ${modelId}:`, error);
            return true; // Fail open
        }
    }

    /**
     * Bloque temporairement un modèle suite à une erreur de quota (429)
     * @param {string} modelId - ID du modèle
     * @param {number} timeoutSeconds - Durée du blocage en secondes
     */
    async recordQuotaExceeded(modelId: any, timeoutSeconds: any = 60) {
        if (!this.client.isReady || !modelId) return;

        const blockKey = `quota:${modelId}:blocked`;
        try {
            // On set une clé qui expire automatiquement
            await this.client.setEx(blockKey, timeoutSeconds, '1');
            console.log(`[QuotaManager] 🥶 Modèle ${modelId} mis au frigo pour ${timeoutSeconds}s (Quota Exceeded)`);
        } catch (error: any) {
            console.error('[QuotaManager] Erreur recordQuotaExceeded:', error);
        }
    }

    /**
     * Filtre une liste de modèles pour ne garder que ceux disponibles
     * @param {Array} models - Liste d'objets modèles ou IDs
     * @returns {Promise<Array>} - Liste filtrée
     */
    async filterAvailableModels(models: any) {
        const available = [];
        for (const model of models) {
            const id = typeof model === 'string' ? model : model.id;
            if (await this.isModelAvailable(id)) {
                available.push(model);
            }
        }
        return available;
    }

    // Deprecated but kept for compatibility validation (can be removed if unused)
    async filterAvailableProviders(candidates: any) {
        return candidates;
    }

    /**
     * Récupère l'état actuel des quotas pour un provider (Debug)
     */
    async getStats(provider: any) {
        if (!this.client.isReady) return null;
        const date = new Date().toISOString().split('T')[0];

        const [rpm, tpm, rpd] = await Promise.all([
            this.client.get(`quota:${provider}:rpm`),
            this.client.get(`quota:${provider}:tpm`),
            this.client.get(`quota:${provider}:rpd:${date}`)
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
     * @param {Object} margins - Marges de sécurité { rpm: 0.2, tpm: 0.1, rpd: 0.05 }
     * @returns {Promise<{healthy: boolean, blocked: boolean, rpmUsed: number, rpmLimit: number, tpmUsed: number, tpmLimit: number, rpdUsed: number, rpdLimit: number, reason?: string}>}
     */
    async getModelHealth(modelId: any,  margins = { rpm: 0.20,  tpm: 0.10,  rpd: 0.05 }) {
        const result = {
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
        const blockKey = `quota:${modelId}:blocked`;

        try {
            // 1. Vérifier blocage explicite (Circuit Breaker)
            const isBlocked = await this.client.get(blockKey);
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

            const keyRPM = `quota:${modelId}:rpm`;
            const keyTPM = `quota:${modelId}:tpm`;
            const keyRPD = `quota:${modelId}:rpd:${date}`;

            const [rpm, tpm, rpd] = await Promise.all([
                this.client.get(keyRPM),
                this.client.get(keyTPM),
                this.client.get(keyRPD)
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

        } catch (error: any) {
            console.error(`[QuotaManager] Erreur getModelHealth ${modelId}:`, error);
            return result; // Fail open
        }
    }

    /**
     * Filtre une liste de modèles pour ne garder que ceux "sains" (avec marge de sécurité)
     * @param {Array<string>} modelIds - Liste des IDs de modèles
     * @param {Object} margins - Marges de sécurité { rpm: 0.2, tpm: 0.1, rpd: 0.05 }
     * @returns {Promise<Array<string>>} - Liste filtrée des IDs sains
     */
    async filterHealthyModels(modelIds: any,  margins = { rpm: 0.20,  tpm: 0.10,  rpd: 0.05 }) {
        if (!this.client.isReady) return modelIds; // Fail open

        const results = await Promise.all(modelIds.map(async (modelId: any) => {
            const health = await this.getModelHealth(modelId, margins);
            return { modelId, healthy: health.healthy };
        }));

        return results.filter((r: any) => r.healthy).map((r: any) => r.modelId);
    }

    /**
     * Récupère les familles qui ont au moins un modèle sain
     * @param {Object} familiesConfig - Configuration des familles { gemini: { modeles: [...] }, ... }
     * @param {Object} margins - Marges de sécurité
     * @returns {Promise<Array<string>>} - Liste des noms de familles saines
     */
    async getHealthyFamilies(familiesConfig: any,  margins = { rpm: 0.20,  tpm: 0.10,  rpd: 0.05 }) {
        const familyResults = await Promise.all(Object.entries(familiesConfig).map(async ([familyName, familyConfig]: any) => {
            const models = familyConfig.modeles || familyConfig.models || [];
            // Exclure les modèles d'embedding du check chat
            const chatModels = models
                .filter((m: any) => !m.id?.includes('embedding') && !m.types?.includes('embedding'))
                .map((m: any) => m.id);

            if (chatModels.length === 0) return { familyName, healthy: false };

            const healthyModels = await this.filterHealthyModels(chatModels, margins);
            return { familyName, healthy: healthyModels.length > 0 };
        }));

        return familyResults.filter((r: any) => r.healthy).map((r: any) => r.familyName);
    }

    /**
     * Mode dégradé : Rate limiting local si Redis down
     * Limite stricte : 1 requête par minute par modèle
     * @param {string} modelId - ID du modèle
     * @returns {boolean} - true si autorisé
     * @private
     */
    _allowWithLocalRateLimit(modelId: any) {
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
