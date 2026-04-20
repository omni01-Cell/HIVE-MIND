// providers/index.js
// Model Provider Layer - Routeur multi-familles

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { classifier } from '../services/ai/classifier.js';
import { envResolver } from '../services/envResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les configurations
let modelsConfig, credentials;
try {
    modelsConfig = JSON.parse(
        readFileSync(join(__dirname, '..', 'config', 'models_config.json'), 'utf-8')
    );
    credentials = JSON.parse(
        readFileSync(join(__dirname, '..', 'config', 'credentials.json'), 'utf-8')
    );
} catch (error) {
    console.error('❌ Erreur chargement config providers:', error.message);
    modelsConfig = { reglages_generaux: { famille_active: 'openai' }, familles: {} };
    credentials = { familles_ia: {} };
}

/**
 * Interface unifiée pour tous les providers
 */
class ProviderRouter {
    constructor() {
        this.adapters = new Map();
        this.currentFamily = modelsConfig.reglages_generaux?.famille_active || 'openai';
        this.usageStats = new Map(); // Tracking des appels par famille
        this.circuitStats = new Map(); // Circuit Breaker: { failureCount: 0, cooldownUntil: 0 }
    }

    /**
     * Enregistre un adaptateur pour une famille
     */
    registerAdapter(familyName, adapter) {
        this.adapters.set(familyName, adapter);
    }

    /**
     * Parse un model string pour extraire family et model
     * Ex: "qwen/qwen3-32b" → { family: "groq", model: "qwen/qwen3-32b" }
     * Ex: "kimi-for-coding" → { family: "kimi", model: "kimi-for-coding" }
     */
    parseModelString(modelStr) {
        // Chercher dans toutes les familles
        for (const [familyName, familyConfig] of Object.entries(modelsConfig.familles)) {
            const model = familyConfig.modeles?.find(m => m.id === modelStr);
            if (model) {
                return { family: familyName, model: modelStr };
            }
        }

        // Si pas trouvé, retourner null
        console.warn(`[Router] ⚠️ Modèle ${modelStr} non trouvé dans la config`);
        return null;
    }

    /**
     * Appel direct d'un service agent (sans classification Level 3)
     * Utilise le modèle assigné + fallback automatique si nécessaire
     */
    async callServiceAgent(serviceName, messages, options = {}) {
        const agent = modelsConfig.reglages_generaux.service_agents?.[serviceName];

        if (!agent) {
            throw new Error(`[Router] Service agent "${serviceName}" non trouvé dans models_config.json`);
        }

        console.log(`[Router] 🔧 Service Agent: ${serviceName} → ${agent.model}`);

        // Préparer la cascade: primary → fallback
        const modelsToTry = [agent.model];
        if (agent.fallback) {
            modelsToTry.push(agent.fallback);
        }

        let lastError = null;

        for (const modelStr of modelsToTry) {
            const parsed = this.parseModelString(modelStr);
            if (!parsed) {
                console.warn(`[Router] ⚠️ Modèle ${modelStr} invalide, skip`);
                continue;
            }

            try {
                // Appel avec température du service
                const result = await this.chat(messages, {
                    ...options,
                    family: parsed.family,
                    model: parsed.model,
                    temperature: agent.temperature ?? options.temperature,
                    isServiceAgent: true, // Flag pour éviter classification
                    isFallback: modelStr === agent.fallback
                });

                if (modelStr === agent.fallback) {
                    console.log(`[Router] ⚠️ ${serviceName} utilisé fallback: ${modelStr}`);
                }

                return result;
            } catch (error) {
                console.warn(`[Router] ❌ ${serviceName}/${modelStr} échec: ${error.message}`);
                lastError = error;
            }
        }

        throw new Error(`[Router] 🛑 Service ${serviceName} échec total. Dernière erreur: ${lastError?.message}`);
    }

    /**
     * Retourne les modèles candidats pour une catégorie chat Level 3
     */
    getChatCandidates(category) {
        const categoryConfig = modelsConfig.reglages_generaux.chat_agents?.categories?.[category];

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
    setFamily(familyName) {
        if (!modelsConfig.familles[familyName]) {
            throw new Error(`Famille inconnue: ${familyName}`);
        }
        this.currentFamily = familyName;
        console.log(`🧠 Famille IA changée: ${familyName}`);
    }

    /**
     * Récupère la configuration d'une famille
     */
    getFamilyConfig(familyName = this.currentFamily) {
        return modelsConfig.familles[familyName];
    }

    /**
     * Récupère la clé API d'une famille
     */
    getApiKey(familyName = this.currentFamily) {
        const key = credentials.familles_ia[familyName];
        // Utiliser EnvResolver pour résolution centralisée
        return envResolver.resolve(key, `${familyName.toUpperCase()}_KEY`);
    }

    /**
     * Trouve un modèle supportant un type donné
     */
    findModelForType(type, familyName = this.currentFamily) {
        const family = this.getFamilyConfig(familyName);
        if (!family?.modeles) return null;

        const model = family.modeles.find(m => m.types?.includes(type));
        return model?.id || family.modeles[0]?.id;
    }

    /**
     * Vérifie si une famille est en cooldown (Circuit Breaker)
     */
    _isCooldownActive(family) {
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
    _recordFailure(family, error) {
        // Détection des erreurs de Quota / Rate Limit
        const isQuotaError = error.message.toLowerCase().match(/(quota|limit|rate|429|insufficient)/);

        if (isQuotaError) {
            const stats = this.circuitStats.get(family) || { failureCount: 0, cooldownUntil: 0 };
            stats.failureCount++;

            // Cooldown progressif : 1min, 5min, 15min
            let cooldownMinutes = 1;
            if (stats.failureCount === 2) cooldownMinutes = 5;
            if (stats.failureCount >= 3) cooldownMinutes = 15;

            stats.cooldownUntil = Date.now() + (cooldownMinutes * 60 * 1000);
            this.circuitStats.set(family, stats);

            console.warn(`[CircuitBreaker] ❄️ ${family} mis en cooldown pour ${cooldownMinutes}m (Erreur Quota/Limit)`);
        }
    }

    /**
     * Réinitialise le Circuit Breaker en cas de succès
     */
    _resetCircuit(family) {
        if (this.circuitStats.has(family)) {
            // On reset seulement le failureCount partiel, ou tout si on veut être gentil
            // Ici on clean tout pour redonner sa chance
            this.circuitStats.delete(family);
        }
    }

    /**
     * Appel chat unifié avec Fallback automatique
     */
    /**
     * Smart Router Chat Logic
     * Level 0: Regex (handled by caller/plugins usually, but here we Routing)
     * Level 1: Context (Redis)
     * Level 2: Availability (QuotaManager)
     * Level 3: Classification (Gemini Flash)
     */
    async chat(messages, options = {}) {
        console.log(`[Router Debug] chat called. messages type: ${typeof messages}, isArray: ${Array.isArray(messages)}`);
        // 1. Initialisation
        const { chatId, sender } = options;
        // On récupère le QuotaManager via l'adaptateur ou via import direct si besoin, 
        // mais idéalement il faudrait l'injecter. Pour l'instant on suppose qu'il est dispo via container
        // ou on l'importe dynamiquement si on n'a pas accès au container ici facilement.
        // NOTE: ProviderRouter est un singleton, on peut importer le container.
        const { container } = await import('../core/ServiceContainer.js');
        let quotaManager = null;
        try {
            if (container.has('quotaManager')) {
                quotaManager = container.get('quotaManager');
            }
        } catch (e) { console.warn('[Router] QuotaManager non dispo via container'); }

        // =========================================================
        // NIVEAU 1: CONTEXTE (STICKY SESSION)
        // =========================================================
        // Si une conversation est en cours avec un modèle spécifique, on essaie de le garder.
        // (Simplification: Ici on check si options.family est forcé, sinon on pourrait check Redis)

        let preferredFamilies = modelsConfig.reglages_generaux.familles_prioritaires;

        // Si l'utilisateur force une famille (via commande ou contexte précédent)
        if (options.family) {
            preferredFamilies = [options.family];
            console.log(`[Router] 🔒 Famille forcée par contexte: ${options.family}`);
        }

        // =========================================================
        // NIVEAU 2: DISPONIBILITÉ PROACTIVE (ZERO-429)
        // =========================================================
        // Filtrer les familles candidates via le QuotaManager AVEC MARGES DE SÉCURITÉ
        // On ne présente que les familles ayant AU MOINS un modèle "sain" (pas proche des limites)

        // Étape 2a: Filtre basique (Clé API valide)
        let availableFamilies = preferredFamilies.filter(f => this.isAvailable(f));

        // Étape 2b: Filtre PROACTIF (Quotas avec marges de sécurité)
        if (quotaManager) {
            try {
                // On ne garde que les familles avec au moins 1 modèle "sain"
                // Marges: RPM < 80%, TPM < 90%, RPD < 95%
                const healthyFamilies = await quotaManager.getHealthyFamilies(
                    modelsConfig.familles,
                    { rpm: 0.20, tpm: 0.10, rpd: 0.05 }
                );

                // Intersection: familles avec clé API ET modèles sains
                availableFamilies = availableFamilies.filter(f => healthyFamilies.includes(f));

                // console.log(`[Router] 🏥 Familles saines: [${healthyFamilies.join(', ')}]`);
            } catch (e) {
                console.warn('[Router] Erreur health check, fallback sur filtre basique:', e.message);
                // On continue avec le filtre basique si erreur
            }
        }

        if (availableFamilies.length === 0) {
            console.warn('[Router] ⚠️ TOUS les modèles prioritaires sont épuisés ou proches des limites ! Passage en mode SECOURS.');
            // Fallback: On réessaie tout ce qui a une clé valide (pas de health check en urgence)
            const allFamilies = Object.keys(modelsConfig.familles);
            availableFamilies = allFamilies.filter(f => this.isAvailable(f));

            // En mode secours, on essaie quand même de trouver des sains
            if (quotaManager && availableFamilies.length > 0) {
                try {
                    const emergencyHealthy = await quotaManager.getHealthyFamilies(
                        modelsConfig.familles,
                        { rpm: 0.05, tpm: 0.05, rpd: 0.02 } // Marges réduites en urgence
                    );
                    if (emergencyHealthy.length > 0) {
                        availableFamilies = availableFamilies.filter(f => emergencyHealthy.includes(f));
                    }
                } catch (e) { /* Ignore en urgence */ }
            }
        }

        if (availableFamilies.length === 0) {
            throw new Error('[Router] 🛑 Aucune famille IA disponible (Toutes épuisées ou sans clé API). Vérifiez credentials.json ou attendez le reset des quotas.');
        }

        // =========================================================
        // NIVEAU 3: DÉTECTION CATÉGORIE + MODÈLES PRÉCIS
        // =========================================================
        // Si on n'a pas de famille/modèle forcé, on détecte la catégorie 
        // et on récupère les 2 modèles précis (primary + fallback)

        // SKIP Level 3 si c'est un appel de service agent (déjà spécifique)
        if (!options.family && !options.model && !options.isClassifierCall && !options.isServiceAgent) {
            const detectionStart = Date.now();
            const lastMsg = messages[messages.length - 1]?.content || "";

            try {
                const category = await classifier.detectCategory(lastMsg, this);
                console.log(`[Router] Détection catégorie: ${(Date.now() - detectionStart).toFixed(3)}ms`);

                if (category) {
                    const candidates = this.getChatCandidates(category);

                    if (candidates && candidates.primary) {
                        console.log(`[Router] 🎯 Catégorie détectée: ${category}`);
                        console.log(`[Router] 📋 Modèles: ${candidates.primary} (fallback: ${candidates.fallback})`);

                        // Parser le primary model pour extraire famille + model ID
                        const primaryParsed = this.parseModelString(candidates.primary);
                        const fallbackParsed = candidates.fallback ? this.parseModelString(candidates.fallback) : null;

                        if (primaryParsed) {
                            options.family = primaryParsed.family;
                            options.model = primaryParsed.model;

                            // Réorganiser availableFamilies pour mettre le choix en premier
                            if (availableFamilies.includes(primaryParsed.family)) {
                                availableFamilies = [primaryParsed.family, ...availableFamilies.filter(f => f !== primaryParsed.family)];
                            }

                            // Si fallback disponible et différent, l'ajouter
                            if (fallbackParsed && fallbackParsed.family !== primaryParsed.family) {
                                if (availableFamilies.includes(fallbackParsed.family)) {
                                    availableFamilies = [
                                        primaryParsed.family,
                                        fallbackParsed.family,
                                        ...availableFamilies.filter(f => f !== primaryParsed.family && f !== fallbackParsed.family)
                                    ];
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn(`[Router] ⚠️ Échec détection catégorie: ${err.message}`);
                // Fallback: continuer avec availableFamilies par défaut
            }
        }

        // =========================================================
        // EXÉCUTION (CASCADE)
        // =========================================================

        let lastError = null;

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
            // SÉCURITÉ CRITIQUE: Si options.model est défini, on ne l'utilise QUE si c'est la bonne famille
            let modelsToTry = [];

            if (options.model && family === options.family) {
                // Si on a un modèle spécifique forcé ET que c'est la bonne famille
                modelsToTry = [options.model];
            } else {
                // Sinon (fallback ou famille différente), on cherche les modèles 'chat' de cette famille
                modelsToTry = familyConfig?.modeles
                    ?.filter(m => m.types?.includes('chat'))
                    .map(m => m.id) || [];
            }


            // Essayer chaque modèle de la famille
            for (const model of modelsToTry) {
                try {
                    // [ZERO-429] Check proactif avec marges de sécurité
                    if (quotaManager) {
                        const health = await quotaManager.getModelHealth(model, { rpm: 0.20, tpm: 0.10, rpd: 0.05 });

                        if (!health.healthy) {
                            console.log(`[Router] ⏭️ ${model} skipped: ${health.reason}`);
                            continue; // Pas de _recordFailure, ce n'est pas une vraie erreur
                        }
                    }

                    console.log(`[Router] 🚀 Tentative: ${family} → ${model}`);
                    const result = await adapter.chat(messages, {
                        ...options,
                        model,
                        apiKey: this.getApiKey(family),
                        familyConfig
                    });

                    // ✅ SUCCÈS
                    this._resetCircuit(family);

                    // 📊 Enregistrer Usage (QuotaManager)
                    // On estime les tokens (très approximatif : 1 mot ~ 1.3 tokens, input+output)
                    const inputTxt = messages.map(m => m.content).join(' ');
                    const outputTxt = result.content || '';
                    const estimatedTokens = Math.ceil((inputTxt.length + outputTxt.length) / 4); // ~4 chars per token

                    if (quotaManager) {
                        // Sig: recordUsage(provider, modelId, tokens)
                        quotaManager.recordUsage(family, model, estimatedTokens).catch(e => console.error(e));
                    }

                    return {
                        ...result,
                        usedFamily: family,
                        usedModel: model
                    };

                } catch (error) {
                    console.warn(`[Router] ⚠️ Échec ${family}/${model}: ${error.message.substring(0, 200)}...`); // Limit length
                    lastError = error;

                    // Gestion intelligente des Quotas (Smart Circuit Breaker)
                    const isQuotaError = error.message.toLowerCase().match(/(quota|limit|rate|429|insufficient)/);

                    if (isQuotaError && quotaManager) {
                        let waitTime = 60; // Défaut 1 minute

                        // Tentative d'extraction du temps d'attente précis
                        // Regex pour "retry in 39.37s" ou "after 60s"
                        const matchWait = error.message.match(/retry in\s+([\d.]+)\s*s/i) ||
                            error.message.match(/after\s+([\d.]+)\s*s/i);

                        if (matchWait && matchWait[1]) {
                            waitTime = Math.ceil(parseFloat(matchWait[1]));
                        }

                        // On bloque spécifiquement CE modèle, pas toute la famille
                        await quotaManager.recordQuotaExceeded(model, waitTime);
                        console.log(`[Router] 🛡️ Modèle ${model} bloqué pour ${waitTime}s (Feedback Temps Réel)`);
                    } else {
                        // Pour les autres erreurs (réseau, crash), on pénalise la famille
                        this._recordFailure(family, error);
                    }

                    // Si on était en mode "Famille Forcée" (contexte) mais que ça a échoué
                    // On doit briser le cadenas et permettre d'essayer les autres familles
                    if (availableFamilies.length === 1 && options.family) {
                        console.warn(`[Router] 🔓 Échec de la famille forcée (${family}). Activation du FALLBACK d'urgence.`);

                        // Récupérer toutes les autres familles dispo (CHECK STRICT)
                        // On doit vérifier chaque modèle de chaque famille maintenant
                        const allOthers = Object.keys(modelsConfig.familles)
                            .filter(f => f !== family && this.isAvailable(f)); // Dispo Clé API

                        // Pour sécuriser, on va relancer chat() sans la contrainte 'family'
                        if (!options.isFallback) {
                            console.log(`[Router] 🔄 Redirection vers les autres providers...`);
                            return this.chat(messages, { ...options, family: undefined, isFallback: true });
                        }
                    }

                    if (this._isCooldownActive(family)) break; // Famille morte, suivante
                }
            }
        }

        throw new Error(`[Router] Échec total de la cascade. Dernière erreur: ${lastError?.message}`);
    }

    /**
     * Génère un embedding
     */
    async embed(text, options = {}) {
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
        let quotaManager = null;
        try {
            const { container } = await import('../core/ServiceContainer.js');
            if (container.has('quotaManager')) {
                quotaManager = container.get('quotaManager');
            }
        } catch (e) { }

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
        try {
            const result = await adapter.embed(text, {
                apiKey,
                model: modelId
            });

            // 4. Enregistrer usage
            if (quotaManager) {
                // Estimation: 1 token ~ 4 chars (très brut)
                // Ou utiliser usage retourné si dispo (OpenAI retourne usage.total_tokens)
                const tokens = result.usage?.total_tokens || Math.ceil(text.length / 4);
                quotaManager.recordUsage(providerName, modelId, tokens).catch(console.error);
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
    async embedFallback(text, config) {
        const providerName = config.provider;
        const modelId = config.model;
        const adapter = this.adapters.get(providerName);
        const apiKey = this.getApiKey(providerName);

        if (!adapter || !apiKey) throw new Error(`Fallback embedding ${providerName} indisponible`);

        // On ne revérifie pas le quota du fallback pour simplifier (Fail open ou on assume que le fallback est large)
        // Mais idéalement il faudrait.

        const result = await adapter.embed(text, { apiKey, model: modelId });
        return result;
    }



    /**
     * Liste les familles disponibles
     */
    listFamilies() {
        return Object.entries(modelsConfig.familles).map(([key, config]) => ({
            id: key,
            name: config.nom_affiche,
            models: config.modeles?.map(m => m.id) || [],
            hasApiKey: !!this.getApiKey(key) && !this.getApiKey(key).startsWith('VOTRE_')
        }));
    }

    /**
     * Vérifie si une famille est disponible
     */
    isAvailable(familyName) {
        const apiKey = this.getApiKey(familyName);
        return !!apiKey && !apiKey.startsWith('VOTRE_');
    }

    /**
     * Incrémente le compteur d'utilisation pour une famille
     */
    _incrementUsage(familyName) {
        const current = this.usageStats.get(familyName) || 0;
        this.usageStats.set(familyName, current + 1);
    }

    /**
     * Récupère les statistiques d'utilisation
     */
    getUsageStats() {
        const stats = {};
        for (const [family, count] of this.usageStats.entries()) {
            stats[family] = count;
        }
        return stats;
    }

    /**
     * Méthode dépréciée au profit de classifier.js
     *@deprecated Utiliser classifier.classify(query, candidates, router)
     */
    async _classifyRequest(messages, candidates) {
        const lastMsg = messages[messages.length - 1]?.content || "";
        const family = await classifier.classify(lastMsg, candidates, this);
        return family ? { family } : null;
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
async function loadAdapters() {
    // Mapping: nom du fichier adaptateur → nom(s) à enregistrer
    const adapterMapping = {
        'openai': ['openai'],
        'gemini': ['gemini'],
        'anthropic': ['anthropic'],
        'mistral': ['mistral'],
        'kimi': ['kimi'],         // Kimi Code (API spéciale coding agents)
        'moonshot': ['moonshot'], // Moonshot AI standard
        'github': ['github'],     // GitHub Models (Free Tier)
        'groq': ['groq'],         // Groq LPU (Fast Inference)
        'huggingface': ['huggingface'], // HF Router
        'nvidia': ['nvidia']       // NVIDIA AI Platform (NIM)
    };

    for (const [fileName, registerNames] of Object.entries(adapterMapping)) {
        try {
            // ... (existing imports)

            // ...

            const adapterPath = join(__dirname, 'adapters', `${fileName}.js`);
            const adapterUrl = pathToFileURL(adapterPath).href;
            const adapter = await import(adapterUrl);

            // Enregistrer l'adaptateur sous tous les noms associés
            for (const name of registerNames) {
                providerRouter.registerAdapter(name, adapter.default);
            }
            // Chargement silencieux pour ne pas casser la barre de progression
        } catch (error) {
            // L'adaptateur n'existe pas encore, c'est OK (silencieux)
            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                // Log d'erreur seulement pour les vraies erreurs, pas les modules manquants
            }
        }
    }
}

// Charger les adaptateurs au démarrage
loadAdapters().catch(console.error);

export default providerRouter;
