// config/index.js
// ============================================================================
// Configuration Centralisée
// ============================================================================
// Point d'entrée unique pour toute la configuration de l'application

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { envResolver } from '../services/envResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les variables d'environnement
dotenv.config({ path: join(__dirname, '..', '.env') });

// ============================================================================
// Loaders
// ============================================================================

/**
 * Charge un fichier JSON de configuration
 * @param {string} filename - Nom du fichier (relatif à /config)
 * @returns {Object} Configuration parsée
 */
function loadJsonConfig(filename) {
    const filePath = join(__dirname, filename);
    if (!existsSync(filePath)) {
        console.warn(`[Config] Fichier non trouvé: ${filename}`);
        return {};
    }
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`[Config] Erreur parsing ${filename}:`, e.message);
        return {};
    }
}

/**
 * Résout une valeur (env var ou valeur directe)
 * @param {string} value - Valeur à résoudre
 * @returns {string|undefined}
 */
function resolveEnvValue(value) {
    return envResolver.resolve(value);
}

// ============================================================================
// Configuration Objects
// ============================================================================

/** @type {Object} Configuration de base */
const baseConfig = loadJsonConfig('config.json');

/** @type {Object} Credentials (clés API) */
const credentials = loadJsonConfig('credentials.json');

/** @type {Object} Configuration des modèles IA */
const modelsConfig = loadJsonConfig('models_config.json');

/** @type {Object} Configuration du scheduler */
const schedulerConfig = loadJsonConfig('scheduler.json');

// ============================================================================
// Resolved Configuration
// ============================================================================

/**
 * Configuration complète et résolue
 * @namespace config
 */
export const config = {
    // === Environnement ===
    env: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG === 'true',
    timezone: process.env.TZ || 'Europe/Paris',

    // === Base de Données ===
    supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_KEY
    },

    redis: {
        url: process.env.REDIS_URL
    },

    // === Clés API (résolues) ===
    apiKeys: {
        gemini: process.env.GEMINI_KEY || resolveEnvValue(credentials.familles_ia?.gemini),
        openai: process.env.OPENAI_KEY || resolveEnvValue(credentials.familles_ia?.openai),
        anthropic: process.env.ANTHROPIC_KEY || resolveEnvValue(credentials.familles_ia?.anthropic),
        groq: process.env.GROQ_KEY || resolveEnvValue(credentials.familles_ia?.groq),
        mistral: process.env.MISTRAL_KEY || resolveEnvValue(credentials.familles_ia?.mistral),
        minimax: process.env.MINIMAX_KEY || resolveEnvValue(credentials.familles_ia?.minimax),
        nvidia: process.env.VOTRE_CLE_NVIDIA || resolveEnvValue(credentials.familles_ia?.nvidia)
    },

    // === Modèles IA ===
    models: modelsConfig,
    priorityFamilies: modelsConfig.reglages_generaux?.familles_prioritaires || ['gemini'],
    embeddings: modelsConfig.reglages_generaux?.embeddings || {
        primary: { provider: 'gemini', model: 'gemini-embedding-001', dimensions: 1024 }
    },

    // === Voice ===
    voice: modelsConfig.voice_provider || {},

    // === Scheduler ===
    scheduler: schedulerConfig,

    // === Application ===
    app: {
        ...baseConfig,
        name: baseConfig.name || 'HIVE-MIND',
        version: '3.0.0'
    },

    // === Helpers ===
    /**
     * Vérifie si une clé API est configurée
     * @param {string} provider - Nom du provider
     * @returns {boolean}
     */
    hasApiKey(provider) {
        return !!this.apiKeys[provider];
    },

    /**
     * Obtient la famille de modèles prioritaire avec une clé valide
     * @returns {string|null}
     */
    getFirstAvailableFamily() {
        for (const family of this.priorityFamilies) {
            if (this.hasApiKey(family)) return family;
        }
        return null;
    }
};

export default config;
