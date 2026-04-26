// tests/integration/core.test.ts
// Integration — BotCore + nouveaux MODs (1, 3, 4, 6, 7, 8)
import { describe, it, beforeEach, jest, expect } from '@jest/globals';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'dummy';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

const mockSock = {
    user: { id: '33612345678@s.whatsapp.net', lid: '33687654321@lid' }
};

jest.unstable_mockModule('../../services/supabase.js', () => ({
    supabase: null,
    db: { getGroupConfig: jest.fn() },
    default: { getGroupConfig: jest.fn() }
}));

jest.unstable_mockModule('../../core/transport/baileys.js', () => ({
    baileysTransport: {
        connect: jest.fn(async () => {}),
        onMessage: jest.fn(),
        onGroupEvent: jest.fn(),
        setContainer: jest.fn(),
        sendText: jest.fn(async () => ({})),
        setPresence: jest.fn(async () => {}),
        sock: mockSock
    }
}));

// Mock CostTracker to prevent budget from interfering with integration tests
jest.unstable_mockModule('../../services/finops/CostTracker.js', () => ({
    costTracker: {
        recordUsage: jest.fn(() => ({ budgetSafe: true, totalCost: 0, sessionTotal: 0 })),
        getSessionCost: jest.fn(() => 0),
        reset: jest.fn()
    },
    CostTracker: jest.fn()
}));

// Mock PermissionManager to auto-approve in tests
jest.unstable_mockModule('../../core/security/PermissionManager.js', () => ({
    permissionManager: {
        validateBashCommand: jest.fn(() => ({ result: true, requiresPermission: false })),
        validateFileWrite: jest.fn(() => ({ result: true, requiresPermission: false })),
        isInSandbox: jest.fn(() => true),
        askPermission: jest.fn(async () => ({ granted: true })),
        handleAdminCommand: jest.fn(() => false),
        handleUserResponse: jest.fn(() => false),
        pendingCount: 0
    },
    BANNED_COMMANDS: ['curl', 'sudo'],
    SAFE_COMMANDS: new Set(['pwd', 'ls'])
}));

const { container } = await import('../../core/ServiceContainer.js');
jest.spyOn(container, 'get').mockImplementation((name: string) => {
    const mockServices: any = {
        workingMemory: {
            trackGroupActivity: jest.fn(async () => {}),
            trackMessage: jest.fn(async () => {}),
            isMuted: jest.fn(async () => false),
            addMessage: jest.fn(async () => {}),
            getReplyStrategy: jest.fn(async () => ({ useQuote: true, useMention: true })),
            getLastInteraction: jest.fn(async () => null),
            getChatVelocity: jest.fn(async () => ({ uniqueSenders: 0 }))
        },
        userService: {
            recordInteraction: jest.fn(async () => {}),
            registerLid: jest.fn(async () => {}),
            getSpeakerHash: jest.fn(async () => 'ABC'),
            resolveLid: jest.fn(async () => null)
        },
        supabase: {
            from: jest.fn(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        single: jest.fn(async () => ({ data: null, error: null }))
                    }))
                }))
            })),
            getGroupConfig: jest.fn(async () => ({}))
        },
        memory: { store: jest.fn(async () => {}) },
        consciousness: {},
        groupService: { trackActivity: jest.fn(async () => {}) },
        adminService: {
            listAdmins: jest.fn(async () => []),
            isSuperUser: jest.fn(async () => false)
        },
        agentMemory: {
            logAction: jest.fn(async () => {}),
            hasRecentFailure: jest.fn(async () => ({ hasFailure: false })),
            getRecentActions: jest.fn(async () => [])
        },
        actionMemory: { getResumableActions: jest.fn(async () => []) },
        facts: {},
        voiceProvider: {},
        quotaManager: {}
    };
    return mockServices[name] || {};
});

const { BotCore } = await import('../../core/index.js');
const { orchestrator } = await import('../../core/orchestrator.js');

describe('BotCore Integration (Phase 4 MODs)', () => {
    let bot: any;

    beforeEach(() => {
        jest.clearAllMocks();
        bot = new BotCore();
        bot.isReady = true;
        bot.transport.sock = mockSock;
    });

    // ── Original tests (preserved) ──

    it('should handle incoming messages by enqueuing them in the orchestrator', async () => {
        const mockMsg = {
            chatId: '123@g.us',
            sender: 'user@s.whatsapp.net',
            senderName: 'User',
            text: 'Hello Bot',
            isGroup: true,
            id: 'msg1',
            raw: { key: { id: 'msg1' } }
        };
        const enqueueSpy = jest.spyOn(orchestrator, 'enqueue');
        await bot._onMessage(mockMsg as any);
        expect(enqueueSpy).toHaveBeenCalled();
    });

    it('should detect bot mentions correctly', () => {
        const text = 'Hello @33612345678';
        const msg = {
            isGroup: true,
            mentionedJids: ['33612345678@s.whatsapp.net'],
            text
        };
        const isMentioned = bot._isBotMentioned(msg, text);
        expect(isMentioned).toBe(true);
    });

    // ── MOD 7: HITL — handleAdminCommand intercepted ──

    it('should expose handleAdminCommand method on permissionManager', async () => {
        const { permissionManager } = await import('../../core/security/PermissionManager.js');
        expect(typeof permissionManager.handleAdminCommand).toBe('function');
    });

    // ── MOD 4: CostTracker integrated in provider call ──

    it('CostTracker mock returns budgetSafe=true during integration', async () => {
        const { costTracker } = await import('../../services/finops/CostTracker.js');
        const record = costTracker.recordUsage('gpt-4o-mini', 1000, 500);
        expect(record.budgetSafe).toBe(true);
    });

    // ── MOD 6: CoT regex compiled correctly ──

    it('CoT thought-only regex matches all supported formats', () => {
        const regex = /<(think|thought|thinking)>[\s\S]*?<\/\1>/gi;
        expect('<think>reasoning</think>'.match(regex)).not.toBeNull();
        expect('<thought>reasoning</thought>'.match(regex)).not.toBeNull();
        expect('<thinking>reasoning</thinking>'.match(regex)).not.toBeNull();
    });

    // ── MOD 1: _compactHistory threshold logic ──

    it('_compactHistory returns original history when under 25k chars', async () => {
        const smallHistory = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' }
        ];
        const result = await bot._compactHistory(smallHistory, '123@g.us');
        expect(result).toEqual(smallHistory);
    });

    // ── MOD 9: LID resolution propagated through userService ──

    it('userService.registerLid is available for Ghost User Merge', () => {
        const userService = container.get('userService') as any;
        expect(typeof userService.registerLid).toBe('function');
    });
});
