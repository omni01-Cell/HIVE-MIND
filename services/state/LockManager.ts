/**
 * services/state/LockManager.ts
 * Système de verrouillage distribué via Redis
 */

import { redis } from '../redisClient.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gère l'acquisition et la libération de verrous distribués
 */
export class LockManager {
  private prefix: string;
  private ttl: number;

  constructor(resourcePrefix: string, ttlMs: number = 5000) {
    this.prefix = resourcePrefix;
    this.ttl = ttlMs;
  }

  /**
   * Tente d'acquérir un verrou distribué
   * @param key ID de la ressource (ex: userJid)
   * @returns Le lockId si succès, null sinon
   */
  public async acquire(key: string): Promise<string | null> {
    if (!redis?.isOpen) {
      console.warn('[LockManager] Redis not ready, proceeding without lock');
      return 'no-lock-fallback';
    }

    const lockKey = `lock:${this.prefix}:${key}`;
    const lockId = Date.now().toString() + Math.random();

    try {
      // SET NX: Set if Not Exists - Opération atomique
      const acquired = await redis.set(lockKey, lockId, {
        PX: this.ttl,
        NX: true
      });

      return acquired ? lockId : null;
    } catch (error: any) {
      console.error('[LockManager] acquire error:', error.message);
      return null;
    }
  }

  /**
   * Attend et acquiert le verrou (Spinlock avec backoff)
   */
  public async acquireWait(key: string, maxRetries: number = 10): Promise<string | null> {
    let attempt = 0;
    while (attempt < maxRetries) {
      const lockId = await this.acquire(key);
      if (lockId) return lockId;

      attempt++;
      // Attente aléatoire pour éviter le "thundering herd problem"
      await delay(50 + Math.random() * 100);
    }

    console.warn(`[LockManager] Failed to acquire lock for ${key} after ${maxRetries} retries`);
    return null;
  }

  /**
   * Relâche le verrou seulement s'il nous appartient
   */
  public async release(key: string, lockId: string | null): Promise<void> {
    if (!lockId || lockId === 'no-lock-fallback' || !redis?.isOpen) return;

    const lockKey = `lock:${this.prefix}:${key}`;
    try {
      // Script Lua pour garantir l'atomicité de la vérification + suppression
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      // script as string, buteval expects it. RedisClientType handled it.
      await redis.eval(script, {
        keys: [lockKey],
        arguments: [lockId]
      });
    } catch (error: any) {
      console.error('[LockManager] release error:', error.message);
    }
  }
}
