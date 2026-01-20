// core/schedulerHandlers.js
// Handlers Phase 3 pour les jobs autonomes

export async function handleSocialCueScan(botCore, workingMemory) {
    console.log('[Scheduler] 👁️ Social Cue Scan...');
    try {
        const { socialCueWatcher } = await import('../services/socialCueWatcher.js');
        const activeGroups = await workingMemory.getActiveGroups(30);

        for (const groupId of activeGroups) {
            try {
                const analysis = await socialCueWatcher.analyzeGroupPulse(groupId);
                if (socialCueWatcher.shouldIntervene(analysis)) {
                    const thought = await socialCueWatcher.generateProactiveThought(groupId, analysis);
                    if (thought) {
                        await botCore.transport.sendText(groupId, thought);
                    }
                }
            } catch (err) {
                console.error(`[SocialCueScan] Error for ${groupId}:`, err.message);
            }
        }
    } catch (e) {
        console.error('[Scheduler] socialCueScan error:', e.message);
    }
}

export async function handleGoalExecution(botCore) {
    console.log('[Scheduler] 🎯 Goal Execution...');
    try {
        const { goalsService } = await import('../services/goalsService.js');
        const pendingGoals = await goalsService.getPendingGoals();

        for (const goal of pendingGoals) {
            try {
                await goalsService.markInProgress(goal.id);

                await botCore._handleMessage({
                    data: {
                        chatId: goal.target_chat_id || 'internal',
                        text: `[OBJECTIF AUTONOME] ${goal.description}`,
                        sender: 'system@hive-mind',
                        senderName: 'HIVE-MIND',
                        isGroup: !!goal.target_chat_id
                    }
                });

                await goalsService.completeGoal(goal.id, 'Exécuté avec succès');
            } catch (err) {
                console.error(`[GoalExecution] Error for goal ${goal.id}:`, err.message);
                await goalsService.completeGoal(goal.id, `Erreur: ${err.message}`);
            }
        }
    } catch (e) {
        console.error('[Scheduler] goalExecution error:', e.message);
    }
}
