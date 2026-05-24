// plugins/loader.js
// plugins/loader.js
// Dynamic plugin loader (Brick-Like system)

import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { eventBus, BotEvents } from '../core/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// WHY (Audit M3): This list was duplicated at two fallback sites.
// Single source of truth prevents inconsistency if one copy is updated.
const SAFE_FALLBACK_TOOLS = [
    'get_my_capabilities', 'send_message', 'send_file', 'use_tool',
    'execute_bash_command', 'edit_file', 'list_directory', 'grep_search', 'code_execution',
    'google_ai_search', 'read_file'
] as const;

/**
 * Standard format that each plugin must expose
 * @typedef {Object} Plugin
 * @property {string} name - Unique plugin name
 * @property {string} description - Description for the AI
 * @property {string} version - Plugin version
 * @property {boolean} enabled - Enabled by default?
 * @property {Object} toolDefinition - OpenAI-compatible definition for function calling
 * @property {Function} execute - Execution function
 */

class PluginLoader {
    plugins: any;
    toolToPlugin: any;
    toolDefinitions: any;
    textMatchers: any;
    _loadErrors: any[] = [];

    constructor() {
        this.plugins = new Map();
        this.toolToPlugin = new Map(); // Maps tool function names to plugin names
        this.toolDefinitions = [];
        this.textMatchers = [];        // Aggregation of plugin textual matchers
    }

    /**
     * Loads all plugins from the /plugins directory
     */
    async loadAll() {
        // Silent loading to not break progress bar
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

        // Errors will be logged after complete() if necessary
        this._loadErrors = loadErrors;
        return this.plugins;
    }

    /**
     * Loads a specific plugin
     * @param {string} pluginName
     */
    async load(pluginName: any) {
        const pluginPath = join(__dirname, pluginName, 'index.js');

        try {
            const pluginModule = await import(pathToFileURL(pluginPath).href);
            const plugin = pluginModule.default || pluginModule;

            // Validation format
            this._validatePlugin(plugin, pluginName);

            // 🛡️ Validation of tool structure (Audit #19 Approach B)
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

                // Plugin disabled - silent
                return;
            }

            this.plugins.set(plugin.name, plugin);

            // Add tool definitions and map function names
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

            // Register textual matchers (silent)
            if (plugin.textMatchers && Array.isArray(plugin.textMatchers)) {
                for (const matcher of plugin.textMatchers) {
                    this.textMatchers.push({
                        ...matcher,
                        pluginName: plugin.name
                    });
                    // IMPORTANT: Map handler name to plugin
                    const handlerName = matcher.name || matcher.handler;
                    if (handlerName) {
                        this.toolToPlugin.set(handlerName, plugin.name);
                    }
                }
            }

            // Silent event
            eventBus.publish(BotEvents.PLUGIN_LOADED, { name: plugin.name });

        } catch (error: any) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                throw error;
            }
            // Plugin without index.js - silent
        }
    }

    /**
     * Validates that a plugin has the correct format
     */
    _validatePlugin(plugin: any, name: any) {
        const required = ['name', 'description', 'version', 'execute'];
        for (const prop of required) {
            if (!plugin[prop]) {
                throw new Error(`Plugin ${name} is missing property: ${prop}`);
            }
        }
        if (typeof plugin.execute !== 'function') {
            throw new Error(`Plugin ${name}: execute must be a function`);
        }
    }

    /**
     * Validates tool definition structure (Audit #19)
     * @private
     */
    _validateToolDefinition(toolDef: any, pluginName: any) {
        if (!toolDef.function) {
            throw new Error(`Plugin ${pluginName}: tool definition is missing "function" object`);
        }

        const { name, description, parameters } = toolDef.function;

        if (!name || typeof name !== 'string') {
            throw new Error(`Plugin ${pluginName}: missing or invalid tool name`);
        }

        if (!description || typeof description !== 'string') {
            throw new Error(`Plugin ${pluginName}: missing description for tool "${name}"`);
        }

        if (!parameters || typeof parameters !== 'object') {
            throw new Error(`Plugin ${pluginName}: missing parameters for tool "${name}"`);
        }

        // Check parameters format (Standard JSON Schema)
        if (parameters.type !== 'object' || !parameters.properties) {
            console.warn(`[PluginLoader] ⚠️ Tool "${name}" (Plugin: ${pluginName}) uses non-standard parameters format`);
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
     * Executes a plugin with Graceful Degradation
     * @param {string} toolName - Tool name
     * @param {Object} args - Arguments for the plugin
     * @param {Object} context - Execution context
     */
    async execute(toolName: any, args: any, context: any) {
        // Resolve tool name to parent plugin
        const pluginName = this.toolToPlugin.get(toolName) || toolName;
        const plugin = this.plugins.get(pluginName);

        if (!plugin) {
            return {
                success: false,
                message: `TOOL_ERROR: Plugin "${toolName}" not found. This tool does not exist or is not loaded.`,
                gracefulDegradation: true
            };
        }

        try {
            // Pass tool name to plugin for multi-tool plugins
            const result = await plugin.execute(args, context, toolName);
            eventBus.publish(BotEvents.PLUGIN_EXECUTED, { name: toolName, args, result });
            return result;
        } catch (error: any) {
            eventBus.publish(BotEvents.PLUGIN_ERROR, { name: toolName, error });
            console.error(`[PluginLoader] ⚠️ Error in ${toolName}:`, error.message);

            return {
                success: false,
                message: `TOOL_ERROR: Tool "${toolName}" encountered an error - ${error.message}. You can inform the user and continue with other requests.`,
                error: error.message,
                gracefulDegradation: true
            };
        }
    }

    // ========================================================================
    // TEXT MATCHERS SYSTEM (Textual command decoupling)
    // ========================================================================

    /**
     * Searches for a textual handler matching given text
     * Allows plugins to declare their own regex patterns
     *
     * @param {string} text - Text to analyze
     * @param {Object} message - Full WhatsApp message (for mentions, etc.)
     * @returns {{name: string, args: Object}|null} - Parsed command or null
     *
     * @example
     * const cmd = pluginLoader.findTextHandler("[ban:@user]", message);
     * // { name: 'whatsapp_ban_user', args: { user_jid: '123@s.whatsapp.net' } }
     */
    findTextHandler(text: any, message: any = {}) {
        if (!text) return null;

        for (const matcher of this.textMatchers) {
            try {
                const match = text.match(matcher.pattern);
                if (match) {
                    // Use extractArgs if defined, otherwise return captured groups
                    const args = matcher.extractArgs
                        ? matcher.extractArgs(match, message, text)
                        : { captures: match.slice(1) };

                    // Check if args are valid (e.g. user_jid must exist)
                    if (args === null || args === undefined) continue;

                    // Support both "name" and "handler" for backwards compatibility
                    const handlerName = matcher.name || matcher.handler;
                    console.log(`[TextMatcher] ✓ Pattern found: ${handlerName} (plugin: ${matcher.pluginName})`);
                    return {
                        name: handlerName,
                        args
                    };
                }
            } catch (error: any) {
                console.error(`[TextMatcher] Error in matcher ${matcher.handler}:`, error.message);
            }
        }

        return null;
    }

    /**
     * Returns all tool definitions for the AI
     * @returns {Array}
     */
    getToolDefinitions() {
        return this.toolDefinitions;
    }

    // ========================================================================
    // DYNAMIC TOOL SELECTION (RAG for Tools - Phase 2)
    // ========================================================================

    /**
     * Returns the most relevant tools for a given request
     * Uses semantic search on bot_tools table
     *
     * @param {string} userMessage - User message
     * @param {number} limit - Max tools to return (default: 5)
     * @param {number} fallbackLimit - If RAG fails, how many tools to send (default: 10)
     * @returns {Promise<Array>} - Relevant tool definitions
     *
     * @example
     * const tools = await pluginLoader.getRelevantTools("ban this guy", 5);
     * // Returns the 5 tools closest to "ban"
     */
    async getRelevantTools(userMessage: any, limit: any = 5, fallbackLimit: any = 10, options: any = {}) {
        const { forceModeration } = options;
        // Dynamic import to avoid circular dependencies
        const { supabase } = await import('../services/supabase.js');
        const { container } = await import('../core/ServiceContainer.js');

        // Use EmbeddingsService singleton from container (avoids duplication)
        let embeddings: any = null;
        try {
            if (container.has('embeddings')) {
                embeddings = container.get('embeddings');
                console.log('[PluginLoader] ✅ EmbeddingsService loaded from container (singleton)');
            } else {
                console.warn('[PluginLoader] EmbeddingsService not available in container');
            }
        } catch (e: any) {
            console.warn('[PluginLoader] Error loading EmbeddingsService from container:', e.message);
        }

        if (!supabase || !embeddings) {
            console.warn('[PluginLoader] RAG unavailable, fallback to all tools');
            return this.toolDefinitions.slice(0, fallbackLimit);
        }

        try {
            // 1. Generate user request embedding
            const queryVector = await embeddings.embed(userMessage);

            if (!queryVector) {
                console.warn('[PluginLoader] Request embedding failed, fallback');
                return this.toolDefinitions.slice(0, fallbackLimit);
            }

            // 2. Search for similar tools in bot_tools
            const { data, error } = await supabase.rpc('match_tools', {
                query_embedding: queryVector,
                match_count: limit
            });

            if (error) {
                console.error('[PluginLoader] match_tools error:', error.message);
                return this.toolDefinitions.slice(0, fallbackLimit);
            }

            if (!data || data.length === 0) {
                console.warn('[PluginLoader] No tools found by RAG, fallback to base tools');
                return this.toolDefinitions.filter((t: any) =>
                    t.function && SAFE_FALLBACK_TOOLS.includes(t.function.name)
                );
            }

            // 3. Merge with CORE TOOLS (Always available tools)
            const CORE_TOOLS = [
                'get_my_capabilities', 'send_message', 'send_file', 'use_tool',
                'code_execution', 'execute_bash_command', 'run_scratchpad',
                'get_file_skeleton', 'get_function', 'edit_file', 'read_file',
                'list_directory', 'grep_search',
                'db_document_read', 'db_document_save', 'db_document_search', 'db_document_delete',
                'google_ai_search',
                // WHY: Browser tools must always be available for the Planner.
                // RAG non-determinism causes these to be missing in ~30% of calls,
                // which makes the Planner delete browser-related steps as "hallucinated".
                'browser_screenshot', 'browser_snapshot',
                'browser_open', 'browser_click', 'browser_fill', 'browser_eval',
                'firecrawl_scrape', 'firecrawl_search',
                'start_deep_search', 'spawn_sub_agent'
            ];

            // [SENTIENCE] If AI is angry, arm the system (with renamed tools)
            if (forceModeration) {
                CORE_TOOLS.push('whatsapp_ban_user', 'whatsapp_kick_user', 'whatsapp_mute_user', 'whatsapp_warn_user', 'whatsapp_tagall');
            }

            const coreToolDefs = this.toolDefinitions.filter((t: any) =>
                t.function && CORE_TOOLS.includes(t.function.name)
            );

            // Map RAG tools
            const relevantTools = data.map((tool: any) => tool.definition);

            // Add Core Tools if not already there
            for (const coreTool of coreToolDefs) {
                if (!relevantTools.find((t: any) => t.function.name === coreTool.function.name)) {
                    relevantTools.push(coreTool);
                }
            }

            console.log(`[PluginLoader] 🎯 ${relevantTools.length} tools selected (RAG + Core):`,
                relevantTools.map((t: any) => t.function.name).join(', ')
            );

            return relevantTools;

        } catch (error: any) {
            console.error('[PluginLoader] getRelevantTools error:', error.message);
            return this.toolDefinitions.filter((t: any) =>
                t.function && SAFE_FALLBACK_TOOLS.includes(t.function.name)
            );
        }
    }


    /**
     * Lists all loaded plugins
     * @returns {Array<{name, description, version}>}
     */
    /**
     * Checks tool sync status with Supabase
     * Removes obsolete tools and signals changes
     * @param {Object} supabase - Supabase client
     * @returns {Promise<{deleted: number, new: number, modified: number}>}
     */
    async checkSyncStatus(supabase: any) {
        if (!supabase) return { deleted: 0, new: 0, modified: 0 };

        try {
            // 1. Get current tools (loaded)
            const loadedTools = this.getToolDefinitions();
            const loadedToolHashes = new Map();

            for (const tool of loadedTools) {
                const name = tool.function?.name;
                const description = tool.function?.description || '';
                if (name) {
                    loadedToolHashes.set(name, this._generateToolHash(name, description));
                }
            }

            // 2. Get tools from database
            const { data: dbTools, error } = await supabase
                .from('bot_tools')
                .select('name, description');

            if (error) throw error;

            let deleted = 0;
            let newTools = 0;
            let modified = 0;

            if (dbTools) {
                // 3. Identify and delete obsolete tools
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

                // 4. Identify new and modified tools
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
     * Generates a simple hash to detect changes
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
     * Reloads a specific plugin
     * @param {string} name
     */
    async reload(name: any) {
        const plugin = this.plugins.get(name);
        if (plugin) {
            // Remove old definition
            this.toolDefinitions = this.toolDefinitions.filter(
                (t: any) => t.function?.name !== name
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
