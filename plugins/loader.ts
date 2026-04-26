// @ts-nocheck
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
    plugins: any;
    toolToPlugin: any;
    toolDefinitions: any;
    textMatchers: any;

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
        const categories = entries.filter((e: any) => e.isDirectory());
        const loadErrors = [];

        for (const category of categories) {
            const catPath = join(__dirname, category.name);
            const pluginEntries = await readdir(catPath, { withFileTypes: true });
            const pluginDirs = pluginEntries.filter((e: any) => e.isDirectory());

            for (const dir of pluginDirs) {
                try {
                    await this.load(`${category.name}/${dir.name}`);
                } catch (error: any) {
                    loadErrors.push({ name: dir.name, error: error.message });
                }
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
    async load(pluginName: any) {
        const pluginPath = join(__dirname, pluginName, 'index.js');

        try {
            const pluginModule = await import(pathToFileURL(pluginPath).href);
            const plugin = pluginModule.default || pluginModule;

            // Validation du format
            this._validatePlugin(plugin, pluginName);

            // 🛡️ Validation de la structure d'outil (Audit #19 Approach B)
            if (plugin.toolDefinition) {
                this._validateToolDefinition(plugin.toolDefinition, pluginName);
            }
            if (plugin.toolDefinitions) {
                plugin.toolDefinitions.forEach((td: any) => this._validateToolDefinition(td, pluginName));
            }

            if (typeof plugin.init === 'function') {
                try {
                    await plugin.init();
                } catch (e: any) {
                    console.error(`[PluginLoader] Error initializing plugin ${pluginName}:`, e.message);
                }
            }

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
                    // IMPORTANT: Mapper le nom du handler vers le plugin
                    const handlerName = matcher.name || matcher.handler;
                    if (handlerName) {
                        this.toolToPlugin.set(handlerName, plugin.name);
                    }
                }
            }

            // Événement silencieux
            eventBus.publish(BotEvents.PLUGIN_LOADED, { name: plugin.name });

        } catch (error: any) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                throw error;
            }
            // Plugin sans index.js - silencieux
        }
    }

    /**
     * Valide qu'un plugin a le bon format
     */
    _validatePlugin(plugin: any, name: any) {
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
     * Valide la structure d'une définition d'outil (Audit #19)
     * @private
     */
    _validateToolDefinition(toolDef: any, pluginName: any) {
        if (!toolDef.function) {
            throw new Error(`Plugin ${pluginName}: définition d'outil manque l'objet "function"`);
        }
        
        const { name, description, parameters } = toolDef.function;
        
        if (!name || typeof name !== 'string') {
            throw new Error(`Plugin ${pluginName}: nom de l'outil manquant ou invalide`);
        }
        
        if (!description || typeof description !== 'string') {
            throw new Error(`Plugin ${pluginName}: description de l'outil "${name}" manquante`);
        }
        
        if (!parameters || typeof parameters !== 'object') {
            throw new Error(`Plugin ${pluginName}: paramètres de l'outil "${name}" manquants`);
        }
        
        // Vérifier format parameters (JSON Schema standard)
        if (parameters.type !== 'object' || !parameters.properties) {
            console.warn(`[PluginLoader] ⚠️ Outil "${name}" (Plugin: ${pluginName}) utilise un format de paramètres non standard`);
        }
        
        return true;
    }

    /**
     * Récupère un plugin par son nom

     * @param {string} name 
     * @returns {Plugin|undefined}
     */
    get(name: any) {
        return this.plugins.get(name);
    }

    /**
     * Exécute un plugin avec Graceful Degradation
     * @param {string} name - Nom du plugin
     * @param {Object} args - Arguments pour le plugin
     * @param {Object} context - Contexte d'exécution
     */
    async execute(toolName: any, args: any, context: any) {
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
        } catch (error: any) {
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
    findTextHandler(text: any, message: any = {}) {
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

                    // Support both "name" and "handler" for backwards compatibility
                    const handlerName = matcher.name || matcher.handler;
                    console.log(`[TextMatcher] ✓ Pattern trouvé: ${handlerName} (plugin: ${matcher.pluginName})`);
                    return {
                        name: handlerName,
                        args
                    };
                }
            } catch (error: any) {
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
    async getRelevantTools(userMessage: any, limit: any = 5, fallbackLimit: any = 10, options: any = {}) {
        const { forceModeration } = options;
        // Import dynamique pour éviter les dépendances circulaires
        const { supabase } = await import('../services/supabase.js');
        const { container } = await import('../core/ServiceContainer.js');
        
        // Utiliser le singleton EmbeddingsService du container (évite duplication)
        let embeddings: any = null;
        try {
            if (container.has('embeddings')) {
                embeddings = container.get('embeddings');
                console.log('[PluginLoader] ✅ EmbeddingsService chargé depuis container (singleton)');
            } else {
                console.warn('[PluginLoader] EmbeddingsService non disponible dans container');
            }
        } catch (e: any) {
            console.warn('[PluginLoader] Erreur chargement EmbeddingsService depuis container:', e.message);
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
            let CORE_TOOLS = ['get_my_capabilities', 'send_message', 'send_file', 'react_to_message', 'use_tool'];

            // [SENTIENCE] Si l'IA est énervée, on arme le système
            if (forceModeration) {
                CORE_TOOLS.push('gm_ban_user', 'gm_kick_user', 'gm_mute_user', 'gm_warn_user', 'gm_tagall');
            }

            const coreToolDefs = this.toolDefinitions.filter((t: any) =>
                t.function && CORE_TOOLS.includes(t.function.name)
            );

            // Mapper les outils RAG
            let relevantTools = data.map((tool: any) => tool.definition);

            // Ajouter les Core Tools s'ils ne sont pas déjà là
            for (const coreTool of coreToolDefs) {
                if (!relevantTools.find((t: any) => t.function.name === coreTool.function.name)) {
                    relevantTools.push(coreTool);
                }
            }

            console.log(`[PluginLoader] 🎯 ${relevantTools.length} outils sélectionnés (RAG + Core):`,
                relevantTools.map((t: any) => t.function.name).join(', ')
            );

            return relevantTools;

        } catch (error: any) {
            console.error('[PluginLoader] Erreur getRelevantTools:', error.message);
            // Fallback: Core Tools + Premiers outils
            const CORE_TOOLS = ['get_my_capabilities', 'send_message', 'send_file', 'react_to_message'];
            const coreToolDefs = this.toolDefinitions.filter((t: any) => t.function && CORE_TOOLS.includes(t.function.name));
            const fallbackTools = this.toolDefinitions.slice(0, fallbackLimit);

            // Merge simple
            const merged = [...coreToolDefs];
            for (const t of fallbackTools) {
                if (!merged.find((m: any) => m.function.name === t.function.name)) merged.push(t);
            }
            return merged;
        }
    }


    /**
     * Liste tous les plugins chargés
     * @returns {Array<{name, description, version}>}
     */
    /**
     * Vérifie l'état de synchronisation des outils avec Supabase
     * Supprime les outils obsolètes et signale les changements
     * @param {Object} supabase - Client Supabase
     * @returns {Promise<{deleted: number, new: number, modified: number}>}
     */
    async checkSyncStatus(supabase: any) {
        if (!supabase) return { deleted: 0, new: 0, modified: 0 };

        try {
            // 1. Récupérer les outils actuels (chargés)
            const loadedTools = this.getToolDefinitions();
            const loadedToolHashes = new Map();

            for (const tool of loadedTools) {
                const name = tool.function?.name;
                const description = tool.function?.description || '';
                if (name) {
                    loadedToolHashes.set(name, this._generateToolHash(name, description));
                }
            }

            // 2. Récupérer les outils en base
            const { data: dbTools, error } = await supabase
                .from('bot_tools')
                .select('name, description');

            if (error) throw error;

            let deleted = 0;
            let newTools = 0;
            let modified = 0;

            if (dbTools) {
                // 3. Identifier et supprimer les obsolètes
                const dbToolNames = dbTools.map((t: any) => t.name);
                const obsoleteTools = dbToolNames.filter((name: any) => !loadedToolHashes.has(name));

                if (obsoleteTools.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('bot_tools')
                        .delete()
                        .in('name', obsoleteTools);

                    if (!deleteError) {
                        deleted = obsoleteTools.length;
                    }
                }

                // 4. Identifier les nouveaux et modifiés
                for (const [name, hash] of loadedToolHashes.entries()) {
                    const dbTool = dbTools.find((t: any) => t.name === name);
                    if (!dbTool) {
                        newTools++;
                    } else {
                        const dbHash = this._generateToolHash(name, dbTool.description);
                        if (hash !== dbHash) {
                            modified++;
                        }
                    }
                }
            }

            return { deleted, new: newTools, modified };

        } catch (error: any) {
            console.error('[PluginLoader] Sync check error:', error);
            return { deleted: 0, new: 0, modified: 0 };
        }
    }

    /**
     * Génère un hash simple pour détecter les changements
     */
    _generateToolHash(name: any, description: any) {
        return `${name}:${description.trim()}`;
    }

    list() {
        return Array.from(this.plugins.values()).map((p: any) => ({
            name: p.name,
            description: p.description,
            version: p.version
        }));
    }

    /**
     * Recharge un plugin spécifique
     * @param {string} name 
     */
    async reload(name: any) {
        const plugin = this.plugins.get(name);
        if (plugin) {
            // Retire l'ancienne définition
            this.toolDefinitions = this.toolDefinitions.filter(
                t => t.function?.name !== name
            );
            this.plugins.delete(name);
        }

        // Find the plugin path across categories
        const categories = await readdir(__dirname, { withFileTypes: true });
        for (const category of categories.filter((e: any) => e.isDirectory())) {
            const catPath = join(__dirname, category.name);
            const plugins = await readdir(catPath, { withFileTypes: true });
            const dir = plugins.find((e: any) => e.isDirectory() && e.name === name);
            if (dir) {
                await this.load(`${category.name}/${name}`);
                return;
            }
        }
    }
}

export const pluginLoader = new PluginLoader();
export default PluginLoader;
