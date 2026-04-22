// tests/integration/core.test.ts
import { describe, it, beforeEach, jest, expect } from '@jest/globals';

// Set environment variables for tests
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'dummy';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

const mockSock = { 
  user: { id: '33612345678@s.whatsapp.net', lid: '33687654321@lid' } 
};

// Mock transport
jest.mock('../../core/transport/baileys.js', () => ({
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

// Mock container instance
import { container } from '../../core/ServiceContainer.js';
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
      getSpeakerHash: jest.fn(async () => 'ABC')
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
    adminService: { listAdmins: jest.fn(async () => []) },
    agentMemory: {},
    actionMemory: {},
    facts: {},
    voiceProvider: {},
    quotaManager: {}
  };
  return mockServices[name] || {};
});

import { BotCore } from '../../core/index.js';
import { orchestrator } from '../../core/orchestrator.js';

describe('BotCore Integration', () => {
  let bot: any;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = new BotCore();
    bot.isReady = true;
    // @ts-ignore
    bot.transport.sock = mockSock;
  });

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

    // @ts-ignore
    const isMentioned = bot._isBotMentioned(msg, text);
    expect(isMentioned).toBe(true);
  });
});
