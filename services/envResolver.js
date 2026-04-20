// services/envResolver.js
// ============================================================================
// Module Unifié de Résolution des Variables d'Environnement
// ============================================================================
// Centralise TOUTE la logique de résolution .env pour éviter la fragmentation

/**
 * Service singleton pour résoudre les variables d'environnement
 * Supporte les formats :
 * - VOTRE_CLE_GEMINI → cherche process.env.VOTRE_CLE_GEMINI puis process.env.GEMINI_KEY
 * - ${GEMINI_KEY} → cherche process.env.GEMINI_KEY
 * - valeur directe → retourne telle quelle
 */
export class EnvResolver {
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
    resolve(value, varName = null) {
        if (!value) return null;
        if (typeof value !== 'string') return value;

        // Check cache
        const cacheKey = `${value}::${varName || ''}`;
        if (this.resolved.has(cacheKey)) {
            this.stats.hits++;
            return this.resolved.get(cacheKey);
        }

        let resolvedValue = null;

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
            if (resolvedValue) {
                this._cache(cacheKey, resolvedValue);
                return resolvedValue;
            }
        }

        // Stratégie 3: Format VOTRE_XXX
        if (value.startsWith('VOTRE_')) {
            // 3a. Chercher tel quel (process.env.VOTRE_CLE_GEMINI)
            if (process.env[value]) {
                resolvedValue = process.env[value];
                this._cache(cacheKey, resolvedValue);
                return resolvedValue;
            }

            // 3b. Inférer le nom de variable (VOTRE_CLE_GEMINI → GEMINI_KEY)
            const inferredName = this._inferVarName(value);
            if (inferredName && process.env[inferredName]) {
                resolvedValue = process.env[inferredName];
                this._cache(cacheKey, resolvedValue);
                return resolvedValue;
            }
        }

        // Stratégie 4: Si varName fourni explicitement, l'essayer
        if (varName && process.env[varName]) {
            resolvedValue = process.env[varName];
            this._cache(cacheKey, resolvedValue);
            return resolvedValue;
        }

        // Échec de résolution
        this.stats.misses++;
        this.stats.warnings.push(`Variable non résolue: ${value} (varName: ${varName || 'N/A'})`);
        console.warn(`[EnvResolver] ⚠️ Variable non résolue: ${value}`);
        
        this._cache(cacheKey, null);
        return null;
    }

    /**
     * Vérifie si une valeur est un placeholder
     * @private
     */
    _isPlaceholder(value) {
        return value.startsWith('VOTRE_') || 
               value.startsWith('${') || 
               value.startsWith('YOUR_') ||
               value === 'undefined' ||
               value === 'null';
    }

    /**
     * Infère le nom de variable depuis un placeholder
     * Ex: VOTRE_CLE_GEMINI → GEMINI_KEY
     * Ex: VOTRE_CLE_OPENAI → OPENAI_KEY
     * @private
     */
    _inferVarName(placeholder) {
        if (!placeholder.startsWith('VOTRE_')) return null;

        // Mapping commun
        const commonMappings = {
            'VOTRE_CLE_GEMINI': 'GEMINI_KEY',
            'VOTRE_CLE_OPENAI': 'OPENAI_KEY',
            'VOTRE_CLE_ANTHROPIC': 'ANTHROPIC_KEY',
            'VOTRE_CLE_GROQ': 'GROQ_KEY',
            'VOTRE_CLE_MISTRAL': 'MISTRAL_KEY',
            'VOTRE_CLE_MINIMAX': 'MINIMAX_KEY',
            'VOTRE_CLE_KIMI': 'KIMI_KEY',
            'VOTRE_CLE_NVIDIA': 'NVIDIA_API_KEY',
            'VOTRE_CLE_HF': 'HF_API_KEY',
            'VOTRE_SUPABASE_URL': 'SUPABASE_URL',
            'VOTRE_SUPABASE_KEY': 'SUPABASE_KEY',
            'VOTRE_REDIS_URL': 'REDIS_URL'
        };

        if (commonMappings[placeholder]) {
            return commonMappings[placeholder];
        }

        // Fallback: VOTRE_CLE_XXX → XXX_KEY
        const match = placeholder.match(/^VOTRE_(?:CLE_)?(.+)$/);
        if (match) {
            const baseName = match[1];
            return `${baseName}_KEY`;
        }

        return null;
    }

    /**
     * Cache une résolution
     * @private
     */
    _cache(key, value) {
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
            stats.warnings.slice(0, 5).forEach(w => console.log(`    - ${w}`));
            if (stats.warnings.length > 5) {
                console.log(`    ... et ${stats.warnings.length - 5} autres`);
            }
        }
    }
}

// Export singleton
export const envResolver = new EnvResolver();
export default envResolver;
