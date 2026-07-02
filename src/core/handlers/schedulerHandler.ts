// core/handlers/schedulerHandler.js
// Gère les tâches planifiées du scheduler
// Extrait de core/index.js pour modularité

import { eventBus, BotEvents } from '../events.js';
import { container } from '../ServiceContainer.js';
import { workingMemory } from '../../services/workingMemory.js';
import { db } from '../../services/supabase.js';
import { eventInboxService } from '../../services/events/EventInboxService.js';
import { actionMemory } from '../../services/memory/ActionMemory.js';
import { hiveWakeSystem } from '../../services/ptc/WakeSystem.js';
import { redis } from '../../services/redisClient.js';

/**
 * Gestionnaire des jobs planifiés
 */
export class SchedulerHandler {
    transport: any;
    messageHandler: any;

    constructor(transport: any, messageHandler: any = null) {
        this.transport = transport;
        this.messageHandler = messageHandler;
    }

    /**
     * Définit le handler de message (pour les jobs qui génèrent des messages)
     */
    setMessageHandler(handler: any) {
        this.messageHandler = handler;
    }

    /**
     * Exécute un job planifié
     * @param {Object} event - Événement du scheduler
     */
    async handleJob(event: any) {
        console.log(`[Scheduler] Exécution job: ${event.job}`);

        switch (event.job) {
            case 'dailyGreeting':
                await this._handleDailyGreeting();
                break;

            case 'spontaneousReflection':
                await this._handleSpontaneousReflection();
                break;

            case 'reminderCheck':
                await this._handleReminderCheck();
                break;

            case 'memoryConsolidation':
                await this._handleMemoryConsolidation();
                break;

            case 'cognitiveDream':
                await this._handleCognitiveDream();
                break;

            case 'memoryCleanup':
                await this._handleMemoryCleanup();
                break;

            case 'memoryDecay':
                await this._handleMemoryDecay();
                break;

            case 'memoryEventScanner':
                await this._handleMemoryEventScanner();
                break;

            case 'tempCleanup':
                await this._handleTempCleanup();
                break;

            case 'socialCueScan':
                await this._handleSocialCueScan();
                break;

            case 'goalExecution':
                await this._handleGoalExecution();
                break;

            // 🛡️ PHASE 3: Jobs de monitoring DB
            case 'dbHealthCheck':
                await this._handleDBHealthCheck();
                break;

            case 'dbPerformanceAnalysis':
                await this._handleDBPerformanceAnalysis();
                break;

            case 'dbWeeklyReport':
                await this._handleDBWeeklyReport();
                break;

            case 'dbCleanup':
                await this._handleDBCleanup();
                break;

            case 'consciousPulse':
                await this._handleConsciousPulse();
                break;

            default:
                console.warn(`[Scheduler] Job inconnu: ${event.job}`);
        }

        eventBus.publish(BotEvents.JOB_COMPLETED, { job: event.job });
    }

    async _handleDailyGreeting() {
        // Placeholder - Envoyer un message matinal aux groupes actifs
        console.log('[Scheduler] dailyGreeting - À implémenter');
    }

    async _handleSpontaneousReflection() {
        console.log('[Scheduler] 🤔 Réflexion Spontanée (Goal Seeking)...');

        const hour = new Date().getHours();
        if (hour < 9 || hour >= 22) return;

        const inactiveGroups = await workingMemory.getInactiveGroups(180);

        for (const groupId of inactiveGroups) {
            console.log(`[GoalSeeking] 💀 Groupe inactif détecté : ${groupId}`);

            if (Math.random() > 0.3) continue;

            const fakeContext = {
                isGroup: true,
                chatId: groupId,
                text: 'SYSTEM_WAKEUP_PROTOCOL: The group is inactive. Generate a thought to wake it up politely or with a controversial topic about tech/AI.',
                senderName: 'SYSTEM',
                sender: 'system@internal'
            };

            if (this.messageHandler) {
                await this.messageHandler({ data: fakeContext });
            }
        }
    }

    async _handleReminderCheck() {
        const reminders = await db.getPendingReminders();

        for (const reminder of reminders) {
            let chatId = reminder.chat_id;
            // Si context_id est présent (nouvelle architecture), le résoudre en legacy chatId
            if (!chatId && reminder.context_id) {
                chatId = await db.resolveLegacyIdFromContext(reminder.context_id);
            }
            if (!chatId) {
                console.error(`[Scheduler] ❌ Impossible de résoudre le chatId pour le rappel ${reminder.id}`);
                await db.markReminderSent(reminder.id);
                continue;
            }

            let actualMessage = reminder.message;
            let cronExpr = null;

            if (actualMessage.startsWith('[WS:')) {
                actualMessage = actualMessage.replace(/^\[WS:\s*(.+?)\]\s*/i, '');
            }

            if (actualMessage.startsWith('[CRON:')) {
                const match = actualMessage.match(/^\[CRON:\s*(.+?)\]\s*(.*)$/i);
                if (match) {
                    cronExpr = match[1].trim();
                    actualMessage = match[2].trim();
                }
            }

            if (actualMessage.startsWith('COMMAND:BAN_USER:')) {
                try {
                    const payload = actualMessage.replace('COMMAND:BAN_USER:', '');
                    const [targetJid, reason] = payload.split('|');

                    console.log(`[Scheduler] 🚀 Exécution BAN planifié pour ${targetJid}`);
                    await this.transport.banUser(chatId, targetJid);

                    await this.transport.sendText(
                        chatId,
                        `🚫 **Ban planifié exécuté**\nUtilisateur: @${targetJid.split('@')[0]}\nRaison: ${reason || 'Aucune'}`
                    );
                } catch (err: any) {
                    console.error(`[Scheduler] ❌ Erreur exécution BAN planifié: ${err.message}`);
                    await this.transport.sendText(
                        chatId,
                        `⚠️ Échec du ban planifié: ${err.message}`
                    );
                }
            } else {
                await this.transport.sendText(
                    chatId,
                    `⏰ Rappel: ${actualMessage}`
                );
            }

            if (cronExpr) {
                try {
                    const parser: any = (await import('cron-parser')).default;
                    // Use the original remind_at as the reference point to avoid drifting next dates when the bot is offline
                    const interval = parser.parseExpression(cronExpr, { currentDate: new Date(reminder.remind_at) });
                    const nextDate = interval.next().toDate();
                    await db.rescheduleReminder(reminder.id, nextDate);
                    console.log(`[Scheduler] 🔄 Rappel récurrent reprogrammé pour: ${nextDate.toISOString()}`);
                } catch (err: any) {
                    console.error(`[Scheduler] Erreur reprogrammation cron (${cronExpr}):`, err.message);
                    await db.markReminderSent(reminder.id);
                }
            } else {
                await db.markReminderSent(reminder.id);
            }
        }
    }

    async _handleMemoryConsolidation() {
        console.log('[Scheduler] 🧶 Consolidation de la mémoire et Tissage du savoir...');
        try {
            const keys = await redis.keys('chat:*:context');
            const chatIds = keys.map((k: any) => k.split(':')[1]);

            if (chatIds.length === 0) {
                console.log('[Scheduler] Aucun chat actif à consolider.');
                return;
            }

            console.log(`[Scheduler] Consolidation de ${chatIds.length} chats...`);
            const consolidationService = container.get('consolidationService');

            for (const chatId of chatIds) {
                consolidationService.consolidate(chatId).catch((err: any) =>
                    console.error(`[Scheduler] Erreur consolidation ${chatId}:`, err.message)
                );
            }
        } catch (e: any) {
            console.error('[Scheduler] Erreur globale consolidation:', e.message);
        }
    }

    async _handleCognitiveDream() {
        console.log('[Scheduler] 💤 Le bot entre en phase de rêve (Auto-Reflection)...');
        try {
            const dreamService = container.get('dream');
            if (dreamService) {
                await dreamService.dream();
            }
        } catch (e: any) {
            console.error('[Scheduler] Erreur pendant le rêve:', e.message);
        }
    }

    async _handleMemoryCleanup() {
        console.log('[Scheduler] 🧹 Nettoyage mémoire sémantique...');
        try {
            const { supabase } = await import('../../services/supabase.js');
            const { data: heavyChats } = supabase ? await supabase
                .from('semantic_memory')
                .select('chat_id')
                .limit(100) : { data: [] as { chat_id: string }[] };

            if (heavyChats && heavyChats.length > 0) {
                const uniqueChatIds = [...new Set(heavyChats.map((m: { chat_id: string }) => m.chat_id))];
                console.log(`[Scheduler] ${uniqueChatIds.length} chat(s) à nettoyer`);

                for (const chatId of uniqueChatIds) {
                    const memory = container.get('memory');
                    await memory.cleanup(chatId, 100);
                }
            }
            console.log('[Scheduler] ✅ Nettoyage mémoire terminé');
        } catch (error: any) {
            console.error('[Scheduler] Erreur memoryCleanup:', error.message);
        }
    }

    async _handleMemoryEventScanner() {
        console.log('[Scheduler] 📅 Scan de la mémoire épistémique (agent_workspace) pour extraction de rappels...');
        try {
            const { supabase } = await import('../../services/supabase.js');
            const { providerRouter } = await import('../../providers/index.js');

            if (!supabase) {
                console.warn('[Scheduler] ⚠️ Supabase not available for epistemic scan');
                return;
            }

            // Scanner les documents modifiés dans les dernières 24 heures
            const targetTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const { data: workspaces, error } = await supabase
                .from('agent_workspace')
                .select('id, context_id, key, content')
                .gte('updated_at', targetTime);

            if (error) throw error;
            if (!workspaces || workspaces.length === 0) {
                console.log('[Scheduler] Aucun document workspace récent à analyser.');
                return;
            }

            let extractedCount = 0;

            for (const doc of workspaces) {
                const textToAnalyze = doc.content.substring(0, 2000);

                const prompt = `
You are a strict calendar extraction agent. Analyze the following workspace document and extract ONLY explicitly mentioned appointments, reminders, or future actions.
Strict rules:
1. If the event is ONE-TIME (e.g. "tomorrow at 3pm"), set "date_iso" with the exact date and leave "cron" empty.
2. If the event is RECURRING (e.g. "every Tuesday the 12th", "every Friday at 1pm"), set "cron" with a valid cron expression and leave "date_iso" empty.
Format de retour strictement JSON sans markdown (pas de balises \`\`\`json) :
[
  { "message": "Texte complet du rappel ou de la tâche", "date_iso": "2026-05-10T15:00:00.000Z", "cron": "0 13 * * 5" }
]
Si aucun événement futur n'est trouvé, renvoie exactement [].
Date et Heure actuelles: ${new Date().toISOString()}

Document [Clé: ${doc.key}]:
${textToAnalyze}
`;
                const response = await providerRouter.chat([{ role: 'user', content: prompt }], { category: 'FAST_CHAT', temperature: 0.1 });

                if (response?.content) {
                    try {
                        const jsonStr = response.content.replace(/```json\n?|\n?```/g, '').trim();
                        let events = [];
                        try {
                            const json5 = (await import('json5')).default;
                            events = json5.parse(jsonStr);
                        } catch {
                            events = JSON.parse(jsonStr);
                        }

                        if (Array.isArray(events) && events.length > 0) {
                            // Purge existing pending reminders for this document to synchronize state
                            await supabase.from('reminders')
                                .delete()
                                .eq('context_id', doc.context_id)
                                .like('message', `[WS: ${doc.key}]%`)
                                .eq('sent', false);

                            for (const ev of events) {
                                let targetDate = ev.date_iso;
                                let finalMessage = `[WS: ${doc.key}] ${ev.message}`;

                                if (ev.cron) {
                                    try {
                                        const parser: any = (await import('cron-parser')).default;
                                        const interval = parser.parseExpression(ev.cron);
                                        targetDate = interval.next().toISOString();
                                        finalMessage = `[CRON: ${ev.cron}] ${ev.message}`;
                                    } catch {
                                        console.error('[Scheduler] Cron invalide ignoré:', ev.cron);
                                        continue;
                                    }
                                }

                                if (finalMessage && targetDate && new Date(targetDate).getTime() > Date.now()) {

                                    await supabase.from('reminders').insert({
                                        context_id: doc.context_id,
                                        message: finalMessage,
                                        remind_at: targetDate,
                                        sent: false
                                    });
                                    console.log(`[Scheduler] ✅ Rappel créé: "${finalMessage}" pour ${targetDate}`);
                                    extractedCount++;
                                }
                            }
                        }
                    } catch (err: any) {
                        console.error(`[Scheduler] Erreur parsing JSON pour document ${doc.key}:`, err.message);
                    }
                }
            }

            console.log(`[Scheduler] Fin du scan. ${extractedCount} nouveau(x) rappel(s) créé(s).`);
        } catch (error: any) {
            console.error('[Scheduler] Erreur memoryEventScanner:', error.message);
        }
    }

    async _handleTempCleanup() {
        console.log('[Scheduler] 🧹 Nettoyage fichiers temporaires...');
        try {
            const { CleanupService } = await import('../../services/cleanup.js');
            const cleanup = new CleanupService();
            await cleanup.run();
        } catch (err: any) {
            console.error('[Scheduler] Erreur tempCleanup:', err.message);
        }
    }

    async _handleSocialCueScan() {
        console.log('[Scheduler] 👀 Scan des signaux sociaux...');
        try {
            const { socialCueWatcher } = await import('../../services/socialCueWatcher.js');
            const activeGroups = await workingMemory.getActiveGroups();

            for (const groupId of activeGroups) {
                const signal = await socialCueWatcher.scanGroup(groupId);
                if (signal && signal.shouldIntervene) {
                    console.log(`[SocialCue] 🚨 Intervention détectée pour ${groupId}: ${signal.reason}`);
                    // Déclenchement d'une intervention proactive
                    eventBus.publish(BotEvents.PROACTIVE_TRIGGER, {
                        chatId: groupId,
                        reason: signal.reason,
                        context: signal.context
                    });
                }
            }
        } catch (e: any) {
            console.error('[Scheduler] Erreur socialCueScan:', e.message);
        }
    }

    async _handleGoalExecution() {
        console.log('[Scheduler] 🎯 Vérification des objectifs autonomes...');
        try {
            const { goalsService } = await import('../../services/goalsService.js');
            const dueGoals = await goalsService.getDueGoals();

            for (const goal of dueGoals) {
                console.log(`[Goals] 🎯 Activation objectif: ${goal.title}`);

                // 1. Marquer comme en cours
                await goalsService.markInProgress(goal.id);

                // 2. Injecter un message système pour réveiller le bot
                if (this.messageHandler) {
                    await this.messageHandler({
                        data: {
                            isGroup: goal.target_chat_id ? goal.target_chat_id.endsWith('@g.us') : false,
                            chatId: goal.target_chat_id,
                            text: `SYSTEM_GOAL_TRIGGER: L'heure est venue d'exécuter l'objectif "${goal.title}".\nConsigne: ${goal.description}\nPriorité: ${goal.priority}`,
                            senderName: 'SYSTEM_SCHEDULER',
                            sender: 'system@internal',
                            isSystem: true // Flag pour traiter différemment si besoin
                        }
                    });
                    console.log(`[Goals] ✅ Trigger envoyé pour ${goal.id}`);
                } else {
                    console.error('[Goals] ❌ Impossible d\'exécuter: messageHandler non défini dans Scheduler');
                }
            }
        } catch (e: any) {
            console.error('[Scheduler] Erreur goalExecution:', e.message);
        }
    }

    async _handleMemoryDecay() {
        console.log('[Scheduler] 🧹💾 Cycle de décroissance mémoire...');
        try {
            const { memoryDecay } = await import('../../services/memory/MemoryDecay.js');
            const result = await memoryDecay.decayAll();

            console.log(`[Scheduler] ✅ Decay: ${result.archived} souvenirs archivés, ${result.kept} conservés dans ${result.chats} chats`);
        } catch (e: any) {
            console.error('[Scheduler] Erreur memoryDecay:', e.message);
        }
    }

    // 🛡️ PHASE 3: Jobs de monitoring DB (Audit #21)

    async _handleDBHealthCheck() {
        console.log('[Scheduler] 🏥 Exécution DB Health Check...');
        try {
            const { monitorDatabaseHealth } = await import('../../scheduler/dbMonitoring.js');
            await monitorDatabaseHealth();
        } catch (e: any) {
            console.error('[Scheduler] Erreur dbHealthCheck:', e.message);
        }
    }

    async _handleDBPerformanceAnalysis() {
        console.log('[Scheduler] 📊 Exécution DB Performance Analysis...');
        try {
            const { analyzePerformance } = await import('../../scheduler/dbMonitoring.js');
            await analyzePerformance();
        } catch (e: any) {
            console.error('[Scheduler] Erreur dbPerformanceAnalysis:', e.message);
        }
    }

    async _handleDBWeeklyReport() {
        console.log('[Scheduler] 📋 Génération Rapport Hebdomadaire DB...');
        try {
            const { generateWeeklyReport } = await import('../../scheduler/dbMonitoring.js');
            await generateWeeklyReport();
        } catch (e: any) {
            console.error('[Scheduler] Erreur dbWeeklyReport:', e.message);
        }
    }

    async _handleDBCleanup() {
        console.log('[Scheduler] 🧹 Exécution DB Cleanup (Audit #16)...');
        try {
            const { cleanupOldData } = await import('../../scheduler/dbMonitoring.js');
            await cleanupOldData();
        } catch (e: any) {
            console.error('[Scheduler] Erreur dbCleanup:', e.message);
        }
    }

    async _handleConsciousPulse() {
        console.log('[Watchdog] 💓 Audit système (Inbox, Crash Recovery, WakeEvents, MAPLE)...');
        try {
            // 0. MAPLE: Détecter les sessions terminées pour l'apprentissage
            try {
                const inactiveGroups = await workingMemory.getInactiveGroups(15);
                for (const chatId of inactiveGroups) {
                    const lockKey = `maple_lock:${chatId}`;
                    if (redis.isOpen && !(await redis.get(lockKey))) {
                        await eventInboxService.pushEvent('trigger_learning', 'watchdog', { chatId });
                        await redis.set(lockKey, '1', { EX: 3600 }); // Lock 1h
                    }
                }
            } catch (err: any) {
                console.error('[Watchdog] Erreur scan MAPLE inactifs:', err.message);
            }

            // 0.5. MindOS Drives : Évaluation des motivations proactives dans les groupes actifs
            try {
                const { driverSystem } = await import('../../services/mindos/DriverSystem.js');
                const activeChats = await workingMemory.getActiveGroups(120);
                for (const chatId of activeChats) {
                    await driverSystem.evaluateDrives(chatId, 'hive_main');
                }
            } catch (err: any) {
                console.error('[Watchdog] Erreur évaluation MindOS Drives:', err.message);
            }

            // 1. Check Inbox
            let unreadEvents = await eventInboxService.getUnreadEvents(10);

            // MAPLE learning events processing (without triggering main LLM mind)
            const learningEvents = unreadEvents.filter(e => e.type === 'trigger_learning');
            if (learningEvents.length > 0) {
                try {
                    const { learningEngine } = await import('../../services/learning/LearningEngine.js');
                    for (const evt of learningEvents) {
                        const chatId = (evt.payload as any)?.chatId;
                        if (chatId) {
                            learningEngine.extractInsights(chatId).catch(err => {
                                console.error('[Watchdog] learningEngine error:', err.message);
                            });
                        }
                        // Remove from inbox list so it's not shown in wakeupPrompt
                        if (redis.isOpen) {
                            await redis.lRem('hive:event_inbox', 0, JSON.stringify(evt));
                        }
                    }
                    // Reload unreadEvents to exclude the processed learning events
                    unreadEvents = await eventInboxService.getUnreadEvents(10);
                } catch (err: any) {
                    console.error('[Watchdog] Erreur traitement evenements MAPLE:', err.message);
                }
            }

            // 2. Check Zombies (tâches inactives depuis > 5 minutes)
            const stalledActions = await actionMemory.getStalledActions(5 * 60 * 1000);
            for (const action of stalledActions) {
                console.log(`[Watchdog] 🧟 Zombie détecté : ${action.type} (Chat: ${action.chatId})`);
                await actionMemory.interruptAction(action.chatId, 'TIMEOUT: Action stalled for more than 5 minutes.');

                if (this.transport && typeof this.transport.sendText === 'function') {
                    await this.transport.sendText(action.chatId, `⚠️ **Action Interrompue** : L'action \`${action.type}\` a été stoppée car elle ne répondait plus depuis 5 minutes.`);
                }
            }

            // 3. Check Wake Events échus
            const missedWakes = await hiveWakeSystem.getMissedWakes();

            // 4. Si rien, on ne réveille pas le LLM
            if (unreadEvents.length === 0 && stalledActions.length === 0 && missedWakes.length === 0) {
                return;
            }

            console.log(`[Watchdog] ⚠️ Réveil requis : ${unreadEvents.length} events, ${stalledActions.length} crashs, ${missedWakes.length} réveils.`);

            let wakeupPrompt = '[SYSTEM WATCHDOG & RECOVERY PROTOCOL]\nTu as été réveillé par le Heartbeat du système.\n\n';

            if (unreadEvents.length > 0) {
                wakeupPrompt += `📥 NOUVEAUX ÉVÉNEMENTS:\nTu as ${unreadEvents.length} événements dans ton Inbox. Utilise l'outil \`read_event_inbox\` pour les lire, traite-les, puis utilise \`clear_event_inbox\`.\n\n`;
            }

            if (missedWakes.length > 0) {
                wakeupPrompt += '⏰ RAPPELS / TÂCHES DE FOND (WakeSystem):\n';
                missedWakes.forEach(w => {
                    wakeupPrompt += `- Contexte/Chat: ${w.chatId} | Consigne: "${w.prompt}"\n`;
                });
                wakeupPrompt += 'Exécute ces consignes maintenant (utilise send_message pour notifier l\'utilisateur concerné si nécessaire).\n\n';
            }

            if (stalledActions.length > 0) {
                wakeupPrompt += '🚨 TÂCHES INTERROMPUES (CRASH RECOVERY):\n';
                stalledActions.forEach(a => {
                    wakeupPrompt += `- Chat: ${a.chatId} | Outil: ${a.type} | Objectif: "${a.goal}"\n`;
                });
                wakeupPrompt += 'Il semble que tu aies crashé pendant ces tâches. Analyse la situation et reprends l\'exécution si possible.\n\n';
            }

            wakeupPrompt += 'DIRECTIVE: Gère cette file d\'attente. Une fois terminé ou si tu n\'as rien de concret à faire, réponds UNIQUEMENT par le token "__HIVE_SILENT_7f3a__" pour te rendormir silencieusement.';

            if (this.messageHandler) {
                await this.messageHandler({
                    data: {
                        isGroup: false,
                        chatId: 'system_internal_mind',
                        text: wakeupPrompt,
                        senderName: 'SYSTEM_WATCHDOG',
                        sender: 'system@internal',
                        isSystem: true,
                        sourceChannel: 'internal'
                    }
                });
            }
        } catch (e: any) {
            console.error('[Scheduler] Erreur consciousPulse:', e.message);
        }
    }
}

export default SchedulerHandler;

