// tests/unit/services/LearningEngine.test.ts
import { describe, it, beforeEach, afterAll, beforeAll, jest, expect } from '@jest/globals';

// Set dummy env vars for Supabase and Redis BEFORE any imports
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'dummy-key';
process.env.REDIS_URL = 'redis://localhost:6379';

let learningEngine: any;
let providerRouter: any;
let factsMemory: any;
let workingMemory: any;

describe('LearningEngine unit tests', () => {

  beforeAll(async () => {
    // Import redis client and mock connect immediately
    const redisModule = await import('../../../services/redisClient.js');
    jest.spyOn(redisModule.redis as any, 'connect').mockImplementation(async () => redisModule.redis as any);

    // Import the services
    const leModule = await import('../../../services/learning/LearningEngine.js');
    learningEngine = leModule.learningEngine;

    const providersModule = await import('../../../providers/index.js');
    providerRouter = providersModule.providerRouter;

    const memoryModule = await import('../../../services/memory.js');
    factsMemory = memoryModule.factsMemory;

    const wmModule = await import('../../../services/workingMemory.js');
    workingMemory = wmModule.workingMemory;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should not extract insights if conversation context is too short', async () => {
    const getContextMock = jest.spyOn(workingMemory, 'getContext').mockImplementation(async () => {
      return [
        { role: 'user', content: 'hello' }
      ];
    });

    const chatSpy = jest.spyOn(providerRouter, 'chat');

    await learningEngine.extractInsights('123@s.whatsapp.net');

    expect(getContextMock).toHaveBeenCalledTimes(1);
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('should parse LLM JSON response and remember insights using MAPLE taxonomy', async () => {
    const mockContext = [
      { role: 'user', content: 'Je suis un développeur Senior React.' },
      { role: 'assistant', content: 'Super ! Comment puis-je vous aider ?' },
      { role: 'user', content: 'Je préfère les explications très courtes.' },
      { role: 'assistant', content: 'D\'accord.' },
      { role: 'user', content: 'Mon objectif est d\'apprendre Go.' }
    ];

    const getContextMock = jest.spyOn(workingMemory, 'getContext').mockImplementation(async () => {
      return mockContext;
    });

    const mockLLMResponse = {
      content: `\`\`\`json
[
  {"type": "fact", "key": "role", "value": "Senior React Developer"},
  {"type": "pref", "key": "tone", "value": "very short explanations"},
  {"type": "goal", "key": "learn", "value": "learn Go"}
]
\`\`\``
    };

    const chatMock = jest.spyOn(providerRouter, 'chat').mockImplementation(async () => {
      return mockLLMResponse as any;
    });

    const rememberMock = jest.spyOn(factsMemory, 'remember').mockImplementation(async () => {
      return true;
    });

    await learningEngine.extractInsights('123@s.whatsapp.net');

    expect(getContextMock).toHaveBeenCalledTimes(1);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(rememberMock).toHaveBeenCalledTimes(3);

    expect(rememberMock).toHaveBeenNthCalledWith(1, '123@s.whatsapp.net', 'fact:role', 'Senior React Developer');
    expect(rememberMock).toHaveBeenNthCalledWith(2, '123@s.whatsapp.net', 'pref:tone', 'very short explanations');
    expect(rememberMock).toHaveBeenNthCalledWith(3, '123@s.whatsapp.net', 'goal:learn', 'learn Go');
  });
});
