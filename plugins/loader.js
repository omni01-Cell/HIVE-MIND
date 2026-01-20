// plugins/loader.js
// Chargeur dynamique de plugins (système Brick-Like)

import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { eventBus, BotEvents } from '../core/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Format standard que chaque plugin doit exposer
 * @typedef {Object} Plugin
 * @property {string} name - Nom unique du plugin
 * @property {string} description - Description pour l'IA
 * @property {string} version - Version du plugin
 * @property {boolean} enabled - Activé par défaut ?
 * @property {Object} toolDefinition - Définition OpenAI-compatible pour function calling
 * @property {Function} execute - Fonction d'exécution
 */

class PluginLoader {
    constructor() {
        this.plugins = new Map();
        this.toolToPlugin = new Map(); // Maps tool function names to plugin names
        this.toolDefinitions = [];
        this.textMatchers = [];        // Agrégation des matchers textuels des plugins
    }

    /**
     * Charge tous les plugins depuis le dossier /plugins
     */
    async loadAll() {
        // Chargement silencieux pour ne pas casser la barre de progression
        const entries = await readdir(__dirname, { withFileTypes: true });
        const pluginDirs = entries.filter(e => e.isDirectory());
        const loadErrors = [];

        for (const dir of pluginDirs) {
            try {
                await this.load(dir.name);
            } catch (error) {
                loadErrors.push({ name: dir.name, error: error.message });
            }
        }

        // Les erreurs seront loguées après le complete() si nécessaire
        this._loadErrors = loadErrors;
        return this.plugins;
    }

    /**
     * Charge un plugin spécifique
     * @param {string} pluginName 
     */
    async load(pluginName) {
        const pluginPath = join(__dirname, pluginName, 'index.js');

        try {
            const pluginModule = await import(pathToFileURL(pluginPath).href);
            const plugin = pluginModule.default || pluginModule;

            // Validation du format
            this._validatePlugin(plugin, pluginName);

            if (!plugin.enabled) {
                // Plugin désactivé - silencieux
                return;
            }

            this.plugins.set(plugin.name, plugin);

            // Ajoute les définitions d'outils et mappe les noms de fonctions
            if (plugin.toolDefinitions) {
                for (const toolDef of plugin.toolDefinitions) {
                    this.toolDefinitions.push(toolDef);
                    const toolName = toolDef.function?.name;
                    if (toolName) {
                        this.toolToPlugin.set(toolName, plugin.name);
                    }
                }
            } else if (plugin.toolDefinition) {
                this.toolDefinitions.push(plugin.toolDefinition);
                const toolName = plugin.toolDefinition.function?.name;
                if (toolName) {
                    this.toolToPlugin.set(toolName, plugin.name);
                }
            }

            // Enregistrer les matchers textuels (silencieux)
            if (plugin.textMatchers && Array.isArray(plugin.textMatchers)) {
                for (const matcher of plugin.textMatchers) {
                    this.textMatchers.push({
                        ...matcher,
                        pluginName: plugin.name
                    });
                }
            }

            // Événement silencieux
            eventBus.publish(BotEvents.PLUGIN_LOADED, { name: plugin.name });

        } catch (error) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                throw error;
            }
            // Plugin sans index.js - silencieux
        }
    }

    /**
     * Valide qu'un plugin a le bon format
     */
    _validatePlugin(plugin, name) {
        const required = ['name', 'description', 'version', 'execute'];
        for (const prop of required) {
            if (!plugin[prop]) {
                throw new Error(`Plugin ${name} manque la propriété: ${prop}`);
            }
        }
        if (typeof plugin.execute !== 'function') {
            throw new Error(`Plugin ${name}: execute doit être une fonction`);
        }
    }

    /**
     * Récupère un plugin par son nom
     * @param {string} name 
     * @returns {Plugin|undefined}
     */
    get(name) {
        return this.plugins.get(name);
    }

    /**
     * Exécute un plugin avec Graceful Degradation
     * @param {string} name - Nom du plugin
     * @param {Object} args - Arguments pour le plugin
     * @param {Object} context - Contexte d'exécution
     */
    async execute(toolName, args, context) {
        // Résoudre le nom de l'outil vers le plugin parent
        const pluginName = this.toolToPlugin.get(toolName) || toolName;
        const plugin = this.plugins.get(pluginName);

        if (!plugin) {
            return {
                success: false,
                message: `ERREUR_OUTIL: Plugin "${toolName}" non trouvé. Cet outil n'existe pas ou n'est pas chargé.`,
                gracefulDegradation: true
            };
        }

        try {
            // Passe le nom de l'outil au plugin pour les plugins multi-outils
            const result = await plugin.execute(args, context, toolName);
            eventBus.publish(BotEvents.PLUGIN_EXECUTED, { name: toolName, args, result });
            return result;
        } catch (error) {
            eventBus.publish(BotEvents.PLUGIN_ERROR, { name: toolName, error });
            console.error(`[PluginLoader] ⚠️ Erreur dans ${toolName}:`, error.message);

            return {
                success: false,
                message: `ERREUR_OUTIL: L'outil "${toolName}" a rencontré une erreur - ${error.message}. Tu peux informer l'utilisateur et continuer avec les autres demandes.`,
                error: error.message,
                gracefulDegradation: true
            };
        }
    }

    // ========================================================================
    // SYSTÈME DE TEXT MATCHERS (Découplage des commandes textuelles)
    // ========================================================================

    /**
     * Cherche un handler textuel correspondant au texte donné
     * Permet aux plugins de déclarer leurs propres patterns regex
     * 
     * @param {string} text - Le texte à analyser
     * @param {Object} message - Le message WhatsApp complet (pour les mentions, etc.)
     * @returns {{name: string, args: Object}|null} - Commande parsée ou null
     * 
     * @example
     * const cmd = pluginLoader.findTextHandler("[ban:@user]", message);
     * // { name: 'gm_ban_user', args: { user_jid: '123@s.whatsapp.net' } }
     */
    findTextHandler(text, message = {}) {
        if (!text) return null;

        for (const matcher of this.textMatchers) {
            try {
                const match = text.match(matcher.pattern);
                if (match) {
                    // Utiliser extractArgs si défini, sinon retourner les groupes capturés
                    const args = matcher.extractArgs
                        ? matcher.extractArgs(match, message, text)
                        : { captures: match.slice(1) };

                    // Vérifier si les args sont valides (ex: user_jid doit exister)
                    if (args === null || args === undefined) continue;

                    console.log(`[TextMatcher] ✓ Pattern trouvé: ${matcher.handler} (plugin: ${matcher.pluginName})`);
                    return {
                        name: matcher.handler,
                        args
                    };
                }
            } catch (error) {
                console.error(`[TextMatcher] Erreur dans matcher ${matcher.handler}:`, error.message);
            }
        }

        return null;
    }

    /**
     * Retourne toutes les définitions d'outils pour l'IA
     * @returns {Array}
     */
    getToolDefinitions() {
        return this.toolDefinitions;
    }

    // ========================================================================
    // DYNAMIC TOOL SELECTION (RAG pour Outils - Phase 2)
    // ========================================================================

    /**
     * Retourne les outils les plus pertinents pour une requête donnée
     * Utilise la recherche sémantique sur la table bot_tools
     * 
     * @param {string} userMessage - Le message de l'utilisateur
     * @param {number} limit - Nombre max d'outils à retourner (défaut: 5)
     * @param {number} fallbackLimit - Si RAG échoue, combien d'outils envoyer (défaut: 10)
     * @returns {Promise<Array>} - Définitions d'outils pertinents
     * 
     * @example
     * const tools = await pluginLoader.getRelevantTools("bannis ce mec", 5);
     * // Retourne les 5 outils les plus proches de "bannir"
     */
    async getRelevantTools(userMessage, limit = 5, fallbackLimit = 10, options = {}) {
        const { forceModeration } = options;
        // Import dynamique pour éviter les dépendances circulaires
        const { supabase } = await import('../services/supabase.js');
        const { EmbeddingsService } = await import('../services/ai/EmbeddingsService.js');
        const { readFileSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');

        // Créer l'instance EmbeddingsService
        let embeddings = null;
        try {
            const __dirname2 = dirname(fileURLToPath(import.meta.url));
            const credentials = JSON.parse(readFileSync(join(__dirname2, '..', 'config', 'credentials.json'), 'utf-8'));
            const modelsConfig = JSON.parse(readFileSync(join(__dirname2, '..', 'config', 'models_config.json'), 'utf-8')); // Load models config

            // Resolve Env Vars Helper
            const resolveKey = (key, jsonVal) => {
                if (!jsonVal || jsonVal.startsWith('VOTRE_')) {
                    if (jsonVal && process.env[jsonVal]) return process.env[jsonVal];
                    if (key === 'gemini') return process.env.GEMINI_API_KEY || process.env.VOTRE_CLE_GEMINI;
                    if (key === 'openai') return process.env.OPENAI_API_KEY;
                }
                return jsonVal;
            };

            const geminiKey = resolveKey('gemini', credentials.familles_ia?.gemini);
            const openaiKey = resolveKey('openai', credentials.familles_ia?.openai);

            // Resolve Model Config
            const primaryEmbedding = modelsConfig?.reglages_generaux?.embeddings?.primary || {};

            embeddings = new EmbeddingsService({
                geminiKey: geminiKey,
                openaiKey: openaiKey,
                model: primaryEmbedding.model || 'gemini-embedding-001',
                dimensions: primaryEmbedding.dimensions || 1024
            });
        } catch (e) {
            console.warn('[PluginLoader] Impossible de charger EmbeddingsService:', e.message);
        }

        if (!supabase || !embeddings) {
            console.warn('[PluginLoader] RAG indisponible, fallback vers tous les outils');
            return this.toolDefinitions.slice(0, fallbackLimit);
        }

        try {
            // 1. Générer l'embedding de la requête utilisateur
            const queryVector = await embeddings.embed(userMessage);

            if (!queryVector) {
                console.warn('[PluginLoader] Échec embedding requête, fallback');
                return this.toolDefinitions.slice(0, fallbackLimit);
            }

            // 2. Rechercher les outils similaires dans bot_tools
            const { data, error } = await supabase.rpc('match_tools', {
                query_embedding: queryVector,
                match_count: limit
            });

            if (error) {
                console.error('[PluginLoader] Erreur match_tools:', error.message);
                return this.toolDefinitions.slice(0, fallbackLimit);
            }

            if (!data || data.length === 0) {
                console.warn('[PluginLoader] Aucun outil trouvé par RAG, fallback');
                return this.toolDefinitions.slice(0, fallbackLimit);
            }

            // 3. Fusionner avec les CORE TOOLS (Outils toujours disponibles)
            let CORE_TOOLS = ['get_my_capabilities', 'send_message', 'react_to_message', 'use_tool'];

            // [SENTIENCE] Si l'IA est énervée, on arme le système
            if (forceModeration) {
                CORE_TOOLS.push('gm_ban_user', 'gm_kick_user', 'gm_mute_user', 'gm_warn_user', 'gm_tagall');
            }

            const coreToolDefs = this.toolDefinitions.filter(t =>
                t.function && CORE_TOOLS.includes(t.function.name)
            );

            // Mapper les outils RAG
            let relevantTools = data.map(tool => tool.definition);

            // Ajouter les Core Tools s'ils ne sont pas déjà là
            for (const coreTool of coreToolDefs) {
                if (!relevantTools.find(t => t.function.name === coreTool.function.name)) {
                    relevantTools.push(coreTool);
                }
            }

            console.log(`[PluginLoader] 🎯 ${relevantTools.length} outils sélectionnés (RAG + Core):`,
                relevantTools.map(t => t.function.name).join(', ')
            );

            return relevantTools;

        } catch (error) {
            console.error('[PluginLoader] Erreur getRelevantTools:', error.message);
            // Fallback: Core Tools + Premiers outils
            const CORE_TOOLS = ['get_my_capabilities', 'send_message', 'react_to_message'];
            const coreToolDefs = this.toolDefinitions.filter(t => t.function && CORE_TOOLS.includes(t.function.name));
            const fallbackTools = this.toolDefinitions.slice(0, fallbackLimit);

            // Merge simple
            const merged = [...coreToolDefs];
            for (const t of fallbackTools) {
                if (!merged.find(m => m.function.name === t.function.name)) merged.push(t);
            }
            return merged;
        }
    }


    /**
     * Liste tous les plugins chargés
     * @returns {Array<{name, description, version}>}
     */
    list() {
        return Array.from(this.plugins.values()).map(p => ({
            name: p.name,
            description: p.description,
            version: p.version
        }));
    }

    /**
     * Recharge un plugin spécifique
     * @param {string} name 
     */
    async reload(name) {
        const plugin = this.plugins.get(name);
        if (plugin) {
            // Retire l'ancienne définition
            this.toolDefinitions = this.toolDefinitions.filter(
                t => t.function?.name !== name
            );
            this.plugins.delete(name);
        }

        // Trouve le dossier correspondant
        const entries = await readdir(__dirname, { withFileTypes: true });
        const dir = entries.find(e => e.isDirectory() && e.name === name);
        if (dir) {
            await this.load(name);
        }
    }
}

export const pluginLoader = new PluginLoader();
export default PluginLoader;
