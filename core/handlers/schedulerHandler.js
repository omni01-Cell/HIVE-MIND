// core/handlers/schedulerHandler.js
// Gère les tâches planifiées du scheduler
// Extrait de core/index.js pour modularité

import { eventBus, BotEvents } from '../events.js';
import { container } from '../ServiceContainer.js';
import { workingMemory } from '../../services/workingMemory.js';
import { db } from '../../services/supabase.js';

/**
 * Gestionnaire des jobs planifiés
 */
export class SchedulerHandler {
    constructor(transport, messageHandler = null) {
        this.transport = transport;
        this.messageHandler = messageHandler;
    }

    /**
     * Définit le handler de message (pour les jobs qui génèrent des messages)
     */
    setMessageHandler(handler) {
        this.messageHandler = handler;
    }

    /**
     * Exécute un job planifié
     * @param {Object} event - Événement du scheduler
     */
    async handleJob(event) {
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

            case 'tempCleanup':
                await this._handleTempCleanup();
                break;

            case 'socialCueScan':
                await this._handleSocialCueScan();
                break;

            case 'goalExecution':
                await this._handleGoalExecution();
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
                text: "SYSTEM_WAKEUP_PROTOCOL: The group is inactive. Generate a thought to wake it up politely or with a controversial topic about tech/AI.",
                senderName: "SYSTEM",
                sender: "system@internal"
            };

            if (this.messageHandler) {
                await this.messageHandler({ data: fakeContext });
            }
        }
    }

    async _handleReminderCheck() {
        const reminders = await db.getPendingReminders();

        for (const reminder of reminders) {
            if (reminder.message.startsWith('COMMAND:BAN_USER:')) {
                try {
                    const payload = reminder.message.replace('COMMAND:BAN_USER:', '');
                    const [targetJid, reason] = payload.split('|');

                    console.log(`[Scheduler] 🚀 Exécution BAN planifié pour ${targetJid}`);
                    await this.transport.banUser(reminder.chat_id, targetJid);

                    await this.transport.sendText(
                        reminder.chat_id,
                        `🚫 **Ban planifié exécuté**\nUtilisateur: @${targetJid.split('@')[0]}\nRaison: ${reason || 'Aucune'}`
                    );
                } catch (err) {
                    console.error(`[Scheduler] ❌ Erreur exécution BAN planifié: ${err.message}`);
                    await this.transport.sendText(
                        reminder.chat_id,
                        `⚠️ Échec du ban planifié: ${err.message}`
                    );
                }
            } else {
                await this.transport.sendText(
                    reminder.chat_id,
                    `⏰ Rappel: ${reminder.message}`
                );
            }

            await db.markReminderSent(reminder.id);
        }
    }

    async _handleMemoryConsolidation() {
        console.log('[Scheduler] 🧶 Consolidation de la mémoire et Tissage du savoir...');
        try {
            const { redis } = await import('../../services/redisClient.js');
            const keys = await redis.keys('chat:*:context');
            const chatIds = keys.map(k => k.split(':')[1]);

            if (chatIds.length === 0) {
                console.log('[Scheduler] Aucun chat actif à consolider.');
                return;
            }

            console.log(`[Scheduler] Consolidation de ${chatIds.length} chats...`);
            const consolidationService = container.get('consolidationService');

            for (const chatId of chatIds) {
                consolidationService.consolidate(chatId).catch(err =>
                    console.error(`[Scheduler] Erreur consolidation ${chatId}:`, err.message)
                );
            }
        } catch (e) {
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
        } catch (e) {
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
                .limit(100) : { data: [] };

            if (heavyChats?.length > 0) {
                const uniqueChatIds = [...new Set(heavyChats.map(m => m.chat_id))];
                console.log(`[Scheduler] ${uniqueChatIds.length} chat(s) à nettoyer`);

                for (const chatId of uniqueChatIds) {
                    const memory = container.get('memory');
                    await memory.cleanup(chatId, 100);
                }
            }
            console.log('[Scheduler] ✅ Nettoyage mémoire terminé');
        } catch (error) {
            console.error('[Scheduler] Erreur memoryCleanup:', error.message);
        }
    }

    async _handleTempCleanup() {
        console.log('[Scheduler] 🧹 Nettoyage fichiers temporaires...');
        try {
            const { CleanupService } = await import('../../services/cleanup.js');
            const cleanup = new CleanupService();
            await cleanup.run();
        } catch (err) {
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
        } catch (e) {
            console.error('[Scheduler] Erreur socialCueScan:', e.message);
        }
    }

    async _handleGoalExecution() {
        console.log('[Scheduler] 🎯 Vérification des objectifs autonomes...');
        try {
            const { goalsService } = await import('../../services/goalsService.js');
            const dueGoals = await goalsService.getDueGoals();

            for (const goal of dueGoals) {
                console.log(`[Goals] Exécution objectif: ${goal.title}`);
                await goalsService.executeGoal(goal.id, this.transport);
            }
        } catch (e) {
            console.error('[Scheduler] Erreur goalExecution:', e.message);
        }
    }

    async _handleMemoryDecay() {
        console.log('[Scheduler] 🧹💾 Cycle de décroissance mémoire...');
        try {
            const { memoryDecay } = await import('../../services/memory/MemoryDecay.js');
            const result = await memoryDecay.decayAll();

            console.log(`[Scheduler] ✅ Decay: ${result.archived} souvenirs archivés, ${result.kept} conservés dans ${result.chats} chats`);
        } catch (e) {
            console.error('[Scheduler] Erreur memoryDecay:', e.message);
        }
    }
}

export default SchedulerHandler;
