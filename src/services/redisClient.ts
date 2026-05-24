// services/redisClient.js
// Client Redis partagé pour tous les services
// Évite les connexions multiples (limite Redis Cloud = 30 connexions)

import { createClient } from 'redis';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Chargement sécurisé de l'URL depuis les credentials
const getRedisUrl = () => {
    try {
        const creds = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'credentials.json'), 'utf-8'));
        let url = creds.redis?.url;

        // Si la valeur est un nom de variable d'environnement (pas une URL), la résoudre
        if (url && !url.startsWith('redis://') && !url.startsWith('rediss://')) {
            // C'est probablement un nom de variable comme "REDIS_URL" ou "VOTRE_LIEN_REDIS"
            url = process.env[url] || process.env.REDIS_URL || 'redis://localhost:6379';
        }

        // Fallback si pas de valeur
        if (!url) {
            url = process.env.REDIS_URL || 'redis://localhost:6379';
        }

        // Sanitize: remove any stray quotes from URL (common .env parsing issue)
        return url.replace(/["']/g, '').trim();
    } catch (e: any) {
        console.warn('[Redis] Impossible de lire credentials.json, repli sur localhost', e.message);
        return process.env.REDIS_URL || 'redis://localhost:6379';
    }
};

// Client Redis unique (singleton)
const redis = createClient({
    url: getRedisUrl(),
    socket: {
        connectTimeout: 15000, // 15s (Augmenté pour les Cold Starts Redis Cloud)
        keepAlive: 10000,      // 10s (Ping TCP pour éviter la coupure silencieuse)
        tls: false,            // Explicitement désactivé pour le port 10xxx standard
        reconnectStrategy: (retries) => {
            if (process.env.APP_ENV === 'local' || retries > 1) {
                // Abandonner immédiatement en local pour basculer sur le mock in-memory
                return new Error('Redis : Abandon de connexion en mode local');
            }
            if (retries > 20) {
                console.error('[Redis] ❌ Echec critique: Trop de tentatives de reconnexion.');
                return new Error('Redis : Nombre maximal de tentatives atteint');
            }
            const delay = Math.min(retries * 500, 5000);
            console.log(`[Redis] Reconnexion tentative ${retries} dans ${delay}ms...`);
            return delay;
        }
    }
});

// Event handlers
redis.on('error', err => console.error('[Redis] Erreur Connexion:', err.message));
redis.on('connect', () => { /* Connexion silencieuse */ });
redis.on('reconnecting', () => console.log('[Redis] Reconnexion en cours...'));

// Connexion asynchrone
let connectionPromise: any = null;

/**
 * Assure que Redis est connecté avant toute opération
 */
/**
 * Assure que Redis est connecté avant toute opération
 */
const ensureConnected = async () => {
    if (redis.isOpen) return;

    if (!connectionPromise) {
        connectionPromise = redis.connect().catch(err => {
            console.warn('[Redis] ⚠️ Connexion impossible. Basculement transparent en mode Mock In-Memory pour ce cycle local:', err.message);
            switchToMock(redis);
            connectionPromise = Promise.resolve();
        });
    }

    await connectionPromise;
};

// Connexion au démarrage supprimée pour éviter les side-effects.
// Le client doit être connecté explicitement par l'application (via botCore.init ou container.init).

/**
 * Vérifie l'état de santé de Redis
 */
const checkHealth = async () => {
    if (!redis.isOpen) {
        return { status: 'disconnected', error: 'Client not open' };
    }
    try {
        const start = Date.now();
        await redis.ping();
        const latency = Date.now() - start;

        const info = await redis.info('memory');
        const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1] || 'unknown';
        const connectedClients = info.match(/connected_clients:(\d+)/)?.[1] || 'unknown';

        return {
            status: 'connected',
            latency: `${latency}ms`,
            memory: usedMemory,
            clients: connectedClients
        };
    } catch (e: any) {
        return { status: 'error', error: e.message };
    }
};

/**
 * Ferme proprement la connexion Redis
 */
const disconnect = async () => {
    if (redis.isOpen) {
        try {
            await redis.quit();
        } catch {}
        console.log('[Redis] Connexion fermée proprement');
    }
};

// =========================================================================
// MOCK REDIS IN-MEMORY FALLBACK (Pour les tests locaux sans serveur Redis)
// =========================================================================

class InMemoryRedisMock {
    storage = new Map<string, { value: any, expiresAt: number | null }>();
    isOpen = true;
    isReady = true;

    private _isExpired(entry: any) {
        if (!entry || entry.expiresAt === null) return false;
        return Date.now() > entry.expiresAt;
    }

    async get(key: string) {
        const entry = this.storage.get(key);
        if (this._isExpired(entry)) {
            this.storage.delete(key);
            return null;
        }
        return entry ? String(entry.value) : null;
    }

    async set(key: string, value: any, options: any = {}) {
        let expiresAt: number | null = null;
        if (options.EX) {
            expiresAt = Date.now() + options.EX * 1000;
        }
        this.storage.set(key, { value, expiresAt });
        return 'OK';
    }

    async setEx(key: string, seconds: number, value: any) {
        this.storage.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
        return 'OK';
    }

    async del(key: string) {
        return this.storage.delete(key) ? 1 : 0;
    }

    async keys(pattern: string) {
        const results: string[] = [];
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const now = Date.now();
        for (const [key, entry] of this.storage.entries()) {
            if (this._isExpired(entry)) {
                this.storage.delete(key);
                continue;
            }
            if (regex.test(key)) {
                results.push(key);
            }
        }
        return results;
    }

    async incr(key: string) {
        const val = await this.get(key);
        const next = (parseInt(val || '0') + 1);
        this.storage.set(key, { value: next, expiresAt: this.storage.get(key)?.expiresAt || null });
        return next;
    }

    async incrBy(key: string, value: number) {
        const val = await this.get(key);
        const next = (parseInt(val || '0') + value);
        this.storage.set(key, { value: next, expiresAt: this.storage.get(key)?.expiresAt || null });
        return next;
    }

    async expire(key: string, seconds: number) {
        const entry = this.storage.get(key);
        if (entry) {
            entry.expiresAt = Date.now() + seconds * 1000;
            return 1;
        }
        return 0;
    }

    async ping() {
        return 'PONG';
    }

    async info() {
        return 'used_memory_human:1MB connected_clients:1';
    }

    async quit() {
        this.isOpen = false;
        this.isReady = false;
    }

    async lPush(key: string, value: string) {
        const entry = this.storage.get(key);
        const list = entry ? JSON.parse(entry.value) : [];
        list.unshift(value);
        this.storage.set(key, { value: JSON.stringify(list), expiresAt: entry?.expiresAt || null });
        return list.length;
    }

    async rPop(key: string) {
        const entry = this.storage.get(key);
        if (!entry) return null;
        const list = JSON.parse(entry.value);
        const item = list.pop();
        this.storage.set(key, { value: JSON.stringify(list), expiresAt: entry.expiresAt });
        return item || null;
    }

    async lRem(key: string, count: number, value: string) {
        const entry = this.storage.get(key);
        if (!entry) return 0;
        const list = JSON.parse(entry.value) as string[];
        let removed = 0;
        const filtered = list.filter(item => {
            if (item === value) {
                removed++;
                return false;
            }
            return true;
        });
        this.storage.set(key, { value: JSON.stringify(filtered), expiresAt: entry.expiresAt });
        return removed;
    }

    async lRange(key: string, start: number, stop: number) {
        const entry = this.storage.get(key);
        if (!entry) return [];
        const list = JSON.parse(entry.value) as string[];
        const actualStop = stop === -1 ? list.length : stop + 1;
        return list.slice(start, actualStop);
    }

    multi() {
        const queue: Array<() => Promise<any>> = [];
        const mockInstance = this;
        return {
            incr(key: string) {
                queue.push(() => mockInstance.incr(key));
                return this;
            },
            expire(key: string, seconds: number) {
                queue.push(() => mockInstance.expire(key, seconds));
                return this;
            },
            incrBy(key: string, value: number) {
                queue.push(() => mockInstance.incrBy(key, value));
                return this;
            },
            async exec() {
                const results = [];
                for (const op of queue) {
                    results.push(await op());
                }
                return results;
            }
        };
    }
}

function switchToMock(redisInstance: any) {
    const mock = new InMemoryRedisMock();

    Object.defineProperty(redisInstance, 'isOpen', { get: () => mock.isOpen });
    Object.defineProperty(redisInstance, 'isReady', { get: () => mock.isReady });

    redisInstance.get = mock.get.bind(mock);
    redisInstance.set = mock.set.bind(mock);
    redisInstance.setEx = mock.setEx.bind(mock);
    redisInstance.del = mock.del.bind(mock);
    redisInstance.keys = mock.keys.bind(mock);
    redisInstance.incr = mock.incr.bind(mock);
    redisInstance.incrBy = mock.incrBy.bind(mock);
    redisInstance.expire = mock.expire.bind(mock);
    redisInstance.ping = mock.ping.bind(mock);
    redisInstance.info = mock.info.bind(mock);
    redisInstance.quit = mock.quit.bind(mock);
    redisInstance.lPush = mock.lPush.bind(mock);
    redisInstance.rPop = mock.rPop.bind(mock);
    redisInstance.lRem = mock.lRem.bind(mock);
    redisInstance.lRange = mock.lRange.bind(mock);
    redisInstance.multi = mock.multi.bind(mock);
}

export { redis, ensureConnected, checkHealth, disconnect };
export default redis;
