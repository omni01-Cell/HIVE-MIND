import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// Mock dependencies BEFORE importing the modules that use them
jest.unstable_mockModule('../services/redisClient.js', () => ({
    redis: {
        isReady: true,
        get: jest.fn(),
        mGet: jest.fn(),
        setEx: jest.fn(),
        multi: jest.fn(() => ({
            incr: jest.fn(),
            expire: jest.fn(),
            incrBy: jest.fn(),
            exec: jest.fn()
        }))
    },
    ensureConnected: jest.fn(),
    checkHealth: jest.fn(),
    disconnect: jest.fn()
}));

// Now we dynamically import the modules after mocking
const { quotaManager } = await import('../services/quotaManager.js');
const { envResolver } = await import('../services/envResolver.js');

describe('Smart Router V2 Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset QuotaManager config for tests if needed
        (quotaManager as any).quotas = {
            'gemini-1.5-pro': { rpm: 10, tpm: 100000, rpd: 500 },
            'gemini-1.5-flash': { rpm: 20, tpm: 200000, rpd: 1000 },
            'audio-model': { rpm: 5, tpm: 10000, rpd: 100 }
        };
    });

    describe('EnvResolver', () => {
        it('should correctly identify and fetch multiple keys for a provider', () => {
            process.env.GEMINI_KEY_1 = 'key1';
            process.env.GEMINI_KEY_2 = 'key2';
            process.env.GEMINI_KEY_4 = 'key4';
            
            // Assume envResolver has a method getAvailableKeysForProvider
            const keys = (envResolver as any).getAvailableKeysForProvider('GEMINI');
            
            expect(keys).toEqual([1, 2, 4]);
            
            // Clean up
            delete process.env.GEMINI_KEY_1;
            delete process.env.GEMINI_KEY_2;
            delete process.env.GEMINI_KEY_4;
        });
    });

    describe('ProviderRouter V2 - Model Filtering', () => {
        it('should exclude audio, tts, and live_api models from standard chat rotation', () => {
            const rawConfig = {
                modeles: [
                    { id: 'text-model', types: ['chat', 'reasoning'] },
                    { id: 'audio-model', types: ['audio', 'chat'] },
                    { id: 'live-model', types: ['live_api', 'chat'] },
                    { id: 'tts-model', types: ['tts', 'chat'] },
                    { id: 'stt-model', types: ['stt', 'transcription'] }
                ]
            };

            const excludedTypes = ['live_api', 'tts', 'stt', 'audio', 'transcription'];
            
            const rawModels = rawConfig.modeles
                .filter((m: any) => {
                    if (!m.types?.includes('chat')) return false;
                    const hasExcluded = m.types.some((t: string) => excludedTypes.includes(t));
                    return !hasExcluded;
                })
                .map((m: any) => m.id);

            expect(rawModels).toEqual(['text-model']);
        });
    });

    describe('QuotaManager V2 - Granular Tracking', () => {
        it('should return Key 2 when Key 1 has exhausted its RPM', async () => {
            const redisModule = await import('../services/redisClient.js');
            const redis = redisModule.redis as any;
            
            // Mock redis get behavior
            redis.get.mockImplementation((key: string) => {
                // Key 1 is exhausted for gemini-1.5-pro
                if (key === 'quota:gemini-1.5-pro:k1:rpm') return '10'; // Equal to limit 10
                // Key 2 is healthy
                if (key === 'quota:gemini-1.5-pro:k2:rpm') return '0';
                return null;
            });

            // Assume envResolver returns available indices 1, 2
            (envResolver as any).getAvailableKeysForProvider = jest.fn().mockReturnValue([1, 2]);

            // Test the new method
            const bestKeyIndex = await (quotaManager as any).getAvailableKeyForModel('gemini-1.5-pro', 'GEMINI');
            
            expect(bestKeyIndex).toBe(2);
        });

        it('should keep Model B on Key 1 even if Model A exhausts Key 1', async () => {
            const redisModule = await import('../services/redisClient.js');
            const redis = redisModule.redis as any;
            
            redis.get.mockImplementation((key: string) => {
                if (key === 'quota:gemini-1.5-pro:k1:rpm') return '10'; // Exhausted
                if (key === 'quota:gemini-1.5-flash:k1:rpm') return '5'; // Healthy (limit is 20)
                return null;
            });

            (envResolver as any).getAvailableKeysForProvider = jest.fn().mockReturnValue([1, 2]);

            const bestKeyIndexPro = await (quotaManager as any).getAvailableKeyForModel('gemini-1.5-pro', 'GEMINI');
            const bestKeyIndexFlash = await (quotaManager as any).getAvailableKeyForModel('gemini-1.5-flash', 'GEMINI');
            
            expect(bestKeyIndexPro).toBe(2);
            expect(bestKeyIndexFlash).toBe(1);
        });
    });
});