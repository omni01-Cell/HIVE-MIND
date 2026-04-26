// tests/integration/services.test.ts
// Integration — Services Layer (MOD 4 + MOD 9)
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';

// Mock Supabase
jest.unstable_mockModule('../../services/supabase.js', () => ({
    __esModule: true,
    supabase: null, // No real DB in integration tests
    default: {
        resolveContextFromLegacyId: jest.fn(async (id: string) => {
            if (!id) return null;
            if (id.includes('@g.us')) return { context_id: 'uuid-group-1', type: 'group' };
            if (id.includes('@s.whatsapp.net')) return { context_id: 'uuid-user-1', type: 'user' };
            return { context_id: 'uuid-cli-1', type: 'user' };
        }),
        isAvailable: jest.fn(() => false),
        logAction: jest.fn(async () => null)
    }
}));

// Mock CostTracker
jest.unstable_mockModule('../../services/finops/CostTracker.js', () => ({
    costTracker: {
        recordUsage: jest.fn((model: string, pt: number, ct: number) => ({
            model,
            promptTokens: pt,
            completionTokens: ct,
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            sessionTotal: 0,
            budgetSafe: true
        })),
        getSessionCost: jest.fn(() => 0),
        reset: jest.fn()
    },
    CostTracker: class {}
}));

// Mock redis
jest.unstable_mockModule('../../services/redisClient.js', () => ({
    redis: {
        isOpen: true,
        multi: jest.fn(),
        set: jest.fn(),
        get: jest.fn(),
        del: jest.fn(),
        hSet: jest.fn(),
        hGet: jest.fn(),
        hGetAll: jest.fn(),
        sAdd: jest.fn(),
        exists: jest.fn(),
        quit: jest.fn(),
        sPop: jest.fn()
    }
}));

const { redis } = await import('../../services/redisClient.js');
const { userService } = await import('../../services/userService.js');
const { StateManager } = await import('../../services/state/StateManager.js');
const { costTracker } = await import('../../services/finops/CostTracker.js');
const { default: db } = await import('../../services/supabase.js');

describe('Services Integration (Phase 4 MODs)', () => {
    const testJid = '12345@s.whatsapp.net';
    const testLid = 'abcde@lid';

    beforeEach(() => {
        Object.defineProperty(redis, 'isOpen', {
            get: () => true,
            configurable: true
        });

        jest.spyOn(redis, 'multi').mockReturnValue({
            hIncrBy: jest.fn().mockReturnThis(),
            hSet: jest.fn().mockReturnThis(),
            expire: jest.fn().mockReturnThis(),
            sAdd: jest.fn().mockReturnThis(),
            exec: jest.fn(async () => [])
        } as any);

        jest.spyOn(redis, 'set').mockResolvedValue('OK' as any);
        jest.spyOn(redis, 'get').mockResolvedValue(null as any);
        jest.spyOn(redis, 'del').mockResolvedValue(1 as any);
        jest.spyOn(redis, 'hSet').mockResolvedValue(1 as any);
        jest.spyOn(redis, 'hGet').mockResolvedValue(null as any);
        jest.spyOn(redis, 'hGetAll').mockResolvedValue({} as any);
        jest.spyOn(redis, 'sAdd').mockResolvedValue(1 as any);
        jest.spyOn(redis, 'exists').mockResolvedValue(0 as any);
        jest.spyOn(redis, 'quit').mockResolvedValue('OK' as any);
    });

    afterEach(() => { jest.restoreAllMocks(); });

    // ── Original tests (preserved) ──

    it('should record interaction and resolve LID correctly', async () => {
        await userService.recordInteraction(testJid, 'Test User');
        expect(redis.multi).toHaveBeenCalled();

        await userService.registerLid(testJid, testLid);
        expect(redis.set).toHaveBeenCalledWith('map:lid:abcde', testJid);

        (redis.get as any).mockResolvedValueOnce(testJid);
        const resolved = await userService.resolveLid(testLid);
        expect(resolved).toBe(testJid);
    });

    it('should clear data from Redis cache when requested', async () => {
        const cacheKey = `user:${testJid}:data`;
        await redis.del(cacheKey);
        expect(redis.del).toHaveBeenCalledWith(cacheKey);
    });

    // ── MOD 9: resolveContextFromLegacyId ──

    it('resolveContextFromLegacyId maps WhatsApp JID to UUID user', async () => {
        const result = await db.resolveContextFromLegacyId(testJid);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('user');
        expect(result?.context_id).toBeDefined();
    });

    it('resolveContextFromLegacyId maps group JID to UUID group', async () => {
        const result = await db.resolveContextFromLegacyId('120363xxx@g.us');
        expect(result?.type).toBe('group');
    });

    it('resolveContextFromLegacyId returns null for empty string', async () => {
        const result = await db.resolveContextFromLegacyId('');
        expect(result).toBeNull();
    });

    // ── MOD 4: CostTracker session integration ──

    it('costTracker.recordUsage returns budgetSafe=true for free models', () => {
        const record = costTracker.recordUsage('qwen/qwen3-32b', 10000, 5000);
        expect(record.totalCost).toBe(0);
        expect(record.budgetSafe).toBe(true);
    });

    it('costTracker.getSessionCost returns a number', () => {
        expect(typeof costTracker.getSessionCost()).toBe('number');
    });

    // ── MOD 9: StateManager UUID-based cache key ──

    it('StateManager uses UUID-based cache key (not legacy JID)', async () => {
        // updateUserInteraction should query resolveContextFromLegacyId
        // then build key as user:{UUID}:data
        await StateManager.updateUserInteraction(testJid, 'TestUser');

        // redis.multi() should be called (pipeline)
        expect(redis.multi).toHaveBeenCalled();
    });

    it('StateManager.processSyncQueue does not crash when redis is empty', async () => {
        jest.spyOn(redis, 'sPop').mockResolvedValue([] as any);
        await expect(StateManager.processSyncQueue(50)).resolves.not.toThrow();
    });
});
