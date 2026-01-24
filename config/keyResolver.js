/**
 * Résout une valeur de credential depuis .env si c'est un placeholder
 * @param {string} credentialValue - Valeur brute du credentials.json
 * @returns {string|null} - Clé API réelle ou null
 */
export function resolveApiKey(credentialValue) {
    if (!credentialValue) return null;
    if (typeof credentialValue !== 'string') return credentialValue;
    
    // Si la valeur commence par VOTRE_ et existe dans l'env, on la résout
    if (credentialValue.startsWith('VOTRE_')) {
        const envValue = process.env[credentialValue];
        if (envValue) {
            return envValue;
        }
    }
    
    // Sinon on retourne la valeur telle quelle
    return credentialValue;
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
