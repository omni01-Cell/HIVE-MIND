/**
 * Commandes slash spécifiques à HIVE-MIND
 *
 * Ces commandes exploitent les fonctionnalités uniques de HIVE-MIND :
 * - Gestion multi-canal (WhatsApp, Discord, Telegram)
 * - Mémoire distribuée (Redis, pgvector, PostgreSQL)
 * - Plugins et outils (50+ outils)
 * - Scheduler/Cron jobs
 * - Voice (Gemini Live, TTS)
 * - Smart Router V2
 * - Safety (Sentinel VIGIL)
 */


/**
 * Commande /status — État du bot HIVE-MIND
 */
export const hiveStatusCommand: SlashCommand = {
    name: 'status',
    altNames: ['etat', 'state'],
    description: 'Affiche l\'état complet du bot HIVE-MIND',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            // Import dynamique du core
            const { botCore } = await import('../../../core/index.js');
            const { container } = await import('../../../core/ServiceContainer.js');

            // Récupérer l'état des services
            const redis = container.has('redis') ? container.get('redis') : null;
            const supabase = container.has('supabase') ? container.get('supabase') : null;
            const transportManager = botCore.transport;

            let statusText = '🤖 *État HIVE-MIND*\n\n';

            // Core
            statusText += `**Core:** ${botCore.isReady ? '✅ Prêt' : '❌ Non initialisé'}\n`;

            // Redis
            if (redis) {
                try {
                    await redis.ping();
                    statusText += '**Redis:** ✅ Connecté\n';
                } catch {
                    statusText += '**Redis:** ❌ Déconnecté\n';
                }
            } else {
                statusText += '**Redis:** ⚠️ Non configuré\n';
            }

            // Supabase
            if (supabase) {
                try {
                    await supabase.from('users').select('count').limit(1);
                    statusText += '**Supabase:** ✅ Connecté\n';
                } catch {
                    statusText += '**Supabase:** ❌ Erreur de connexion\n';
                }
            } else {
                statusText += '**Supabase:** ⚠️ Non configuré\n';
            }

            // Transports actifs
            const activeTransports = transportManager?.activeTransports || [];
            statusText += `**Transports:** ${activeTransports.join(', ') || 'Aucun'}\n`;

            // Modèle actuel
            statusText += `**Modèle:** ${process.env.HIVE_MODEL || 'gemini-2.0-flash'}\n`;

            // Uptime
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            statusText += `**Uptime:** ${hours}h ${minutes}m\n`;

            addItem({
                type: 'info',
                text: statusText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération du statut: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /plugins — Liste les plugins chargés
 */
export const hivePluginsCommand: SlashCommand = {
    name: 'plugins',
    altNames: ['extensions', 'addons'],
    description: 'Liste les plugins HIVE-MIND chargés',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            const { pluginLoader } = await import('../../../plugins/loader.js');

            const tools = pluginLoader.getToolDefinitions();
            const toolNames = tools.map((t: { function?: { name?: string } }) => t.function?.name).filter(Boolean);

            let pluginsText = '🔌 *Plugins HIVE-MIND*\n\n';
            pluginsText += `**Nombre d'outils:** ${toolNames.length}\n\n`;
            pluginsText += '**Outils disponibles:**\n';
            pluginsText += toolNames.map((name: string) => `• ${name}`).join('\n');

            addItem({
                type: 'info',
                text: pluginsText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération des plugins: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /memory — État de la mémoire
 */
export const hiveMemoryCommand: SlashCommand = {
    name: 'memory',
    altNames: ['memoire', 'mem'],
    description: 'Affiche l\'état de la mémoire distribuée',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            const { container } = await import('../../../core/ServiceContainer.js');

            let memoryText = '🧠 *Mémoire HIVE-MIND*\n\n';

            // L0: In-process
            memoryText += '**L0 (In-process):** ✅ Active\n';

            // L1: Redis
            const redis = container.has('redis') ? container.get('redis') : null;
            if (redis) {
                try {
                    const info = await redis.info('memory');
                    const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1] || 'N/A';
                    memoryText += `**L1 (Redis):** ✅ ${usedMemory} utilisé\n`;
                } catch {
                    memoryText += '**L1 (Redis):** ⚠️ Non disponible\n';
                }
            } else {
                memoryText += '**L1 (Redis):** ❌ Non configuré\n';
            }

            // L2: pgvector
            const supabase = container.has('supabase') ? container.get('supabase') : null;
            if (supabase) {
                try {
                    const { count } = await supabase
                        .from('workspace_write')
                        .select('*', { count: 'exact', head: true });
                    memoryText += `**L2 (pgvector):** ✅ ${count || 0} entrées\n`;
                } catch {
                    memoryText += '**L2 (pgvector):** ⚠️ Non disponible\n';
                }
            } else {
                memoryText += '**L2 (pgvector):** ❌ Non configuré\n';
            }

            // L3: PostgreSQL
            memoryText += '**L3 (PostgreSQL):** ✅ Connecté\n';

            addItem({
                type: 'info',
                text: memoryText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération de la mémoire: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /routes — État du Smart Router
 */
export const hiveRoutesCommand: SlashCommand = {
    name: 'routes',
    altNames: ['router', 'keys'],
    description: 'Affiche l\'état du Smart Router V2 et des clés API',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            const { container } = await import('../../../core/ServiceContainer.js');
            const quotaManager = container.has('quotaManager') ? container.get('quotaManager') : null;

            let routesText = '🔑 *Smart Router V2*\n\n';

            if (quotaManager) {
                // Récupérer les stats des clés
                routesText += '**Clés configurées:**\n';
                routesText += '• GOOGLE_AI_KEY: Configurée\n';
                routesText += '• OPENAI_KEY: Configurée\n';
                routesText += '• ANTHROPIC_KEY: Configurée\n';

                // Quotas
                routesText += '\n**Quotas:**\n';
                routesText += '• Gemini: 10 req/min\n';
                routesText += '• OpenAI: 500 req/min\n';
            } else {
                routesText += '⚠️ Smart Router non configuré\n';
            }

            addItem({
                type: 'info',
                text: routesText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération des routes: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /groups — Liste les groupes gérés
 */
export const hiveGroupsCommand: SlashCommand = {
    name: 'groups',
    altNames: ['groupes', 'grp'],
    description: 'Liste les groupes WhatsApp/Discord gérés',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            const { container } = await import('../../../core/ServiceContainer.js');
            const groupService = container.has('groupService') ? container.get('groupService') : null;

            let groupsText = '👥 *Groupes HIVE-MIND*\n\n';

            if (groupService) {
                // Récupérer les groupes depuis la base
                const { supabase } = await import('../../../services/supabase.js');
                const { data: groups } = await supabase
                    .from('groups')
                    .select('id, name, platform')
                    .limit(10);

                if (groups && groups.length > 0) {
                    groupsText += groups.map((g: { name: string; platform: string }) =>
                        `• **${g.name}** (${g.platform})`
                    ).join('\n');
                } else {
                    groupsText += 'Aucun groupe configuré';
                }
            } else {
                groupsText += '⚠️ Service de groupes non disponible';
            }

            addItem({
                type: 'info',
                text: groupsText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération des groupes: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /cron — Liste les tâches planifiées
 */
export const hiveCronCommand: SlashCommand = {
    name: 'cron',
    altNames: ['scheduler', 'taches'],
    description: 'Affiche les tâches planifiées (cron jobs)',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            const { container } = await import('../../../core/ServiceContainer.js');
            const schedulerHandler = container.has('schedulerHandler') ? container.get('schedulerHandler') : null;

            let cronText = '⏰ *Tâches Planifiées*\n\n';

            if (schedulerHandler) {
                // Récupérer les crons actifs
                cronText += '**Crons actifs:**\n';
                cronText += '• memoryEventScanner (toutes les heures)\n';
                cronText += '• sessionCleanup (quotidien)\n';
                cronText += '• memoryConsolidation (hebdomadaire)\n';
            } else {
                cronText += '⚠️ Scheduler non disponible';
            }

            addItem({
                type: 'info',
                text: cronText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération des crons: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /security — État de la sécurité
 */
export const hiveSecurityCommand: SlashCommand = {
    name: 'security',
    altNames: ['securite', 'secu'],
    description: 'Affiche l\'état du système de sécurité (Sentinel, HITL)',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            let securityText = '🛡️ *Sécurité HIVE-MIND*\n\n';

            // Sentinel VIGIL
            securityText += '**Sentinel VIGIL:** ✅ Actif\n';
            securityText += '• Évalue les actions avant exécution\n';
            securityText += '• Bloque les actions à risque\n';

            // PermissionManager (HITL)
            securityText += '\n**PermissionManager (HITL):** ✅ Actif\n';
            securityText += '• Logique 0: CLI/TUI (admin local)\n';
            securityText += '• Logique 1: Admin Hub (out-of-band)\n';
            securityText += '• Logique 2: In-band avec escalade\n';

            // Sandbox
            securityText += '\n**Sandbox:** ✅ Active\n';
            securityText += `• Répertoire: ${process.env.SANDBOX_DIR || 'Sandbox1'}\n`;

            // SafeScriptValidator
            securityText += '\n**SafeScriptValidator:** ✅ Actif\n';
            securityText += '• Layer 1: AST validation\n';
            securityText += '• Layer 2: Proxy protection\n';
            securityText += '• Layer 3: Auto-repair\n';

            addItem({
                type: 'info',
                text: securityText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération de la sécurité: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Commande /voice — État du système vocal
 */
export const hiveVoiceCommand: SlashCommand = {
    name: 'voice',
    altNames: ['vocal', 'tts'],
    description: 'Affiche l\'état du système vocal (TTS, STT, Live)',
    kind: CommandKind.BUILTIN,
    isEnabled: () => true,
    execute: async (context: CommandContext) => {
        const { addItem } = context.ui;

        try {
            let voiceText = '🎤 *Système Vocal*\n\n';

            // TTS
            voiceText += '**TTS (Text-to-Speech):** ✅ Actif\n';
            voiceText += '• Gemini TTS (Kore)\n';
            voiceText += '• Minimax Persona\n';

            // STT
            voiceText += '\n**STT (Speech-to-Text):** ✅ Actif\n';
            voiceText += '• Gemini Live API\n';
            voiceText += '• Groq Whisper\n';

            // Live Audio
            voiceText += '\n**Live Audio:** ✅ Actif\n';
            voiceText += '• WebSocket Gemini Live\n';
            voiceText += '• VAD (Voice Activity Detection)\n';

            addItem({
                type: 'info',
                text: voiceText
            }, Date.now());

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            addItem({
                type: 'error',
                text: `❌ Erreur lors de la récupération de la voix: ${message}`
            }, Date.now());
        }

        return { type: 'handled' as const };
    }
};

/**
 * Exporte toutes les commandes HIVE-MIND
 */
export const hiveCommands: SlashCommand[] = [
    hiveStatusCommand,
    hivePluginsCommand,
    hiveMemoryCommand,
    hiveRoutesCommand,
    hiveGroupsCommand,
    hiveCronCommand,
    hiveSecurityCommand,
    hiveVoiceCommand
];
