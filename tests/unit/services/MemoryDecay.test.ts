// tests/unit/services/MemoryDecay.test.ts
import { describe, it, beforeEach, afterAll, beforeAll, jest, expect } from '@jest/globals';

// Set dummy env vars for Supabase and Redis BEFORE any imports
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'dummy-key';
process.env.REDIS_URL = 'redis://localhost:6379';

let memoryDecay: any;
let supabase: any;
let providerRouter: any;
let db: any;

const createQueryBuilderMock = (data: any) => {
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.is = () => builder;
  builder.gte = () => builder;
  builder.insert = () => Promise.resolve({ error: null });
  builder.update = () => builder;
  builder.then = (resolve: any) => resolve({ data, error: null });
  return builder;
};

describe('MemoryDecay unit tests', () => {

  beforeAll(async () => {
    // Import redis client and mock connect immediately
    const redisModule = await import('../../../services/redisClient.js');
    jest.spyOn(redisModule.redis, 'connect').mockImplementation(async () => {});

    // Import the services
    const mdModule = await import('../../../services/memory/MemoryDecay.js');
    memoryDecay = mdModule.memoryDecay;

    const supabaseModule = await import('../../../services/supabase.js');
    supabase = supabaseModule.supabase;
    db = supabaseModule.default;

    const providersModule = await import('../../../providers/index.js');
    providerRouter = providersModule.providerRouter;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    
    // Default resolveContext mock
    if (db) {
      jest.spyOn(db, 'resolveContextFromLegacyId').mockImplementation(async () => ({
        context_id: 'chat_123'
      }));
    }
  });

  it('should decay active memories and update decay score and archived_at when keep is false', async () => {
    // Set created_at to 5 days ago to guarantee decay
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const mockMemories = [
      { id: '1', role: 'assistant', content: 'Memory 1', recall_count: 0, decay_score: 1.0, created_at: fiveDaysAgo },
      { id: '2', role: 'assistant', content: 'Memory 2', recall_count: 1, decay_score: 0.8, created_at: fiveDaysAgo }
    ];

    const supabaseSpy = jest.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      if (table === 'memories') {
        return createQueryBuilderMock(mockMemories);
      }
      return createQueryBuilderMock({ context_id: 'chat_123' });
    }) as any);

    const result = await memoryDecay.decay('chat_123');

    expect(supabaseSpy).toHaveBeenCalledWith('memories');
    expect(result.archived).toBe(2);
    expect(result.kept).toBe(0);
  });

  it('should trigger consolidation when 5 or more memories are archived', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const mockMemories = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      role: 'assistant',
      content: `Memory ${i}`,
      recall_count: 0,
      decay_score: 1.0,
      created_at: fiveDaysAgo
    }));

    const supabaseSpy = jest.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      if (table === 'memories') {
        return createQueryBuilderMock(mockMemories);
      }
      return createQueryBuilderMock({ context_id: 'chat_123' });
    }) as any);

    // Mock providerRouter.chat for consolidation
    const chatMock = jest.spyOn(providerRouter, 'chat').mockImplementation(async () => {
      return { content: 'This is a consolidated gist.' } as any;
    });

    const result = await memoryDecay.decay('chat_123');

    expect(result.archived).toBe(6);
    
    // Allow the setImmediate consolidation callback to run
    await new Promise(resolve => setImmediate(resolve));

    expect(chatMock).toHaveBeenCalled();
  });
});
