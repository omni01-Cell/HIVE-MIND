// utils/dnsHelpers.js
// ============================================================================
// Helpers DNS pour résolution ciblée des problèmes de connectivité
// ============================================================================

import dns from 'dns';

/**
 * Force IPv4 pour une URL spécifique (ciblée, pas globale)
 * Utilisé pour résoudre les problèmes avec Kimi/Cloudflare sous Node 17+
 * 
 * @param {string} url - URL à tester
 * @returns {boolean} - true si IPv4 forcing appliqué
 */
export function forceIPv4ForUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // Liste des domaines qui ont besoin de IPv4 forcing
    const ipv4RequiredDomains = [
        'kimi.moonshot.cn',
        'api.moonshot.cn',
        'cloudflare.com',
        'workers.dev'
    ];

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // Vérifier si ce domaine nécessite IPv4
        const needsIPv4 = ipv4RequiredDomains.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );

        if (needsIPv4) {
            console.log(`[DNS] 🔧 IPv4 forcing activé pour: ${hostname}`);

            // Option 1: Utiliser un agent HTTP personnalisé (recommandé)
            // Cette approche est plus propre que le setDefaultResultOrder global
            return true;
        }

        return false;

    } catch (e) {
        console.warn(`[DNS] ⚠️ Erreur parsing URL ${url}:`, e.message);
        return false;
    }
}

/**
 * Crée un agent HTTP avec IPv4 forcing pour les requêtes spécifiques
 * @returns {Object} - Configuration d'agent pour fetch/node-fetch
 */
export async function createIPv4Agent() {
    // Pour node-fetch ou axios
    const http = await import('http');
    const https = await import('https');

    return {
        http: new http.Agent({
            family: 4,  // Force IPv4
            keepAlive: true,
            timeout: 30000
        }),
        https: new https.Agent({
            family: 4,  // Force IPv4  
            keepAlive: true,
            timeout: 30000
        })
    };
}

/**
 * Configuration DNS ciblée pour les providers problématiques
 * @param {string} providerName - Nom du provider
 * @returns {Object} - Configuration DNS
 */
export function getDNSConfig(providerName) {
    const dnsConfigs = {
        'kimi': {
            family: 4,           // IPv4 only
            lookup: (hostname, options, callback) => {
                // Custom lookup pour forcer IPv4
                dns.lookup(hostname, { family: 4 }, callback);
            }
        },
        'moonshot': {
            family: 4,
            // Ajouter d'autres configs spécifiques si nécessaire
        }
    };

    return dnsConfigs[providerName] || null;
}

/**
 * Vérifie si une erreur de réseau pourrait être résolue par IPv4 forcing
 * @param {Error} error - L'erreur réseau
 * @param {string} url - URL qui a causé l'erreur
 * @returns {boolean} - true si IPv4 forcing pourrait aider
 */
export function shouldTryIPv4Fallback(error, url) {
    if (!error || !url) return false;

    const errorMessages = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'fetch failed',
        'network error'
    ];

    const errorStr = error.toString().toLowerCase();
    const isNetworkError = errorMessages.some(msg => errorStr.includes(msg.toLowerCase()));

    if (isNetworkError) {
        console.log(`[DNS] 🔄 IPv4 fallback suggéré pour: ${url}`);
        return forceIPv4ForUrl(url);
    }

    return false;
}

/**
 * Wrapper fetch avec retry et IPv4 fallback intelligent
 * @param {string} url - URL à fetch
 * @param {Object} options - Options fetch
 * @param {number} maxRetries - Nombre max de retries
 * @returns {Promise} - Réponse fetch
 */
export async function fetchWithIPv4Fallback(url, options = {}, maxRetries = 2) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Tentative normale
            const response = await fetch(url, options);
            return response;

        } catch (error) {
            lastError = error;

            // Dernière tentative: IPv4 forcing
            if (attempt === maxRetries - 1 && shouldTryIPv4Fallback(error, url)) {
                console.log(`[DNS] 🔄 Tentative IPv4 fallback pour: ${url}`);

                try {
                    // Créer agent IPv4 pour cette requête
                    const agents = await createIPv4Agent();
                    const ipv4Options = {
                        ...options,
                        agent: url.startsWith('https:') ? agents.https : agents.http
                    };

                    return await fetch(url, ipv4Options);

                } catch (ipv4Error) {
                    console.warn(`[DNS] ❌ IPv4 fallback a échoué:`, ipv4Error.message);
                    // Continuer avec l'erreur originale
                }
            }

            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000; // Backoff exponentiel
                console.log(`[DNS] ⏳ Retry dans ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}