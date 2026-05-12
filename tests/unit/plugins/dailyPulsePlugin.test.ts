// tests/unit/plugins/dailyPulsePlugin.test.ts
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';

jest.unstable_mockModule('../../../plugins/tools/daily_pulse/journal_generator.js', () => ({
    journalGenerator: {
        generateDailyScript: jest.fn(),
        produceAudio: jest.fn()
    }
}));

const { default: DailyPulsePlugin } = await import('../../../plugins/tools/daily_pulse/index.js');
const { journalGenerator } = await import('../../../plugins/tools/daily_pulse/journal_generator.js');

const mockGenerateDailyScript = journalGenerator.generateDailyScript as jest.MockedFunction<typeof journalGenerator.generateDailyScript>;
const mockProduceAudio = journalGenerator.produceAudio as jest.MockedFunction<typeof journalGenerator.produceAudio>;

describe('Daily Pulse Plugin', () => {
    let mockTransport: any;
    let baseContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockTransport = {
            sendText: jest.fn(),
            sendVoiceNote: jest.fn()
        };
        baseContext = {
            chatId: '123@g.us',
            transport: mockTransport
        };
    });

    it('should fail if context is missing', async () => {
        const result = await DailyPulsePlugin.execute({}, {}, 'generate_daily_pulse');
        expect(result.success).toBe(false);
        expect(result.message).toContain('CONTEXT_ERROR');
    });

    it('should generate script and produce audio, then send voice note', async () => {
        mockGenerateDailyScript.mockResolvedValue('Hello this is the news');
        mockProduceAudio.mockResolvedValue('/tmp/audio.ogg');

        const result = await DailyPulsePlugin.execute({}, baseContext, 'generate_daily_pulse');

        expect(result.success).toBe(true);
        expect(mockTransport.sendText).toHaveBeenCalledWith('123@g.us', expect.stringContaining('Analyzing logs'));
        expect(mockTransport.sendVoiceNote).toHaveBeenCalledWith('123@g.us', '/tmp/audio.ogg', expect.any(Object));
        expect(result.message).toContain('audio sent');
    });

    it('should send text fallback if audio fails', async () => {
        mockGenerateDailyScript.mockResolvedValue('Hello this is the news');
        mockProduceAudio.mockResolvedValue(null as any);

        const result = await DailyPulsePlugin.execute({}, baseContext, 'generate_daily_pulse');

        expect(result.success).toBe(true);
        expect(mockTransport.sendText).toHaveBeenCalledWith('123@g.us', expect.stringContaining('Hello this is the news'));
        expect(result.message).toContain('Text Mode');
    });

    it('should handle not enough activity', async () => {
        mockGenerateDailyScript.mockResolvedValue(null as any);

        const result = await DailyPulsePlugin.execute({}, baseContext, 'generate_daily_pulse');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Not enough activity');
    });

    it('should handle errors gracefully', async () => {
        mockGenerateDailyScript.mockRejectedValue(new Error('Generation failed'));

        const result = await DailyPulsePlugin.execute({}, baseContext, 'generate_daily_pulse');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Error during Daily Pulse');
    });

    it('should ignore unknown tools', async () => {
        const result = await DailyPulsePlugin.execute({}, baseContext, 'unknown_tool');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown tool');
    });
});
