import { envResolver } from '../services/envResolver.js';

/**
 * Résout une valeur de credential depuis .env si c'est un placeholder
 */
export function resolveApiKey(credentialValue: string, providerName?: string): string | null {
    const resolvedValue = envResolver.resolve(credentialValue);
    if (resolvedValue !== null) {
        return resolvedValue;
    }

    const inferredProvider = providerName || inferProviderName(credentialValue);
    if (!inferredProvider) {
        return null;
    }

    return envResolver.resolveProviderKey(inferredProvider);
}

function inferProviderName(credentialValue: string): string | null {
    const envReference = /^\$\{([A-Z0-9_]+)\}$/i.exec(String(credentialValue || ''));
    if (!envReference) {
        return null;
    }

    const envName = envReference[1].toUpperCase();
    if (!envName.endsWith('_KEY') && !/_KEY_\d+$/.test(envName)) {
        return null;
    }

    return envName.replace(/_KEY(?:_\d+)?$/, '').toLowerCase();
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
            resolved.familles_ia[family] = resolveApiKey(key, family);
        }
    }
    
    return resolved;
}
