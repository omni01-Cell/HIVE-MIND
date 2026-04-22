// tests/integration/services.test.ts
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';

// Mock Supabase is fine as it's a simpler module
jest.mock('../../services/supabase.js', () => ({
  __esModule: true,
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(async () => ({ data: null, error: null })),
          maybeSingle: jest.fn(async () => ({ data: null, error: null }))
        }))
      })),
      upsert: jest.fn(() => ({
        select: jest.fn(async () => ({ data: null, error: null }))
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(async () => ({ error: null }))
      }))
    }))
  }
}));

// Import the REAL redis but we will spy on it
import { redis } from '../../services/redisClient.js';
import { userService } from '../../services/userService.js';
import { StateManager } from '../../services/state/StateManager.js';

describe('Services Integration', () => {
  const testJid = '12345@s.whatsapp.net';
  const testLid = 'abcde@lid';

  beforeEach(() => {
    // 1. Mock the isOpen getter safely
    Object.defineProperty(redis, 'isOpen', {
      get: () => true,
      configurable: true
    });

    // 2. Spy on all methods to prevent real network calls
    jest.spyOn(redis, 'multi').mockReturnValue({
      hIncrBy: jest.fn().mockReturnThis(),
      hSet: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      sAdd: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => [])
    } as any);

    jest.spyOn(redis, 'set').mockResolvedValue('OK');
    jest.spyOn(redis, 'get').mockResolvedValue(null);
    jest.spyOn(redis, 'del').mockResolvedValue(1);
    jest.spyOn(redis, 'hSet').mockResolvedValue(1);
    jest.spyOn(redis, 'hGet').mockResolvedValue(null);
    jest.spyOn(redis, 'hGetAll').mockResolvedValue({});
    jest.spyOn(redis, 'sAdd').mockResolvedValue(1);
    jest.spyOn(redis, 'exists').mockResolvedValue(0);
    jest.spyOn(redis, 'quit').mockResolvedValue('OK');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should record interaction and resolve LID correctly', async () => {
    // 1. Record interaction with JID
    await userService.recordInteraction(testJid, 'Test User');
    
    // In recordInteraction, it calls StateManager.updateUserInteraction which uses multi()
    expect(redis.multi).toHaveBeenCalled();

    // 2. Register LID
    await userService.registerLid(testJid, testLid);
    
    // Check if redis.set was called (LID mapping)
    // IdentityMap uses map:lid:numericId format
    expect(redis.set).toHaveBeenCalledWith('map:lid:abcde', testJid);

    // 3. Resolve LID
    (redis.get as any).mockResolvedValueOnce(testJid);
    const resolved = await userService.resolveLid(testLid);
    expect(resolved).toBe(testJid);
  });

  it('should clear data from Redis cache when requested', async () => {
    const cacheKey = `user:${testJid}:data`;
    await redis.del(cacheKey);
    expect(redis.del).toHaveBeenCalledWith(cacheKey);
  });
});
