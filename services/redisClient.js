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
    } catch (e) {
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
            if (retries > 20) {
                console.error('[Redis] ❌ Echec critique: Trop de tentatives de reconnexion.');
                return new Error('Redis : Nombre maximal de tentatives atteint');
            }
            // Backoff progressif : 500ms -> 1s -> 2s ... Max 5s
            const delay = Math.min(retries * 500, 5000);
            console.log(`[Redis] Reconnexion tentative ${retries} dans ${delay}ms...`);
            return delay;
        }
    }
});

// Event handlers
redis.on('error', err => console.error('[Redis] Erreur Connexion:', err.message));
redis.on('connect', () => { /* Connexion silencieuse pour ne pas casser la barre de progression */ });
redis.on('reconnecting', () => console.log('[Redis] Reconnexion en cours...'));

// Connexion asynchrone
let connectionPromise = null;

/**
 * Assure que Redis est connecté avant toute opération
 * @returns {Promise<void>}
 */
const ensureConnected = async () => {
    if (redis.isOpen) return;

    if (!connectionPromise) {
        connectionPromise = redis.connect().catch(err => {
            console.error('[Redis] Échec de la connexion initiale:', err.message);
            connectionPromise = null;
            throw err;
        });
    }

    await connectionPromise;
};

// Connexion au démarrage
ensureConnected().catch(() => { });

/**
 * Vérifie l'état de santé de Redis
 * @returns {Promise<Object>} Status et métriques
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
    } catch (e) {
        return { status: 'error', error: e.message };
    }
};

/**
 * Ferme proprement la connexion Redis
 * @returns {Promise<void>}
 */
const disconnect = async () => {
    if (redis.isOpen) {
        await redis.quit();
        console.log('[Redis] Connexion fermée proprement');
    }
};

export { redis, ensureConnected, checkHealth, disconnect };
export default redis;
