// tests/e2e/bot.e2e.test.ts
import { describe, it, beforeAll, jest, expect } from '@jest/globals';

// Set environment variables for tests
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'dummy';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// Mock heavy dependencies
jest.mock('qrcode-terminal', () => ({
  generate: jest.fn()
}));

const mockSock = { 
  user: { id: '33612345678@s.whatsapp.net', lid: '33687654321@lid' },
  ev: { on: jest.fn(), removeAllListeners: jest.fn() }
};

jest.mock('../../core/transport/baileys.js', () => ({
  baileysTransport: {
    connect: jest.fn(async () => {}),
    onMessage: jest.fn(),
    onGroupEvent: jest.fn(),
    setContainer: jest.fn(),
    sendText: jest.fn(async () => ({})),
    setPresence: jest.fn(async () => {}),
    sendVoice: jest.fn(async () => ({})),
    downloadMedia: jest.fn(async () => Buffer.from('')),
    sock: mockSock
  }
}));

import { botCore } from '../../core/index.js';
import { container } from '../../core/ServiceContainer.js';
import { orchestrator } from '../../core/orchestrator.js';

describe('Bot E2E Flow', () => {
  beforeAll(async () => {
    // Partially initialize container or mock it
    jest.spyOn(container, 'init').mockImplementation(async () => {});
    
    // Mock health checks
    const mockHealth = { status: 'connected' };
    jest.spyOn(container, 'get').mockImplementation((name: string) => {
      const mockServices: any = {
        workingMemory: { 
          checkHealth: async () => mockHealth,
          trackGroupActivity: async () => {},
          isMuted: async () => false,
          addMessage: async () => {},
          trackMessage: async () => {},
          getReplyStrategy: async () => ({ useQuote: true, useMention: true }),
          getLastInteraction: async () => null,
          getChatVelocity: async () => ({ uniqueSenders: 0 }),
          getContext: async () => []
        },
        supabase: { 
          checkHealth: async () => mockHealth,
          from: () => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) })
          })
        },
        userService: {
          recordInteraction: async () => {},
          registerLid: async () => {},
          getSpeakerHash: async () => 'ABC'
        },
        memory: { store: async () => {} },
        consciousness: {},
        groupService: { trackActivity: async () => {} },
        adminService: { listAdmins: async () => [] },
        agentMemory: {},
        actionMemory: {},
        facts: {},
        voiceProvider: {},
        quotaManager: {}
      };
      return mockServices[name] || {};
    });

    // Mock orchestrator to prevent real processing loop in E2E
    jest.spyOn(orchestrator, 'enqueue').mockImplementation(() => {});

    await botCore.init();
  });

  it('should process a message flow end-to-end (mocked orchestrator)', async () => {
    const mockMsg = {
      chatId: '123@g.us',
      sender: 'user@s.whatsapp.net',
      senderName: 'User',
      text: 'Hello Bot',
      isGroup: true,
      id: 'msg1',
      raw: { key: { id: 'msg1' } }
    };

    // Simulate message reception
    await botCore._onMessage(mockMsg as any);

    // Verify that the message was enqueued in the orchestrator
    expect(orchestrator.enqueue).toHaveBeenCalled();
  });

  it('should correctly detect if the bot is mentioned', () => {
    // We'll test the property that _isBotMentioned uses
    // @ts-ignore
    botCore.transport.sock = mockSock;
    
    const text = 'Hello @33612345678';
    const msg = {
      isGroup: true,
      mentionedJids: ['33612345678@s.whatsapp.net'],
      text
    };

    // @ts-ignore
    const isMentioned = botCore._isBotMentioned(msg, text);
    expect(isMentioned).toBe(true);
  });
});
