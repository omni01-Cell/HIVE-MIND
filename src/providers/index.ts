// providers/index.js
// providers/index.js
// Model Provider Layer - Routeur multi-familles

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
// LLM classifier permanently disabled — category is now always
// provided by the caller (e.g. category: 'AGENTIC') or defaults to AGENTIC.
import { envResolver } from '../services/envResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let activeRuntime: unknown = null;
async function getRuntime() {
    if (activeRuntime) return activeRuntime;
    try {
        const { container } = await import('../core/ServiceContainer.js');
        if (container.has('runtime')) {
            activeRuntime = container.get('runtime');
            return activeRuntime;
        }
    } catch {
        /* ignore */
    }
    const { AIRuntimeInfrastructure } = await import('../services/runtime/RuntimeInfrastructure.js');
    activeRuntime = new AIRuntimeInfrastructure();
    return activeRuntime;
}

interface ModelsConfigJson {
    reglages_generaux: {
        famille_active?: string;
        familles_prioritaires?: string[];
        service_recipes?: Record<string, { model: string; fallback?: string; fallback_2?: string; temperature?: number }>;
        chat_recipes?: {
            categories?: Record<string, { primary: string; fallback?: string; description?: string }>;
        };
        embeddings?: {
            primary?: { provider: string; model: string; dimensions?: number };
            fallback?: { provider: string; model: string };
        };
    };
    familles: Record<string, {
        nom_affiche?: string;
        service_enabled?: boolean;
        modeles?: { id: string; types?: string[] }[];
    }>;
}

export interface ChatResponse {
    content: string | null;
    thought?: string | null;
    toolCalls?: {
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
        thought_signature?: string;
    }[] | null;
    finishReason?: string;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    usedFamily?: string;
    usedModel?: string;
    [key: string]: unknown;
}

export interface ChatOptions {
    family?: string;
    model?: string;
    fallbackFamily?: string;
    fallbackModel?: string;
    isServiceRecipe?: boolean;
    category?: string;
    temperature?: number;
    max_tokens?: number;
    isFallback?: boolean;
    [key: string]: unknown;
}

// Charger les configurations
let modelsConfig: ModelsConfigJson;
try {
    modelsConfig = JSON.parse(
        readFileSync(join(__dirname, '..', 'config', 'models_config.json'), 'utf-8')
    ) as ModelsConfigJson;
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Erreur chargement config providers:', errorMessage);
    modelsConfig = { reglages_generaux: { famille_active: 'openai' }, familles: {} };
}

/**
 * Interface unifiée pour tous les providers
 */
class ProviderRouter {
    adapters: Map<string, { chat: (messages: unknown[], options: Record<string, unknown>) => Promise<unknown>; embed?: (text: string | string[], options: Record<string, unknown>) => Promise<unknown> }>;
    currentFamily: string;
    usageStats: Map<string, number>;
    forcedFamily?: string;
    forcedModel?: string;
    circuitStats: Map<string, { failureCount: number, cooldownUntil: number }>;
    /** Failure score par modèle (non-quota) : plus haut = relégué en fin de rotation */
    modelFailureScore: Map<string, { score: number, lastFailureAt: number }>;

    constructor() {
        this.adapters = new Map();
        this.currentFamily = modelsConfig.reglages_generaux?.famille_active || 'openai';
        this.usageStats = new Map(); // Tracking des appels par famille
        this.circuitStats = new Map(); // Circuit Breaker: { failureCount: 0, cooldownUntil: 0 }
        this.modelFailureScore = new Map(); // Reliability score par modèle
    }

    /**
     * Enregistre un adaptateur pour une famille
     */
    registerAdapter(familyName: string, adapter: { chat: (messages: unknown[], options: Record<string, unknown>) => Promise<unknown>; embed?: (text: string | string[], options: Record<string, unknown>) => Promise<unknown> }) {
        this.adapters.set(familyName, adapter);
    }

    /**
     * Parse un model string pour extraire family et model
     * Ex: "qwen/qwen3-32b" → { family: "groq", model: "qwen/qwen3-32b" }
     * Ex: "kimi-for-coding" → { family: "kimi", model: "kimi-for-coding" }
     */
    parseModelString(modelStr: string): { family: string, model: string } | null {
        const priorityFamilies = modelsConfig.reglages_generaux.familles_prioritaires || [];
        const allFamilies = Object.keys(modelsConfig.familles);
        const orderedFamilies = [...new Set([...priorityFamilies, ...allFamilies])];

        // Chercher dans toutes les familles par ordre de priorité
        for (const familyName of orderedFamilies) {
            const familyConfig = modelsConfig.familles[familyName];
            if (!familyConfig) continue;
            const model = familyConfig.modeles?.find((m) => m.id === modelStr);
            if (model) {
                return { family: familyName, model: modelStr };
            }
        }

        // Si pas trouvé, retourner null
        console.warn(`[Router] ⚠️ Modèle ${modelStr} non trouvé dans la config`);
        return null;
    }

    /**
     * Appel direct d'une recette de service (sans classification Level 3)
     * Utilise le modèle assigné + fallback automatique si nécessaire
     */
    async callServiceRecipe(serviceName: string, messages: unknown[], options: ChatOptions = {}) {
        const recipe = modelsConfig.reglages_generaux.service_recipes?.[serviceName];

        if (!recipe) {
            throw new Error(`[Router] Service recipe "${serviceName}" non trouvé dans models_config.json`);
        }

        console.log(`[Router] 🔧 Service Recipe: ${serviceName} → ${recipe.model}`);

        // Charger QuotaManager s'il est disponible
        let quotaManager: { isModelAvailable: (model: string) => Promise<boolean> } | null = null;
        try {
            const { container } = await import('../core/ServiceContainer.js');
            if (container.has('quotaManager')) {
                quotaManager = container.get('quotaManager') as { isModelAvailable: (model: string) => Promise<boolean> };
            }
        } catch { /* ignore */ }

        // Préparer la cascade: primary → fallback → fallback_2
        const modelsToTry = [recipe.model];
        if (recipe.fallback) {
            modelsToTry.push(recipe.fallback);
        }
        if (recipe.fallback_2) {
            modelsToTry.push(recipe.fallback_2);
        }

        const fallbackModels = new Set([recipe.fallback, recipe.fallback_2].filter(Boolean));

        let lastError: unknown = null;
        let triedAny = false;

        for (const modelStr of modelsToTry) {
            const parsed = this.parseModelString(modelStr);
            if (!parsed) {
                console.warn(`[Router] ⚠️ Modèle ${modelStr} invalide, skip`);
                continue;
            }

            // Vérifier si le modèle est indisponible ou a reçu un délai (cooldown de sa famille)
            const cooldownRemaining = this._isCooldownActive(parsed.family);
            if (cooldownRemaining) {
                console.log(`[Router] ❄️ Modèle ${modelStr} de service sauté direct : famille ${parsed.family} en cooldown (${cooldownRemaining}s)`);
                continue;
            }

            if (quotaManager) {
                const isAvailable = await quotaManager.isModelAvailable(parsed.model);
                if (!isAvailable) {
                    console.log(`[Router] ⏭️ Modèle ${modelStr} de service sauté direct : quota épuisé ou clé bloquée`);
                    continue;
                }
            }

            triedAny = true;
            try {
                // Appel avec température du service
                const result = await this.chat(messages, {
                    ...options,
                    family: parsed.family,
                    model: parsed.model,
                    temperature: recipe.temperature ?? options.temperature,
                    isServiceRecipe: true, // Flag pour éviter classification
                    isFallback: fallbackModels.has(modelStr)
                });

                if (fallbackModels.has(modelStr)) {
                    console.log(`[Router] ⚠️ ${serviceName} utilisé fallback: ${modelStr}`);
                }

                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.warn(`[Router] ❌ ${serviceName}/${modelStr} échec: ${errorMessage}`);
                lastError = error;
            }
        }

        if (!triedAny) {
            throw new Error(`[Router] 🛑 Service ${serviceName} échec total : tous les modèles de la cascade sont indisponibles ou en cooldown.`);
        }

        const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`[Router] 🛑 Service ${serviceName} échec total. Dernière erreur: ${lastErrorMessage}`);
    }

    /**
     * Retourne les modèles candidats pour une catégorie chat Level 3
     */
    getChatCandidates(category: string) {
        const categoryConfig = modelsConfig.reglages_generaux.chat_recipes?.categories?.[category];

        if (!categoryConfig) {
            console.warn(`[Router] ⚠️ Catégorie chat "${category}" introuvable`);
            return null;
        }

        return {
            primary: categoryConfig.primary,
            fallback: categoryConfig.fallback,
            description: categoryConfig.description
        };
    }

    /**
     * Change la famille active
     */
    setFamily(familyName: string) {
        if (!modelsConfig.familles[familyName]) {
            throw new Error(`Famille inconnue: ${familyName}`);
        }
        this.currentFamily = familyName;
        console.log(`🧠 Famille IA changée: ${familyName}`);
    }

    /**
     * Récupère la configuration d'une famille
     */
    getFamilyConfig(familyName: string = this.currentFamily) {
        return modelsConfig.familles[familyName];
    }

    /**
     * Récupère la clé API d'une famille
     */
    getApiKey(familyName: string = this.currentFamily, keyIndex: number | null = null): string | null {
        return envResolver.resolveProviderKey(familyName, keyIndex);
    }

    /**
     * Trouve un modèle supportant un type donné
     */
    findModelForType(type: string, familyName: string = this.currentFamily) {
        const family = this.getFamilyConfig(familyName);
        if (!family?.modeles) return null;

        const model = family.modeles.find((m) => m.types?.includes(type));
        return model?.id || family.modeles[0]?.id;
    }

    /**
     * Vérifie si une famille est en cooldown (Circuit Breaker)
     */
    _isCooldownActive(family: string): number | false {
        const stats = this.circuitStats.get(family);
        if (!stats) return false;

        if (Date.now() < stats.cooldownUntil) {
            const remaining = Math.ceil((stats.cooldownUntil - Date.now()) / 1000);
            return remaining;
        }
        return false;
    }

    /**
     * Enregistre un échec pour le Circuit Breaker
     */
    _recordFailure(family: string, error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Détection des erreurs de Quota / Rate Limit
        const isQuotaError = errorMessage.toLowerCase().match(/(quota|limit|rate|429|insufficient)/);

        if (isQuotaError) {
            const stats = this.circuitStats.get(family) || { failureCount: 0, cooldownUntil: 0 };
            const newStats = {
                failureCount: stats.failureCount + 1,
                cooldownUntil: stats.cooldownUntil
            };

            // Cooldown progressif : 1min, 5min, 15min
            let cooldownMinutes = 1;
            if (newStats.failureCount === 2) cooldownMinutes = 5;
            if (newStats.failureCount >= 3) cooldownMinutes = 15;

            newStats.cooldownUntil = Date.now() + (cooldownMinutes * 60 * 1000);
            this.circuitStats.set(family, newStats);

            console.warn(`[CircuitBreaker] ❄️ ${family} mis en cooldown pour ${cooldownMinutes}m (Erreur Quota/Limit)`);
        }
    }

    /**
     * Réinitialise le Circuit Breaker en cas de succès
     */
    _resetCircuit(family: string) {
        if (this.circuitStats.has(family)) {
            this.circuitStats.delete(family);
        }
    }

    // =========================================================================
    // RELIABILITY SCORING — Modèles défaillants relegués en fin de rotation
    // =========================================================================

    /**
     * Incrémente le failure score d'un modèle non-quota.
     * Score max: 10. Décroît de 50% toutes les 30 minutes (half-life).
     */
    _recordModelFailure(model: string) {
        const now = Date.now();
        const HALF_LIFE_MS = 30 * 60 * 1000; // 30 min
        const existing = this.modelFailureScore.get(model) || { score: 0, lastFailureAt: now };

        // Appliquer le déclin exponentiel depuis le dernier échec
        const elapsed = now - existing.lastFailureAt;
        const decayFactor = Math.pow(0.5, elapsed / HALF_LIFE_MS);
        const decayedScore = existing.score * decayFactor;

        const newScore = Math.min(10, decayedScore + 1);
        this.modelFailureScore.set(model, { score: newScore, lastFailureAt: now });
        console.log(`[Router] 📉 Reliability score ${model}: ${newScore.toFixed(2)} (+1 échec)`);
    }

    /**
     * Trie un tableau de modèles par fiabilité : les moins défaillants en premier.
     * Les modèles sans historique d'échec restent à leur position.
     */
    _sortModelsByReliability(models: string[]): string[] {
        const now = Date.now();
        const HALF_LIFE_MS = 30 * 60 * 1000;

        return [...models].sort((a, b) => {
            const statsA = this.modelFailureScore.get(a);
            const statsB = this.modelFailureScore.get(b);

            // Calculer le score actuel (avec déclin temporel)
            const scoreA = statsA
                ? statsA.score * Math.pow(0.5, (now - statsA.lastFailureAt) / HALF_LIFE_MS)
                : 0;
            const scoreB = statsB
                ? statsB.score * Math.pow(0.5, (now - statsB.lastFailureAt) / HALF_LIFE_MS)
                : 0;

            return scoreA - scoreB; // Moins d'échecs en premier
        });
    }

    /**
     * Appel chat unifié avec Fallback automatique
     */
    /**
     * Smart Router Chat Logic
     * Level 1: Context (Sticky Session)
     * Level 2: Availability (QuotaManager — Zero-429)
     * Level 3: Category Resolution (caller-provided or default AGENTIC — NO LLM call)
     */
    async chat(messages: unknown[], rawOptions: ChatOptions = {}): Promise<ChatResponse> {
        console.log(`[Router Debug] chat called. messages type: ${typeof messages}, isArray: ${Array.isArray(messages)}`);
        const options = { ...rawOptions };
        if (this.forcedFamily) {
            options.family = this.forcedFamily;
        }
        if (this.forcedModel) {
            options.model = this.forcedModel;
        }
        // 1. Initialisation
        const { container } = await import('../core/ServiceContainer.js');
        let quotaManager: {
            getHealthyFamilies: (config: unknown, thresholds: { rpm: number; tpm: number; rpd: number }) => Promise<string[]>;
            getAvailableKeyForModel: (model: string, family: string, thresholds: { rpm: number; tpm: number; rpd: number }) => Promise<number | null>;
            recordQuotaExceeded: (model: string, waitTime: number, keyIndex: number) => Promise<void>;
            recordUsage: (family: string, model: string, estimatedTokens: number, keyIndex: number) => Promise<void>;
        } | null = null;
        try {
            if (container.has('quotaManager')) {
                quotaManager = container.get('quotaManager') as {
                    getHealthyFamilies: (config: unknown, thresholds: { rpm: number; tpm: number; rpd: number }) => Promise<string[]>;
                    getAvailableKeyForModel: (model: string, family: string, thresholds: { rpm: number; tpm: number; rpd: number }) => Promise<number | null>;
                    recordQuotaExceeded: (model: string, waitTime: number, keyIndex: number) => Promise<void>;
                    recordUsage: (family: string, model: string, estimatedTokens: number, keyIndex: number) => Promise<void>;
                };
            }
        } catch { console.warn('[Router] QuotaManager non dispo via container'); }

        // =========================================================
        // NIVEAU 1: CONTEXTE (STICKY SESSION)
        // =========================================================
        let preferredFamilies = modelsConfig.reglages_generaux.familles_prioritaires || [];

        if (options.family) {
            preferredFamilies = [options.family];
            console.log(`[Router] 🔒 Famille forcée par contexte: ${options.family}`);
        }

        // =========================================================
        // NIVEAU 2: DISPONIBILITÉ PROACTIVE (ZERO-429)
        // =========================================================
        let availableFamilies = preferredFamilies.filter((f: string) => this.isAvailable(f));
        if (options.isServiceRecipe) {
            availableFamilies = availableFamilies.filter((f: string) => modelsConfig.familles[f]?.service_enabled !== false);
        }

        if (quotaManager) {
            try {
                const healthyFamilies = await quotaManager.getHealthyFamilies(
                    modelsConfig.familles,
                    { rpm: 0.20, tpm: 0.10, rpd: 0.05 }
                );
                availableFamilies = availableFamilies.filter((f: string) => healthyFamilies.includes(f));
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                console.warn('[Router] Erreur health check, fallback sur filtre basique:', errorMessage);
            }
        }

        if (availableFamilies.length === 0) {
            console.warn('[Router] ⚠️ TOUS les modèles prioritaires sont épuisés ou proches des limites ! Passage en mode SECOURS.');
            const allFamilies = Object.keys(modelsConfig.familles);
            availableFamilies = allFamilies.filter((f: string) => this.isAvailable(f));
            if (options.isServiceRecipe) {
                availableFamilies = availableFamilies.filter((f: string) => modelsConfig.familles[f]?.service_enabled !== false);
            }

            if (quotaManager && availableFamilies.length > 0) {
                try {
                    const emergencyHealthy = await quotaManager.getHealthyFamilies(
                        modelsConfig.familles,
                        { rpm: 0.05, tpm: 0.05, rpd: 0.02 }
                    );
                    if (emergencyHealthy.length > 0) {
                        availableFamilies = availableFamilies.filter((f: string) => emergencyHealthy.includes(f));
                    }
                } catch { /* Ignore en urgence */ }
            }
        }

        if (availableFamilies.length === 0) {
            throw new Error('[Router] 🛑 Aucune famille IA disponible (Toutes épuisées ou sans clé API). Vérifiez credentials.json ou attendez le reset des quotas.');
        }

        // =========================================================
        // NIVEAU 3: RÉSOLUTION CATÉGORIE (pas d'appel LLM)
        // =========================================================
        // La catégorie est TOUJOURS fournie par l'appelant (ex: core/index.ts
        // passe category: 'AGENTIC'). Si aucune catégorie n'est fournie,
        // on utilise AGENTIC par défaut. Plus de classification LLM.
        if (!options.family && !options.model && !options.isServiceRecipe) {
            const category = options.category || 'AGENTIC';
            console.log(`[Router] 🎯 Catégorie: ${category}${options.category ? '' : ' (défaut)'}`);

            const candidates = this.getChatCandidates(category);

            if (candidates && candidates.primary) {
                console.log(`[Router] 📋 Modèles: ${candidates.primary} (fallback: ${candidates.fallback})`);

                const primaryParsed = this.parseModelString(candidates.primary);
                const fallbackParsed = candidates.fallback ? this.parseModelString(candidates.fallback) : null;

                if (primaryParsed) {
                    options.family = primaryParsed.family;
                    options.model = primaryParsed.model;

                    if (fallbackParsed) {
                        options.fallbackFamily = fallbackParsed.family;
                        options.fallbackModel = fallbackParsed.model;
                    }

                    if (availableFamilies.includes(primaryParsed.family)) {
                        availableFamilies = [primaryParsed.family, ...availableFamilies.filter((f: string) => f !== primaryParsed.family)];
                    }

                    if (fallbackParsed && fallbackParsed.family !== primaryParsed.family) {
                        if (availableFamilies.includes(fallbackParsed.family)) {
                            availableFamilies = [
                                primaryParsed.family,
                                fallbackParsed.family,
                                ...availableFamilies.filter((f: string) => f !== primaryParsed.family && f !== fallbackParsed.family)
                            ];
                        }
                    }
                }
            }
        }

        // =========================================================
        // EXÉCUTION (CASCADE)
        // =========================================================

        let lastError: unknown = null;

        for (const family of availableFamilies) {
            // 🛑 Circuit Breaker Check (Interne Router)
            const cooldownRemaining = this._isCooldownActive(family);
            if (cooldownRemaining) {
                console.log(`[Router] ❄️ Skipping ${family} (Cooldown: ${cooldownRemaining}s)`);
                continue;
            }

            const adapter = this.adapters.get(family);
            if (!adapter) {
                console.warn(`[Router] ⚠️ Adaptateur manquant pour ${family}, passage à la famille suivante...`);
                continue;
            }
            const familyConfig = this.getFamilyConfig(family);

            // Modèles à tester pour cette famille
            let modelsToTry: string[] = [];

            if (options.model && family === options.family) {
                // Si on a un modèle spécifique forcé ET que c'est la bonne famille
                modelsToTry.push(options.model);
            }
            if (options.fallbackModel && family === options.fallbackFamily) {
                // S'il y a un fallback dans la même famille
                if (!modelsToTry.includes(options.fallbackModel)) {
                    modelsToTry.push(options.fallbackModel);
                }
            }

            if (modelsToTry.length === 0) {
                // Sinon (fallback ou famille différente), on cherche les modèles 'chat' de cette famille
                // Smart Router V2: On exclut les modèles purement audio/live pour préserver les quotas texte
                const excludedTypes = ['live_api', 'tts', 'stt', 'audio', 'transcription'];

                const rawModels = familyConfig?.modeles
                    ?.filter((m) => {
                        if (!m.types?.includes('chat')) return false;
                        // Ne pas bloquer si isServiceRecipe est true (services internes peuvent bypasser le filtre)
                        if (options.isServiceRecipe) return true;

                        const hasExcluded = m.types.some((t: string) => excludedTypes.includes(t));
                        return !hasExcluded;
                    })
                    .map((m) => m.id) || [];
                // [RELIABILITY] Trier par fiabilité — modèles défaillants relégués en dernier
                modelsToTry = this._sortModelsByReliability(rawModels);
            }

            // Essayer chaque modèle de la famille
            for (const model of modelsToTry) {
                const availableIndices = envResolver.getAvailableKeysForProvider(family);
                const maxKeyAttempts = availableIndices && availableIndices.length > 0 ? availableIndices.length : 1;
                let attempt = 0;
                let modelFailedNonQuota = false;

                while (attempt < maxKeyAttempts) {
                    attempt++;
                    let keyIndex = 1;

                    try {
                        // [ZERO-429] Smart Router V2 : Recherche proactive de clé avec multi-rotation
                        if (quotaManager) {
                            const bestKeyIndex = await quotaManager.getAvailableKeyForModel(model, family, { rpm: 0.20, tpm: 0.10, rpd: 0.05 });

                            if (bestKeyIndex === null) {
                                console.log(`[Router] ⏭️ ${model} skipped: Toutes les clés sont épuisées (429 Proactif)`);
                                break; // Plus aucune clé valide pour ce modèle, on passe au modèle suivant
                            }
                            keyIndex = bestKeyIndex;
                        }

                        // ── KKT Lagrangian Throttling ──
                        const runtimeInstance = (await getRuntime()) as { finOps: { calculateLambda: () => number; recordUsage: (model: string, promptTokens: number, completionTokens: number) => { budgetSafe: boolean } } };
                        const lambda = runtimeInstance.finOps.calculateLambda();
                        const activeOptions = { ...options };
                        if (lambda > 0.05) {
                            const baseMaxTokens = (options.max_tokens as number) || 4096;
                            const throttledMaxTokens = Math.max(200, Math.floor(baseMaxTokens * (1 - lambda)));
                            activeOptions.max_tokens = throttledMaxTokens;
                            console.log(`[Router:KKT] ⚠️ Budget Slack depletion detected (λ = ${lambda.toFixed(2)}). Throttling max_tokens: ${baseMaxTokens} → ${throttledMaxTokens}`);
                        }

                        console.log(`[Router] 🚀 Tentative: ${family} → ${model} (Clé ${keyIndex})`);
                        const result = (await adapter.chat(messages, {
                            ...activeOptions,
                            model,
                            apiKey: this.getApiKey(family, keyIndex) || '',
                            keyIndex, // Passer l'index pour que l'adapter puisse incrémenter le bon compteur
                            familyConfig
                        })) as ChatResponse;

                        // ✅ SUCCÈS
                        this._resetCircuit(family);

                        // 💰 [FINOPS] Enregistrer le coût via AIRuntimeInfrastructure (Kill Switch)
                        const promptTokens = result.usage?.prompt_tokens || 0;
                        const completionTokens = result.usage?.completion_tokens || 0;
                        const usageRecord = runtimeInstance.finOps.recordUsage(model, promptTokens, completionTokens);

                        if (!usageRecord.budgetSafe) {
                            throw new Error('BUDGET_EXCEEDED: Le budget maximum de la session a été atteint. Arrêt de sécurité.');
                        }

                        // 📊 Enregistrer Usage (QuotaManager) — tokens estimés si usage absent
                        const estimatedTokens = promptTokens + completionTokens ||
                            Math.ceil(((messages.map((m) => {
                                const msg = m as { content?: string };
                                return msg.content || '';
                            }).join(' ').length) + (result.content || '').length) / 4);

                        if (quotaManager) {
                            await quotaManager.recordUsage(family, model, estimatedTokens, keyIndex);
                        }

                        return {
                            ...result,
                            usedFamily: family,
                            usedModel: model
                        };

                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.warn(`[Router] ⚠️ Échec ${family}/${model} (Clé ${keyIndex || 1}): ${errorMessage.substring(0, 200)}...`); // Limit length
                        lastError = error;

                        const isQuotaError = errorMessage.toLowerCase().match(/(quota|limit|rate|429|insufficient)/);

                        if (isQuotaError && quotaManager) {
                            let waitTime = 60; // Défaut 1 minute

                            // Tentative d'extraction du temps d'attente précis
                            const matchWait = errorMessage.match(/retry in\s+([\d.]+)\s*s/i) ||
                                errorMessage.match(/after\s+([\d.]+)\s*s/i);

                            if (matchWait && matchWait[1]) {
                                waitTime = Math.ceil(parseFloat(matchWait[1]));
                            }

                            // On bloque spécifiquement CE modèle, pas toute la famille, et pour cette CLÉ
                            await quotaManager.recordQuotaExceeded(model, waitTime, keyIndex);
                            console.log(`[Router] 🛡️ Modèle ${model} (Clé ${keyIndex}) bloqué pour ${waitTime}s (Feedback Temps Réel)`);

                            // 🔄 INNER RETRY LOOP : Si on a d'autres clés pour CE modèle, on réessaie immédiatement !
                            if (attempt < maxKeyAttempts) {
                                console.log(`[Router] 🔄 Basculement transparent sur la clé suivante pour ${model}...`);
                                continue;
                            }
                        } else {
                            // Erreur non-quota: pénaliser la famille ET le modèle spécifique
                            this._recordFailure(family, error);
                            this._recordModelFailure(model);
                            modelFailedNonQuota = true;
                        }

                        break; // Sortir de la boucle while et passer au modèle suivant
                    }
                } // End while (attempt < maxKeyAttempts)

                if (modelFailedNonQuota && this._isCooldownActive(family)) break; // Famille morte, on sort du for modelsToTry

                // Si on était en mode "Famille Forcée" (contexte) mais que le modèle a échoué sur toutes les clés
                // On doit briser le cadenas et permettre d'essayer les autres familles
                if (availableFamilies.length === 1 && options.family) {
                    console.warn(`[Router] 🔓 Échec de la famille forcée (${family}). Activation du FALLBACK d'urgence.`);

                    // Pour sécuriser, on va relancer chat() sans la contrainte 'family'
                    if (!options.isFallback) {
                        console.log('[Router] 🔄 Redirection vers les autres providers...');
                        return this.chat(messages, { ...options, family: undefined, isFallback: true });
                    }
                }
            } // End for (const model of modelsToTry)
        }

        const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`[Router] Échec total de la cascade. Dernière erreur: ${lastErrorMessage}`);
    }

    /**
     * Génère un embedding
     */
    async embed(text: string | string[], _options: Record<string, unknown> = {}) {
        // 1. Déterminer le provider (Config > OpenAI fallback)
        const primaryConfig = modelsConfig.reglages_generaux?.embeddings?.primary;
        const providerName = primaryConfig?.provider || 'openai';
        const modelId = primaryConfig?.model || 'text-embedding-3-small';

        const adapter = this.adapters.get(providerName);
        const apiKey = this.getApiKey(providerName);

        if (!adapter || !apiKey) {
            throw new Error(`Provider embedding '${providerName}' non disponible ou sans clé.`);
        }

        // 2. Vérifier les quotas (si QuotaManager disponible)
        // NOTE: ProviderRouter est un singleton, on peut essayer de récupérer le container
        let quotaManager: { isModelAvailable: (model: string) => Promise<boolean>; recordUsage: (family: string, model: string, estimatedTokens: number) => Promise<void> } | null = null;
        try {
            const { container } = await import('../core/ServiceContainer.js');
            if (container.has('quotaManager')) {
                quotaManager = container.get('quotaManager') as { isModelAvailable: (model: string) => Promise<boolean>; recordUsage: (family: string, model: string, estimatedTokens: number) => Promise<void> };
            }
        } catch { /* ignore */ }

        if (quotaManager) {
            const isAvailable = await quotaManager.isModelAvailable(modelId);
            if (!isAvailable) {
                // Fallback vers secondaire si primaire épuisé ?
                // Pour l'instant on fail, ou on pourrait implémenter une logique de fallback complexe ici.
                // Essayons le fallback configuré
                const fallbackConfig = modelsConfig.reglages_generaux?.embeddings?.fallback;
                if (fallbackConfig && fallbackConfig.provider !== providerName) {
                    console.warn(`[Router] ⚠️ Embedding ${providerName}/${modelId} quota épuisé. Tentative fallback ${fallbackConfig.provider}...`);
                    return this.embedFallback(text, fallbackConfig);
                }
                throw new Error(`Quota épuisé pour le modèle d'embedding ${modelId}`);
            }
        }

        // 3. Exécuter
        if (!adapter.embed) {
            throw new Error(`L'adaptateur pour ${providerName} ne supporte pas la méthode embed`);
        }
        try {
            const result = await adapter.embed(text, {
                apiKey,
                model: modelId
            });

            // 4. Enregistrer usage
            if (quotaManager) {
                // Estimation: 1 token ~ 4 chars (très brut)
                // Ou utiliser usage retourné si dispo (OpenAI retourne usage.total_tokens)
                const tokens = (result as { usage?: { total_tokens?: number } }).usage?.total_tokens || Math.ceil(text.length / 4);
                quotaManager.recordUsage(providerName, modelId, tokens).catch(() => {});
            }

            return result;
        } catch (error) {
            console.error(`[Router] Erreur embedding ${providerName}:`, error);
            throw error;
        }
    }

    /**
     * Helper pour le fallback d'embedding (simplifié pour éviter récursion infinie complexe)
     */
    async embedFallback(text: string | string[], config: { provider: string; model: string }) {
        const providerName = config.provider;
        const modelId = config.model;
        const adapter = this.adapters.get(providerName);
        const apiKey = this.getApiKey(providerName);

        if (!adapter || !apiKey) throw new Error(`Fallback embedding ${providerName} indisponible`);

        // On ne revérifie pas le quota du fallback pour simplifier (Fail open ou on assume que le fallback est large)
        // Mais idéalement il faudrait.

        if (!adapter.embed) throw new Error(`Provider embedding ${providerName} ne supporte pas embed`);
        const result = await adapter.embed(text, { apiKey, model: modelId });
        return result;
    }


    /**
     * Liste les familles disponibles
     */
    listFamilies() {
        return Object.entries(modelsConfig.familles as Record<string, { nom_affiche?: string; modeles?: { id: string }[] }>).map(([key, config]) => ({
            id: key,
            name: config.nom_affiche,
            models: config.modeles?.map((m) => m.id) || [],
            hasApiKey: !!this.getApiKey(key)
        }));
    }

    /**
     * Vérifie si une famille est disponible
     */
    isAvailable(familyName: string) {
        const apiKey = this.getApiKey(familyName);
        return !!apiKey && !apiKey.startsWith('VOTRE_');
    }

    /**
     * Incrémente le compteur d'utilisation pour une famille
     */
    _incrementUsage(familyName: string) {
        const current = this.usageStats.get(familyName) || 0;
        this.usageStats.set(familyName, current + 1);
    }

    /**
     * Récupère les statistiques d'utilisation
     */
    getUsageStats() {
        const stats: Record<string, number> = {};
        for (const [family, count] of this.usageStats.entries()) {
            stats[family] = count;
        }
        return stats;
    }


    /**
     * Réinitialise les statistiques d'utilisation
     */
    resetUsageStats() {
        this.usageStats.clear();
        console.log('📊 Statistiques d\'utilisation réinitialisées');
    }
}

export const providerRouter = new ProviderRouter();

// Auto-import des adaptateurs disponibles
// WHY: Exported and idempotent so ServiceContainer can `await loadAdapters()`.
// The module-level fire-and-forget call below provides backward compatibility
// for code paths that import providerRouter without going through the container.
let loadPromise: Promise<void> | null = null;
export async function loadAdapters(): Promise<void> {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        // Mapping: nom du fichier adaptateur → nom(s) à enregistrer
        const adapterMapping = {
            'antigravity': ['antigravity'],
            'codex': ['codex'],
            'openai': ['openai'],
            'gemini': ['gemini'],
            'geminiCli': ['gemini-cli'],
            'anthropic': ['anthropic'],
            'mistral': ['mistral'],
            'codestral': ['codestral'],
            'kimi': ['kimi'],
            'moonshot': ['moonshot'],
            'github': ['github'],
            'groq': ['groq'],
            'huggingface': ['huggingface'],
            'nvidia': ['nvidia'],
            'openrouter': ['openrouter'],
            'cerebras': ['cerebras'],
            'cohere': ['cohere'],
            'cloudflare': ['cloudflare'],
            'fireworks': ['fireworks'],
            'baseten': ['baseten'],
            'nebius': ['nebius'],
            'novita': ['novita'],
            'ai21': ['ai21'],
            'upstage': ['upstage'],
            'nlpcloud': ['nlpcloud'],
            'alibaba': ['alibaba'],
            'modal': ['modal'],
            'inferencenet': ['inferencenet'],
            'hyperbolic': ['hyperbolic'],
            'sambanova': ['sambanova'],
            'scaleway': ['scaleway'],
            'vercel': ['vercel'],
            'opencodezen': ['opencodezen']
        };

        for (const [fileName, registerNames] of Object.entries(adapterMapping)) {
            try {
                const adapterPath = join(__dirname, 'adapters', `${fileName}.js`);
                const adapterUrl = pathToFileURL(adapterPath).href;
                const adapter = await import(adapterUrl);

                // Enregistrer l'adaptateur sous tous les noms associés
                for (const name of registerNames) {
                    providerRouter.registerAdapter(name, adapter.default);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.indexOf('ERR_MODULE_NOT_FOUND') === -1 && errorMessage.indexOf('MODULE_NOT_FOUND') === -1) {
                    console.error(`[Router Debug] Erreur de chargement pour ${fileName}:`, error);
                }
            }
        }
    })();

    return loadPromise;
}

// Backward compatibility: auto-load when module is imported outside ServiceContainer
loadAdapters().catch(console.error);

export default providerRouter;
