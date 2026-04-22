/**
 * services/redisClient.ts
 * Client Redis partagé pour tous les services
 * Évite les connexions multiples (limite Redis Cloud = 30 connexions)
 */

import { createClient, RedisClientType } from 'redis';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RedisHealth {
  status: 'connected' | 'disconnected' | 'error';
  latency?: string;
  memory?: string;
  clients?: string;
  error?: string;
}

/**
 * Chargement sécurisé de l'URL depuis les credentials
 */
const getRedisUrl = (): string => {
  try {
    const creds = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'credentials.json'), 'utf-8'));
    let url = creds.redis?.url;

    if (url && !url.startsWith('redis://') && !url.startsWith('rediss://')) {
      url = process.env[url] || process.env.REDIS_URL || 'redis://localhost:6379';
    }

    if (!url) {
      url = process.env.REDIS_URL || 'redis://localhost:6379';
    }

    return url.replace(/["']/g, '').trim();
  } catch (e: any) {
    console.warn('[Redis] Impossible de lire credentials.json, repli sur localhost', e.message);
    return process.env.REDIS_URL || 'redis://localhost:6379';
  }
};

/**
 * Client Redis unique (singleton)
 */
export const redis: RedisClientType = createClient({
  url: getRedisUrl(),
  socket: {
    connectTimeout: 15000, // 15s (Augmenté pour les Cold Starts Redis Cloud)
    keepAlive: 10000,      // 10s (Ping TCP pour éviter la coupure silencieuse)
    tls: false,            
    reconnectStrategy: (retries: number) => {
      const MAX_RETRIES = 20;
      if (retries > MAX_RETRIES) {
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
redis.on('error', (err: Error) => console.error('[Redis] Erreur Connexion:', err.message));
redis.on('connect', () => { /* Silencieux */ });
redis.on('reconnecting', () => console.log('[Redis] Reconnexion en cours...'));

// Connexion asynchrone
let connectionPromise: Promise<void> | null = null;

/**
 * Assure que Redis est connecté avant toute opération
 */
export const ensureConnected = async (): Promise<void> => {
  if (redis.isOpen) return;

  if (!connectionPromise) {
    connectionPromise = redis.connect().catch((err: Error) => {
      console.error('[Redis] Échec de la connexion initiale:', err.message);
      connectionPromise = null;
      throw err;
    });
  }

  await connectionPromise;
};

/**
 * Vérifie l'état de santé de Redis
 */
export const checkHealth = async (): Promise<RedisHealth> => {
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
export const disconnect = async (): Promise<void> => {
  if (redis.isOpen) {
    await redis.quit();
    console.log('[Redis] Connexion fermée proprement');
  }
};

// Connexion au démarrage (silencieuse)
ensureConnected().catch(() => {});

export default redis;
