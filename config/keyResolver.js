import { envResolver } from '../services/envResolver.js';

/**
 * Résout une valeur de credential depuis .env si c'est un placeholder
 * @param {string} credentialValue - Valeur brute du credentials.json
 * @returns {string|null} - Clé API réelle ou null
 */
export function resolveApiKey(credentialValue) {
    return envResolver.resolve(credentialValue);
}

/**
 * Résout un objet credentials complet (notamment les familles_ia)
 * @param {Object} credentials - Objet credentials brut
 * @returns {Object} - Objet credentials avec clés résolues
 */
export function resolveCredentials(credentials) {
    if (!credentials) return {};
    const resolved = { ...credentials };
    
    if (resolved.familles_ia) {
        resolved.familles_ia = { ...resolved.familles_ia };
        for (const [family, key] of Object.entries(resolved.familles_ia)) {
            resolved.familles_ia[family] = resolveApiKey(key);
        }
    }
    
    return resolved;
}
