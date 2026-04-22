/**
 * services/quotaManager.ts
 * Gestionnaire de quotas pour les appels aux modèles d'IA
 * Implémente RPM (Requests Per Minute), TPM (Tokens Per Minute) et RPD (Requests Per Day)
 */

import { redis as redisClient } from './redisClient.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface QuotaLimits {
  rpm?: number;
  tpm?: number;
  rpd?: number;
}

export interface ModelHealth {
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

class QuotaManager {
  private quotas: Record<string, QuotaLimits> = {};
  private localRateLimit = new Map<string, number>();
  private redisDownSince: number | null = null;

  constructor() {
    this._loadConfig();
  }

  private _loadConfig(): void {
    try {
      const configPath = join(__dirname, '..', 'config', 'models_config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      this.quotas = {};

      if (config.familles) {
        for (const [_, providerConfig] of Object.entries<any>(config.familles)) {
          const modelList = providerConfig.modeles || providerConfig.models || [];
          for (const model of modelList) {
            if (model.quota && model.id) {
              this.quotas[model.id] = model.quota;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[QuotaManager] Impossible de charger les quotas:', e.message);
    }
  }

  public async init(): Promise<void> {
    // Initialisé (silencieux)
  }

  /**
   * Enregistre l'utilisation d'un modèle après un appel réussi
   */
  public async recordUsage(provider: string, modelId: string, estimatedTokens: number = 0): Promise<void> {
    if (!redisClient.isOpen || !modelId) return;

    const date = new Date().toISOString().split('T')[0];
    const quotaKeyRPM = `quota:${modelId}:rpm`;
    const quotaKeyTPM = `quota:${modelId}:tpm`;
    const quotaKeyRPD = `quota:${modelId}:rpd:${date}`;

    try {
      const multi = redisClient.multi();

      multi.incr(quotaKeyRPM);
      multi.expire(quotaKeyRPM, 60);

      if (estimatedTokens > 0) {
        multi.incrBy(quotaKeyTPM, estimatedTokens);
        multi.expire(quotaKeyTPM, 60);
      }

      multi.incr(quotaKeyRPD);
      multi.expire(quotaKeyRPD, 48 * 3600);

      await multi.exec();
    } catch (error) {
      console.error('[QuotaManager] Erreur Redis usage recording:', error);
    }
  }

  /**
   * Vérifie si un modèle spécifique est disponible
   */
  public async isModelAvailable(modelId: string, estimatedCost: number = 0): Promise<boolean> {
    if (!redisClient.isOpen) {
      console.warn('[QuotaManager] ⚠️ Redis indisponible - Mode dégradé actif');
      
      if (!this.redisDownSince) {
        this.redisDownSince = Date.now();
      }
      
      const downMinutes = (Date.now() - this.redisDownSince) / 60000;
      if (downMinutes > 5) {
        console.error('[QuotaManager] 🚨 Redis down depuis > 5 min - BLOCAGE TOTAL');
        return false;
      }
      
      return this._allowWithLocalRateLimit(modelId);
    }
    
    this.redisDownSince = null;
    if (!modelId) return true;

    const date = new Date().toISOString().split('T')[0];
    const blockKey = `quota:${modelId}:blocked`;

    // 1. Vérifier si le modèle est explicitement bloqué (Circuit Breaker)
    const isBlocked = await redisClient.get(blockKey);
    if (isBlocked) return false;

    if (!this.quotas[modelId]) return true;

    const limits = this.quotas[modelId];
    const keyRPM = `quota:${modelId}:rpm`;
    const keyTPM = `quota:${modelId}:tpm`;
    const keyRPD = `quota:${modelId}:rpd:${date}`;

    try {
      const [rpm, tpm, rpd] = await Promise.all([
        redisClient.get(keyRPM),
        redisClient.get(keyTPM),
        redisClient.get(keyRPD)
      ]);

      const currentRPM = parseInt(rpm || '0');
      const currentTPM = parseInt(tpm || '0');
      const currentRPD = parseInt(rpd || '0');

      if (limits.rpm && (currentRPM + 1) > limits.rpm) return false;
      if (limits.tpm && (currentTPM + estimatedCost) > limits.tpm) return false;
      if (limits.rpd && (currentRPD + 1) > limits.rpd) return false;

      return true;
    } catch (error) {
      console.error(`[QuotaManager] Erreur lecture quota ${modelId}:`, error);
      return true; // Fail open
    }
  }

  /**
   * Bloque temporairement un modèle suite à une erreur 429
   */
  public async recordQuotaExceeded(modelId: string, timeoutSeconds: number = 60): Promise<void> {
    if (!redisClient.isOpen || !modelId) return;

    const blockKey = `quota:${modelId}:blocked`;
    try {
      await redisClient.setEx(blockKey, timeoutSeconds, '1');
      console.log(`[QuotaManager] 🥶 Modèle ${modelId} bloqué pour ${timeoutSeconds}s`);
    } catch (error) {
      console.error('[QuotaManager] Erreur recordQuotaExceeded:', error);
    }
  }

  /**
   * Filtre une liste de modèles pour ne garder que ceux disponibles
   */
  public async filterAvailableModels<T>(models: T[]): Promise<T[]> {
    const available: T[] = [];
    for (const model of models) {
      const id = typeof model === 'string' ? model : (model as any).id;
      if (await this.isModelAvailable(id)) {
        available.push(model);
      }
    }
    return available;
  }

  /**
   * Récupère l'état de santé détaillé d'un modèle
   */
  public async getModelHealth(modelId: string, margins = { rpm: 0.20, tpm: 0.10, rpd: 0.05 }): Promise<ModelHealth> {
    const result: ModelHealth = {
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

    if (!redisClient.isOpen || !modelId) return result;

    const date = new Date().toISOString().split('T')[0];
    const blockKey = `quota:${modelId}:blocked`;

    try {
      const isBlocked = await redisClient.get(blockKey);
      if (isBlocked) {
        result.healthy = false;
        result.blocked = true;
        result.reason = 'BLOCKED (429 antérieur)';
        return result;
      }

      if (!this.quotas[modelId]) return result;

      const limits = this.quotas[modelId];
      result.rpmLimit = limits.rpm || Infinity;
      result.tpmLimit = limits.tpm || Infinity;
      result.rpdLimit = limits.rpd || Infinity;

      const [rpm, tpm, rpd] = await Promise.all([
        redisClient.get(`quota:${modelId}:rpm`),
        redisClient.get(`quota:${modelId}:tpm`),
        redisClient.get(`quota:${modelId}:rpd:${date}`)
      ]);

      result.rpmUsed = parseInt(rpm || '0');
      result.tpmUsed = parseInt(tpm || '0');
      result.rpdUsed = parseInt(rpd || '0');

      const rpmThreshold = Math.floor(result.rpmLimit * (1 - margins.rpm));
      if (limits.rpm && result.rpmUsed >= rpmThreshold) {
        result.healthy = false;
        result.reason = `RPM critique (${result.rpmUsed}/${result.rpmLimit})`;
        return result;
      }

      const tpmThreshold = Math.floor(result.tpmLimit * (1 - margins.tpm));
      if (limits.tpm && result.tpmUsed >= tpmThreshold) {
        result.healthy = false;
        result.reason = `TPM critique (${result.tpmUsed}/${result.tpmLimit})`;
        return result;
      }

      const rpdThreshold = Math.floor(result.rpdLimit * (1 - margins.rpd));
      if (limits.rpd && result.rpdUsed >= rpdThreshold) {
        result.healthy = false;
        result.reason = `RPD critique (${result.rpdUsed}/${result.rpdLimit})`;
        return result;
      }

      return result;
    } catch (error) {
      console.error(`[QuotaManager] Erreur getModelHealth ${modelId}:`, error);
      return result;
    }
  }

  private _allowWithLocalRateLimit(modelId: string): boolean {
    const key = `local:${modelId}`;
    const lastSeen = this.localRateLimit.get(key);
    const now = Date.now();
    
    if (lastSeen && (now - lastSeen) < 60000) return false;
    
    this.localRateLimit.set(key, now);
    return true;
  }
}

export const quotaManager = new QuotaManager();
export default quotaManager;
