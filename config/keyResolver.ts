import { envResolver } from '../services/envResolver.js';

/**
 * Résout une valeur de credential depuis .env si c'est un placeholder
 */
export function resolveApiKey(credentialValue: string): string | null {
    return envResolver.resolve(credentialValue);
}

/**
 * Résout un objet credentials complet (notamment les familles_ia)
 */
export function resolveCredentials(credentials: Record<string, any>): Record<string, any> {
    if (!credentials) return {};
    const resolved = { ...credentials };
    
    if (resolved.familles_ia) {
        resolved.familles_ia = { ...resolved.familles_ia };
        for (const [family, key] of Object.entries(resolved.familles_ia as Record<string, string>)) {
            resolved.familles_ia[family] = resolveApiKey(key);
        }
    }
    
    return resolved;
}
