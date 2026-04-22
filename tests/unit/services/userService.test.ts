// tests/unit/services/userService.test.ts
import { describe, it, beforeEach, afterAll, beforeAll, jest, expect } from '@jest/globals';

// Set dummy env vars for Supabase and Redis BEFORE any imports
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'dummy-key';
process.env.REDIS_URL = 'redis://localhost:6379';

// We will load modules dynamically to ensure env vars are set
let userService: any;
let StateManager: any;
let IdentityMap: any;
let redis: any;
let supabase: any;

describe('userService unit tests', () => {
  
  beforeAll(async () => {
    // Import redis client and mock connect immediately
    const redisModule = await import('../../../services/redisClient.js');
    redis = redisModule.redis;
    jest.spyOn(redis, 'connect').mockImplementation(async () => {});
    
    // Import others
    const userSvcModule = await import('../../../services/userService.js');
    userService = userSvcModule.userService;
    
    const stateMgrModule = await import('../../../services/state/StateManager.js');
    StateManager = stateMgrModule.StateManager;
    
    const identityMapModule = await import('../../../services/state/IdentityMap.js');
    IdentityMap = identityMapModule.IdentityMap;
    
    const supabaseModule = await import('../../../services/supabase.js');
    supabase = supabaseModule.supabase;
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.restoreAllMocks();
    
    // Re-apply essential mocks after restoreAll
    if (redis) {
      jest.spyOn(redis, 'hGet').mockImplementation(async () => null);
      jest.spyOn(redis, 'hSet').mockImplementation(async () => ({}));
      jest.spyOn(redis, 'connect').mockImplementation(async () => {});
    }
  });

  afterAll(async () => {
    if (redis && typeof redis.quit === 'function') {
      try { await redis.quit(); } catch (e) {}
    }
  });

  describe('recordInteraction()', () => {
    it('should resolve LID and update interaction', async () => {
      const identifier = 'some_id';
      const pushName = 'TestUser';
      const resolvedJid = '123@s.whatsapp.net';
      
      const resolveMock = jest.spyOn(IdentityMap, 'resolve').mockImplementation(async () => resolvedJid);
      const updateMock = jest.spyOn(StateManager, 'updateUserInteraction').mockImplementation(async () => {});

      await userService.recordInteraction(identifier, pushName);

      expect(resolveMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProfile()', () => {
    it('should return a formatted profile from StateManager', async () => {
      const jid = '123@s.whatsapp.net';
      const mockUser = {
        jid,
        last_pushname: 'TestPush',
        username: 'TestUser',
        interaction_count: 5,
        last_seen: '2023-01-01'
      };
      
      jest.spyOn(StateManager, 'getUser').mockImplementation(async () => mockUser);

      const profile = await userService.getProfile(jid);

      expect(profile.jid).toBe(jid);
      expect(profile.names).toEqual(['TestPush']);
    });
  });

  describe('getSpeakerHash()', () => {
    it('should return UNK if no JID provided', async () => {
      const hash = await userService.getSpeakerHash(null);
      expect(hash).toBe('UNK');
    });

    it('should return hash from cache if available', async () => {
      jest.spyOn(IdentityMap, 'resolve').mockImplementation(async () => 'resolved@s.whatsapp.net');
      jest.spyOn(redis, 'hGet').mockImplementation(async () => 'ABC');
      
      const hash = await userService.getSpeakerHash('123');
      expect(hash).toBe('ABC');
    });

    it('should generate and return a 3-char hash if not in cache', async () => {
      jest.spyOn(IdentityMap, 'resolve').mockImplementation(async () => 'resolved@s.whatsapp.net');
      jest.spyOn(redis, 'hGet').mockImplementation(async () => null);
      if (supabase) {
        jest.spyOn(supabase, 'from').mockImplementation((() => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null })
            })
          }),
          upsert: () => ({
            select: async () => ({ data: null })
          })
        })) as any);
      }

      const hash = await userService.getSpeakerHash('123');
      expect(hash).toHaveLength(3);
    });
  });
});
