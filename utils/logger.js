// utils/logger.js
// Système de logging centralisé avec contrôle du debug et commandes admin

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// ============================================================
// ÉTAT GLOBAL DU DEBUG
// ============================================================

const debugState = {
    // Si la variable DEBUG est explicitement "false", on désactive.
    // Sinon, par défaut on active (ou vous pouvez changer la logique inverse)
    // Ici : active SEULEMENT si DEBUG=true
    enabled: process.env.DEBUG === 'true',
    categories: new Set(['all']), // Catégories: 'all', 'mention', 'authority', 'social', 'ban', 'router', 'admin', 'kimi'
    verbose: false
};

// ============================================================
// CLASSE LOGGER
// ============================================================

class Logger {
    constructor(prefix = '') {
        this.prefix = prefix;
    }

    _timestamp() {
        return new Date().toISOString().substring(11, 19);
    }

    _format(level, color, message, ...args) {
        const ts = this._timestamp();
        const pre = this.prefix ? `[${this.prefix}]` : '';
        console.log(`${color}[${ts}] ${level}${pre}${colors.reset}`, message, ...args);
    }

    info(message, ...args) {
        this._format('INFO', colors.cyan, message, ...args);
    }

    success(message, ...args) {
        this._format('✓', colors.green, message, ...args);
    }

    warn(message, ...args) {
        this._format('WARN', colors.yellow, message, ...args);
    }

    error(message, ...args) {
        this._format('ERROR', colors.red, message, ...args);
    }

    debug(category, message, ...args) {
        if (!debugState.enabled) return;
        if (!debugState.categories.has('all') && !debugState.categories.has(category)) return;

        const ts = this._timestamp();
        const pre = this.prefix ? `[${this.prefix}]` : '';
        console.log(`${colors.magenta}[${ts}] DEBUG:${category.toUpperCase()}${pre}${colors.reset}`, message, ...args);
    }

    child(prefix) {
        return new Logger(this.prefix ? `${this.prefix}:${prefix}` : prefix);
    }
}

// ============================================================
// COMMANDES DEBUG
// ============================================================

/**
 * Active le mode debug
 */
export function enableDebug() {
    debugState.enabled = true;
    console.log('✅ [Logger] Mode DEBUG activé');
    return true;
}

/**
 * Désactive le mode debug
 */
export function disableDebug() {
    debugState.enabled = false;
    console.log('🔇 [Logger] Mode DEBUG désactivé');
    return true;
}

/**
 * Définit les catégories de debug actives
 * @param {string[]} categories - Ex: ['mention', 'authority', 'social', 'ban', 'router']
 */
export function setDebugCategories(categories) {
    debugState.categories = new Set(categories);
    console.log(`🔧 [Logger] Catégories actives: ${categories.join(', ')}`);
    return true;
}

/**
 * Réinitialise le debug
 */
export function resetDebug() {
    debugState.enabled = true;
    debugState.categories = new Set(['all']);
    console.log('🔄 [Logger] Debug réinitialisé');
    return true;
}

/**
 * Retourne l'état actuel du debug
 */
export function debugStatus() {
    return {
        enabled: debugState.enabled,
        categories: [...debugState.categories],
        verbose: debugState.verbose
    };
}

// ============================================================
// COMMANDES REDIS
// ============================================================

/**
 * Nettoie le cache Redis d'un groupe
 */
export async function clearGroupCache(redis, groupJid) {
    if (!redis) return { success: false, error: 'Redis non disponible' };

    try {
        const keys = [`group:${groupJid}:meta`, `group:${groupJid}:context`];
        for (const key of keys) await redis.del(key);
        console.log(`✅ [Logger] Cache groupe effacé: ${groupJid}`);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Nettoie tout le cache Redis du bot
 */
export async function flushRedisCache(redis) {
    if (!redis) return { success: false, error: 'Redis non disponible' };

    try {
        const groupKeys = await redis.keys('group:*');
        const userKeys = await redis.keys('user:*');
        const wmKeys = await redis.keys('wm:*');
        const allKeys = [...groupKeys, ...userKeys, ...wmKeys];

        for (const key of allKeys) await redis.del(key);
        console.log(`✅ [Logger] Cache Redis nettoyé: ${allKeys.length} clés`);
        return { success: true, keysDeleted: allKeys.length };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Statistiques Redis
 */
export async function redisStats(redis) {
    if (!redis) return { error: 'Redis non disponible' };

    try {
        const groups = (await redis.keys('group:*')).length;
        const users = (await redis.keys('user:*')).length;
        const wm = (await redis.keys('wm:*')).length;
        return { groups, users, workingMemory: wm, total: groups + users + wm };
    } catch (err) {
        return { error: err.message };
    }
}

// ============================================================
// COMMANDES ADMIN
// ============================================================

/**
 * Force refresh du cache admin
 */
export async function refreshAdminCache(adminService) {
    if (!adminService) return false;
    try {
        await adminService.refresh();
        console.log('✅ [Logger] Cache admin rafraîchi');
        return true;
    } catch (err) {
        console.error('❌ [Logger] Erreur refreshAdminCache:', err.message);
        return false;
    }
}

/**
 * État du système
 */
export async function systemStatus(services = {}) {
    const status = {
        timestamp: new Date().toISOString(),
        debug: debugStatus(),
        services: {}
    };

    if (services.redis) {
        try {
            await services.redis.ping();
            status.services.redis = '✅ OK';
            status.redisStats = await redisStats(services.redis);
        } catch {
            status.services.redis = '❌ Déconnecté';
        }
    }

    if (services.adminService) {
        status.services.adminCache = `${services.adminService.getCacheSize()} admin(s)`;
    }

    return status;
}

// ============================================================
// AIDE
// ============================================================

export function help() {
    console.log(`
📋 COMMANDES LOGGER DISPONIBLES:

🔧 DEBUG:
   enableDebug()                    → Active les logs DEBUG
   disableDebug()                   → Désactive les logs DEBUG
   debugStatus()                    → État actuel
   resetDebug()                     → Réinitialise
   setDebugCategories(['mention'])  → Filtre par catégorie

🗄️ REDIS:
   clearGroupCache(redis, "jid@g.us")  → Efface cache d'un groupe
   flushRedisCache(redis)              → ⚠️ Efface TOUT le cache
   redisStats(redis)                   → Statistiques

👑 ADMIN:
   refreshAdminCache(adminService)     → Refresh cache admin

📊 SYSTÈME:
   systemStatus({ redis, adminService })
   
🛑 BASE DE DONNÉES:
   npm run cli db:reset-data         → ⚠️ VIDE toutes les données (Sauf Global Admins)
`
);
}

export const logger = new Logger();
export default Logger;
