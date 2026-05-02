// Plugin for managing autonomous goals

export default {
    name: 'goals',
    description: 'Autonomous goal management',
    version: '1.0.0',

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'create_goal',
                description: 'Creates an autonomous goal for a future action (research, reminder, scheduled task). Useful for remembering to do something later.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Short and descriptive title of the goal'
                        },
                        description: {
                            type: 'string',
                            description: 'Detailed description of what needs to be done'
                        },
                        executeIn: {
                            type: 'string',
                            description: 'For a time-based reminder: When to execute this goal. Examples: "2h", "1d", "tomorrow". Ignored if waitForUser/Keyword is defined.',
                            default: '1h'
                        },
                        waitForUser: {
                            type: 'string',
                            description: 'Optional: Wait for a message from this specific user (Name or JID) before triggering the goal.'
                        },
                        waitForKeyword: {
                            type: 'string',
                            description: 'Optional: Wait for a message containing this keyword before triggering the goal.'
                        }
                    },
                    required: ['title', 'description']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_goals',
                description: 'Lists active autonomous goals for this chat.',
                parameters: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            description: 'Filter by status (pending, in_progress, completed)',
                            enum: ['pending', 'in_progress', 'completed', 'all']
                        }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'complete_goal',
                description: 'Marks an autonomous goal as completed. MUST be used at the end of a goal execution.',
                parameters: {
                    type: 'object',
                    properties: {
                        goalId: {
                            type: 'string',
                            description: 'ID of the completed goal'
                        },
                        result: {
                            type: 'string',
                            description: 'Action result (optional)'
                        }
                    },
                    required: ['goalId']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'cancel_goal',
                description: 'Cancels an autonomous goal.',
                parameters: {
                    type: 'object',
                    properties: {
                        goalId: {
                            type: 'string',
                            description: 'ID of the goal to cancel'
                        }
                    },
                    required: ['goalId']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        // Defensive destructuring of context
        const { chatId } = context || {};

        if (!chatId) {
            return { success: false, message: 'CONTEXT_ERROR: chatId is required.' };
        }

        // Import dynamique pour éviter les instanciations prématurées
        const { goalsService } = await import('../../../services/goalsService.js');

        switch (toolName) {
        case 'create_goal': {
            const { title, description, executeIn = '1h', waitForUser, waitForKeyword } = args;

            // Determine trigger type
            let triggerType = 'TIME';
            let triggerEvent: any = null;
            let triggerCondition: any = {};
            let executeAt: any = null;

            if (waitForUser || waitForKeyword) {
                triggerType = 'EVENT';
                triggerEvent = 'WAIT_FOR_MESSAGE';
                triggerCondition = {};
                if (waitForUser) triggerCondition.from_user = waitForUser;
                if (waitForKeyword) triggerCondition.contains = waitForKeyword;

                // Set a far date (2099) for events to avoid Time Scheduler triggering
                executeAt = new Date('2099-12-31T23:59:59Z');
            } else {
                // Time based
                executeAt = goalsService.parseDuration(executeIn);
            }

            // Create the goal
            const goal = await goalsService.createGoal({
                title,
                description,
                executeAt,
                targetChatId: chatId,
                origin: 'self',
                triggerType,
                triggerEvent,
                triggerCondition
            });

            let validMsg = '';
            if (triggerType === 'EVENT') {
                validMsg = `Execution on event: ${waitForUser ? `From "${waitForUser}"` : ''} ${waitForKeyword ? `Containing "${waitForKeyword}"` : ''}`;
            } else {
                validMsg = `Scheduled execution: ${executeAt.toLocaleString('en-US')}`;
            }

            return {
                success: true,
                message: `✅ Goal created: "${title}"\n${validMsg}\nID: ${goal.id}`
            };
        }

        case 'list_goals': {
            const { status = 'all' } = args;
            const allGoals = await goalsService.getChatGoals(chatId);

            const filtered = status === 'all'
                ? allGoals
                : allGoals.filter((g: any) => g.status === status);

            if (filtered.length === 0) {
                return {
                    success: true,
                    message: 'No goals found.'
                };
            }

            const list = filtered.map((g: any) =>
                `- [${g.status}] ${g.title}\n  Execution: ${new Date(g.execute_at).toLocaleString('en-US')}\n  ID: ${g.id}`
            ).join('\n\n');

            return {
                success: true,
                message: `📋 Goals (${filtered.length}):\n\n${list}`
            };
        }

        case 'complete_goal': {
            const { goalId, result } = args;
            await goalsService.completeGoal(goalId, result);

            return {
                success: true,
                message: `✅ Goal ${goalId} marked as COMPLETED.`
            };
        }

        case 'cancel_goal': {
            const { goalId } = args;
            await goalsService.cancelGoal(goalId);

            return {
                success: true,
                message: `❌ Goal ${goalId} cancelled.`
            };
        }

        default:
            return {
                success: false,
                message: 'Unknown tool.'
            };
    }
}
};
