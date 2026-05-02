// plugins/memory/index.js
// Persistent fact memorization plugin (Option C)
// Allows the AI to memorize, recall, and list information about users

// Lazy loaded services helper
const getServices = async () => {
    const [{ factsMemory, workspaceMemory, semanticMemory }, { workingMemory }] = await Promise.all([
        import('../../../services/memory.js'),
        import('../../../services/workingMemory.js')
    ]);
    return { factsMemory, workspaceMemory, semanticMemory, workingMemory };
};

export default {
    name: 'memory',
    description: 'Persistent memory management - memorize, recall, and list facts about users',
    version: '1.0.0',
    enabled: true,

    // Multiple definitions for function calling
    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'remember_fact',
                description: 'Memorizes an important fact about the user for future recall. Use this when the user asks you to remember something or shares significant personal info.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Fact category (e.g., "name", "city", "job", "birthday", "music_preference")'
                        },
                        value: {
                            type: 'string',
                            description: 'The value to memorize (e.g., "John", "Paris", "Developer", "March 15")'
                        }
                    },
                    required: ['key', 'value']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'recall_fact',
                description: 'Recalls a specific memorized fact about the user. Use this when the user asks if you remember something.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Fact category to recall (e.g., "name", "city", "job")'
                        }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_facts',
                description: 'Lists all known facts about the user. Use this when the user asks what you know about them.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'forget_fact',
                description: 'Forgets a specific fact about the user. Use this when the user asks to forget or remove an information.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Fact category to forget'
                        }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_write',
                description: 'Saves or updates a document in your active workspace (Epistemic Memory). Use for planning, summarizing, or maintaining persistent state.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Unique identifier for the document (e.g., "migration_plan", "user_profile")' },
                        content: { type: 'string', description: 'Complete content of the document (text or JSON)' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering (e.g., ["plan", "urgent"])' }
                    },
                    required: ['key', 'content']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_read',
                description: 'Reads the complete content of a specific document from your active workspace.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Unique identifier of the document to read' }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_search',
                description: 'Semantically searches through all your workspace documents (Epistemic Memory) to find similar concepts.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The question or concept to search for' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by specific tags (optional)' }
                    },
                    required: ['query']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'workspace_delete',
                description: 'Deletes an obsolete document from your workspace.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Unique identifier of the document to delete' }
                    },
                    required: ['key']
                }
            }
        },
        // === V3 DYNAMIC CONTEXT TOOLS ===
        {
            type: 'function',
            function: {
                name: 'update_scratchpad',
                description: 'Overwrites your L1 working memory (GCC Scratchpad visible in your prompt at every turn). Use for short-term state tracking between turns: ongoing task status, waiting conditions, key decisions. For long-term documents, use workspace_write instead. Max 500 chars.',
                parameters: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'New scratchpad content. This REPLACES the current content entirely.' }
                    },
                    required: ['text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'search_long_term_memory',
                description: 'Searches the RAG vector database for past conversations, stored knowledge, and deep context. Use this when the user refers to past events NOT present in your L1 dynamic context (Passport, Scratchpad, Action History). This is a Pull-based retrieval — only call when needed.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Semantic search query describing what you are looking for' }
                    },
                    required: ['query']
                }
            }
        }
    ],

    /**
     * Executes memory tool
     * @param {Object} args - Tool arguments
     * @param {Object} context - Context (transport, message, chatId, sender)
     * @param {string} toolName - Called tool name
     */
    async execute(args: any, context: any, toolName: any) {
        // Defensive destructuring of context
        const { chatId, sender } = context || {};

        if (!chatId) {
            return { success: false, message: 'CONTEXT_ERROR: chatId is required for memory operations.' };
        }

        // Use sender or chatId for personal facts
        const factsChatId = sender || chatId;

        switch (toolName) {
            case 'remember_fact':
                return await this._rememberFact(factsChatId, args.key, args.value);

            case 'recall_fact':
                return await this._recallFact(factsChatId, args.key);

            case 'list_facts':
                return await this._listFacts(factsChatId);

            case 'forget_fact':
                return await this._forgetFact(factsChatId, args.key);

            case 'workspace_write':
                return await this._workspaceWrite(factsChatId, args.key, args.content, args.tags);

            case 'workspace_read':
                return await this._workspaceRead(factsChatId, args.key);

            case 'workspace_search':
                return await this._workspaceSearch(factsChatId, args.query, args.tags);

            case 'workspace_delete':
                return await this._workspaceDelete(factsChatId, args.key);

            case 'update_scratchpad':
                return await this._updateScratchpad(chatId, args.text);

            case 'search_long_term_memory':
                return await this._searchLongTermMemory(chatId, args.query);

            default:
                return { success: false, message: `Unknown tool: ${toolName}` };
        }
    },

    /**
     * Memorizes a fact
     */
    async _rememberFact(chatId: any, key: any, value: any) {
        try {
            const { factsMemory } = await getServices();
            // Normalize the key (lowercase, underscores)
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');

            await factsMemory.remember(chatId, normalizedKey, value);

            return {
                success: true,
                message: `FACT_MEMORIZED: I've noted "${normalizedKey}" = "${value}". I will remember it! 📝`
            };
        } catch (error: any) {
            console.error('[Memory Plugin] Error remember:', error);
            return {
                success: false,
                message: `Memorization error: ${error.message}`
            };
        }
    },

    /**
     * Recalls a fact
     */
    async _recallFact(chatId: any, key: any) {
        try {
            const { factsMemory } = await getServices();
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
            const value = await factsMemory.get(chatId, normalizedKey);

            if (value) {
                return {
                    success: true,
                    message: `FACT_FOUND: ${normalizedKey} = "${value}"`
                };
            } else {
                return {
                    success: false,
                    message: `FACT_UNKNOWN: I have no information on "${key}" for this user.`
                };
            }
        } catch (error: any) {
            console.error('[Memory Plugin] Error recall:', error);
            return {
                success: false,
                message: `Recall error: ${error.message}`
            };
        }
    },

    /**
     * Lists all facts
     */
    async _listFacts(chatId: any) {
        try {
            const { factsMemory } = await getServices();
            const facts = await factsMemory.getAll(chatId);
            const entries = Object.entries(facts);

            if (entries.length === 0) {
                return {
                    success: true,
                    message: `NO_FACTS: I haven't memorized any information for this user yet.`
                };
            }

            const formatted = entries
                .map(([key, value]) => `• ${key}: ${value}`)
                .join('\n');

            return {
                success: true,
                message: `KNOWN_FACTS (${entries.length}):\n${formatted}`
            };
        } catch (error: any) {
            console.error('[Memory Plugin] Error list:', error);
            return {
                success: false,
                message: `Listing error: ${error.message}`
            };
        }
    },

    /**
     * Forgets a fact
     */
    async _forgetFact(chatId: any, key: any) {
        try {
            const { factsMemory } = await getServices();
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');

            // Vérifier si le fait existe
            const existing = await factsMemory.get(chatId, normalizedKey);
            if (!existing) {
                return {
                    success: false,
                    message: `FACT_NOT_FOUND: I had no information on "${key}" to forget.`
                };
            }

            await factsMemory.forget(chatId, normalizedKey);

            return {
                success: true,
                message: `FACT_FORGOTTEN: I've forgotten "${normalizedKey}". This information has been removed. 🗑️`
            };
        } catch (error: any) {
            console.error('[Memory Plugin] Error forget:', error);
            return {
                success: false,
                message: `Forget error: ${error.message}`
            };
        }
    },

    /**
     * Workspace Write
     */
    async _workspaceWrite(chatId: any, key: any, content: any, tags: any) {
        try {
            const { workspaceMemory } = await getServices();
            const success = await workspaceMemory.write(chatId, key, content, tags || []);
            if (success) {
                return { success: true, message: `WORKSPACE_WRITTEN: Document "${key}" saved successfully.` };
            }
            return { success: false, message: `Error saving document "${key}".` };
        } catch (error: any) {
            return { success: false, message: `Internal error: ${error.message}` };
        }
    },

    /**
     * Workspace Read
     */
    async _workspaceRead(chatId: any, key: any) {
        try {
            const { workspaceMemory } = await getServices();
            const doc = await workspaceMemory.read(chatId, key);
            if (doc) {
                return { success: true, message: `WORKSPACE_DOC [${key}]:\n${doc.content}\n\nTags: ${(doc.tags || []).join(', ')}` };
            }
            return { success: false, message: `WORKSPACE_NOT_FOUND: Document "${key}" does not exist.` };
        } catch (error: any) {
            return { success: false, message: `Internal error: ${error.message}` };
        }
    },

    /**
     * Workspace Search
     */
    async _workspaceSearch(chatId: any, query: any, tags: any) {
        try {
            const { workspaceMemory } = await getServices();
            const results = await workspaceMemory.search(chatId, query, tags || []);
            if (results && results.length > 0) {
                const formatted = results.map((r: any) => `- [${r.key}] (Score: ${Math.round(r.similarity*100)}%): ${r.content.substring(0, 200)}...`).join('\n');
                return { success: true, message: `WORKSPACE_SEARCH_RESULTS:\n${formatted}` };
            }
            return { success: true, message: `WORKSPACE_NO_MATCH: No documents found for "${query}".` };
        } catch (error: any) {
            return { success: false, message: `Internal error: ${error.message}` };
        }
    },

    /**
     * Workspace Delete
     */
    async _workspaceDelete(chatId: any, key: any) {
        try {
            const { workspaceMemory } = await getServices();
            const success = await workspaceMemory.delete(chatId, key);
            if (success) {
                return { success: true, message: `WORKSPACE_DELETED: Document "${key}" deleted.` };
            }
            return { success: false, message: `Error deleting "${key}".` };
        } catch (error: any) {
            return { success: false, message: `Internal error: ${error.message}` };
        }
    },

    // === V3 DYNAMIC CONTEXT TOOLS ===

    /**
     * Updates the L1 Redis scratchpad (GCC). Content will appear in the
     * agent's <scratchpad> block at the next turn.
     */
    async _updateScratchpad(chatId: any, text: any) {
        try {
            const { workingMemory } = await getServices();
            if (!text || typeof text !== 'string') {
                return { success: false, message: 'SCRATCHPAD_ERROR: text parameter is required (string).' };
            }

            await workingMemory.setScratchpad(chatId, text);

            return {
                success: true,
                message: `SCRATCHPAD_UPDATED: Your working memory has been updated (${Math.min(text.length, 500)} chars). It will be visible in your <scratchpad> at the next turn.`
            };
        } catch (error: any) {
            return { success: false, message: `SCRATCHPAD_ERROR: ${error.message}` };
        }
    },

    /**
     * Pull-based RAG search. The agent calls this when it needs deep context
     * that is NOT present in its L1 hot cache.
     */
    async _searchLongTermMemory(chatId: any, query: any) {
        try {
            const { semanticMemory } = await getServices();
            if (!query || typeof query !== 'string') {
                return { success: false, message: 'LTM_ERROR: query parameter is required (string).' };
            }

            const results = await semanticMemory.recall(chatId, query, 5);

            if (!results || results.length === 0) {
                return {
                    success: true,
                    message: 'LTM_NO_RESULTS: No relevant memories found for this query.'
                };
            }

            const formatted = results.map((r: any, i: number) => {
                const content = r.formattedContent || r.content;
                return `${i + 1}. [${r.role || 'unknown'}] ${content.substring(0, 300)}`;
            }).join('\n');

            return {
                success: true,
                message: `LTM_RESULTS (${results.length} memories):\n${formatted}`
            };
        } catch (error: any) {
            return { success: false, message: `LTM_ERROR: ${error.message}` };
        }
    }
};
