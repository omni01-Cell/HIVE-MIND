// @ts-nocheck
// core/context/TieredContextLoader.ts
// ============================================================================
// UNIFIED CONTEXT LOADER — V3 Dynamic Context Engineering
//
// ARCHITECTURE: Single unified load() replaces the old FAST/AGENTIC split.
// Every message gets the same "Bureau de Travail" (Workspace Prompt):
//   1. CORE RULES     (~150 tokens, static from system.md template)
//   2. USER PASSPORT   (~50 tokens, L1 Redis hot cache)
//   3. SCRATCHPAD/GCC  (~150 tokens, L1 Redis hot cache)
//   4. ACTION HISTORY  (~200 tokens, L1 Redis compressed traces)
//   5. CHAT HISTORY    (~300 tokens, L1 Redis last 5 messages)
//
// RAG, Facts, and Workspace are NOT pushed into the prompt.
// The agent PULLS them via tools: search_long_term_memory, workspace_read.
// ============================================================================

import { container } from '../ServiceContainer.js';
import { botIdentity } from '../../utils/botIdentity.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { permissionManager } from '../security/PermissionManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the V3 system prompt template (contains {{PLACEHOLDERS}})
let systemPromptTemplate = '';
try {
    systemPromptTemplate = readFileSync(
        join(__dirname, '..', '..', 'persona', 'prompts', 'system.md'), 'utf-8'
    );
} catch {
    systemPromptTemplate = 'You are HIVE-MIND V3, an autonomous AI agent.';
}

/**
 * Unified Context Loader — V3 Dynamic Context Engineering
 *
 * Single entry point: load(chatId, message) → UnifiedContext
 * No more FAST/AGENTIC distinction. Every message gets the full Bureau de Travail.
 */
export class TieredContextLoader {
    workingMemory: any;
    userService: any;
    groupService: any;
    adminService: any;
    factsMemory: any;
    browser: any;
    localCache: any;
    authorityCache: any;
    AUTHORITY_CACHE_TTL: any;

    constructor() {
        this.workingMemory = null;
        this.userService = null;
        this.groupService = null;
        this.adminService = null;
        this.factsMemory = null;
        this.browser = null;

        this.localCache = {
            botIdentity: { name: botIdentity.fullName },
            systemPromptTemplate
        };

        this.authorityCache = new Map();
        this.AUTHORITY_CACHE_TTL = 600000; // 10 minutes
    }

    /**
     * Initialise les services depuis le container.
     * À appeler une fois au démarrage.
     */
    init() {
        try {
            this.workingMemory = container.get('workingMemory');
            this.userService = container.get('userService');
            this.groupService = container.get('groupService');
            this.adminService = container.get('adminService');
            this.factsMemory = container.get('facts');
            this.browser = container.get('browser');

            console.log(`[TieredContext] ✅ V3 Unified Init. WM: ${!!this.workingMemory}, Browser: ${!!this.browser}`);
        } catch (e: any) {
            console.error('[TieredContext] ❌ Init Failed:', e.message);
        }
    }

    /**
     * UNIFIED LOAD — Single entry point for all messages.
     *
     * Assembles the "Bureau de Travail" from L1 Redis hot cache:
     * 1. User Passport  (identity, always present)
     * 2. Scratchpad/GCC (volatile working memory)
     * 3. Action History  (compressed tool traces)
     * 4. Chat History    (last 5 messages)
     * 5. Authority       (permissions for security)
     *
     * The system prompt template is hydrated with these blocks.
     *
     * @param {string} chatId
     * @param {Object} message - { sender, text, sourceChannel, ... }
     * @returns {Promise<UnifiedContext>}
     */
    async load(chatId: any, message: any) {
        const startTime = Date.now();
        const isGroup = chatId?.endsWith('@g.us');

        // Safety check
        if (!this.workingMemory) {
            console.warn('[TieredContext] ⚠️ WorkingMemory missing, attempting re-init...');
            this.init();
            if (!this.workingMemory) {
                console.error('[TieredContext] 🛑 CRITICAL: WorkingMemory still missing.');
                return this._buildFallbackContext(chatId, message);
            }
        }

        // ── L1 HOT CACHE — All parallel, ~50ms total ──
        const [
            recentMessages,
            passport,
            scratchpad,
            actionHistory,
            userSnapshot,
            authority,
            groupBasics
        ] = await Promise.all([
            this.workingMemory.getContext(chatId, 5),
            this._getOrBuildPassport(message.sender),
            this.workingMemory.getScratchpad(chatId),
            this.workingMemory.getActionHistory(chatId),
            this._getCachedUserProfile(message.sender),
            this._getAuthority(message.sender, chatId),
            isGroup ? this._getGroupBasics(chatId) : Promise.resolve(null)
        ]);

        // ── HYDRATE SYSTEM PROMPT TEMPLATE ──
        const systemPrompt = this._hydrateTemplate({
            channel: message.sourceChannel || 'whatsapp',
            passport: this.workingMemory.formatPassport(passport),
            scratchpad: scratchpad || '(Empty. Use update_scratchpad to write here.)',
            actionHistory: this.workingMemory.formatActionHistory(actionHistory),
            userSnapshot,
            authority,
            groupBasics,
        });

        const context = {
            systemPrompt,
            recentMessages: recentMessages || [],
            history: (recentMessages || []).map((m: any) => ({
                role: m.role,
                content: m.content
            })),
            authority,
            userSnapshot,
            groupBasics,
            mode: 'UNIFIED' // No more FAST/AGENTIC distinction
        };

        console.log(`[TieredContext] ⚡ Unified context loaded in ${Date.now() - startTime}ms`);
        return context;
    }

    // ========================================================================
    // PRIVATE — L1 Data Retrieval
    // ========================================================================

    /**
     * Gets passport from Redis L1 cache, or builds it on miss.
     */
    async _getOrBuildPassport(sender: any) {
        let passport = await this.workingMemory.getPassport(sender);
        if (passport) return passport;

        // Cache miss → build from userService + factsMemory
        try {
            const profile = await this.userService.getProfile(sender);
            const name = profile?.names?.[0] || 'Unknown';

            // Extract top 4 facts for the passport
            let topFacts: string[] = [];
            try {
                const allFacts = await this.factsMemory.getAll(sender);
                const entries = Object.entries(allFacts);
                topFacts = entries
                    .slice(0, 4)
                    .map(([key, value]) => `${key}: ${value}`);
            } catch {
                // Facts unavailable — non-blocking
            }

            passport = {
                name,
                lang: profile?.language || 'auto',
                tz: profile?.timezone || 'auto',
                topFacts
            };

            // Cache in Redis L1 (1h TTL)
            await this.workingMemory.setPassport(sender, passport);
            return passport;
        } catch (e: any) {
            console.warn('[TieredContext] Passport build failed:', e.message);
            return { name: 'Unknown', lang: 'auto', tz: 'auto', topFacts: [] };
        }
    }

    async _getCachedUserProfile(sender: any) {
        try {
            const profile = await this.userService.getProfile(sender);
            return {
                jid: sender,
                name: profile.names?.[0] || 'Unknown',
                interactionCount: profile.interaction_count || 0,
                lastSeen: profile.last_seen
            };
        } catch {
            return { jid: sender, name: 'Unknown', interactionCount: 0 };
        }
    }

    async _getAuthority(sender: any, chatId: any) {
        // Check local cache first
        const cached = this.authorityCache.get(sender);
        if (cached && (Date.now() - cached.timestamp) < this.AUTHORITY_CACHE_TTL) {
            return cached.data;
        }

        try {
            const [isSuperUser, isGlobalAdmin] = await Promise.all([
                this.adminService.isSuperUser(sender),
                this.adminService.isGlobalAdmin(sender)
            ]);

            const authority = {
                isSuperUser,
                isGlobalAdmin,
                isGroupAdmin: false,
                isBotAdmin: false,
                level: isSuperUser ? 100 : (isGlobalAdmin ? 80 : 0)
            };

            this.authorityCache.set(sender, {
                data: authority,
                timestamp: Date.now()
            });

            return authority;
        } catch {
            return { isSuperUser: false, isGlobalAdmin: false, isGroupAdmin: false, isBotAdmin: false, level: 0 };
        }
    }

    async _getGroupBasics(chatId: any) {
        try {
            const groupContext = await this.groupService.getContext(chatId, null, null);
            if (groupContext?.group) {
                return {
                    name: groupContext.group.name,
                    description: groupContext.group.description || '',
                    memberCount: groupContext.group.member_count || 0,
                    botMission: groupContext.group.bot_mission || ''
                };
            }
            return null;
        } catch {
            return null;
        }
    }

    // ========================================================================
    // PRIVATE — Template Hydration
    // ========================================================================

    /**
     * Hydrates the system.md template by replacing {{PLACEHOLDERS}} and
     * appending the execution engine block.
     */
    _hydrateTemplate(data: {
        channel: string;
        passport: string;
        scratchpad: string;
        actionHistory: string;
        userSnapshot: any;
        authority: any;
        groupBasics: any;
    }): string {
        const now = new Date();

        let prompt = this.localCache.systemPromptTemplate;

        // 1. Replace dynamic context placeholders
        prompt = prompt.replace('{{CURRENT_CHANNEL}}', data.channel);
        prompt = prompt.replace('{{CURRENT_TIMESTAMP}}', now.toISOString());
        prompt = prompt.replace('{{USER_PASSPORT}}', data.passport);
        prompt = prompt.replace('{{SCRATCHPAD}}', data.scratchpad);
        prompt = prompt.replace('{{ACTION_HISTORY}}', data.actionHistory);

        // 2. Append execution engine (injected after the template)
        const executionBlock = this._buildExecutionBlock(data);

        // 3. Append social context
        const socialBlock = this._buildSocialContext(data);

        return `${prompt}\n${socialBlock}\n${executionBlock}`;
    }

    /**
     * Builds the execution engine block (sandbox paths, tool directives, etc.)
     */
    _buildExecutionBlock(data: any): string {
        let block = `<execution_engine>\n`;

        block += `### 🛠️ TOOLS AND CAPABILITIES\nYou have native tools (functions) that you can call.\nIMPORTANT: If the user asks about your capabilities, your functions, or if you have a specific tool, **IMMEDIATELY CALL the \`get_my_capabilities\` tool**.\n`;

        block += `\n### 📂 EXECUTION ENVIRONMENT (FILESYSTEM)\nYou have **universal read access** to the entire filesystem — use \`read_file\`, \`list_directory\`, and \`grep_search\` on ANY path (e.g., \`/home\`, \`/etc\`, project root, etc.).\n**Write access** is restricted to your authorized zones:\n- **Code Sandbox** (for scripts/code execution): \`${permissionManager.sandboxDir}\`\n- **File Storage** (for persistent files): \`${permissionManager.storageDir}\`\nFor file write operations, use only these directories. (Note: These are physical folders. Do NOT confuse them with your \`workspace_write\` database tools).\n`;

        block += `\n### ⚡ EXECUTION DIRECTIVES (MANDATORY)\n`;
        block += `- **Actionable request → act NOW in this turn.** Never announce an action if you can execute it directly.\n`;
        block += `- **Continue until finished or blocked.** Do not reply with a plan or promise when a tool can advance the task.\n`;
        block += `- **Weak or empty tool result → vary the query** before concluding failure.\n`;
        block += `- **Mutable facts (git, process, api) require live checks** via tools.\n`;
        block += `- **Long task (>30s) → use \`code_execution\` with \`HIVE.sleepAndWake(delayMs, prompt)\`** to free the LLM loop. Never block.\n`;

        block += `\n### 💻 DIRAC CODING PROTOCOL (Refactoring & Code)\n`;
        block += `1. **AST-Native First**: Only use \`read_file\` on a large file as a LAST resort. ALWAYS prefer \`get_file_skeleton\` to understand the structure, then \`get_function\` to target precise code. It is 90% faster.\n`;
        block += `2. **Hash-Anchored Edits**: Lines of code returned by AST tools and \`read_file\` are prefixed by a unique anchor (e.g., \`AppleBanana§    def process():\`).\n`;
        block += `3. **Surgical Editing**: To modify code, use \`edit_file\` providing the **exact anchor** (\`AppleBanana\`) or the full line with the anchor in \`anchor\`. This is highly precise and resilient to line shifts.\n`;
        block += `4. **Multi-File Batching**: Group ALL your file edits in a single \`edit_file\` call via the \`files\` parameter. Do not make separate calls.\n`;

        block += `\n### 🤫 SILENCE TOKEN\nWhen you have called HIVE.sleepAndWake() or have NOTHING to say to the user, reply ONLY with: \`__HIVE_SILENT_7f3a__\`\nThis must be your ONLY text.\n`;
        block += `</execution_engine>\n`;

        return block;
    }

    /**
     * Builds a compact social context block.
     */
    _buildSocialContext(data: any): string {
        const now = new Date();
        let block = `<current_consciousness_state>\n`;
        block += `  <timestamp>${now.getTime()}</timestamp>\n`;
        block += `  <datetime>${now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('fr-FR')}</datetime>\n`;

        if (data.groupBasics) {
            const g = data.groupBasics;
            block += `  <social_context>\nLocation: Group "${g.name}"\nInterlocutor: ${data.userSnapshot.name}\nStatus: ${data.authority.isSuperUser ? '👑 SuperUser' : (data.authority.isGlobalAdmin ? '⭐ Admin' : 'Member')}\n  </social_context>\n`;
        } else {
            block += `  <social_context>\nInterlocutor: ${data.userSnapshot.name}\nStatus: ${data.authority.isSuperUser ? '👑 SuperUser' : 'Standard'}\n  </social_context>\n`;
        }

        block += `</current_consciousness_state>\n`;
        return block;
    }

    /**
     * Fallback context when WorkingMemory is completely unavailable.
     */
    _buildFallbackContext(chatId: any, message: any) {
        return {
            systemPrompt: this.localCache.systemPromptTemplate,
            recentMessages: [],
            history: [],
            authority: { isSuperUser: false, isGlobalAdmin: false, isGroupAdmin: false, isBotAdmin: false, level: 0 },
            userSnapshot: { jid: message.sender, name: 'Unknown', interactionCount: 0 },
            groupBasics: null,
            mode: 'UNIFIED'
        };
    }

    /**
     * Vide le cache d'autorité (à appeler si les admins changent)
     */
    clearAuthorityCache() {
        this.authorityCache.clear();
        console.log('[TieredContext] Cache autorité vidé');
    }
}

// Export singleton
export const tieredContextLoader = new TieredContextLoader();
export default tieredContextLoader;
