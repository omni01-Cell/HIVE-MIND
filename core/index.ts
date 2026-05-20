// core/index.js
// Orchestrateur principal du bot - Cerveau central

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';

import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { orchestrator } from './orchestrator.js';
import { eventBus, BotEvents } from './events.js';
import { transportManager } from './transport/TransportManager.js';
import { pluginLoader } from '../plugins/loader.js';
import { providerRouter } from '../providers/index.js';
import { scheduler } from '../scheduler/index.js';
import { extractToolCallsFromText, parseToolArguments } from '../utils/toolCallExtractor.js';
import { isStorable } from '../utils/helpers.js';
import { detectResponseDefects, sanitizeResponse } from '../utils/responseSanitizer.js';
import { validateToolArgs } from '../utils/toolValidator.js';

// [PTC] Programmatic Tool Calling — Pilier D AION
import { ptcExecutor, buildToolFunctions } from '../services/ptc/index.js';
// [WAKE] WakeSystem — Push-based long-running agent tasks (OpenClaw Heartbeat pattern)
import { hiveWakeSystem } from '../services/ptc/WakeSystem.js';
import { mailboxWatcher } from '../services/events/MailboxWatcher.js';
import { startupDisplay } from '../utils/startup.js';

import { botIdentity } from '../utils/botIdentity.js';
import { extractNumericId, jidMatch, formatForDisplay } from '../utils/jidHelper.js';

// DTC Refactor: Inclusion du ServiceContainer
import { container } from './ServiceContainer.js';
import { cli } from './cli.js'; // Interface Ligne de Commande
import type { MessageData, BotEvent } from './types/BotTypes.js';

// Group Manager (filtrage hybride)
let filterProcessor: any = null;
try {
    const groupManager = await import('../plugins/whatsapp/group_manager/index.js');
    filterProcessor = groupManager.default.processor;
} catch (e: any) {
    console.warn('[Core] Group Manager non chargé:', e.message);
}

// Refactoring: Import des handlers modulaires
import { SchedulerHandler, GroupHandler } from './handlers/index.js';
// [V3] Unified Context Engineering
import { tieredContextLoader } from './context/TieredContextLoader.js';
import { permissionManager } from './security/PermissionManager.js';
import { blueprintManager, AgentBlueprint } from './blueprint/AgentBlueprint.js';

// DTC Phase 1: Les admins globaux sont maintenant dans Supabase via adminService
// Le chargement se fait de manière asynchrone dans init()

const __dirname = dirname(fileURLToPath(import.meta.url));

let persona: { name: string; traits?: string[]; interests?: string[]; role?: string };
try {
    persona = JSON.parse(
        readFileSync(join(__dirname, '..', 'persona', 'profile.json'), 'utf-8')
    );
} catch {
    persona = { name: 'Bot', traits: [], interests: [] };
}

// Charger le prompt système
let systemPrompt: string;
let refusalPrompt: string;
try {
    systemPrompt = readFileSync(
        join(__dirname, '..', 'persona', 'prompts', 'system.md'), 'utf-8'
    );
    // Charger le template de refus s'il existe
    refusalPrompt = readFileSync(
        join(__dirname, '..', 'persona', 'prompts', 'refusal.md'), 'utf-8'
    );
} catch {
    systemPrompt = 'You are a friendly assistant.';
    refusalPrompt = 'You are {{name}}. Politely refuse because: {{reason}}.';
}

/**
 * Noyau principal du bot
 */
export class BotCore {

    transport: any;
    isReady: boolean;
    FEEDBACK_TIMEOUT_MS: number;
    QUICK_ACKNOWLEDGMENTS: string[];
    schedulerHandler: any;
    groupHandler: any;
    currentBlueprint: AgentBlueprint;

    constructor() {
        this.transport = transportManager;
        this.isReady = false;

        // Load blueprint with fallback
        try {
            this.currentBlueprint = blueprintManager.loadBlueprint('hive_main');
        } catch (e: any) {
            console.warn('[Core] Failed loading hive_main blueprint, using safe fallback:', e.message);
            this.currentBlueprint = {
                metadata: { id: 'fallback', name: 'Safe Fallback', version: '0.1.0' },
                mindos: { drives: [] },
                action_space: { allowed_tools: ['send_message', 'read_file'] },
                constraints: { read_only_fs: false, max_budget_usd: 1.0, max_iterations: 10 }
            };
        }

        // [FEEDBACK FIRST] Constantes pour réponse rapide < 30s
        this.FEEDBACK_TIMEOUT_MS = 25000; // 25 secondes max avant accusé de réception
        this.QUICK_ACKNOWLEDGMENTS = [
            "Je réfléchis... 🤔",
            "Laisse-moi 2 secondes... 💭",
            "Je cherche ça... 🔍",
            "Hmm, intéressant... 🧐",
            "Un instant... ⏳"
        ];
    }

    // Getters pour accès facile aux services via container
    get db() { return container.get('supabase'); }
    get workingMemory() { return container.get('workingMemory'); }
    get consciousness() { return container.get('consciousness'); }
    get userService() { return container.get('userService'); }
    get groupService() { return container.get('groupService'); }
    get adminService() { return container.get('adminService'); }
    get agentMemory() { return container.get('agentMemory'); }
    get actionMemory() { return container.get('actionMemory'); }
    get factsMemory() { return container.get('facts'); }
    get semanticMemory() { return container.get('memory'); }
    get voiceProvider() { return container.get('voiceProvider'); }
    get quotaManager() { return container.get('quotaManager'); }
    get runtime() { return container.get('runtime'); }

    async _getLiveAudioTools() {
        // Gemini Live API crashes (1011) when setup payload exceeds ~10KB.
        // getRelevantTools() injects 14 CORE_TOOLS — we bypass it entirely.
        // Strategy: 3 hardcoded essentials + 2 RAG-selected tools.

        const HARDCODED_TOOLS = ['send_message', 'google_ai_search', 'get_my_capabilities'];
        const allToolDefs = (pluginLoader as any).toolDefinitions || [];

        // 1. Hardcoded essentials
        const toolsByName = new Map<string, any>();
        for (const tool of allToolDefs) {
            const name = tool?.function?.name;
            if (name && HARDCODED_TOOLS.includes(name)) {
                toolsByName.set(name, tool);
            }
        }

        // 2. Direct RAG query (bypass getRelevantTools to avoid CORE_TOOLS injection)
        try {
            const { supabase } = await import('../services/supabase.js');
            const embeddingsService = container.has('embeddings') ? container.get('embeddings') : null;

            if (supabase && embeddingsService) {
                const queryVector = await (embeddingsService as any).embed('conversation vocale recherche information');
                if (queryVector) {
                    const { data } = await supabase.rpc('match_tools', {
                        query_embedding: queryVector,
                        match_count: 5
                    });

                    if (data && data.length > 0) {
                        let added = 0;
                        for (const match of data) {
                            const name = match.definition?.function?.name;
                            if (name && !toolsByName.has(name) && added < 2) {
                                toolsByName.set(name, match.definition);
                                added++;
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            console.warn('[GeminiLive] RAG fallback: direct query failed:', e.message);
        }

        const tools = Array.from(toolsByName.values());
        console.log(`[GeminiLive] 🔧 ${tools.length} tools for Live: ${tools.map((t: any) => t.function.name).join(', ')}`);
        return tools;
    }

    async _executeLiveTool(name: string, args: any, message: any, availableTools: any[], authority: any) {
        // [GLOBAL RETRY AND DEFENSE SYSTEM] Pre-execution argument validation (Layer A)
        const validation = validateToolArgs(name, JSON.stringify(args || {}), availableTools);
        if (!validation.valid) {
            console.warn(`[GeminiLive] ⚠️ Missing required params for "${name}": [${validation.missing.join(', ')}]`);
            return {
                success: false,
                error: 'MISSING_REQUIRED_PARAMETERS',
                message: `TOOL_CALL_REJECTED: Tool "${name}" is missing required parameters: [${validation.missing.join(', ')}]. `
                    + `You MUST retry this tool call immediately with ALL required parameters filled. `
                    + `Expected schema: ${JSON.stringify(validation.schema, null, 0)}`,
                missing_params: validation.missing
            };
        }

        if (name === 'code_execution') {
            console.log('[PTC] ⚡ Exécution programmatique déclenchée via Gemini Live');
            const code = args?.code;
            if (!code || typeof code !== 'string') {
                return { success: false, error: 'code_execution requires a string "code" argument.' };
            }

            const chatId = message.chatId;
            const toolFns = buildToolFunctions(
                availableTools,
                (toolName: string, toolArgs: any, ctx: any) => pluginLoader.execute(toolName, toolArgs, ctx),
                {
                    transport: this.transport,
                    message,
                    chatId,
                    sender: message.sender,
                    sourceChannel: message.sourceChannel,
                    onProgress: (status: string) => {
                        eventBus.publish(BotEvents.TOOL_PROGRESS, { tool: 'code_execution', status, chatId });
                    },
                }
            );

            try {
                const hiveBridge = hiveWakeSystem.buildHiveBridge(chatId);
                hiveWakeSystem.registerWakeCallback(chatId, async (wakeEvent) => {
                    console.log(`[WakeSystem] ⏰ Réveil contextuel pour chatId=${chatId}`);
                    await this._onMessage({
                        chatId: wakeEvent.chatId,
                        sender: 'system@wake',
                        senderName: 'WAKE_SYSTEM',
                        text: `[WAKE_EVENT] ${wakeEvent.prompt}`,
                        isGroup: wakeEvent.chatId?.endsWith('@g.us') ?? false,
                        isSystem: true,
                        sourceChannel: 'internal',
                    } as any);
                });

                const ptcResult = await ptcExecutor.execute(code, toolFns, hiveBridge);
                if (ptcResult.metadata.sleepScheduled) {
                    const sleep = ptcResult.metadata.sleepScheduled;
                    return {
                        success: true,
                        type: 'SLEEP_SCHEDULED',
                        message: sleep.message,
                        wakeEventId: sleep.wakeEventId,
                        wakeAtMs: sleep.wakeAtMs,
                    };
                }
                return ptcResult;
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        }

        return this._safeExecuteTool(
            { id: `live_${Date.now()}`, function: { name, arguments: JSON.stringify(args || {}) } },
            { chatId: message.chatId, message, authority }
        );
    }

    /**
     * Initialise tous les composants
     */
    async init() {
        if (this.isReady) return;

        // Configuration dynamique des modules pour la barre de progression
        startupDisplay.setModules([
            { id: 'config', name: 'Configuration', icon: '⚙️' },
            { id: 'redis', name: 'Redis Cloud', icon: '🔴' },
            { id: 'supabase', name: 'Supabase DB', icon: '🗄️' },
            { id: 'plugins', name: 'Plugins', icon: '🔌' },
            { id: 'scheduler', name: 'Scheduler', icon: '⏰' },
            { id: 'reflection', name: 'Intelligence', icon: '🧠' },
            { id: 'transport', name: 'Connexion WhatsApp', icon: '📱' }
        ]);

        startupDisplay.showLogo();

        // 0. DTC Refactor: Initialiser le ServiceContainer (Config)

        startupDisplay.loading('config');
        try {
            await container.init();
            this.transport.setContainer(container); // Injecter le container dans le transport
            container.register('transport', this.transport); // [FIX] Enregistrer le transport pour TieredContextLoader
            tieredContextLoader.init(); // [FIX] Initialiser le chargeur de contexte explicitement
            startupDisplay.success('config');
        } catch (e: any) {
            startupDisplay.error('config', e.message);
        }

        // Redis & Supabase (via container)
        startupDisplay.loading('redis');
        try {
            const redisMemory = container.get('workingMemory');
            const redisHealth = await redisMemory.checkHealth();
            if (redisHealth.status === 'connected' || redisHealth.status === 'healthy') {
                startupDisplay.success('redis', 'connected');
            } else {
                startupDisplay.error('redis', redisHealth.error || `Status: ${redisHealth.status}`);
            }
        } catch (e: any) {
            startupDisplay.error('redis', e.message);
        }

        startupDisplay.loading('supabase');
        try {
            const supabaseService = container.get('supabase');
            // Test via checkHealth
            const supaHealth = await supabaseService.checkHealth();
            if (supaHealth.status === 'connected') {
                startupDisplay.success('supabase', 'service_role');
            } else {
                startupDisplay.error('supabase', supaHealth.error || 'non connecté');
            }
        } catch (e: any) {
            startupDisplay.error('supabase', e.message);
        }

        // 1. Charger les plugins

        startupDisplay.loading('plugins');
        try {
            const loadedPlugins = await pluginLoader.loadAll();

            // Sync check
            const supabase = container.get('supabase');
            const syncStatus = await pluginLoader.checkSyncStatus(supabase);
            let syncDetails = `${loadedPlugins?.size || 0} loaded`;

            if (syncStatus.deleted > 0 || syncStatus.new > 0 || syncStatus.modified > 0) {
                const parts = [];
                if (syncStatus.new > 0) parts.push(`+${syncStatus.new} new`);
                if (syncStatus.modified > 0) parts.push(`~${syncStatus.modified} mod`);
                if (syncStatus.deleted > 0) parts.push(`-${syncStatus.deleted} del`);
                syncDetails += ` [${parts.join(', ')}]`;

                // --- Auto-Sync pour indexer les nouveaux/modifiés ---
                const skipSync = process.env.APP_ENV === 'local' || process.env.NODE_ENV === 'test';
                if (!skipSync && (syncStatus.new > 0 || syncStatus.modified > 0)) {
                    try {
                        const embeddings = container.get('embeddings');
                        const tools = pluginLoader.getToolDefinitions();
                        let indexed = 0;
                        for (const tool of tools) {
                            const toolName = tool.function?.name;
                            if (!toolName) continue;
                            const vector = await embeddings.embed(`${toolName}: ${tool.function?.description}`);
                            if (vector) {
                                const { error } = await supabase.from('bot_tools').upsert({
                                    name: toolName, plugin_name: toolName.split('_')[0],
                                    description: tool.function?.description, definition: tool, embedding: vector
                                }, { onConflict: 'name' });
                                if (!error) indexed++;
                            }
                        }
                        syncDetails += ` (Synched: ${indexed})`;
                    } catch (syncErr: any) {
                        console.warn('[Core] Erreur auto-sync plugins:', syncErr.message);
                    }
                }
            }

            startupDisplay.success('plugins', syncDetails);

        } catch (e: any) {
            startupDisplay.error('plugins', e.message);
        }

        // 2. Enregistrer les handlers d'événements
        this._registerHandlers();

        // 3. Initialiser le scheduler
        startupDisplay.loading('scheduler');
        try {
            scheduler.init();
            startupDisplay.success('scheduler');
        } catch (e: any) {
            startupDisplay.error('scheduler', e.message);
        }

        // [WAKE] Démarrer le WakeSystem (Heartbeat 5s pour tâches longue durée)
        hiveWakeSystem.start();
        // Démarrer la surveillance de la boîte de réception d'événements
        mailboxWatcher.start();
        // Enregistrer le callback global : quand un Wake Event expire, re-injecter
        // le prompt dans la boucle comme si c'était un nouveau message entrant.
        hiveWakeSystem.on('wake', async (event: any) => {
            console.log(`[WakeSystem] ⏰ Réveil générique pour chatId=${event.chatId}, prompt="${event.prompt.slice(0, 60)}..."`);
            // Ré-injecter comme message système dans la boucle principale
            await this._onMessage({
                chatId: event.chatId,
                sender: 'system@wake',
                senderName: 'WAKE_SYSTEM',
                text: `[WAKE_EVENT] ${event.prompt}`,
                isGroup: event.chatId?.endsWith('@g.us') ?? false,
                isSystem: true,
                sourceChannel: 'internal',
            } as any);
        });

        // 4. [LEVEL 5] Initialiser le Feedback et Auto-Apprentissage
        startupDisplay.loading('reflection');
        try {
            const { feedbackService } = await import('../services/feedbackService.js');
            feedbackService.init();
            startupDisplay.success('reflection', 'feedback active');
        } catch (e: any) {
            startupDisplay.error('reflection', e.message);
        }


        // 6. Connecter le transport
        startupDisplay.loading('transport');
        try {
            let activeTransports = process.env.ACTIVE_TRANSPORTS ? process.env.ACTIVE_TRANSPORTS.split(',') : ['whatsapp'];

            // Environment Detection Logic
            const appEnv = process.env.APP_ENV || 'local';

            if (appEnv === 'server' || !process.stdin.isTTY) {
                console.log(`[Core] 🌐 Mode ${appEnv === 'server' ? 'SERVEUR' : 'NON-TTY'} (Headless). CLI désactivée.`);
                activeTransports = activeTransports.filter(t => t !== 'cli' && t !== 'ink-cli');
            } else if (appEnv === 'local' && !activeTransports.includes('ink-cli')) {
                console.log('[Core] 💻 Mode LOCAL. Activation de la CLI (Ink).');
                activeTransports.push('ink-cli');
            }

            await this.transport.initialize(activeTransports);
            startupDisplay.success('transport', `Connecté (${activeTransports.join(', ')})`);
        } catch (e: any) {
            startupDisplay.error('transport', e.message);
        }

        // 6. Configurer les callbacks
        this.transport.onMessage((msg: any) => this._onMessage(msg));
        this.transport.onGroupEvent((event: any) => this._onGroupEvent(event));

        // 7. [PHASE 3] Résilience: Vérifier les tâches interrompues
        await this._resumePendingActions();

        this.isReady = true;
        startupDisplay.complete(persona.name);
    }

    /**
     * Enregistre les handlers pour l'orchestrateur
     */
    _registerHandlers() {
        // Initialiser les handlers modulaires
        this.schedulerHandler = new SchedulerHandler(this.transport);
        this.schedulerHandler.setMessageHandler(this._handleMessage.bind(this));

        this.groupHandler = new GroupHandler(this.transport);
        this.groupHandler.setWelcomeHandler(this._handleGroupWelcome.bind(this));

        // Enregistrement des handlers dans l'orchestrateur
        orchestrator.registerHandler('message', async (event: any) => {
            await this._handleMessage(event as BotEvent);
        });

        orchestrator.registerHandler('scheduled', async (event: any) => {
            // Déléguer au handler modulaire
            await this.schedulerHandler.handleJob(event);
        });

        orchestrator.registerHandler('proactive', async (event: any) => {
            await this._handleProactive(event as BotEvent);
        });

        orchestrator.registerHandler('group_event', async (event: any) => {
            // Déléguer au handler modulaire
            await this.groupHandler.handleEvent(event);
        });
    }

    /**
     * Callback sur réception de message
     */
    async _onMessage(message: MessageData) {
        const { workingMemory } = this;
        if (!message.text?.trim()) return;


        // [GOAL SEEKING] Tracker l'activité du groupe
        if (message.isGroup) {
            workingMemory.trackGroupActivity(message.chatId).catch(() => { });
        }

        // VERIFICATION MUTE (Silence)
        // Si l'utilisateur est mute dans ce groupe, on ignore totalement
        if (message.isGroup) {
            const isMuted = await workingMemory.isMuted(message.chatId, message.sender);
            if (isMuted) {
                console.log(`[Core] Message ignoré (User Muted): ${message.sender} dans ${message.chatId}`);
                return;
            }
        }

        orchestrator.enqueue({
            type: 'message',
            chatId: message.chatId,
            data: message,
            priority: 1
        } as any);
    }

    _onGroupEvent(event: any) {
        orchestrator.enqueue({
            type: 'group_event',
            chatId: event.groupId,
            data: event,
            priority: 3
        } as any);
    }

    /**
     * (Module 3) Logique de Bienvenue & Roadmap
     */
    async _handleGroupWelcome(event: BotEvent) {
        const { db } = this;
        const { groupId, participants, action } = event.data;

        if (action !== 'add') return;

        // 1. Récupérer la config du groupe
        const config = await db.getGroupConfig(groupId);

        // 2. Message de bienvenue personnalisé ou défaut
        const welcomeTemplate = config?.welcome_message || `Bienvenue @user !`;

        for (const participant of participants) {
            const userJid = participant;
            const userName = userJid.split('@')[0];

            const message = welcomeTemplate
                .replace('@user', `@${userName}`);

            await this.transport.sendText(groupId, message, {
                mentions: [userJid]
            });
        }
    }

    /**
     * (Fix 1) Détermine si le bot est sollicité
     */
    _isBotMentioned(message: MessageData, text: string) {
        // 1. MP (Message Privé)
        if (!message.isGroup) return true;

        // 2. Récupérer TOUS les identifiants du bot (JID téléphone + LID)
        // WHY: sock.user can be temporarily undefined during WhatsApp reconnection.
        // We cache the last known values to survive transient disconnections.
        const rawBotId = this.transport.sock?.user?.id;
        const botLid = this.transport.sock?.user?.lid;

        // Cache on first successful read (survives reconnection windows)
        if (rawBotId) (this as any)._cachedBotId = rawBotId;
        if (botLid) (this as any)._cachedBotLid = botLid;

        const effectiveBotId = rawBotId || (this as any)._cachedBotId;
        const effectiveBotLid = botLid || (this as any)._cachedBotLid;

        // WHY: Modern WhatsApp uses LID-based identifiers in mentionedJid and
        // contextInfo.participant. sock.user.lid is often NOT populated by Baileys.
        // We resolve the bot's LID from the userService identity map as a fallback,
        // so that LID-based @mentions and quoted-message checks actually work.
        let resolvedBotLid = effectiveBotLid;
        if (!resolvedBotLid && effectiveBotId) {
            try {
                const userSvc = this.userService;
                if (userSvc?.getLidForJid) {
                    const lid = userSvc.getLidForJid(effectiveBotId);
                    if (lid) {
                        resolvedBotLid = lid;
                        (this as any)._cachedBotLid = lid;
                    }
                }
            } catch {
                // Non-critical: if userService is unavailable, we continue with what we have
            }
        }

        if (!effectiveBotId && !resolvedBotLid) {
            console.warn('[Core] ⚠️ Bot identity unavailable (socket reconnecting?), falling back to name detection only');
        }

        const botPhoneId = extractNumericId(effectiveBotId);
        const botLidId = extractNumericId(resolvedBotLid);

        const mentionedJids = (message as any).mentionedJids || [];

        // 2a. Vérifier si le bot est mentionné via son numéro de téléphone OU son LID
        for (const jid of mentionedJids) {
            if (jidMatch(jid, effectiveBotId) || jidMatch(jid, resolvedBotLid)) {
                console.log(`[DEBUG] ✓ Détecté via @mention (jid=${jid})`);
                return true;
            }
        }

        // 2b. Fallback: JID visible dans le texte
        if (botPhoneId && text.includes(botPhoneId)) {
            return true;
        }
        if (botLidId && text.includes(botLidId)) {
            return true;
        }

        // 3. Réponse à un message du bot (Quoted)
        // WHY: Uses effectiveBotId/resolvedBotLid (cached) instead of raw values
        // to survive socket reconnection windows where sock.user is temporarily undefined.
        if (message.quotedMsg) {
            console.log(`[DEBUG QuotedMsg] sender=${message.quotedMsg.sender}, text="${message.quotedMsg.text?.substring(0, 30)}..."`);
        }

        if (message.quotedMsg?.sender) {
            if (jidMatch(message.quotedMsg.sender, effectiveBotId) || jidMatch(message.quotedMsg.sender, resolvedBotLid)) {
                console.log('[DEBUG] ✓ Détecté via quotedMsg (jidMatch)');
                return true;
            }
        }

        // 4. Mention par Nom (dynamique via botIdentity)
        if (botIdentity.isMentioned(text)) {
            console.log('[DEBUG] ✓ Détecté via nom (botIdentity)');
            return true;
        }

        console.log('[DEBUG] ✗ Bot NON mentionné');
        return false;
    }

    /**
     * Traite un message
     */
    async _handleMessage(event: BotEvent): Promise<void> {
        const { db, workingMemory, consciousness, userService, groupService, adminService, factsMemory, semanticMemory } = this;
        const message = event.data;
        const { chatId, sender, senderName, text, isGroup } = message;


        if (chatId === 'status@broadcast' || chatId?.endsWith('@broadcast')) {
            return; // Silently ignore
        }

        console.log(`[${isGroup ? 'G' : 'P'}] ${senderName}: ${text.substring(0, 50)}...`);

        // ======== (PHASE 4) AUTONOMOUS EVENT TRIGGERS (Wait For X) ========
        // Vérifier si ce message débloque un objectif en attente
        try {
            const { goalsService } = await import('../services/goalsService.js');
            const triggeredGoals = await goalsService.checkEventTriggers(message);

            if (triggeredGoals.length > 0) {
                console.log(`[EventTrigger] 🎯 ${triggeredGoals.length} objectif(s) déclenché(s) par ce message !`);
                for (const goal of triggeredGoals) {
                    // Marquer comme en cours
                    await goalsService.markInProgress(goal.id);

                    // Injecter le message système pour forcer l'exécution
                    // On simule un message système qui arrive immédiatement après
                    setTimeout(async () => {
                        await this._onMessage({
                            isGroup: goal.target_chat_id ? goal.target_chat_id.endsWith('@g.us') : false,
                            chatId: goal.target_chat_id,
                            text: `SYSTEM_GOAL_TRIGGER: L'objectif "${goal.title}" a été déclenché par un événement (Reçu message de ${senderName}).\nConsigne: ${goal.description}\nPriorité: ${goal.priority}`,
                            senderName: "SYSTEM_EVENT_LISTENER",
                            sender: "system@internal",
                            isSystem: true
                        } as any);
                    }, 500); // Petit délai pour laisser traiter le message courant
                }
            }
        } catch (e: any) {
            console.error('[EventTrigger] Erreur vérification:', e.message);
        }

        // ========== VELOCITY TRACKING (Adaptive Reply System) ==========
        // Tracker ce message pour le calcul de vélocité du chat
        if (isGroup) {
            workingMemory.trackMessage(chatId, sender).catch(() => { });
        }

        // ======== IDENTITY LINKING (Aggressive) ========
        // Lier le LID au JID si disponible (Critique pour que le bot reconnaisse les admins)
        // ======== IDENTITY LINKING (Aggressive) ========
        // Lier le LID au JID si disponible via le message brut
        if (message.sender && message.raw) {
            try {
                const userService = container.get('userService');
                if (userService) {
                    const rawKey = message.raw.key || {};
                    // Dans les groupes modernes, key.participant est souvent le LID
                    // message.sender est normalisé, donc ça dépend de Baileys

                    const candidate1 = message.sender;
                    const candidate2 = rawKey.participant;

                    if (candidate1 && candidate2 && candidate1 !== candidate2) {
                        let jid: any = null;
                        let lid: any = null;

                        if (candidate1.endsWith('@s.whatsapp.net')) jid = candidate1;
                        if (candidate1.endsWith('@lid')) lid = candidate1;

                        if (candidate2.endsWith('@s.whatsapp.net')) jid = candidate2;
                        if (candidate2.endsWith('@lid')) lid = candidate2;

                        if (jid && lid) {
                            // On a trouvé une paire JID/LID !
                            console.log(`[Identity] 🔗 LINK DÉTECTÉ: ${jid} ↔ ${lid}`);
                            userService.registerLid(jid, lid).catch(() => { });
                        }
                    }
                }
            } catch (e: any) {
                console.warn('[Identity] Erreur linking:', e.message);
            }
        }

        // ======== COMMANDES TEXTUELLES PLUGINS (ex: .shutdown, .devcontact) ========
        // Le système générique permet à tout plugin de définir des commandes textuelles
        const textCommand = pluginLoader.findTextHandler(text, message);
        if (textCommand) {
            console.log(`[Core] ⌨️ Commande textuelle détectée: ${textCommand.name}`);

            // Exécution directe via le plugin concerné
            // Le loader s'occupe de router vers le bon plugin execute()
            const result = await pluginLoader.execute(textCommand.name, textCommand.args, {
                transport: this.transport,
                message,
                chatId,
                sender,
                isGroup
            });

            // Si le plugin retourne un message, on l'envoie
            if (result && result.message) {
                await this.transport.sendText(chatId, result.message);
            }
            return; // On arrête le flux ici, pas d'IA si c'est une commande
        }

        // ======== INTERCEPTION PERMISSION MANAGER — Admin Hub (.approve/.reject) ========
        if (text.startsWith('.approve') || text.startsWith('.reject')) {
            if (permissionManager.handleAdminCommand(text)) {
                console.log(`[Core] 🏢 Commande Admin Hub consommée par le PermissionManager`);
                return;
            }
        }

        // ======== INTERCEPTION PERMISSION MANAGER — In-Band (oui/non) ========
        if (permissionManager.handleUserResponse(text)) {
            console.log(`[Core] 🛡️ Message consommé par le PermissionManager (In-Band)`);
            return;
        }

        // ======== COMMANDES .TASK (Group Manager) ========
        if (text.toLowerCase().startsWith('.task') && isGroup) {
            const groupManager = pluginLoader.get('group_manager');
            if (groupManager) {
                const parsed = (groupManager as any).parseTextCommand(text);
                if (parsed) {
                    console.log(`[Core] Commande .task détectée: ${parsed.name}`);
                    const result = await groupManager.execute(parsed.args, {
                        transport: this.transport,
                        message,
                        chatId,
                        sender
                    }, parsed.name);

                    await this.transport.sendText(chatId, result.message);
                    return; // Arrêt ici, pas d'IA
                }
            }
        }

        // ======== FILTRAGE GROUPE (avant IA, économique) ========
        if (isGroup && filterProcessor) {
            try {
                const filterResult = await filterProcessor.process(message, this.transport);
                if (filterResult?.action) {
                    console.log(`[Filter] Action exécutée: ${filterResult.action}`);
                    // Le message a été traité par le filtre, on n'appelle pas l'IA
                    return;
                }
            } catch (e: any) {
                console.error('[Filter] Erreur:', e.message);
            }
        }

        // (Fix 1) Utilisation de la nouvelle méthode de détection
        const mentionsBot = this._isBotMentioned(message, text);
        const isPrivate = !isGroup;

        // NOUVEAU: Détecter si c'est une image adressée au bot
        const hasImage = message.mediaType === 'image';
        const hasQuotedImage = message.quotedMsg?.hasImage;
        const isImageForBot = hasImage && (isPrivate || mentionsBot || message.quotedMsg?.sender === this.transport.sock?.user?.id);

        // ========== CONTEXTUAL CONVERSATION (Follow-up Mode) ==========
        // Si l'utilisateur est le dernier à avoir parlé au bot (et qu'on est en mode solo/calme)
        // On considère qu'il parle toujours au bot, même sans mention
        let isContextualReply = false;

        if (isGroup && !mentionsBot) {
            const lastInteraction = await workingMemory.getLastInteraction(chatId);
            const velocity = await workingMemory.getChatVelocity(chatId);

            // Si c'est le même utilisateur, il y a moins de 2 min, et personne d'autre n'est actif
            if (lastInteraction &&
                lastInteraction.user === sender &&
                (Date.now() - lastInteraction.timestamp) < 120000 && // 2 minutes
                velocity.uniqueSenders <= 1
            ) {
                console.log(`[Core] 🗣️ Conversation Suivie détectée (User: ${senderName})`);
                isContextualReply = true;
            }
        }

        let hasInterest = false;
        if (!mentionsBot && !isPrivate && !isContextualReply && !isImageForBot) {
            const interests = persona.interests || [];
            hasInterest = interests.some((topic: any) => text.toLowerCase().includes(topic.toLowerCase()));

            // Si aucun critère n'est rempli, on ignore
            if (!hasInterest) return;
        }

        // DTC Phase 1: Enregistrer l'interaction via userService (unifie LowDB + Supabase)
        await userService.recordInteraction(sender, senderName, isGroup ? chatId : null);

        // 2. Tracking Groupe (Stats Spécifiques) - NOUVEAU
        if (isGroup) {
            // Pas besoin d'attendre (fire and forget)
            const groupService = container.get('groupService');
            groupService.trackActivity(chatId, sender).catch(console.error);
        }

        // 1. Mémoire de travail (Redis) avec identification speaker pour les groupes
        if (isGroup) {
            const speakerHash = await userService.getSpeakerHash(sender);
            await workingMemory.addMessage(chatId, 'user', text, speakerHash, senderName);
        } else {
            await workingMemory.addMessage(chatId, 'user', text);
        }

        // 2. Mémoire sémantique
        if (isStorable(text, 'user')) {
            // Mémoire Sémantique (RAG) via DI
            const memory = container.get('memory');
            memory.store(chatId, text, 'user', { msgId: message.id }).catch(console.error);
        }

        // Indicateur de frappe
        await this.transport.setPresence(chatId, 'composing', message.sourceChannel);

        // [FEEDBACK FIRST] Variables de contrôle pour la réponse rapide
        let feedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
        const feedbackState = { sent: false };

        try {
            // ========== GESTION AUDIO NATIF (Gemini Live) ==========
            // Si le message a été marqué par Baileys comme devant utiliser le mode natif
            if (message.useNativeAudio) {
                console.log('[Core] 🎙️ Traitement Audio Natif (Gemini Live)');

                if (container.has('geminiLiveProvider')) {
                    const geminiLive = container.get('geminiLiveProvider');
                    const hiveCfg = container.get('config');

                    // Construire le contexte via le loader unifié V3
                    const context: any = await tieredContextLoader.load(chatId, message);

                    const relevantTools = await this._getLiveAudioTools();

                    // Définir l'executor pour que le Provider puisse appeler les tools du Bot
                    geminiLive.toolExecutor = async (name: any, args: any) => {
                        console.log(`[Core] 🛠️ Exécution tool via Live: ${name}`);
                        return await this._executeLiveTool(name, args, message, relevantTools, context.authority);
                    };

                    let response: any = null;
                    try {
                        // Appel Streaming vers Gemini Live
                        response = await geminiLive.processAudioWithTools({
                            audioBuffer: message.audioBuffer,
                            systemPrompt: context.systemPrompt,
                            tools: relevantTools,
                            conversationHistory: (context.history || []).slice(-5), // Limite contexte audio
                            voice: hiveCfg.models?.reglages_generaux?.audio_strategy?.native_voice || 'Aoede'
                        });
                    } catch (apiError: any) {
                        console.error('[Core] ❌ Erreur API Gemini Live:', apiError.message);
                        await this.transport.sendText(chatId, "⚠️ Une erreur technique s'est produite avec l'API vocale (timeout ou déconnexion). Peux-tu reformuler ?");
                        return;
                    }

                    // 1. Envoyer la réponse AUDIO
                    if (response.audioFile) {
                        try {
                            // On envoie le fichier audio (converti en OGG par le provider ou baileys?)
                            // Wait, geminiLiveProvider save en PCM actuellement.
                            // Il faut le convertir en OGG ici ou dans le provider.
                            // Le provider renvoie 'audioFile' (PCM). Baileys sendVoice attend un OGG/MP3 souvent.
                            // Baileys sendVoice: { audio: { url: path }, mimetype: 'audio/mp4', ptt: true }
                            // Il faut convertir PCM -> OGG/MP3. 

                            // Import dynamique du converter
                            const converter = await import('../services/audio/audioConverter.js');
                            const fs = await import('fs');
                            const path = await import('path');

                            const outputOgg = response.audioFile.replace('.pcm', '.ogg');
                            await converter.convertPcmToOgg(response.audioFile, outputOgg);

                            await this.transport.sendVoiceNote(chatId, { url: outputOgg });

                            // Nettoyage
                            setTimeout(() => {
                                try { fs.unlinkSync(response.audioFile); } catch (e: any) { }
                                try { fs.unlinkSync(outputOgg); } catch (e: any) { }
                            }, 10000);

                        } catch (e: any) {
                            console.error('[Core] ❌ Erreur envoi vocal natif:', e.message);
                        }
                    } else if (response.transcribedText) {
                        // Fallback texte si pas d'audio généré
                        await this.transport.sendText(chatId, response.transcribedText);
                    } else if (response.toolCalls && response.toolCalls.length > 0) {
                        // Tools were executed but no voice/text response — action completed silently
                        console.log(`[Core] 🛠️ Live: ${response.toolCalls.length} tool(s) exécuté(s), pas de réponse vocale (normal pour les actions).`);
                    } else {
                        // Genuinely empty response — log but don't spam the user
                        console.warn('[Core] ⚠️ Live: aucune réponse (ni audio, ni texte, ni tool). Possible timeout côté modèle.');
                    }

                    // 2. Stocker en mémoire (texte transcrit par Gemini)
                    if (response.transcribedText) {
                        await workingMemory.addMessage(chatId, 'assistant', response.transcribedText);
                    }

                    return; // Fin du traitement natif, on arrête ici.
                } else {
                    console.warn('[Core] ⚠️ Flag useNativeAudio actif mais provider manquant. Fallback cascade.');
                }
            }

            // ========== GESTION MULTIMODALE (Images) ==========
            let userContent = text;
            const imageBlocks = []; // Stocke les images à envoyer à l'IA

            // 1. Image directe envoyée par l'utilisateur
            if (message.mediaType === 'image') {
                try {
                    console.log('[Core] 📷 Téléchargement image directe...');
                    const buffer = await this.transport.downloadMedia(message);
                    const base64 = buffer.toString('base64');
                    imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
                    console.log('[Core] ✅ Image directe téléchargée');
                } catch (e: any) {
                    console.error('[Core] ❌ Erreur téléchargement image directe:', e.message);
                }
            }

            // 2. Image dans le message cité (quoted)
            if (message.quotedMsg?.hasImage) {
                try {
                    console.log('[Core] 📷 Téléchargement image du quoted message...');
                    // Télécharger l'image du quoted via le message brut
                    const quotedBuffer = await this.transport.downloadQuotedMedia(message);
                    if (quotedBuffer) {
                        const quotedBase64 = quotedBuffer.toString('base64');
                        imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${quotedBase64}` } });
                        console.log('[Core] ✅ Image quoted téléchargée');
                    }
                } catch (e: any) {
                    console.error('[Core] ❌ Erreur téléchargement image quoted:', e.message);
                }
            }

            // Construire le contenu multimodal si on a des images
            if (imageBlocks.length > 0) {
                userContent = [
                    { type: 'text', text: text || 'Que vois-tu sur cette image ?' },
                    ...imageBlocks
                ];
            }

            // 3. Document / Fichier envoyé par l'utilisateur (Sauvegarde temporaire)
            if (message.mediaType === 'document' || message.mediaType === 'video' || message.mediaType === 'audio') {
                try {
                    console.log(`[Core] 📁 Téléchargement fichier temporaire (${message.mediaType})...`);
                    const buffer = await this.transport.downloadMedia(message);

                    // Extraire le vrai nom du fichier
                    let originalFileName = '';
                    const rawMsg = message.raw?.message || message.raw;

                    // Tenter de récupérer le nom original tel qu'affiché dans l'UI WhatsApp
                    if (rawMsg?.documentMessage?.fileName) {
                        originalFileName = rawMsg.documentMessage.fileName;
                    } else if (rawMsg?.documentMessage?.title) {
                        originalFileName = rawMsg.documentMessage.title;
                    } else if (rawMsg?.documentWithCaptionMessage?.message?.documentMessage?.fileName) {
                        originalFileName = rawMsg.documentWithCaptionMessage.message.documentMessage.fileName;
                    } else if (message.mediaType === 'audio') {
                        originalFileName = `vocal_${Date.now()}.ogg`; // Les audios WhatsApp perdent souvent leur nom
                    } else if (message.mediaType === 'video') {
                        originalFileName = `video_${Date.now()}.mp4`; // Les vidéos média aussi (sauf si envoyées en document)
                    } else {
                        originalFileName = `fichier_${Date.now()}`;
                    }

                    const fs = await import('fs');
                    const path = await import('path');

                    // Stockage temporaire structuré
                    const downloadDir = path.join(process.cwd(), 'hm_storage', 'tmp_download');
                    if (!fs.existsSync(downloadDir)) {
                        fs.mkdirSync(downloadDir, { recursive: true });
                    }

                    // Nettoyer le nom pour la sécurité système
                    const safeFileName = path.basename(originalFileName).replace(/[^a-zA-Z0-9.\-_ \(\)]/g, '_');
                    const filePath = path.join(downloadDir, safeFileName);

                    fs.writeFileSync(filePath, buffer);
                    console.log(`[Core] ✅ Fichier téléchargé: ${filePath}`);

                    // Planifier la suppression automatique (10 minutes)
                    setTimeout(() => {
                        fs.unlink(filePath, (err) => {
                            if (err && err.code !== 'ENOENT') {
                                console.error(`[Cleanup] Erreur lors de la suppression de ${filePath}:`, err.message);
                            } else if (!err) {
                                console.log(`[Cleanup] 🧹 Fichier temporaire supprimé: ${filePath}`);
                            }
                        });
                    }, 10 * 60 * 1000); // 10 minutes

                    // Information enrichie pour l'IA
                    const timeString = new Date().toLocaleString('fr-FR');
                    const fileNotice = `\n\n[SYSTÈME ALERTE FICHIER : \n- Expéditeur : @${senderName}\n- Date : ${timeString}\n- Fichier reçu : "${originalFileName}"\n- Type : ${message.mediaType}\n- Emplacement temporaire : ${filePath}\n\nATTENTION : Ce fichier est stocké dans un répertoire temporaire et SERA SUPPRIMÉ AUTOMATIQUEMENT dans 10 minutes. Si ce fichier est important et que vous devez le conserver, vous DEVEZ utiliser vos outils pour le copier ou le déplacer vers un stockage permanent avant de faire autre chose. Vous pouvez lire son contenu avec read_file si nécessaire.]`;

                    if (Array.isArray(userContent)) {
                        const textBlock = userContent.find((b: any) => b.type === 'text');
                        if (textBlock) textBlock.text += fileNotice;
                    } else {
                        userContent += fileNotice;
                    }
                } catch (e: any) {
                    console.error('[Core] ❌ Erreur téléchargement fichier:', e.message);
                }
            }

            // ========== CONTEXTE DE MESSAGE CITÉ (Quote Context) ==========
            // Intégrer le contexte du message cité pour que l'IA comprenne le contexte
            if (message.quotedMsg) {
                const quotedParticipant = message.quotedMsg.sender?.split('@')[0] || 'Inconnu';
                let quoteBlock = '';

                if (message.quotedMsg.hasImage && !message.quotedMsg.text) {
                    quoteBlock = `\n\n[Contexte - En réponse à une IMAGE envoyée par @${quotedParticipant}]`;
                } else if (message.quotedMsg.hasImage && message.quotedMsg.text) {
                    quoteBlock = `\n\n[Contexte - En réponse à une IMAGE avec légende de @${quotedParticipant} : "${message.quotedMsg.text}"]`;
                } else if (message.quotedMsg.hasVideo) {
                    quoteBlock = `\n\n[Contexte - En réponse à une VIDÉO de @${quotedParticipant}${message.quotedMsg.text ? ` : "${message.quotedMsg.text}"` : ''}]`;
                } else if (message.quotedMsg.text) {
                    quoteBlock = `\n\n[Contexte - En réponse à un message de @${quotedParticipant} : "${message.quotedMsg.text}"]`;
                }

                if (quoteBlock) {
                    if (Array.isArray(userContent)) {
                        // Cas Multimodal : on l'ajoute au bloc texte
                        const textBlock = userContent.find((b: any) => b.type === 'text');
                        if (textBlock) textBlock.text += quoteBlock;
                    } else {
                        // Cas Texte simple
                        userContent += quoteBlock;
                    }
                }
            }


            // Construire les options de réponse (Quote, Mention)
            let replyOptions: Record<string, any> = {};
            if (isGroup) {
                const strategy = await workingMemory.getReplyStrategy(chatId, message);
                const isBotDirectlyAddressed = mentionsBot || isContextualReply;

                // LOGIQUE D'HUMANISATION (Quote vs Tag)
                // 1. Les humains ne font jamais de "mentions fantômes" (forcer un tag sans écrire le @Nom dans le texte).
                // 2. Si le chat est en chaos (useMention = true), le Quote prendrait trop de place verticale.
                //    On désactive le Quote automatique, l'IA se chargera d'écrire `@Nom` si elle le juge nécessaire.
                if (strategy.useMention) {
                    // Mode Chaos : Pas de Quote, pas de Tag automatique. 
                    // C'est le parser (baileys.ts) qui gérera les tags si l'IA écrit "@Prénom".
                } else if ((strategy.useQuote || isBotDirectlyAddressed) && message.raw) {
                    // Mode Actif/Calm/Solo : On cite le message pour garder le contexte visuel (très humain).
                    replyOptions.reply = message.raw;
                }
            }

            // ==================================================================================
            // 🧠 V3 UNIFIED PATH — Dynamic Context Engineering
            // No more FAST/AGENTIC split. Every message gets the same Bureau de Travail
            // and enters the ReAct loop. The agent PULLs deep context via tools if needed.
            // ==================================================================================

            // 1. Load unified context (L1 Hot Cache — Passport + Scratchpad + ActionHistory + Chat)
            const fullContext = await tieredContextLoader.load(chatId, message);
            const activeBlueprint = (fullContext as any).blueprint || this.currentBlueprint;

            // 2. Build LLM history
            const systemPrompt = fullContext.systemPrompt;
            let history = [];

            history.push({ role: 'system', content: systemPrompt });
            history.push(...fullContext.history);
            history.push({ role: 'user', content: userContent });

            // 3. Collector for action trace (saved to Redis L1 after response)
            const toolsUsedThisTurn: Array<{ name: string, args_summary: string, result_summary: string }> = [];

            // [GLOBAL RETRY AND DEFENSE SYSTEM] Per-tool retry counter — prevents infinite loops when the LLM
            // omits required parameters. Scoped to the entire ReAct turn (not per-iteration)
            // so a tool that fails 3 times across iterations 2, 4, 6 still hits the limit.
            const toolRetryCount = new Map<string, number>();
            const MAX_TOOL_RETRIES = 2;

            let responseDefectRetries = 0;
            const MAX_DEFECT_RETRIES = 2;



            let finalResponse: any = null;
            let keepThinking = true;
            let iterations = 0;
            const MAX_ITERATIONS = 10;
            let usedFamily: any = null;





            // [UNIFIED] All messages go through the ReAct loop — no FAST/AGENTIC split
            console.log(`[ReAct] 🚀 Démarrage de la boucle ReAct (max ${MAX_ITERATIONS} itérations)`);

            // [FIX] Récupération des outils pour l'Agentic Path
            // On utilise le mode 'forceModeration' si nécessaire, ou standard
            let relevantTools = await pluginLoader.getRelevantTools(text, 5, 10);

            // [CONSTRAINT MANIFOLD] Pruning : Ne garder que les outils autorisés par le blueprint
            if (this.runtime?.sentinel) {
                relevantTools = this.runtime.sentinel.projectActionSpace(relevantTools, activeBlueprint);
                console.log(`[Manifold:Pruner] 🎯 Action space projected down to ${relevantTools.length} tools`);
            }

            // [PTC] Injecter le meta-tool code_execution — TOUJOURS disponible (CORE TOOL)
            // Sa description liste dynamiquement les outils RAG sélectionnés ci-dessus,
            // ce qui permet au LLM de savoir exactement quels outils il peut orchestrer.
            const ptcEnabled = process.env.PTC_ENABLED !== 'false'; // Activé par défaut
            if (ptcEnabled) {
                const codeExecToolDef = ptcExecutor.buildCodeExecutionToolDef(relevantTools);
                relevantTools.push(codeExecToolDef);
                console.log(`[PTC] 🚀 Meta-tool code_execution injecté (${relevantTools.length - 1} outils orchestrables)`);
            }

            // [EXPLICIT PLANNER] Seulement si AGENTIC
            if (keepThinking) {
                const { planner } = await import('../services/agentic/Planner.js');
                const needsPlanning = await planner.needsPlanning(
                    typeof userContent === 'string' ? userContent : text,
                    relevantTools
                );

                if (needsPlanning) {
                    console.log('[Planner] 📋 Tâche complexe détectée, création d\'un plan...');
                    const plan = await planner.plan(
                        typeof userContent === 'string' ? userContent : text,
                        { tools: relevantTools, chatId, message }
                    );

                    if (plan) {
                        const executionLog = await planner.execute(plan, {
                            // [SAFE EXECUTION ADAPTER] Injection de la sécurité
                            executeToolFn: async (toolCall: any, msg: any) => {
                                return await this._safeExecuteTool(toolCall, {
                                    chatId,
                                    message: msg,
                                    authority: (fullContext as any).authority, // Capture du contexte d'autorité
                                    blueprint: activeBlueprint
                                });
                            },
                            tools: relevantTools,
                            chatId,
                            message
                        });
                        const analysis = await planner.review(executionLog);

                        // [PRIORITY 1 FIX] Honest plan summary — block false success claims
                        const successCount = (executionLog as any).completed?.length || 0;
                        const failCount = (executionLog as any).failed?.length || 0;
                        const totalSteps = (plan as any).steps?.length || 1;
                        const successRate = Math.round((successCount / totalSteps) * 100);

                        // Build factual step-by-step status
                        const stepStatuses = ((plan as any).steps || []).map((s: any) => {
                            const succeeded = (executionLog as any).completed?.includes(s.id);
                            const failed = (executionLog as any).failed?.includes(s.id);
                            const status = succeeded ? '✅' : failed ? '❌' : '⏭️ skipped';
                            const result = (executionLog as any).results?.[s.id];
                            const resultSummary = result
                                ? (result.error ? `Error: ${result.message || 'unknown'}` : 'OK')
                                : 'not executed';
                            return `Step ${s.id} [${status}]: ${s.action} → ${resultSummary}`;
                        }).join('\n');

                        // If success rate is below 50%, skip LLM call — return factual report directly
                        if (successRate < 50) {
                            console.warn(`[Planner] ⚠️ Low success rate (${successRate}%). Returning factual report instead of LLM summary.`);
                            finalResponse = `⚠️ Plan partially failed (${successCount}/${totalSteps} steps completed, ${successRate}% success rate).\n\n${stepStatuses}`;
                        } else {
                            try {
                                const summaryPrompt = `<plan_execution_report>
Objective: ${(plan as any).goal}
Result: ${successCount}/${totalSteps} steps completed (${successRate}% success rate)
${failCount > 0 ? `⚠️ ${failCount} steps FAILED.` : ''}

Step-by-step status:
${stepStatuses}
</plan_execution_report>

<instructions>
Generate an HONEST conversational summary of what happened.
RULES:
- If steps failed, you MUST mention the failures explicitly.
- NEVER claim a file was created if the step that creates it failed or was skipped.
- NEVER claim success if the success rate is below 80%.
- If the overall result is a failure, say so clearly and explain what went wrong.
- Do NOT invent outcomes that are not in the report above.
</instructions>`;
                                const summaryResponse = await providerRouter.chat([
                                    ...history,
                                    { role: 'user', content: summaryPrompt }
                                ], { category: 'AGENTIC' });

                                finalResponse = summaryResponse.content;
                            } catch (summaryErr: any) {
                                // [BUG #7 FIX] Never leave the user without a response
                                console.error('[Planner] ❌ Échec génération résumé:', summaryErr.message);
                                finalResponse = `Plan executed (${successCount}/${totalSteps} steps, ${successRate}% success).\n\n${stepStatuses}`;
                            }
                        }
                        await this.actionMemory.completeAction(chatId, { success: (analysis as any).success });

                        keepThinking = false;
                    }
                }
            }

            while (keepThinking && iterations < MAX_ITERATIONS) {
                iterations++;

                // [PHASE 2+] GESTION DE CONTEXTE INTELLIGENTE (2 niveaux)
                // Niveau 1 : Compression LLM (résumé sémantique via modèle rapide)
                // Niveau 2 : Troncature mécanique (fallback si LLM échoue)
                try {
                    const compacted = await this._compactHistory(history, chatId);
                    if (compacted !== history) {
                        history.length = 0;
                        history.push(...compacted);
                    } else {
                        // Si _compactHistory n'a rien fait (sous le seuil), tenter la troncature classique
                        const optimized = this._optimizeHistory(history);
                        if (optimized !== history) {
                            history.length = 0;
                            history.push(...optimized);
                        }
                    }
                } catch (ctxErr: any) {
                    console.error('[ContextManager] ❌ Échec optimisation:', ctxErr);
                }

                // Appel à l'IA avec l'historique accumulé
                let response: any;
                try {
                    response = await providerRouter.chat(history, {
                        tools: relevantTools,
                        // Premier tour: résolution via catégorie AGENTIC (quotas, fallback, reliability)
                        // Tours suivants: garder la même famille pour cohérence du thread
                        ...(usedFamily
                            ? { family: usedFamily }
                            : { category: 'AGENTIC' })
                    });
                } catch (chatErr: any) {
                    // [CIRCUIT BREAKER] Fallback résilient si la famille sélectionnée échoue mid-loop
                    if (chatErr.message?.includes('BUDGET_EXCEEDED') && usedFamily) {
                        console.warn(`[FinOps] ⚠️ Budget dépassé pour la famille ${usedFamily}. Fallback sur la catégorie AGENTIC (changement de voix/modèle possible).`);
                        usedFamily = null; // Déverrouille la famille
                        try {
                            response = await providerRouter.chat(history, {
                                tools: relevantTools,
                                category: 'AGENTIC'
                            });
                        } catch (fallbackErr: any) {
                            if (fallbackErr.message?.includes('BUDGET_EXCEEDED')) {
                                console.error('[FinOps] 🚨 Budget global épuisé, arrêt de la boucle ReAct.');
                                finalResponse = '⚠️ Le budget global de cette session est épuisé. Je m\'arrête ici.';
                                keepThinking = false;
                                break;
                            }
                            throw fallbackErr;
                        }
                    }
                    // [FINOPS] Kill Switch : arrêt propre si budget dépassé et qu'on n'est pas locké
                    else if (chatErr.message?.includes('BUDGET_EXCEEDED')) {
                        console.error('[FinOps] 🚨 Budget global épuisé, arrêt de la boucle ReAct.');
                        finalResponse = '⚠️ Le budget global de cette session est épuisé. Je m\'arrête ici.';
                        keepThinking = false;
                        break;
                    } else {
                        throw chatErr; // Re-throw les autres erreurs
                    }
                }

                // Sauvegarder la famille utilisée au premier tour
                if (!usedFamily) usedFamily = response.usedFamily;

                // [FALLBACK] Détecter les "hallucinations" de tool calls textuels (ex: Kimi qui écrit du code)
                if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
                    const extractedCalls = extractToolCallsFromText(response.content, true);

                    if (extractedCalls.length > 0) {
                        console.log(`[Core] 🛠️ ${extractedCalls.length} tool calls extraits du texte`);

                        // Convertir au format OpenAI avec ID compatible Mistral (9 chars)
                        response.toolCalls = extractedCalls.map((call: any) => {
                            const args = parseToolArguments(call.arguments);
                            // ID compatible Mistral (9 chars alphanumériques)
                            const randomId = Math.random().toString(36).substring(2, 11);

                            return {
                                id: randomId,
                                type: 'function',
                                function: {
                                    name: call.name,
                                    arguments: JSON.stringify(args || {})
                                }
                            };
                        });
                    }
                }

                if (response.toolCalls && response.toolCalls.length > 0) {
                    console.log(`[Agent] 🛠️ Étape ${iterations}: L'IA appelle ${response.toolCalls.length} outil(s)`);

                    // 1. Ajouter la "pensée" de l'assistant à l'historique
                    // [FIX] Kimi K2+ nécessite reasoning_content pour que le contexte soit valide
                    const historyEntry: any = {
                        role: 'assistant',
                        content: response.content || null,
                        tool_calls: response.toolCalls
                    };

                    if (response.reasoningContent) {
                        historyEntry.reasoning_content = response.reasoningContent; // Snake_case pour API standard
                    }

                    history.push(historyEntry);

                    // 2. Exécuter les outils
                    const { getToolFeedback } = await import('../utils/messageSplitter.js');

                    // [DIRAC] Parallel Tool Execution — Read-only tools run concurrently
                    // WHY: When the LLM calls 3 read_file + 1 get_file_skeleton in one turn,
                    // sequential execution wastes ~3x the I/O time. Parallelizing read-only
                    // tools saves 60-80% latency on multi-tool turns.
                    const READ_ONLY_TOOLS = new Set([
                        'read_file', 'list_directory', 'grep_search',
                        'get_file_skeleton', 'get_function', 'find_symbol_references',
                    ]);

                    // Partition tool calls into parallel-safe (read-only) and sequential (mutating)
                    const parallelBatch: typeof response.toolCalls = [];
                    const sequentialQueue: typeof response.toolCalls = [];

                    for (const tc of response.toolCalls) {
                        if (READ_ONLY_TOOLS.has(tc.function.name)) {
                            parallelBatch.push(tc);
                        } else {
                            sequentialQueue.push(tc);
                        }
                    }

                    // Helper: execute a single tool call and push result to history
                    const executeAndRecord = async (toolCall: any) => {
                        const toolName = toolCall.function.name;
                        try {
                            // ── [GLOBAL RETRY AND DEFENSE SYSTEM] Pre-execution argument validation ──
                            // WHY: The LLM frequently omits required params (e.g., `name` for
                            // browser_screenshot, `key` for db_document_save). Without this check,
                            // the tool fails silently and the LLM doesn't self-correct.
                            // This validates against the JSON Schema `required` array and returns
                            // a structured error that guides the LLM to retry with correct params.
                            const validation = validateToolArgs(toolName, toolCall.function.arguments || '{}', relevantTools);
                            if (!validation.valid) {
                                const retryKey = `${toolName}:${toolCall.id}`;
                                const currentRetries = toolRetryCount.get(retryKey) || 0;

                                if (currentRetries < MAX_TOOL_RETRIES) {
                                    toolRetryCount.set(retryKey, currentRetries + 1);
                                    console.warn(`[ToolValidator] ⚠️ Missing required params for "${toolName}": [${validation.missing.join(', ')}] (retry ${currentRetries + 1}/${MAX_TOOL_RETRIES})`);

                                    // Return structured error that guides the LLM to self-correct
                                    return {
                                        role: 'tool' as const,
                                        tool_call_id: toolCall.id,
                                        name: toolName,
                                        content: JSON.stringify({
                                            success: false,
                                            error: 'MISSING_REQUIRED_PARAMETERS',
                                            message: `[SYSTEM REJECTION] : Tool "${toolName}" is missing required parameters: [${validation.missing.join(', ')}]. `
                                                + `DIRECTIVE: This is a system correction. You MUST retry this tool call immediately with ALL required parameters filled. `
                                                + `DO NOT apologize, do not acknowledge this message. Just output the corrected tool call. `
                                                + `Expected schema: ${JSON.stringify(validation.schema, null, 0)}`,
                                            missing_params: validation.missing,
                                            retry: currentRetries + 1,
                                            maxRetries: MAX_TOOL_RETRIES
                                        })
                                    };
                                }
                                console.error(`[ToolValidator] ❌ Max retries (${MAX_TOOL_RETRIES}) exceeded for "${toolName}". Proceeding with invalid args.`);
                            }

                            let toolResult: any;

                            // WHY: ALL tools (including code_execution) route through _safeExecuteTool
                            // for full security pipeline (Sentinel VIGIL safety, Ralph laziness, FinOps, DB logging).
                            // _safeExecuteTool internally detects code_execution and routes to _executePtcCode.
                            toolResult = await this._safeExecuteTool(toolCall, {
                                chatId,
                                message,
                                authority: fullContext.authority,
                                blueprint: activeBlueprint
                            });

                            // --- LE DOUBLE RENDU (DUAL RENDERING) ---

                            // 1. Rendu pour l'utilisateur (Instantané) — CLI UNIQUEMENT
                            if (toolResult && toolResult.userOutput && message.sourceChannel === 'cli') {
                                const userMsg = typeof toolResult.userOutput === 'string'
                                    ? toolResult.userOutput
                                    : JSON.stringify(toolResult.userOutput);

                                // Envoi immédiat pour faire patienter l'utilisateur pendant que l'IA "réfléchit" à la suite
                                await this.transport.sendUniversalResponse(chatId, { markdown: userMsg }, {}, message.sourceChannel);
                            }

                            // 2. Rendu pour le LLM (Optimisé / Tronqué)
                            const llmContent = (toolResult && toolResult.llmOutput)
                                ? (typeof toolResult.llmOutput === 'string' ? toolResult.llmOutput : JSON.stringify(toolResult.llmOutput))
                                : JSON.stringify(toolResult); // Fallback pour les anciens plugins

                            // [V3] Collect tool trace for action history
                            toolsUsedThisTurn.push({
                                name: toolName,
                                args_summary: (toolCall.function.arguments || '').substring(0, 80),
                                result_summary: (typeof llmContent === 'string' ? llmContent : '').substring(0, 100)
                            });

                            // 3. Retourner le history entry (will be pushed after all parallel calls complete)
                            return {
                                role: 'tool' as const,
                                tool_call_id: toolCall.id,
                                name: toolName,
                                content: llmContent,
                            };

                        } catch (unexpectedErr: any) {
                            console.error(`[Agent] ❌ Erreur fatale boucle ReAct:`, unexpectedErr);
                            return {
                                role: 'tool' as const,
                                tool_call_id: toolCall.id,
                                name: toolName,
                                content: JSON.stringify({ success: false, error: true, message: `Fatal Loop Error: ${unexpectedErr.message}` }),
                            };
                        }
                    };

                    // ── Execute parallel batch (read-only) ──
                    if (parallelBatch.length > 0) {
                        console.log(`[Agent] ⚡ Exécution parallèle de ${parallelBatch.length} outil(s) read-only`);
                        const parallelResults = await Promise.all(parallelBatch.map(executeAndRecord));
                        for (const result of parallelResults) {
                            history.push(result);
                            console.log(`[Agent] ✅ Résultat ${result.name} traité (parallel)`);
                        }
                    }

                    // ── Execute sequential queue (mutating) ──
                    for (const toolCall of sequentialQueue) {
                        const result = await executeAndRecord(toolCall);
                        history.push(result);
                        console.log(`[Agent] ✅ Résultat ${result.name} traité (sequential, Dual Render: checked)`);

                        // UX Agentique: Petit feedback visuel si c'est long
                        if (iterations > 1) {
                            await this.transport.setPresence(chatId, 'composing', message.sourceChannel);
                        }
                    }

                    // On continue la boucle pour que l'IA analyse ces résultats
                    continue;

                } else {
                    // 4. L'IA n'a plus d'outils à appeler
                    console.log(`[Agent] 🏁 Fin de réflexion à l'étape ${iterations}.`);

                    const contentStr = response.content || '';

                    // [LAYER 1 DEFENSE] In-loop validation to catch hallucinations before they reach the user
                    const defects = detectResponseDefects(contentStr);

                    if (defects.defectCount > 0 && responseDefectRetries < MAX_DEFECT_RETRIES && iterations < MAX_ITERATIONS) {
                        responseDefectRetries++;
                        console.warn(`[Agent] ⚠️ Response defect detected (retry ${responseDefectRetries}/${MAX_DEFECT_RETRIES}): ${defects.details.join(', ')}`);

                        history.push({
                            role: 'assistant',
                            content: contentStr
                        });

                        let retryInstruction = '';
                        if (defects.hasNoThoughts) {
                            retryInstruction = 'You forgot to use your mandatory <thought> tags. You must ALWAYS think out loud inside <thought> tags before answering. Retry.';
                        } else if (defects.hasLeakedToolCalls) {
                            retryInstruction = 'CRITICAL ERROR: You wrote tool call syntax (e.g. tool_code_execution) directly in your text response. You must use the structured tool call API provided by the system. Never write tool code in plain text. Correct your error immediately.';
                        } else if (defects.hasRawCodeDominance) {
                            retryInstruction = 'ERROR: Your response contains only raw code. If you want to execute this code, use the structured `code_execution` tool. Do not send it directly to the user as plain text.';
                        } else if (defects.hasJsonToolObject) {
                            retryInstruction = 'ERROR: You returned a JSON tool call object in the text. You must use the structured tool call API. Retry.';
                        }

                        history.push({
                            role: 'user',
                            content: `[SYSTEM REJECTION] : ACTION REJECTED by internal format validator.\nReason: ${retryInstruction}\n\nSYSTEM DIRECTIVE: This is an automatic system interception, not a user message. You must restart your action and correct this error. DO NOT APOLOGIZE, do not acknowledge (no "Sorry", no "Thank you"). Just generate the corrected response or tool call.`
                        });
                        continue; // Force une itération supplémentaire
                    }

                    // [RUNTIME: RALPH LOOP]
                    // On évalue la paresse agentique uniquement si l'agent a fait au moins 1 action (itérations > 1) 
                    // et a produit un texte final.
                    if (iterations > 1 && contentStr && iterations < MAX_ITERATIONS) {
                        const runtime = container.get('runtime');
                        // Extraire le but initial depuis userContent (qui peut être un string ou un array multimodal)
                        const initialGoal = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);
                        
                        const ralphEval = await runtime.ralph.verifyCompletion(initialGoal, contentStr);
                        
                        if (!ralphEval.is_complete && ralphEval.laziness_detected) {
                            console.warn(`[Runtime:RALPH] 🥾 Agent paresseux détecté. Injection du kickback prompt.`);
                            
                            // On sauvegarde la réponse paresseuse dans l'historique
                            history.push({
                                role: 'assistant',
                                content: contentStr
                            });
                            
                            // On force la boucle à continuer avec l'intervention de RALPH
                            history.push({
                                role: 'user',
                                content: `[SYSTEM SUPERVISOR: RALPH] ${ralphEval.kickback_message}`
                            });
                            
                            continue; // 🔄 DÉCLENCHE UNE NOUVELLE ITÉRATION ReAct
                        }
                    }

                    // Fallback for thoughts-only (if it passed the defect check but still is practically empty)
                    const thoughtOnlyCheck = contentStr
                        .replace(/<(think|thought|thinking)>([\s\S]*?)<\/\1>/gi, '')
                        .replace(/^([\s\S]*?)<\/(think|thought|thinking)>/gi, '')
                        .replace(/<(think|thought|thinking)>([\s\S]*?)$/gi, '')
                        .replace(/<\/?(think|thought|thinking)>/gi, '')
                        .trim();

                    if (!thoughtOnlyCheck && contentStr.length > 0 && iterations < MAX_ITERATIONS) {
                        console.log('[CoT] ⚠️ Réponse contenant uniquement des pensées. Relance pour obtenir une réponse utilisateur.');
                        history.push({
                            role: 'assistant',
                            content: contentStr
                        });
                        history.push({
                            role: 'user',
                            content: `[SYSTEM REJECTION] : ACTION REJECTED by internal validator.\nReason: You thought inside your <thought> tags, but produced no final response for the user and called no tools.\n\nSYSTEM DIRECTIVE: This is an automatic interception. Immediately generate a direct user response without apologizing or justifying this omission. Do not reply to this system message.`
                        });
                        continue; // Force une itération supplémentaire
                    }



                    finalResponse = response.content;
                    keepThinking = false;
                }
            }

            // Sécurité boucle infinie
            if (!finalResponse && iterations >= MAX_ITERATIONS) {
                finalResponse = "J'ai trop réfléchi et je me suis perdu en chemin... (Boucle infinie détectée)";
                console.warn('[Agent] ⚠️ MAX_ITERATIONS reached');
            }

            // [AGENTIC] Fallback si l'IA n'a rien répondu mais a bouclé
            if (!finalResponse && iterations > 0) {
                // Si l'IA n'a plus rien à dire après avoir utilisé des outils (ex: react_to_message, SLEEP_SCHEDULED),
                // on convertit cette absence de réponse en action silencieuse pour ne pas envoyer de message d'erreur.
                finalResponse = '__HIVE_SILENT_7f3a__';
                console.log('[Agent] 🏁 Réponse vide après exécution d\'outils, conversion en action silencieuse.');
            }

            // --- Post-Processing (Commandes Textuelles Fallback) ---
            if (finalResponse) {
                // Parser les commandes textuelles via le système de matchers décentralisé
                // Chaque plugin déclare ses propres patterns (textMatchers) - voir plugins/loader.js
                const parsedCommand = pluginLoader.findTextHandler(finalResponse, {
                    ...message,
                    botJid: this.transport.sock?.user?.id // Passer l'ID du bot pour filtrer les mentions
                });
                if (parsedCommand) {
                    console.log(`[Core] Commande textuelle détectée dans réponse IA: ${parsedCommand.name}`);
                    // (Logique identique à avant pour l'exécution cmd textuelle)
                    let toolResult: any;
                    try {
                        toolResult = await pluginLoader.execute(
                            parsedCommand.name,
                            parsedCommand.args,
                            { transport: this.transport, message, chatId, sender }
                        );
                        if (toolResult.success) {
                            // On remplace la réponse de l'IA par le résultat de la commande
                            finalResponse = toolResult.message;
                        }
                    } catch (cmdErr: any) {
                        console.error(`[Core] ⚠️ Text Command Fallback Error:`, cmdErr.message);
                    }
                }
            }


            // Délai naturel
            await this._naturalDelay();

            // [VOICE LOGIC] Si le message d'origine était vocal ou si demandé
            if (message.isTranscribed || text.toLowerCase().includes('réponds par vocal')) {
                try {
                    // Utiliser le VoiceProvider unifié (avec fallback Minimax -> Gemini -> GTTS)
                    const voiceProvider = container.get('voiceProvider');
                    if (voiceProvider) {
                        console.log('[Core] 🗣️ Génération réponse vocale...');
                        const ttsResult = await voiceProvider.textToSpeech(finalResponse);

                        if (ttsResult && ttsResult.filePath) {
                            // Indicateur "enregistrement" pour le voice note
                            await this.transport.setPresence(chatId, 'recording', message.sourceChannel);

                            // Envoyer la note vocale via sendVoiceNote (PTT)
                            await this.transport.sendVoiceNote(chatId, ttsResult.filePath, {
                                duration: Math.min(finalResponse.length * 40, 3000)
                            });
                            console.log(`[Core] ✓ Réponse vocale envoyée (${ttsResult.provider})`);

                            // Revenir en disponible
                            await this.transport.setPresence(chatId, 'available', message.sourceChannel);

                            // Stockage mémoire
                            await workingMemory.addMessage(chatId, 'assistant', finalResponse);
                            if (isStorable(finalResponse, 'assistant')) {
                                const memory = container.get('memory');
                                memory.store(chatId, finalResponse, 'assistant', { msgId: message.id }).catch(console.error);
                            }
                            return; // FIN TRAITEMENT
                        } else {
                            console.warn('[Core] ⚠️ VoiceProvider n\'a pas retourné de fichier audio');
                        }
                    }
                } catch (voiceError: any) {
                    console.error('[Core] ❌ Echec réponse vocale, fallback texte:', voiceError.message);
                    // Fallback vers envoi texte normal ci-dessous
                }
            }

            // Envoyer la réponse TEXTE (Standard ou Fallback)
            if (!finalResponse || typeof finalResponse !== 'string' || finalResponse.trim() === '') {
                console.warn('[Core] ⚠️ Réponse vide ou invalide (non-string), annulation envoi');
                return;
            }

            // [AGENTIC] Nettoyage de la pensée interne (Invisible pour l'utilisateur)
            // Supporte <think>, <thought>, <thinking> (DeepSeek, Gemini, etc.)
            const thoughts: string[] = [];
            const originalResponseForLog = finalResponse;

            // 1. Properly enclosed tags
            const enclosedRegex = /<(think|thought|thinking)>([\s\S]*?)<\/\1>/gi;
            // 2. Unclosed opening tag (from tag to the end)
            const unclosedRegex = /<(think|thought|thinking)>([\s\S]*?)$/gi;
            // 3. Unopened closing tag (from start to the closing tag)
            const unopenedRegex = /^([\s\S]*?)<\/(think|thought|thinking)>/gi;

            let thoughtMatch;

            // Extract properly enclosed thoughts
            while ((thoughtMatch = enclosedRegex.exec(finalResponse)) !== null) {
                thoughts.push(thoughtMatch[2].trim());
            }
            finalResponse = finalResponse.replace(enclosedRegex, '');

            // Extract unopened closing tag (the LLM forgot to open)
            while ((thoughtMatch = unopenedRegex.exec(finalResponse)) !== null) {
                thoughts.push(thoughtMatch[1].trim());
            }
            finalResponse = finalResponse.replace(unopenedRegex, '');

            // Extract unclosed opening tag (the LLM forgot to close)
            while ((thoughtMatch = unclosedRegex.exec(finalResponse)) !== null) {
                thoughts.push(thoughtMatch[2].trim());
            }
            finalResponse = finalResponse.replace(unclosedRegex, '');

            // Fallback: remove any stray unopened or unclosed tags
            finalResponse = finalResponse.replace(/<\/?(think|thought|thinking)>/gi, '').trim();

            if (thoughts.length > 0) {
                console.log(`[CoT] 🧠 Pensée de l'agent (${thoughts.length} bloc(s)) :`);
                thoughts.forEach((t, i) => console.log(`  [${i + 1}] ${t.substring(0, 200)}${t.length > 200 ? '...' : ''}`));

                // Si après nettoyage il ne reste rien
                if (!finalResponse) {
                    if (iterations > 0) {
                        finalResponse = "*(Réflexion terminée sans réponse textuelle)*";
                    } else {
                        return;
                    }
                }
            } else if (originalResponseForLog !== finalResponse) {
                // Si on a nettoyé des balises orphelines sans capturer de pensée valide
                if (!finalResponse) {
                    if (iterations > 0) {
                        finalResponse = "*(Réflexion terminée sans réponse textuelle)*";
                    } else {
                        return;
                    }
                }
            }

            // [LAYER 2 DEFENSE] Final Post-Loop Sanitization (Last Line of Defense)
            // Catch anything that slipped through the Layer 1 retries
            const sanitized = sanitizeResponse(finalResponse);
            if (sanitized.wasModified) {
                console.warn(`[Sanitizer] 🛡️ Stripped ${sanitized.strippedItems.length} leaked item(s): ${sanitized.strippedItems.join(', ')}`);
                finalResponse = sanitized.cleaned;
            }

            // [FIX] Detecter et corriger le format <send_message>JSON</send_message>
            // Protection contre l'hallucination de format XML du modèle
            const sendMessageRegex = /<send_message>([\s\S]*?)<\/send_message>/;
            const smMatch = finalResponse && finalResponse.match(sendMessageRegex);
            if (smMatch) {
                try {
                    const jsonContent = JSON.parse(smMatch[1]);
                    if (jsonContent.text) {
                        console.log('[Core] 🧹 Nettoyage automatique du format <send_message>');
                        finalResponse = jsonContent.text;
                    }
                } catch (e: any) {
                    // Fallback: simplement nettoyer les balises si le JSON est invalide ou si c'est du texte brut
                    finalResponse = finalResponse.replace(/<\/?send_message>/g, '');
                }
            }

            if (!finalResponse) return;

            // ── [SILENT TOKEN] Supprimer les messages "internes" ──
            // WHY: Token namespaced + hash suffix pour éviter les collisions accidentelles.
            // Vérifie strict equality ET contains (si le LLM enrobe le token dans du texte).
            const SILENT_TOKEN = '__HIVE_SILENT_7f3a__';
            const trimmed = finalResponse.trim();
            if (trimmed === SILENT_TOKEN || trimmed.includes(SILENT_TOKEN)) {
                console.log('[Core] 🤫 SILENT token intercepté — aucun message envoyé à l\'utilisateur.');
                // Stocker quand même en mémoire pour la cohérence de l'historique
                await workingMemory.addMessage(chatId, 'assistant', '[ACTION_SILENCIEUSE]');
                clearTimeout(feedbackTimeoutId ?? undefined);
                feedbackState.sent = true;
                return;
            }

            // ========== [FEEDBACK FIRST] Nettoyer le timeout et envoyer la réponse ==========
            clearTimeout(feedbackTimeoutId ?? undefined);
            feedbackState.sent = true; // Empêcher l'envoi de l'accusé de réception tardif

            // [MESSAGE SPLITTING] Découper les messages longs en plusieurs parties
            const { splitMessage } = await import('../utils/messageSplitter.js');
            const messageParts = splitMessage(finalResponse, 1500);

            for (let i = 0; i < messageParts.length; i++) {
                // Envoi réponse universelle (replyOptions déjà défini plus haut)
                await this.transport.sendUniversalResponse(chatId, { markdown: messageParts[i] }, i === 0 ? replyOptions : {}, message.sourceChannel);

                // Petit délai naturel entre les parties (sauf la dernière)
                if (i < messageParts.length - 1) {
                    await this._naturalDelay(400);
                }
            }

            if (messageParts.length > 1) {
                console.log(`[Core] 📨 Message découpé en ${messageParts.length} parties`);
            }

            await this.transport.setPresence(chatId, 'paused', message.sourceChannel);

            // Mise à jour de la dernière interaction pour le mode conversationnel
            if (isGroup) {
                await workingMemory.setLastInteraction(chatId, sender);
            }

            // 4. Stockage réponse (Redis + Supabase)
            await workingMemory.addMessage(chatId, 'assistant', finalResponse);

            // [V3] Save compressed action trace to Redis L1 for next turn's <action_history>
            await workingMemory.addActionTrace(chatId, {
                user_query: (typeof text === 'string' ? text : '(multimodal)').substring(0, 100),
                tools_used: toolsUsedThisTurn,
                response_preview: finalResponse.substring(0, 100)
            });

            if (isStorable(finalResponse, 'assistant')) {
                const memory = container.get('memory');
                memory.store(chatId, finalResponse, 'assistant', { msgId: message.id }).catch(console.error);
            }

            // Option B: Extraction automatique de faits (asynchrone, ne bloque pas)
            this._extractFacts(text, sender).catch(err =>
                console.error('[Core] Erreur extraction faits:', err.message)
            );

            // Log (Désactivé)
            // await db.log('message', ...);

        } catch (error: any) {
            clearTimeout(feedbackTimeoutId ?? undefined);
            console.error('[Core] Erreur traitement:', error);

            // [FINOPS] Message spécifique pour Kill Switch budgétaire
            if (error.message?.includes('BUDGET_EXCEEDED')) {
                await this.transport.sendUniversalResponse(chatId, {
                    markdown: '⚠️ **Budget de session épuisé.** Pour protéger ton portefeuille, je me mets en pause. Relance-moi pour une nouvelle session.'
                }, {}, message.sourceChannel);
            } else {
                await this.transport.sendUniversalResponse(chatId, { markdown: "Oups, j'ai bugué 😅 Réessaie !" }, {}, message.sourceChannel);
            }
            await this.transport.setPresence(chatId, 'paused', message.sourceChannel);
        }
    }




    /**
     * Exécute un outil de manière sécurisée (avec Critique et Boussole Morale)
     * Utiliser cette méthode au lieu de _executeTool direct pour le Planner
     */
    async _safeExecuteTool(toolCall: any, context: any): Promise<any> {
        const { db } = this;
        const toolName = toolCall.function.name;

        const { chatId, message, authority } = context;

        // [AUDIT M3] Extraction robuste de l'autorité
        const isSuperUser = authority?.isSuperUser || context.isSuperUser || false;
        const isGlobalAdmin = authority?.isGlobalAdmin || context.isGlobalAdmin || false;
        const level = authority?.level || context.level || 0;
        const authorityLevel = isSuperUser ? 'SUPERUSER' : (isGlobalAdmin ? 'GLOBAL_ADMIN' : `USER (Lvl ${level})`);

        console.log(`[SafeExecute] 🛡️ Exécution sécurisée demandée: ${toolName} (Level: ${authorityLevel})`);

        if (chatId) {
            await this.actionMemory.pulseAction(chatId);
        }

        try {
            // [LEVEL 5] AIRuntimeInfrastructure: Sentinel VIGIL safety & coherence evaluation
            const runtime = container.get('runtime');
            if (runtime) {
                const agentMemory = this.agentMemory;
                const recentActions = chatId ? await agentMemory.getRecentActions(chatId, 5) : [];
                const activeBlueprint = context.blueprint || this.currentBlueprint;
                
                const evalResult = await runtime.sentinel.evaluate(toolCall, {
                    senderName: message?.senderName || 'Anonymous',
                    authorityLevel: authorityLevel,
                    isGroup: message?.isGroup || false,
                    chatId: chatId || 'unknown'
                }, recentActions, activeBlueprint);

                if (!evalResult.allowed) {
                    console.warn(`[Runtime:VIGIL] 🛑 Action blocked by Sentinel: ${evalResult.reason} (risk: ${evalResult.risk_level})`);
                    return {
                        success: false,
                        error: true,
                        message: `TOOL_BLOCKED_BY_RUNTIME_SENTINEL:\n`
                            + `Tool: ${toolName}\n`
                            + `Risk Level: ${evalResult.risk_level}\n`
                            + `Reason: ${evalResult.reason}\n`
                            + `Action Required: ${evalResult.intervention_prompt || 'Inform the user of this limitation, or try an alternative approach.'}`
                    };
                }
            }

            // [PRIORITY 3 FIX] Route code_execution through PTC executor
            // WHY: code_execution is a meta-tool handled specially by PTC, not a plugin.
            // The Planner calls _safeExecuteTool which would hit pluginLoader.execute()
            // and fail with "Plugin not found". This intercept routes it correctly.
            if (toolName === 'code_execution') {
                console.log('[PTC] ⚡ Exécution programmatique via Planner path (_safeExecuteTool)');
                const relevantToolDefs = pluginLoader.getToolDefinitions();
                return await this._executePtcCode(toolCall, message, chatId, relevantToolDefs, {
                    transport: this.transport,
                    message,
                    chatId,
                    sender: message.sender,
                    isGroup: message.isGroup,
                    authorityLevel: authorityLevel || 'MEMBRE (Standard)',
                    isSuperUser: isSuperUser,
                    isGlobalAdmin: isGlobalAdmin,
                    sourceChannel: message.sourceChannel,
                });
            }

            // EXÉCUTION RÉELLE
            const toolResult = await this._executeTool(toolCall, message);

            // [P0 FIX] Parse tool args once, reuse for Observer + ActionEvaluator
            // WHY: Prevents a second unguarded JSON.parse that could convert a successful
            // tool execution into a post-action failure.
            let parsedParams: Record<string, unknown> = {};
            try {
                parsedParams = JSON.parse(toolCall.function.arguments || '{}');
            } catch {
                // Malformed JSON — use empty object for Observer/Evaluator
            }

            // [EPISODIC MEMORY] Log de l'action réussie

            const actionLog = await db.logAction(chatId, toolName, toolCall.function.arguments, toolResult, true);

            // [POST-ACTION EVALUATION] Évaluer l'action pour apprentissage continu
            if (actionLog?.id) {
                const { actionEvaluator } = await import('../services/agentic/ActionEvaluator.js');
                actionEvaluator.evaluate({
                    id: actionLog.id,
                    tool: toolName,
                    params: parsedParams,
                    result: toolResult,
                    duration_ms: 0,
                    chatId,
                    timestamp: Date.now()
                }).catch(e => console.error('[Eval] Error:', e.message));
            }

            return toolResult;

        } catch (execErr: any) {
            console.error(`[SafeExecute] ❌ Erreur exécution outil ${toolName}:`, execErr);

            // [EPISODIC MEMORY] Log de l'action échouée
            db.logAction(chatId, toolName, toolCall.function.arguments, null, false, execErr.message);

            return {
                success: false,
                error: true,
                message: `Tool Execution Failed: ${execErr.message}. Please analyze the error, self-correct your parameters or strategy, and try again.`
            };
        }
    }

    /**
     * Executes the 'code_execution' meta-tool via the PTC sandbox.
     * Centralized defensive execution path used by both ReAct and Planner.
     */
    async _executePtcCode(toolCall: any, message: any, chatId: string, relevantTools: any[], contextParams: any): Promise<any> {
        let codeArgs: any;
        try {
            codeArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseErr: any) {
            // [GLOBAL RETRY AND DEFENSE SYSTEM] Catch malformed JSON from LLM (Layer C: Safety Net)
            return {
                success: false,
                error: 'MALFORMED_JSON_ARGUMENTS',
                message: `[SYSTEM REJECTION] : Your tool call arguments are malformed JSON: "${parseErr.message}". `
                    + `DIRECTIVE: This is a system correction. Please retry with valid JSON containing a "code" string parameter. `
                    + `DO NOT apologize, do not acknowledge this error. Just output the corrected tool call.`
            };
        }

        if (!codeArgs.code || typeof codeArgs.code !== 'string') {
            return { success: false, error: true, message: 'code_execution requires a string "code" argument.' };
        }

        // Construire les fonctions tool pour le sandbox
        const toolFns = buildToolFunctions(
            relevantTools,
            (name: string, args: any, ctx: any) => pluginLoader.execute(name, args, ctx),
            {
                ...contextParams,
                onProgress: (status: string) => {
                    eventBus.publish(BotEvents.TOOL_PROGRESS, { tool: 'code_execution', status, chatId });
                },
            }
        );

        try {
            // Construire le bridge HIVE pour ce chatId (WakeSystem)
            const hiveBridge = hiveWakeSystem.buildHiveBridge(chatId);

            // Enregistrer le callback de réveil spécifique à ce chatId
            hiveWakeSystem.registerWakeCallback(chatId, async (wakeEvent) => {
                console.log(`[WakeSystem] ⏰ Réveil contextuel pour chatId=${chatId}`);
                await this._onMessage({
                    chatId: wakeEvent.chatId,
                    sender: 'system@wake',
                    senderName: 'WAKE_SYSTEM',
                    text: `[WAKE_EVENT] ${wakeEvent.prompt}`,
                    isGroup: wakeEvent.chatId?.endsWith('@g.us') ?? false,
                    isSystem: true,
                    sourceChannel: 'internal',
                } as any);
            });

            // Exécuter le code dans le sandbox VM (avec bridge HIVE)
            const ptcResult = await ptcExecutor.execute(codeArgs.code, toolFns, hiveBridge);

            // [SLEEP_SCHEDULED]
            if (ptcResult.metadata?.sleepScheduled) {
                const sleep = ptcResult.metadata.sleepScheduled;
                console.log(`[PTC] 💤 SLEEP_SCHEDULED — id=${sleep.wakeEventId}, réveil dans ${Math.round((sleep.wakeAtMs - Date.now()) / 1000)}s`);
                return {
                    success: true,
                    type: 'SLEEP_SCHEDULED',
                    message: sleep.message,
                    wakeEventId: sleep.wakeEventId,
                    wakeAtMs: sleep.wakeAtMs,
                };
            }

            console.log(`[PTC] 📊 ${ptcResult.metadata?.toolCallCount || 0} tools exécutés, ~${ptcResult.metadata?.totalTokensSaved || 0} tokens économisés`);
            return ptcResult;

        } catch (ptcErr: any) {
            // [FALLBACK] Si PTC refuse (1 seul outil), exécuter via tool calling natif
            if (ptcErr.message?.startsWith('PTC_SINGLE_TOOL')) {
                console.log('[PTC] ⏭️ Fallback tool calling natif (1 seul outil détecté)');
                const singleToolMatch = codeArgs.code?.match(/(?:await\s+)?(\w+)\s*\(\s*(\{[\s\S]*?\})\s*\)/);
                if (singleToolMatch) {
                    const [, extractedTool, extractedArgs] = singleToolMatch;

                    // [GLOBAL RETRY AND DEFENSE SYSTEM] Validation du fallback (Layer B)
                    const validation = validateToolArgs(extractedTool, extractedArgs, relevantTools);
                    if (!validation.valid) {
                        console.warn(`[PTC→Native] ⚠️ Missing required params for "${extractedTool}": [${validation.missing.join(', ')}]`);
                        return {
                            success: false,
                            error: 'MISSING_REQUIRED_PARAMETERS',
                            message: `[SYSTEM REJECTION] : Tool "${extractedTool}" is missing required parameters: [${validation.missing.join(', ')}]. `
                                + `DIRECTIVE: This is a system correction. You MUST retry this tool call immediately with ALL required parameters filled. `
                                + `DO NOT apologize, do not acknowledge this message. Just output the corrected tool call. `
                                + `Expected schema: ${JSON.stringify(validation.schema, null, 0)}`,
                            missing_params: validation.missing
                        };
                    }

                    try {
                        // WHY: Route through _safeExecuteTool for full security pipeline
                        // (Sentinel VIGIL safety, Ralph laziness, FinOps, DB action logging)
                        // instead of pluginLoader.execute() which bypasses all security checks.
                        const fallbackToolCall = {
                            id: toolCall.id || `ptc_fallback_${Date.now()}`,
                            function: {
                                name: extractedTool,
                                arguments: extractedArgs
                            }
                        };
                        console.log(`[PTC→Native] 🛡️ Routing ${extractedTool} through _safeExecuteTool`);
                        return await this._safeExecuteTool(fallbackToolCall, {
                            chatId,
                            message,
                            authority: {
                                isSuperUser: contextParams.isSuperUser,
                                isGlobalAdmin: contextParams.isGlobalAdmin,
                                level: contextParams.authorityLevel
                            }
                        });
                    } catch (err: any) {
                        return { success: false, error: `PTC fallback: impossible d'extraire les arguments pour ${extractedTool}` };
                    }
                } else {
                    return { success: false, error: ptcErr.message };
                }
            }
            console.error('[PTC] ❌ Erreur sandbox:', ptcErr);
            return {
                success: false,
                error: true,
                message: ptcErr.message || 'PTC execution failed'
            };
        }
    }





    /**
     * Compresse l'historique via un LLM rapide quand la fenêtre de contexte sature.
     * Inspiré de Claude Code /compact : on résume la conversation passée,
     * puis on reconstruit un historique minimal (system + résumé + derniers échanges).
     *
     * @param history - L'historique complet de la boucle ReAct
     * @param chatId - Pour les logs
     * @returns L'historique compressé ou l'original si sous le seuil
     */
    async _compactHistory(history: any[], chatId: string): Promise<any[]> {
        const TOTAL_CHAR_LIMIT = 25000;
        const currentSize = JSON.stringify(history).length;

        if (currentSize < TOTAL_CHAR_LIMIT) return history;

        console.log(`[ContextManager] ⚠️ Saturation (${currentSize} chars). Déclenchement du Garbage Collector IA...`);

        // Isoler le System Prompt (index 0) et les 2 derniers échanges
        const systemPrompt = history[0];
        const lastInteraction = history.slice(-2);

        // Messages à compresser : tout entre system prompt et les 2 derniers
        const messagesToCompress = history.slice(1, -2);
        if (messagesToCompress.length === 0) return history;

        const textToCompress = JSON.stringify(messagesToCompress);

        const summaryPrompt = [
            {
                role: 'user',
                content: `You are the memory manager of HIVE-MIND.
Here is the history of a long working session of an AI agent.
Make a VERY DENSE and TECHNICAL summary of what happened.
Focus ONLY on:
1. The user's initial objective.
2. The modified or read files, and executed commands.
3. Les erreurs rencontrées et les solutions trouvées.
4. L'état actuel exact (ce qu'il reste à faire).

Historique à compresser :
${textToCompress}`
            }
        ];

        try {
            const response = await providerRouter.chat(summaryPrompt, {
                family: 'groq',
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1
            });

            const summary = response.content;
            console.log(`[ContextManager] ✅ Historique compressé (${currentSize} → résumé)`);

            // WHY: On injecte le résumé dans le system prompt (pas dans l'historique)
            // pour ne pas fabriquer de faux échanges que le LLM pourrait citer.
            const enrichedSystemPrompt = {
                ...systemPrompt,
                content: `${systemPrompt.content}\n\n<session_memory_summary>\nRésumé condensé de la session en cours (contexte compressé automatiquement) :\n${summary}\n</session_memory_summary>`
            };

            return [
                enrichedSystemPrompt,
                ...lastInteraction
            ];
        } catch (e: any) {
            console.error(`[ContextManager] ❌ Échec compression IA, fallback troncature:`, e.message);
            return this._optimizeHistory(history);
        }
    }

    /**
     * Gère intelligemment la fenêtre de contexte pour éviter l'explosion (Amnésie Progressive)
     * Tronque les sorties d'outils volumineuses tout en gardant l'instruction utilisateur
     * @param history - Historique complet
     * @returns Historique optimisé
     */
    _optimizeHistory(history: any[]) {
        const TOTAL_CHAR_LIMIT = 25000;
        const TOOL_OUTPUT_LIMIT = 2000;

        let currentSize = JSON.stringify(history).length;

        if (currentSize < TOTAL_CHAR_LIMIT) {
            return history;
        }

        console.log(`[ContextManager] ⚠️ Surcharge contexte détectée (${currentSize} chars). Troncature mécanique...`);

        const optimizedHistory = [...history];
        const safeZoneStart = 2;
        const safeZoneEnd = optimizedHistory.length - 3;
        let trimmedCount = 0;

        for (let i = safeZoneStart; i < safeZoneEnd; i++) {
            const msg = optimizedHistory[i];

            if (msg.role === 'tool' && msg.content && msg.content.length > TOOL_OUTPUT_LIMIT) {
                const originalLen = msg.content.length;
                msg.content = msg.content.substring(0, TOOL_OUTPUT_LIMIT) +
                    `\n... [TRONQUÉ: ${originalLen - TOOL_OUTPUT_LIMIT} chars masqués]`;

                trimmedCount++;
                currentSize = JSON.stringify(optimizedHistory).length;

                if (currentSize < TOTAL_CHAR_LIMIT) break;
            }
        }

        console.log(`[ContextManager] ✅ Troncature terminée. ${trimmedCount} outils tronqués. Taille: ${currentSize} chars.`);
        return optimizedHistory;
    }

    /**
     * [PHASE 3] Résilience: Vérifie s'il y a des actions interrompues (Crash Recovery)
     * Si oui, propose de les reprendre
     */
    async _resumePendingActions() {
        const { actionMemory } = this;
        console.log('[Core] ♻️ Vérification des tâches interrompues...');
        try {
            const pendingActions = await actionMemory.getResumableActions(5);


            if (pendingActions.length > 0) {
                console.log(`[Core] ⚠️ ${pendingActions.length} action(s) interrompue(s) trouvée(s). Tentative de reprise...`);

                for (const action of pendingActions) {
                    // On ne reprend que les actions récentes (< 24h)
                    const age = Date.now() - action.createdAt;
                    if (age > 24 * 3600 * 1000) {
                        console.log(`[Core] Action ${action.id} trop vieille, ignorée.`);
                        continue;
                    }

                    // Notifier dans le chat qu'on a trouvé quelque chose
                    const msg = `♻️ *Reprise d'activité*\nJ'ai détecté une tâche interrompue : "${action.params.goal}".\nJe reprends là où je m'étais arrêté (Étape ${action.steps.length}).\n_(Dites 'stop' pour annuler)_`;
                    await this.transport.sendText(action.chatId, msg);

                    // [REHYDRATION] Restaure le contexte Redis pour que le Planner soit prêt
                    await actionMemory.rehydrateAction(action.chatId, action.id);

                    // On ne change PAS le status DB ici pour garder la persistance "active" 
                    // tant que la tâche n'est pas finie ou annulée.

                    // WHY: Rehydrating state is not enough. The bot will wait silently for user input.
                    // We must synthesize an internal message to trigger the AI loop with the correct context.
                    this._handleMessage({
                        chatId: action.chatId,
                        sender: 'system_recovery',
                        senderName: 'SYSTEM',
                        isGroup: action.chatId.endsWith('@g.us'),
                        text: `[SYSTEM_RESUME] Tâche interrompue restaurée. Objectif initial: "${action.params?.goal || action.goal}". Reprends l'exécution de ce plan là où il s'est arrêté. Ne demande pas de permission, exécute la prochaine étape.`,
                        sourceChannel: 'system'
                    } as any).catch(e => console.error('[Core] ❌ Erreur reprise automatique ReAct:', e));
                }
            } else {
                console.log('[Core] ✅ Aucune tâche interrompue.');
            }
        } catch (e: any) {
            console.error('[Core] ❌ Erreur lors de la vérification de reprise:', e.message);
        }
    }

    /**
     * (Module 3) Vérification de la Roadmap au premier message
     */
    async _checkRoadmap(chatId: string, isGroup: boolean) {
        if (!isGroup) return;
        const { db } = this;
        const config = await db.getGroupConfig(chatId);

        // Si pas de config ou description vide, on lance le prompt d'initialisation
        if (!config || !config.description) {
            // On vérifie si on a déjà demandé récemment (pour éviter le spam) dans workingMemory ou logs
            // Pour l'instant on le fait simplement :
            await this.transport.sendText(chatId, "⚠️ *Configuration Requise*\nJe n'ai pas de feuille de route pour ce groupe. Quel est notre objectif ici ? (Répondez pour définir la mission)");

            // On pourrait créer une entrée temporaire pour marquer qu'on a demandé
            await db.upsertGroupConfig(chatId, { description: "EN_ATTENTE" });
        }
    }

    /**
     * Exécute un outil avec Graceful Degradation et Mémoire Épisodique
     * Les erreurs sont capturées et retournées à l'IA au lieu de faire crasher le flow
     * Toutes les actions sont loguées pour apprentissage (Episodic Memory)
     */
    async _executeTool(toolCall: any, message: any) {
        const { agentMemory } = this;
        const { name, arguments: argsJson } = toolCall.function;


        let args: any;
        try {
            args = JSON.parse(argsJson);
        } catch (parseErr: any) {
            console.error(`[Core] ❌ Erreur parsing arguments pour ${name}:`, parseErr.message);

            // Log l'échec de parsing
            await agentMemory.logAction(
                message.chatId,
                name,
                { raw: argsJson },
                null,
                'error',
                `Parse error: ${parseErr.message}`
            );

            return {
                success: false,
                message: `ERREUR_OUTIL: Impossible de parser les arguments pour "${name}". Arguments invalides.`,
                error: parseErr.message,
                gracefulDegradation: true
            };
        }

        const context = {
            transport: this.transport,
            container, // Injection du container pour accès aux services (Audit M3)
            message,
            chatId: message.chatId,
            sender: message.sender,
            // sourceChannel is used by PermissionManager.askPermission to route
            // the sandbox permission prompt to the correct transport adapter.
            sourceChannel: message.sourceChannel ?? (message.chatId?.endsWith('@g.us') ? 'group' : 'private'),
            // [ASYNC RENDERING] Callback de progression pour feedback temps réel
            onProgress: (statusMessage: string) => {
                eventBus.publish(BotEvents.TOOL_PROGRESS, { tool: name, status: statusMessage, chatId: message.chatId });
                console.log(`[Tool Progress] ⏳ ${name}: ${statusMessage}`);
            }
        };

        // [AGENTIC] Vérifier si cet outil a récemment échoué (éviter répétition)
        const recentFailure = await agentMemory.hasRecentFailure(message.chatId, name, 15);
        if (recentFailure.hasFailure) {
            console.warn(`[Core] ⚠️ Outil "${name}" a échoué récemment: ${recentFailure.errorMessage}`);
            // On continue quand même mais on log l'avertissement
        }

        try {
            const result = await pluginLoader.execute(name, args, context);

            // [AGENTIC] Log succès dans la mémoire épisodique
            await agentMemory.logAction(
                message.chatId,
                name,
                args,
                typeof result === 'object' ? result : { response: result },
                'success',
                null
            );

            return result;
        } catch (execErr: any) {
            // Graceful Degradation: On retourne l'erreur à l'IA au lieu de crasher
            console.error(`[Core] ⚠️ Graceful Degradation - Outil "${name}" a échoué:`, execErr.message);

            // Classifier le type d'erreur pour un message plus utile à l'IA
            let errorType = 'ERREUR_INTERNE';
            let userFriendlyMsg = execErr.message;

            if (execErr.message.includes('timeout') || execErr.message.includes('Timeout')) {
                errorType = 'TIMEOUT';
                userFriendlyMsg = 'Le service a mis trop de temps à répondre';
            } else if (execErr.message.includes('network') || execErr.message.includes('fetch')) {
                errorType = 'ERREUR_RESEAU';
                userFriendlyMsg = 'Impossible de joindre le service externe';
            } else if (execErr.message.includes('401') || execErr.message.includes('403')) {
                errorType = 'ERREUR_AUTH';
                userFriendlyMsg = 'Problème d\'authentification avec le service';
            } else if (execErr.message.includes('404')) {
                errorType = 'NON_TROUVE';
                userFriendlyMsg = 'La ressource demandée n\'existe pas';
            } else if (execErr.message.includes('rate') || execErr.message.includes('limit')) {
                errorType = 'RATE_LIMIT';
                userFriendlyMsg = 'Trop de requêtes, réessayer plus tard';
            }

            // [AGENTIC] Log échec dans la mémoire épisodique
            await agentMemory.logAction(
                message.chatId,
                name,
                args,
                null,
                'error',
                `[${errorType}] ${execErr.message}`
            );

            return {
                success: false,
                message: `ERREUR_OUTIL [${errorType}]: L'outil "${name}" a échoué - ${userFriendlyMsg}. Tu peux expliquer à l'utilisateur que cette fonctionnalité est temporairement indisponible et continuer avec les autres demandes.`,
                error: execErr.message,
                errorType: errorType,
                gracefulDegradation: true
            };
        }
    }

    /**
     * Génère un refus humanisé
     */
    async _generateRefusal(originalMessage: string, reason: string) {
        // Construction du prompt via le template chargé
        let prompt = refusalPrompt
            .replace('{{name}}', persona.name)
            .replace('{{reason}}', reason)
            .replace('{{role}}', persona.role || 'Assistant');

        const response = await providerRouter.chat([
            {
                role: 'system',
                content: prompt
            },
            { role: 'user', content: originalMessage }
        ], { temperature: 0.9, family: 'google' }); // Optimisation : on force Google pour les tâches simples (rapide/gratuit)

        return response.content;
    }

    /**
     * Reformule le résultat d'un outil
     * @param {string} originalMessage - Message original de l'utilisateur
     * @param {string} result - Résultat de l'outil
     * @param {string} [family] - Family du provider à utiliser (pour maintenir la cohérence)
     */
    async _reformulateResult(originalMessage: string, result: string, family: string | null = null) {
        const response = await providerRouter.chat([
            {
                role: 'system',
                content: `You are ${persona.name}. Formulate a natural response based on this result: ${result}. Be concise.`
            },
            { role: 'user', content: originalMessage }
        ], {
            temperature: 0.7,
            // Forcer le même provider pour la cohérence du contexte
            ...(family && { family })
        });

        return response.content;
    }

    // ========================================================================
    // NOTE: _parseTextCommand a été supprimé (Phase 1 - Découplage)
    // Les patterns textuels sont maintenant déclarés dans chaque plugin via textMatchers
    // Voir: pluginLoader.findTextHandler() dans plugins/loader.js
    // ========================================================================

    /**
     * Délai naturel pour simuler la frappe
     */
    async _naturalDelay(ms: number = 1500) {
        // WHY: Use the caller's requested delay as base, add ±30% jitter for natural feel.
        // Old code ignored `ms` entirely and always used 1000-2500ms.
        const jitter = ms * 0.3;
        const delay = ms + (Math.random() * jitter * 2 - jitter); // ms ± 30%
        await new Promise(r => setTimeout(r, Math.max(100, delay)));
    }

    /**
     * Gère les événements de groupe (Module 3 & 2)
     */
    async _handleGroupEvent(event: any) {
        const { db, groupService } = this;
        const { groupId, participants, action } = event.data;


        // DTC Phase 1: Invalider le cache Redis sur les événements critiques
        if (['promote', 'demote', 'remove'].includes(action)) {
            await groupService.invalidateCache(groupId);
        }

        // **NOUVEAU: Tracking des événements membres dans la base**
        for (const participant of participants) {
            try {
                // Enregistrer l'événement dans l'historique
                await db.recordMemberEvent(groupId, participant, action);

                // Si c'est un ajout, vérifier si l'utilisateur a déjà quitté
                if (action === 'add') {
                    const hasLeftBefore = await db.hasLeftBefore(groupId, participant);
                    if (hasLeftBefore) {
                        const username = participant.split('@')[0];
                        console.log(`[GroupEvent] 🔄 Utilisateur ${username} a rejoint à nouveau`);

                        // Optionnel: Notifier le groupe
                        await this.transport.sendText(
                            groupId,
                            `👀 @${username} est de retour dans le groupe!`,
                            { mentions: [participant] }
                        );
                    }
                }
            } catch (error: any) {
                // Tentative de récupération si le groupe n'existe pas en DB (FK Violation)
                if (error?.code === '23503' || error?.message?.includes('foreign key constraint')) {
                    console.log('[GroupEvent] 🔄 Groupe inconnu en DB, synchronisation d\'urgence...');
                    try {
                        const metadata = await this.transport.getGroupMetadata(groupId);
                        await groupService.updateGroup(groupId, metadata);

                        // Retry l'insertion
                        await db.recordMemberEvent(groupId, participant, action);
                        console.log('[GroupEvent] ✓ Synchronisation et tracking réussis');
                    } catch (syncError: any) {
                        console.error('[GroupEvent] Échec récupération sync:', syncError);
                    }
                } else {
                    console.error('[GroupEvent] Erreur tracking:', error);
                }
            }
        }

        // Gestionnaire spécifique pour les arrivées (Welcome)
        if (action === 'add') {
            await this._handleGroupWelcome(event as BotEvent);

            // **NOUVEAU: Définir le fondateur si c'est la première fois**
            try {
                const founder = await db.getGroupFounder(groupId);
                if (!founder) {
                    // Récupérer les métadonnées du groupe pour identifier le créateur
                    const metadata = await this.transport.getGroupMetadata(groupId);
                    const creatorJid = metadata.owner || metadata.subjectOwner;

                    if (creatorJid) {
                        await db.setGroupFounder(groupId, creatorJid);
                        console.log(`[GroupEvent] ✓ Fondateur défini: ${creatorJid}`);
                    }
                }
            } catch (error: any) {
                console.error('[GroupEvent] Erreur définition fondateur:', error);
            }
        }

        // Logs basiques pour les autres actions
        const messages = {
            remove: `👋 Au revoir @${participants[0].split('@')[0]}...`,
            promote: `🎉 Félicitations @${participants[0].split('@')[0]} est maintenant admin !`,
            demote: `📉 @${participants[0].split('@')[0]} n'est plus admin.`
        };

        if ((messages as any)[action]) {
            await this.transport.sendText(groupId, (messages as any)[action], {
                mentions: participants
            });
        }
    }

    /**
     * Gère une tâche planifiée
     */
    async _handleScheduledJob(event: any) {
        console.log(`[Scheduler] Exécution job: ${event.job}`);

        // À implémenter selon le job
        switch (event.job) {
            case 'dailyGreeting':
                // Envoyer un message matinal aux groupes actifs
                break;

            case 'spontaneousReflection':
                console.log('[Scheduler] 🤔 Réflexion Spontanée (Goal Seeking)...');

                // 1. Identifier les groupes inactifs (Morts depuis 3h+)
                // On exclut la nuit (22h - 9h) pour ne pas spammer
                const hour = new Date().getHours();
                if (hour < 9 || hour >= 22) return;

                const inactiveGroups = await this.workingMemory.getInactiveGroups(180); // 3 heures

                for (const groupId of inactiveGroups) {
                    console.log(`[GoalSeeking] 💀 Groupe inactif détecté : ${groupId}`);

                    // 2. Vérifier si on doit intervenir (Random check pour ne pas être robotique)
                    if (Math.random() > 0.3) continue; // 30% de chance d'intervenir par cycle

                    // 3. Simuler un message système pour déclencher la boucle cognitive
                    // On injecte une pensée comme si elle venait de l'intérieur
                    const fakeContext = {
                        isGroup: true,
                        chatId: groupId,
                        text: "SYSTEM_WAKEUP_PROTOCOL: The group is inactive. Generate a thought to wake it up politely or with a controversial topic about tech/AI.",
                        senderName: "SYSTEM",
                        sender: "system@internal"
                    };

                    await this._handleMessage({ data: fakeContext } as BotEvent);
                }
                break;

            case 'spontaneousReflection':
                // [AGENTIC] Réflexion Spontanée
                // Le bot "pense" à voix haute dans les logs et peut décider d'agir
                console.log('[Agent] 🧘 Réflexion spontanée déclenchée...');
                // TODO: Implémenter la logique de scan des tâches en attente ou ping users inactifs
                // Pour l'instant on log juste pour vérifier le heartbeat cognitive
                break;

            case 'reminderCheck':
                // Vérifier et envoyer les rappels
                const reminders = await this.db.getPendingReminders();
                for (const reminder of reminders) {
                    // Check if it's a COMMAND payload
                    if (reminder.message.startsWith('COMMAND:BAN_USER:')) {
                        try {
                            // Syntax: COMMAND:BAN_USER:{jid}|Reason
                            const payload = reminder.message.replace('COMMAND:BAN_USER:', '');
                            const [targetJid, reason] = payload.split('|');

                            console.log(`[Scheduler] 🚀 Exécution BAN planifié pour ${targetJid}`);

                            // Execute ban via transport directly (simpler than invoking plugin execute)
                            await this.transport.banUser(reminder.chat_id, targetJid);

                            // Send confirmation
                            await this.transport.sendText(
                                reminder.chat_id,
                                `🚫 **Ban planifié exécuté**\nUtilisateur: @${targetJid.split('@')[0]}\nRaison: ${reason || 'Aucune'}`
                            );
                        } catch (err: any) {
                            console.error(`[Scheduler] ❌ Erreur exécution BAN planifié: ${err.message}`);
                            await this.transport.sendText(
                                reminder.chat_id,
                                `⚠️ Échec du ban planifié pour @${reminder.message.split(':')[2]?.split('|')[0] || '?'} : ${err.message}`
                            );
                        }
                    } else {
                        // Standard reminder
                        await this.transport.sendText(
                            reminder.chat_id,
                            `⏰ Rappel: ${reminder.message}`
                        );
                    }

                    await this.db.markReminderSent(reminder.id);
                }
                break;

            case 'memoryConsolidation':
                console.log('[Scheduler] 🧶 Consolidation de la mémoire et Tissage du savoir...');
                try {
                    // 1. Récupérer les chats actifs récemment depuis Redis
                    const { redis } = await import('../services/redisClient.js');
                    const keys = await redis.keys('chat:*:context');
                    const chatIds = keys.map((k: any) => k.split(':')[1]);

                    if (chatIds.length === 0) {
                        console.log('[Scheduler] Aucun chat actif à consolider.');
                        break;
                    }

                    console.log(`[Scheduler] Consolidation de ${chatIds.length} chats...`);
                    const consolidationService = container.get('consolidationService');

                    for (const chatId of chatIds) {
                        // Consolidation asynchrone pour ne pas bloquer le scheduler
                        consolidationService.consolidate(chatId).catch((err: any) =>
                            console.error(`[Scheduler] Erreur consolidation ${chatId}:`, err.message)
                        );
                    }
                } catch (e: any) {
                    console.error('[Scheduler] Erreur globale consolidation:', e.message);
                }
                break;

            case 'cognitiveDream':
                console.log('[Scheduler] 💤 Le bot entre en phase de rêve (Auto-Reflection)...');
                try {
                    const dreamService = container.get('dream');
                    if (dreamService) {
                        await dreamService.dream();
                    }
                } catch (e: any) {
                    console.error('[Scheduler] Erreur pendant le rêve:', e.message);
                }
                break;

            case 'memoryCleanup':
                console.log('[Scheduler] 🧹 Nettoyage mémoire sémantique...');
                try {
                    // Récupérer les chats avec beaucoup de messages stockés
                    const { supabase } = await import('../services/supabase.js');
                    const { data: heavyChats } = supabase ? await supabase
                        .from('semantic_memory')
                        .select('chat_id')
                        .limit(100) : { data: [] };

                    if (heavyChats && heavyChats.length > 0) {
                        // Extraire les chat_ids uniques
                        const uniqueChatIds = [...new Set(heavyChats.map((m: any) => m.chat_id))];
                        console.log(`[Scheduler] ${uniqueChatIds.length} chat(s) à nettoyer`);

                        for (const chatId of uniqueChatIds) {
                            // Cleanup additionnel si nécessaire
                            const memory = container.get('memory');
                            await memory.cleanup(chatId, 100);
                        }
                    }
                    console.log('[Scheduler] ✅ Nettoyage mémoire terminé');
                } catch (error: any) {
                    console.error('[Scheduler] Erreur memoryCleanup:', error.message);
                }
                break;

            case 'tempCleanup':
                console.log('[Scheduler] 🧹 Nettoyage fichiers temporaires...');
                try {
                    const { CleanupService } = await import('../services/cleanup.js');
                    const cleanup = new CleanupService();
                    await cleanup.run();
                } catch (err: any) {
                    console.error('[Scheduler] Erreur tempCleanup:', err.message);
                }
                break;
        }

        eventBus.publish(BotEvents.JOB_COMPLETED, { job: event.job });
    }

    /**
     * Gère les déclencheurs proactifs
     */
    /**
     * Gère la réponse proactive
     */
    async _handleProactive(event: BotEvent): Promise<void> {
        // ... (code existant)
        // Réponse proactive sur keyword détecté
        const { chatId, text } = event.data;

        const response = await providerRouter.chat([
            {
                role: 'system',
                content: `You are ${persona.name}. Intervene naturally on this topic that interests you. Be brief and bring value.`
            },
            { role: 'user', content: text }
        ]);

        await this._naturalDelay();
        await this.transport.sendUniversalResponse(chatId, { markdown: response.content }, {}, (event.data as any).sourceChannel);
    }

    /**
     * Gère l'arrêt d'urgence du bot (.shutdown)
     * Format: .shutdown [duration] (ex: .shutdown 2h)
     */
    async _handleShutdown(message: any): Promise<void> {
        const { adminService } = this;
        const { sender, chatId, text } = message;


        // DTC Phase 1: Vérification Admin Global via adminService (Supabase)
        if (!adminService.isGlobalAdmin(sender)) {
            console.log(`[Security] Tentative de shutdown non autorisée par ${sender}`);
            // Pas de réponse pour ne pas révéler la commande
            return;
        }

        console.log(`[Security] Shutdown demandé par ${sender}`);

        // Analyse de la durée (.shutdown 2h, .shutdown 30m)
        const args = text.split(' ');
        const durationStr = args[1];
        let shutdownUntil: any = null;

        if (durationStr) {
            const match = durationStr.match(/^(\d+)([hm])$/);
            if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2];
                const ms = amount * (unit === 'h' ? 3600000 : 60000);
                shutdownUntil = Date.now() + ms;
            }
        }

        // Message d'adieu
        const goodbye = shutdownUntil
            ? `😴 Je fais une sieste de ${durationStr}. À tout à l'heure !`
            : `👋 Arrêt du système demandé. Au revoir !`;

        await this.transport.sendText(chatId, goodbye);

        // Créer le fichier de verrouillage si temporaire
        if (shutdownUntil) {
            writeFileSync(join(__dirname, '..', '.shutdown_lock'), shutdownUntil.toString());
        }

        // Laisser le temps au message de partir
        setTimeout(() => {
            // [WAKE] Arrêter proprement le heartbeat pour permettre un shutdown clean
            hiveWakeSystem.stop();
            mailboxWatcher.stop();
            console.log('🛑 Arrêt du processus.');
            process.exit(0);
        }, 2000);
    }

    // ======== OPTION B: EXTRACTION AUTOMATIQUE DE FAITS ========

    /**
     * Extrait automatiquement les faits importants d'un message
     * Fonctionne en arrière-plan sans bloquer la réponse
     * @param {string} text - Texte du message utilisateur
     * @param {string} userJid - JID de l'utilisateur
     */
    async _extractFacts(text: string, userJid: string): Promise<void> {
        const { factsMemory } = this;
        // Ne pas traiter les messages trop courts ou les commandes

        if (!text || text.length < 10 || text.startsWith('.') || text.startsWith('/')) {
            return;
        }

        // Patterns pour détecter les informations personnelles
        const patterns = [
            // Nom
            { regex: /(?:je (?:m'appelle|suis|me nomme))\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i, key: 'nom' },
            // Ville/Lieu
            { regex: /(?:j'habite|je vis|je suis)\s+(?:à|en|au)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i, key: 'ville' },
            // Métier
            { regex: /(?:je suis|je travaille comme)\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)?)/i, key: 'métier' },
            // Age
            { regex: /(?:j'ai|j ai)\s+(\d{1,3})\s*ans/i, key: 'age' },
            // Anniversaire
            { regex: /(?:mon anniversaire|je suis né|née le)\s+(?:le\s+)?(\d{1,2}\s+\w+)/i, key: 'anniversaire' },
            // Préférence couleur
            { regex: /(?:ma couleur préférée|j'aime le|j'adore le)\s+(bleu|rouge|vert|jaune|noir|blanc|rose|violet|orange)/i, key: 'couleur_préférée' },
        ];

        const extractedFacts = [];

        // Extraction par patterns regex
        for (const { regex, key } of patterns) {
            const match = text.match(regex);
            if (match && match[1]) {
                const value = match[1].trim();
                // Éviter les faux positifs (valeurs trop courtes ou génériques)
                if (value.length >= 2 && !['un', 'une', 'le', 'la'].includes(value.toLowerCase())) {
                    extractedFacts.push({ key, value });
                }
            }
        }

        // Stocker les faits trouvés
        if (extractedFacts.length > 0) {
            console.log(`[Core] Faits extraits automatiquement: ${extractedFacts.length}`);

            for (const { key, value } of extractedFacts) {
                try {
                    await factsMemory.remember(userJid, key, value);
                    console.log(`  ✓ ${key}: ${value}`);
                } catch (err: any) {
                    console.error(`  ✗ Erreur stockage ${key}:`, err.message);
                }
            }
        }
    }
}

export const botCore = new BotCore();
export default botCore;
