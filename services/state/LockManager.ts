// @ts-nocheck
// services/state/LockManager.js
import { redis } from '../redisClient.js';

// Helper pour attendre (promisified setTimeout)
const delay = (ms: any) => new Promise(resolve => setTimeout(resolve, ms));

export class LockManager {
    prefix: any;
    ttl: any;

    constructor(resourcePrefix, ttlMs = 5000) {
        this.prefix = resourcePrefix;
        this.ttl = ttlMs;
    }

    /**
     * Tente d'acquérir un verrou distribué
     * @param {string} key - ID de la ressource (ex: userJid)
     * @returns {Promise<string|null>} Le lockId si succès, null sinon
     */
    async acquire(key: any) {
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
    async acquireWait(key: any, maxRetries: any = 10) {
        let attempt = 0;
        while (attempt < maxRetries) {
            const lockId = await this.acquire(key);
            if (lockId) return lockId;

            attempt++;
            // Attente aléatoire pour éviter le "thundering herd problem"
            await delay(50 + Math.random() * 100);
        }

        console.warn(`[LockManager] Failed to acquire lock for ${key} after ${maxRetries} retries`);
        return null; // On retourne null plutôt que throw pour ne pas crasher le flux, mais l'appelant doit gestire
    }

    /**
     * Relâche le verrou seulement s'il nous appartient
     */
    async release(key: any, lockId: any) {
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
            await redis.eval(script, {
                keys: [lockKey],
                arguments: [lockId]
            });
        } catch (error: any) {
            console.error('[LockManager] release error:', error.message);
        }
    }
}
