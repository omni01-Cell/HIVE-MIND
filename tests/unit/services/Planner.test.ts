import { jest, describe, beforeEach, it, expect } from '@jest/globals';

type ChatMessage = {
    readonly role: string;
    readonly content: string;
};

type ChatResponse = {
    readonly content: string;
};

type ChatFn = (
    messages: readonly ChatMessage[],
    options?: Record<string, unknown>,
) => Promise<ChatResponse>;

type StartActionFn = (
    chatId: string,
    payload: unknown,
) => Promise<string>;

const chatMock = jest.fn<ChatFn>();
const startActionMock = jest.fn<StartActionFn>();

jest.unstable_mockModule('../../../providers/index.js', () => ({
    providerRouter: {
        chat: chatMock,
    },
}));

jest.unstable_mockModule('../../../services/memory/ActionMemory.js', () => ({
    actionMemory: {
        startAction: startActionMock,
    },
}));

jest.unstable_mockModule('../../../services/supabase.js', () => ({
    supabase: null,
}));

const { ExplicitPlanner } = await import('../../../services/agentic/Planner.js');

describe('ExplicitPlanner', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        startActionMock.mockResolvedValue('plan_1');
    });

    describe('plan', () => {
        it('should instruct the model to use execute_bash_command when terminal npm or filesystem work is required', async () => {
            // Arrange
            chatMock.mockResolvedValue({
                content: JSON.stringify({
                    steps: [
                        {
                            id: 1,
                            action: 'Run a Node script that reads a PDF and writes markdown',
                            tool: 'execute_bash_command',
                            params: { command: 'node extract_pdf.js' },
                            estimated_time: 10,
                            depends_on: [],
                        },
                    ],
                    total_time_estimate: 10,
                    complexity: 'medium',
                }),
            });
            const planner = new ExplicitPlanner();
            const context = {
                chatId: 'chat_1',
                tools: [
                    createToolDefinition('execute_bash_command', 'Execute terminal commands'),
                    createToolDefinition('code_execution', 'Execute sandboxed JavaScript'),
                ],
            };

            // Act
            await planner.plan('Install pdf-parse, extract a PDF, write test_document.md', context);

            // Assert
            const prompt = getPlannerPrompt();
            expect(prompt).toContain('Use `execute_bash_command` for terminal commands, npm installs, Node scripts, and filesystem file creation.');
            expect(prompt).not.toContain("do NOT use 'execute_bash_command'");
        });
    });
});

function createToolDefinition(name: string, description: string) {
    return {
        function: {
            name,
            description,
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    };
}

function getPlannerPrompt(): string {
    const firstCall = chatMock.mock.calls[0];
    const messages = firstCall?.[0] as readonly { readonly role: string; readonly content: string }[] | undefined;
    const userMessage = messages?.find((message) => message.role === 'user');
    return userMessage?.content ?? '';
}
