/**
 * services/envResolver.ts
 * Module Unifié de Résolution des Variables d'Environnement
 * Centralise TOUTE la logique de résolution .env pour éviter la fragmentation
 */

export interface EnvStats {
  hits: number;
  misses: number;
  warnings: string[];
  cacheSize: number;
  hitRate: number;
}

/**
 * Service pour résoudre les variables d'environnement avec plusieurs stratégies
 * Supporte les formats :
 * - VOTRE_CLE_GEMINI → cherche process.env.VOTRE_CLE_GEMINI puis process.env.GEMINI_KEY
 * - ${GEMINI_KEY} → cherche process.env.GEMINI_KEY
 */
export class EnvResolver {
  private _resolved = new Map<string, string | null>();
  private _stats = {
    hits: 0,
    misses: 0,
    warnings: [] as string[]
  };

  /**
   * Résout une valeur depuis .env avec plusieurs stratégies
   * @param value Valeur brute (peut être placeholder, variable, ou valeur directe)
   * @param varName Nom de variable suggéré
   */
  public resolve(value: any, varName: string | null = null): string | null {
    if (!value) return null;
    if (typeof value !== 'string') return value.toString();

    const cacheKey = `${value}::${varName || ''}`;
    if (this._resolved.has(cacheKey)) {
      this._stats.hits++;
      return this._resolved.get(cacheKey)!;
    }

    let resolvedValue: string | undefined | null = null;

    // Stratégie 1: Valeur directe (pas un placeholder)
    if (!this._isPlaceholder(value)) {
      resolvedValue = value;
      this._cache(cacheKey, resolvedValue);
      return resolvedValue;
    }

    // Stratégie 2: Format ${VAR_NAME}
    if (value.startsWith('${') && value.endsWith('}')) {
      const envKey = value.slice(2, -1);
      resolvedValue = process.env[envKey];
      if (resolvedValue) {
        this._cache(cacheKey, resolvedValue);
        return resolvedValue;
      }
    }

    // Stratégie 3: Format VOTRE_XXX
    if (value.startsWith('VOTRE_') || value.startsWith('YOUR_')) {
      if (process.env[value]) {
        resolvedValue = process.env[value];
        this._cache(cacheKey, resolvedValue);
        return resolvedValue;
      }

      const inferredName = this._inferVarName(value);
      if (inferredName && process.env[inferredName]) {
        resolvedValue = process.env[inferredName];
        this._cache(cacheKey, resolvedValue);
        return resolvedValue;
      }
    }

    // Stratégie 4: Si varName fourni explicitement
    if (varName && process.env[varName]) {
      resolvedValue = process.env[varName];
      this._cache(cacheKey, resolvedValue);
      return resolvedValue;
    }

    // Échec de résolution
    this._stats.misses++;
    this._stats.warnings.push(`Variable non résolue: ${value} (varName: ${varName || 'N/A'})`);
    console.warn(`[EnvResolver] ⚠️ Variable non résolue: ${value}`);
    
    this._cache(cacheKey, null);
    return null;
  }

  private _isPlaceholder(value: string): boolean {
    return value.startsWith('VOTRE_') || 
           value.startsWith('${') || 
           value.startsWith('YOUR_') ||
           value === 'undefined' ||
           value === 'null';
  }

  private _inferVarName(placeholder: string): string | null {
    if (!placeholder.startsWith('VOTRE_') && !placeholder.startsWith('YOUR_')) return null;

    const commonMappings: Record<string, string> = {
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

    const match = placeholder.match(/^(?:VOTRE|YOUR)_(?:CLE_)?(.+)$/);
    if (match) {
      return `${match[1]}_KEY`;
    }

    return null;
  }

  private _cache(key: string, value: string | null): void {
    this._resolved.set(key, value);
  }

  public clearCache(): void {
    this._resolved.clear();
    console.log('[EnvResolver] Cache vidé');
  }

  public getStats(): EnvStats {
    const total = this._stats.hits + this._stats.misses;
    return {
      ...this._stats,
      cacheSize: this._resolved.size,
      hitRate: total > 0 ? this._stats.hits / total : 0
    };
  }

  public diagnose(): void {
    const stats = this.getStats();
    console.log('\n[EnvResolver] 📊 Diagnostic:');
    console.log(`  Cache: ${stats.cacheSize} entrées`);
    console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`  Hits: ${stats.hits}, Misses: ${stats.misses}`);
    
    if (stats.warnings.length > 0) {
      console.log(`\n  ⚠️ Warnings (${stats.warnings.length}):`);
      stats.warnings.slice(0, 5).forEach(w => console.log(`    - ${w}`));
    }
  }
}

export const envResolver = new EnvResolver();
export default envResolver;
