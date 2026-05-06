// @ts-nocheck
// services/envResolver.js
// ============================================================================
// Module Unifié de Résolution des Variables d'Environnement
// ============================================================================
// Centralise TOUTE la logique de résolution .env pour éviter la fragmentation

/**
 * Service singleton pour résoudre les variables d'environnement
 * Supporte les formats :
 * - API providers: PROVIDER_KEY, PROVIDER_KEY_1, PROVIDER_KEY_2...
 * - no_key / NO_KEY disables a key slot explicitly
 */
export class EnvResolver {
    resolved: any;
    stats: any;

    constructor() {
        // Cache des résolutions pour performance
        this.resolved = new Map();
        // Compteur pour monitoring
        this.stats = {
            hits: 0,
            misses: 0,
            warnings: []
        };
    }

    /**
     * Résout une valeur depuis .env avec plusieurs stratégies
     * @param {string} value - Valeur brute (peut être placeholder, variable, ou valeur directe)
     * @param {string} [varName] - Nom de variable suggéré (ex: 'GEMINI_KEY')
     * @returns {string|null} - Valeur résolue ou null si introuvable
     */
    resolve(value: any, varName: any = null) {
        if (!value) return null;
        if (typeof value !== 'string') return value;
        if (this._isDisabledKey(value)) return null;

        // Check cache
        const cacheKey = `${value}::${varName || ''}`;
        if (this.resolved.has(cacheKey)) {
            this.stats.hits++;
            return this.resolved.get(cacheKey);
        }

        let resolvedValue: any = null;

        // Stratégie 1: Valeur directe (pas un placeholder)
        if (!this._isPlaceholder(value)) {
            resolvedValue = value;
            this._cache(cacheKey, resolvedValue);
            return resolvedValue;
        }

        // Stratégie 2: Format ${VAR_NAME}
        if (value.startsWith('${') && value.endsWith('}')) {
            const envKey = value.slice(2, -1); // Enlever ${ et }
            resolvedValue = process.env[envKey];
            if (resolvedValue && !this._isDisabledKey(resolvedValue)) {
                this._cache(cacheKey, resolvedValue);
                return resolvedValue;
            }
        }

        // Stratégie 3: Si varName fourni explicitement, l'essayer
        if (varName) {
            if (process.env[varName] && !this._isDisabledKey(process.env[varName])) {
                resolvedValue = process.env[varName];
                this._cache(cacheKey, resolvedValue);
                return resolvedValue;
            }
            if (process.env[`${varName}_1`] && !this._isDisabledKey(process.env[`${varName}_1`])) {
                resolvedValue = process.env[`${varName}_1`];
                this._cache(cacheKey, resolvedValue);
                return resolvedValue;
            }
        }

        // Échec de résolution
        this.stats.misses++;

        this._cache(cacheKey, null);
        return null;
    }

    /**
     * Résout une clé provider strictement depuis PROVIDER_KEY / PROVIDER_KEY_N.
     * N'utilise pas credentials.json ni les anciens alias legacy.
     */
    resolveProviderKey(providerName: any, keyIndex: any = null) {
        const prefix = `${String(providerName).toUpperCase()}_KEY`;
        const candidates = keyIndex === null || keyIndex === undefined
            ? [prefix, ...Array.from({ length: 7 }, (_, index) => `${prefix}_${index + 1}`)]
            : Number(keyIndex) === 1
                ? [`${prefix}_1`, prefix]
                : [`${prefix}_${Number(keyIndex)}`];

        for (const envName of candidates) {
            const value = process.env[envName];
            if (value && !this._isDisabledKey(value)) {
                return value;
            }
        }

        return null;
    }

    /**
     * Retourne les indices des clés disponibles pour un fournisseur donné (ex: [1, 2] pour GEMINI_KEY_1, GEMINI_KEY_2)
     * Supporte de 1 à 7 clés. Retourne [1] si seule la clé sans suffixe (ex: GEMINI_KEY) existe.
     * @param {string} providerName - Nom du provider (ex: 'GEMINI')
     * @returns {number[]} - Liste des indices
     */
    getAvailableKeysForProvider(providerName: any) {
        const prefix = `${providerName.toUpperCase()}_KEY`;
        const indices = [];

        for (let i = 1; i <= 7; i++) {
            if (process.env[`${prefix}_${i}`] && !this._isDisabledKey(process.env[`${prefix}_${i}`])) {
                indices.push(i);
            }
        }

        if (indices.length === 0 && process.env[prefix] && !this._isDisabledKey(process.env[prefix])) {
            indices.push(1); // Default to key 1 if no suffix
        }

        return indices;
    }

    _isDisabledKey(value: any) {
        return typeof value === 'string' && value.trim().toLowerCase() === 'no_key';
    }

    /**
     * Vérifie si une valeur est un placeholder
     * @private
     */
    _isPlaceholder(value: any) {
        return value.startsWith('${') || 
               value.startsWith('YOUR_') ||
               value === 'undefined' ||
               value === 'null';
    }

    /**
     * Cache une résolution
     * @private
     */
    _cache(key: any, value: any) {
        this.resolved.set(key, value);
    }

    /**
     * Efface le cache (utile pour tests ou rechargement config)
     */
    clearCache() {
        this.resolved.clear();
        console.log('[EnvResolver] Cache vidé');
    }

    /**
     * Retourne les statistiques d'utilisation
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.resolved.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    /**
     * Affiche un rapport de diagnostic
     */
    diagnose() {
        const stats = this.getStats();
        console.log('\n[EnvResolver] 📊 Diagnostic:');
        console.log(`  Cache: ${stats.cacheSize} entrées`);
        console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
        console.log(`  Hits: ${stats.hits}, Misses: ${stats.misses}`);
        
        if (stats.warnings.length > 0) {
            console.log(`\n  ⚠️ Warnings (${stats.warnings.length}):`);
            stats.warnings.slice(0, 5).forEach((w: any) => console.log(`    - ${w}`));
            if (stats.warnings.length > 5) {
                console.log(`    ... et ${stats.warnings.length - 5} autres`);
            }
        }
    }
}

// Export singleton
export const envResolver = new EnvResolver();
export default envResolver;
