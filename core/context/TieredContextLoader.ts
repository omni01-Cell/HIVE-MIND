// @ts-nocheck
// core/context/TieredContextLoader.js
// ============================================================================
// TIERED CONTEXT LOADER - Chargement contexte à 3 niveaux (HOT/WARM/COLD)
// Objectif: Réduire la latence de chargement de contexte de ~2000ms à ~250ms
// ============================================================================

import { container } from '../ServiceContainer.js';
import { botIdentity } from '../../utils/botIdentity.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { permissionManager } from '../security/PermissionManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// System prompt minimal pour le FastPath
let minimalSystemPrompt = '';
try {
    minimalSystemPrompt = readFileSync(
        join(__dirname, '..', '..', 'persona', 'prompts', 'system.md'), 'utf-8'
    );
} catch {
    minimalSystemPrompt = 'You are a friendly assistant.';
}

/**
 * Loader de contexte tiered pour optimiser la latence
 * 
 * NIVEAU 1 (HOT): ~50ms - Toujours chargé, données ultra-rapides
 * NIVEAU 2 (WARM): ~200ms - Données cachées avec TTL
 * NIVEAU 3 (COLD): ~800ms+ - Données lourdes, seulement pour AgenticPath
 */
export class TieredContextLoader {
    workingMemory: any;
    userService: any;
    groupService: any;
    adminService: any;
    factsMemory: any;
    workspaceMemory: any;
    consciousness: any;
    memory: any;
    browser: any;
    localCache: any;
    authorityCache: any;
    AUTHORITY_CACHE_TTL: any;

    constructor() {
        // Services injectés via container
        this.workingMemory = null;
        this.userService = null;
        this.groupService = null;
        this.adminService = null;
        this.factsMemory = null;
        this.workspaceMemory = null;
        this.consciousness = null;
        this.memory = null;
        this.browser = null;

        // Cache local en mémoire (ultra-rapide)
        this.localCache = {
            botIdentity: { name: botIdentity.fullName }, // minimal keep for fastpath if used elsewhere
            systemPromptTemplate: minimalSystemPrompt
        };

        // Cache des autorités (évite les appels répétés à adminService)
        this.authorityCache = new Map();
        this.AUTHORITY_CACHE_TTL = 600000; // 10 minutes
    }

    /**
     * Initialise les services depuis le container
     * À appeler une fois au démarrage
     */
    init() {
        try {
            this.workingMemory = container.get('workingMemory');
            this.userService = container.get('userService');
            this.groupService = container.get('groupService');
            this.adminService = container.get('adminService');
            this.factsMemory = container.get('facts'); // Correct key is 'facts'
            this.workspaceMemory = container.get('workspace');
            this.consciousness = container.get('consciousness');
            this.memory = container.get('memory');
            this.browser = container.get('browser');

            console.log(`[TieredContext] ✅ Init Success. WM: ${!!this.workingMemory}, Browser: ${!!this.browser}`);
        } catch (e: any) {
            console.error('[TieredContext] ❌ Init Failed:', e.message);
        }
    }

    /**
     * NIVEAU 1: HOT - Données ultra-rapides (~50ms)
     * Redis only + cache local
     */
    async loadHot(chatId: any) {
        const startTime = Date.now();

        // Safety Check
        if (!this.workingMemory) {
            console.warn('[TieredContext] ⚠️ WorkingMemory missing, attempting re-init...');
            this.init();
            if (!this.workingMemory) {
                console.error('[TieredContext] 🛑 CRITICAL: WorkingMemory still missing after re-init.');
                // Fallback fictif pour éviter crash
                return { recentMessages: [], chatMode: 'normal', botIdentity: this.localCache.botIdentity, timestamp: new Date() };
            }
        }

        // Parallélisation des appels Redis
        const [recentMessages, chatMode] = await Promise.all([
            this.workingMemory.getContext(chatId, 5), // 5 derniers messages
            this.workingMemory.getChatMode?.(chatId) || 'normal'
        ]);

        const hotData = {
            recentMessages: recentMessages || [],
            chatMode,
            botIdentity: this.localCache.botIdentity,
            timestamp: new Date()
        };

        console.log(`[TieredContext] HOT chargé en ${Date.now() - startTime}ms`);
        return hotData;
    }

    /**
     * NIVEAU 2: WARM - Données cachées (~200ms)
     * Profil utilisateur + autorité avec cache TTL
     */
    async loadWarm(chatId: any, sender: any, isGroup: any = false) {
        const startTime = Date.now();

        // Vérifier le cache d'autorité local
        const cachedAuthority = this._getCachedAuthority(sender);

        // Parallélisation
        const [userSnapshot, authority, groupBasics] = await Promise.all([
            this._getCachedUserProfile(sender),
            cachedAuthority || this._loadAndCacheAuthority(sender, chatId),
            isGroup ? this._getGroupBasics(chatId) : null
        ]);

        const warmData = {
            userSnapshot,
            authority,
            group: groupBasics,
            systemPromptBase: this._buildMinimalPrompt(userSnapshot, authority, groupBasics)
        };

        console.log(`[TieredContext] WARM chargé en ${Date.now() - startTime}ms`);
        return warmData;
    }

    /**
     * NIVEAU 3: COLD - Données lourdes (~800ms+)
     * Seulement pour AgenticPath
     */
    async loadCold(chatId: any, message: any) {
        const startTime = Date.now();

        // PARALLÉLISATION TOTALE de tous les appels lourds
        const [facts, ragResults, groupMembers, consciousnessState, lessons, workspaceKeys, browserAvailable] = await Promise.all([
            this._loadFacts(message.sender),
            this._loadRAG(chatId, message.text),
            this._loadGroupMembers(chatId),
            this._loadConsciousness(chatId, message.sender),
            this._loadLessons(),
            this._loadWorkspaceKeys(chatId),
            this.browser ? this.browser.isAvailable() : Promise.resolve(false)
        ]);

        const coldData = {
            facts,
            rag: ragResults,
            groupMembers,
            consciousness: consciousnessState,
            lessons,
            workspaceKeys,
            browserAvailable
        };

        console.log(`[TieredContext] COLD chargé en ${Date.now() - startTime}ms`);
        return coldData;
    }

    /**
     * Méthode principale: Charge le contexte selon le mode
     * @param {string} chatId 
     * @param {Object} message 
     * @param {'FAST'|'AGENTIC'} mode 
     */
    async load(chatId: any, message: any, mode: any = 'FAST') {
        const startTime = Date.now();
        const isGroup = chatId?.endsWith('@g.us');

        // HOT est toujours chargé
        const hot = await this.loadHot(chatId);

        // WARM est chargé pour les deux modes
        const warm = await this.loadWarm(chatId, message.sender, isGroup);

        if (mode === 'FAST') {
            // FastPath: Contexte léger uniquement
            const context = this._buildFastContext(hot, warm, message);
            console.log(`[TieredContext] ⚡ FAST context complet en ${Date.now() - startTime}ms`);
            return context;
        }

        // AgenticPath: Charger COLD en plus
        const cold = await this.loadCold(chatId, message);
        const context = this._buildFullContext(hot, warm, cold, message);

        console.log(`[TieredContext] 🧠 FULL context complet en ${Date.now() - startTime}ms`);
        return context;
    }

    // ========================================================================
    // MÉTHODES PRIVÉES - Helpers de chargement
    // ========================================================================

    async _getCachedUserProfile(sender: any) {
        try {
            // Le userService a déjà un cache Redis interne
            const profile = await this.userService.getProfile(sender);
            return {
                jid: sender,
                name: profile.names?.[0] || 'Inconnu',
                interactionCount: profile.interaction_count || 0,
                lastSeen: profile.last_seen
            };
        } catch (e: any) {
            return { jid: sender, name: 'Inconnu', interactionCount: 0 };
        }
    }

    _getCachedAuthority(sender: any) {
        const cached = this.authorityCache.get(sender);
        if (cached && (Date.now() - cached.timestamp) < this.AUTHORITY_CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    async _loadAndCacheAuthority(sender: any, chatId: any) {
        try {
            const [isSuperUser, isGlobalAdmin] = await Promise.all([
                this.adminService.isSuperUser(sender),
                this.adminService.isGlobalAdmin(sender)
            ]);

            const authority = {
                isSuperUser,
                isGlobalAdmin,
                isGroupAdmin: false, // Sera enrichi par groupService si nécessaire
                isBotAdmin: false,
                level: isSuperUser ? 100 : (isGlobalAdmin ? 80 : 0)
            };

            // Mettre en cache
            this.authorityCache.set(sender, {
                data: authority,
                timestamp: Date.now()
            });

            return authority;
        } catch (e: any) {
            return { isSuperUser: false, isGlobalAdmin: false, isGroupAdmin: false, isBotAdmin: false, level: 0 };
        }
    }

    async _getGroupBasics(chatId: any) {
        try {
            // Récupérer seulement les infos essentielles du groupe
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
        } catch (e: any) {
            return null;
        }
    }

    async _loadFacts(sender: any) {
        try {
            return await this.factsMemory.format(sender);
        } catch (e: any) {
            console.warn('[TieredContext] Erreur chargement faits:', e.message);
            return '';
        }
    }

    async _loadRAG(chatId: any, text: any) {
        try {
            const relevantMemories = await this.memory.recall(chatId, text, 3);
            if (relevantMemories?.length > 0) {
                return relevantMemories.map((m: any) => `- ${m.content}`).join('\n');
            }
            return '';
        } catch (e: any) {
            console.warn('[TieredContext] Erreur RAG:', e.message);
            return '';
        }
    }

    async _loadGroupMembers(chatId: any) {
        try {
            if (!chatId?.endsWith('@g.us')) return [];
            return await this.groupService.getGroupMembers(chatId);
        } catch (e: any) {
            return [];
        }
    }

    async _loadConsciousness(chatId: any, sender: any) {
        try {
            return await this.consciousness.getGlobalState(chatId, sender);
        } catch (e: any) {
            return { emotionalState: { mood: 'neutre', annoyance: 0 } };
        }
    }

    async _loadLessons() {
        try {
            const { dreamService } = await import('../../services/dreamService.js');
            return dreamService.getLessons?.() || '';
        } catch (e: any) {
            return '';
        }
    }

    async _loadWorkspaceKeys(chatId: any) {
        try {
            if (!this.workspaceMemory) return [];
            const keys = await this.workspaceMemory.getKeys(chatId);
            return keys || [];
        } catch (e: any) {
            console.warn('[TieredContext] Erreur chargement workspace keys:', e.message);
            return [];
        }
    }

    // ========================================================================
    // MÉTHODES PRIVÉES - Builders de contexte
    // ========================================================================

    _buildMinimalPrompt(userSnapshot: any, authority: any, group: any = null) {
        // 1. STRATE 1 : NOYAU D'IDENTITÉ (Froid, très cachable)
        // La template contient déjà tout le XML d'identité, on ne nettoie plus rien.
        let identityXml = `${this.localCache.systemPromptTemplate.trim()}\n`;

        // 2. STRATE 2 : MOTEUR d'EXÉCUTION (Froid, règles système dures)
        let executionXml = `<execution_engine>\n`;
        executionXml += `### 🛠️ TOOLS AND CAPABILITIES\nYou have native tools (functions) that you can call.\nIMPORTANT: If the user asks about your capabilities, your functions, or if you have a specific tool, **IMMEDIATELY CALL the \`get_my_capabilities\` tool**.\n`;
        executionXml += `\n### 📂 EXECUTION ENVIRONMENT (SANDBOX)\nYou are an agent confined within a secure environment.\n- **Workspace**: \`${permissionManager.sandboxDir}\`\n- **Persistent Memory**: \`${permissionManager.storageDir}\`\nUse only these directories for files.\n`;
        
        executionXml += `\n### ⚡ EXECUTION DIRECTIVES (MANDATORY)\n`;
        executionXml += `- **Actionable request → act NOW in this turn.** Never announce an action if you can execute it directly.\n`;
        executionXml += `- **Continue until finished or blocked.** Do not reply with a plan or promise when a tool can advance the task.\n`;
        executionXml += `- **Weak or empty tool result → vary the query** before concluding failure.\n`;
        executionXml += `- **Mutable facts (git, process, api) require live checks** via tools.\n`;
        executionXml += `- **Long task (>30s) → use \`code_execution\` with \`HIVE.sleepAndWake(delayMs, prompt)\`** to free the LLM loop. Never block.\n`;
        
        executionXml += `\n### 💻 DIRAC CODING PROTOCOL (Refactoring & Code)\n`;
        executionXml += `1. **AST-Native First**: Only use \`read_file\` on a large file as a LAST resort. ALWAYS prefer \`get_file_skeleton\` to understand the structure, then \`get_function\` to target precise code. It is 90% faster.\n`;
        executionXml += `2. **Hash-Anchored Edits**: Lines of code returned by AST tools and \`read_file\` are prefixed by a unique anchor (e.g., \`AppleBanana§    def process():\`).\n`;
        executionXml += `3. **Surgical Editing**: To modify code, use \`edit_file\` providing the **exact anchor** (\`AppleBanana\`) or the full line with the anchor in \`anchor\`. This is highly precise and resilient to line shifts.\n`;
        executionXml += `4. **Multi-File Batching**: Group ALL your file edits in a single \`edit_file\` call via the \`files\` parameter. Do not make separate calls.\n`;

        executionXml += `\n### 🤫 SILENCE TOKEN\nWhen you have called HIVE.sleepAndWake() or have NOTHING to say to the user, reply ONLY with: \`__HIVE_SILENT_7f3a__\`\nThis must be your ONLY text.\n`;
        executionXml += `</execution_engine>\n`;

        // 3. STRATE 3 : CONSCIENCE (Chaud, généré et modifié dynamiquement)
        const now = new Date();
        let baseConsciousnessXml = `<current_consciousness_state>\n`;
        baseConsciousnessXml += `  <timestamp>${now.getTime()}</timestamp>\n`;
        baseConsciousnessXml += `  <datetime>${now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('fr-FR')}</datetime>\n`;
        
        const socialContext = group ? 
            `Location: Group "${group.name}"\nInterlocutor: ${userSnapshot.name}\nStatus: ${authority.isSuperUser ? '👑 SuperUser' : (authority.isGlobalAdmin ? '⭐ Admin' : 'Member')}` :
            `Interlocutor: ${userSnapshot.name}\nStatus: ${authority.isSuperUser ? '👑 SuperUser' : 'Standard'}`;
            
        baseConsciousnessXml += `  <social_context>\n${socialContext}\n  </social_context>\n`;

        // On retourne l'objet destructuré pour permettre à _buildFast et _buildFull de fermer la balise
        return { identityXml, executionXml, baseConsciousnessXml };
    }

    _buildFastContext(hot: any, warm: any, message: any) {
        const { identityXml, executionXml, baseConsciousnessXml } = warm.systemPromptBase;
        
        // Assemblage final FastPath
        const systemPrompt = `${identityXml}\n${baseConsciousnessXml}</current_consciousness_state>\n\n${executionXml}`;

        return {
            systemPrompt,
            recentMessages: hot.recentMessages,
            history: hot.recentMessages.map((m: any) => ({
                role: m.role,
                content: m.content
            })),
            authority: warm.authority,
            userSnapshot: warm.userSnapshot,
            mode: 'FAST'
        };
    }

    _buildFullContext(hot: any, warm: any, cold: any, message: any) {
        let { identityXml, executionXml, baseConsciousnessXml } = warm.systemPromptBase;

        // Helper function to sanitize user input to prevent XML prompt injection
        const sanitizeXml = (str: string) => {
            if (!str) return '';
            return str.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;');
        };

        // Enrichissement progressif du vecteur de conscience
        if (cold.facts) {
            baseConsciousnessXml += `  <factual_memory>\n${sanitizeXml(cold.facts)}\n  </factual_memory>\n`;
        }

        if (cold.rag) {
            baseConsciousnessXml += `  <relevant_memories>\n${sanitizeXml(cold.rag)}\n  </relevant_memories>\n`;
        }

        if (cold.lessons) {
            baseConsciousnessXml += `  <learned_lessons>\n${sanitizeXml(cold.lessons)}\n  </learned_lessons>\n`;
        }

        if (cold.consciousness?.emotionalState) {
            const { mood, annoyance } = cold.consciousness.emotionalState;
            baseConsciousnessXml += `  <emotional_vector>\n    <mood>${mood}</mood>\n    <stress_level>${annoyance}</stress_level>\n  </emotional_vector>\n`;
        }

        // [NOUVEAU] Workspace / Epistemic Memory (Zero-Trust)
        if (cold.workspaceKeys && cold.workspaceKeys.length > 0) {
            const keysList = cold.workspaceKeys.map((k: any) => k.key).join(', ');
            baseConsciousnessXml += `  <available_workspace_documents>\n    ${sanitizeXml(keysList)}\n  </available_workspace_documents>\n`;
            baseConsciousnessXml += `  <workspace_instruction>You have access to these documents. Use \`workspace_read\` to check their content if necessary to accomplish your task.</workspace_instruction>\n`;
        }

        // [BROWSER] Browser Availability
        baseConsciousnessXml += `  <browser_agent_status>\n    <available>${cold.browserAvailable}</available>\n  </browser_agent_status>\n`;

        // [NOUVEAU] Fix #5 : Inner Monologue (reprise du dernier <think>)
        let lastThought = '';
        if (hot.recentMessages && Array.isArray(hot.recentMessages)) {
            // Parcourir de la fin vers le début pour trouver le dernier message de l'assistant
            for (let i = hot.recentMessages.length - 1; i >= 0; i--) {
                const msg = hot.recentMessages[i];
                if (msg.role === 'assistant' && msg.content) {
                    const match = msg.content.match(/<think>([\s\S]*?)<\/think>/);
                    if (match && match[1]) {
                        lastThought = match[1].trim();
                        break;
                    }
                }
            }
        }
        
        if (lastThought) {
            baseConsciousnessXml += `  <inner_monologue>\n    <![CDATA[\n${lastThought}\n    ]]>\n  </inner_monologue>\n`;
        }

        const enrichedAuthority = { ...warm.authority };
        if (cold.groupMembers?.length > 0) {
            const botJid = container.get('transport')?.sock?.user?.id;
            if (botJid) {
                const botMember = cold.groupMembers.find((m: any) =>
                    m.jid?.includes(botJid.split(':')[0]?.split('@')[0])
                );
                enrichedAuthority.isBotAdmin = botMember?.isAdmin || false;

                if (enrichedAuthority.isBotAdmin) {
                    enrichedAuthority.level = Math.max(enrichedAuthority.level, 50); // Level 50 = Moderator
                    enrichedAuthority.botHasControl = true;
                    // L'IA prend conscience de son pouvoir modérateur
                    baseConsciousnessXml += `  <stance_towards_user>You have administration rights in this group. Hostility or banning allowed in case of abuse.</stance_towards_user>\n`;
                }
            }
        }

        // Assemblage final AgenticPath
        const systemPrompt = `${identityXml}\n${baseConsciousnessXml}</current_consciousness_state>\n\n${executionXml}`;

        return {
            systemPrompt,
            recentMessages: hot.recentMessages,
            history: hot.recentMessages.map((m: any) => ({
                role: m.role,
                content: m.content
            })),
            authority: enrichedAuthority,
            userSnapshot: warm.userSnapshot,
            groupMembers: cold.groupMembers,
            consciousness: cold.consciousness,
            mode: 'AGENTIC'
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
