// tests/unit/services/costTracker.test.ts
// MOD 4 — Kill Switch Financier (CostTracker)
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';

// Mock events module BEFORE importing CostTracker
jest.unstable_mockModule('../../../core/events.js', () => ({
    eventBus: { publish: jest.fn(), on: jest.fn(), subscribe: jest.fn() },
    BotEvents: {
        SYSTEM_ERROR: 'system:error',
        TOOL_PROGRESS: 'tool:progress'
    }
}));

// Mock fs to control pricing.json loading
jest.unstable_mockModule('fs', () => ({
    readFileSync: jest.fn(),
    existsSync: jest.fn(),
    writeFileSync: jest.fn()
}));

const fsModule = await import('fs');
const { CostTracker } = await import('../../../services/finops/CostTracker.js');
const { eventBus, BotEvents } = await import('../../../core/events.js');

describe('CostTracker (MOD 4)', () => {
    let tracker: any;
    let publishSpy: any;
    let fsSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();
        fsSpy = (fsModule.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
            default: { input: 0.15, output: 0.60 },
            models: {
                'gpt-4o-mini': { input: 0.15, output: 0.60 },
                'gpt-4o': { input: 5.00, output: 15.00 },
                'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
                'qwen/qwen3-32b': { input: 0.00, output: 0.00 }
            }
        }));
        publishSpy = jest.spyOn(eventBus, 'publish').mockImplementation(() => {});
        tracker = new CostTracker(2.00);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ── recordUsage ──

    it('recordUsage — calculates cost correctly for a known model', () => {
        // Arrange
        const model = 'gpt-4o-mini';
        const promptTokens = 1000;
        const completionTokens = 500;

        // Act
        const record = tracker.recordUsage(model, promptTokens, completionTokens);

        // Assert — (1000/1M)*0.15 + (500/1M)*0.60 = 0.00015 + 0.00030 = 0.00045
        expect(record.inputCost).toBeCloseTo(0.00015, 6);
        expect(record.outputCost).toBeCloseTo(0.00030, 6);
        expect(record.totalCost).toBeCloseTo(0.00045, 6);
    });

    it('recordUsage — uses default rates for unknown model', () => {
        // Arrange — model not in pricing.json
        const model = 'unknown-model-xyz';

        // Act
        const record = tracker.recordUsage(model, 1_000_000, 1_000_000);

        // Assert — default: input=0.15, output=0.60
        expect(record.inputCost).toBeCloseTo(0.15, 4);
        expect(record.outputCost).toBeCloseTo(0.60, 4);
    });

    it('recordUsage — returns $0 for free models (Groq/NVIDIA/GitHub)', () => {
        // Arrange
        const model = 'qwen/qwen3-32b'; // input: 0, output: 0

        // Act
        const record = tracker.recordUsage(model, 50000, 10000);

        // Assert
        expect(record.totalCost).toBe(0);
        expect(record.budgetSafe).toBe(true);
    });

    it('recordUsage — accumulates session cost across multiple calls', () => {
        // Arrange & Act — two calls
        tracker.recordUsage('gpt-4o', 100_000, 50_000);
        const record2 = tracker.recordUsage('gpt-4o', 100_000, 50_000);

        // Assert — each call: (100k/1M)*5 + (50k/1M)*15 = 0.5 + 0.75 = 1.25 → total = 2.50
        expect(record2.sessionTotal).toBeCloseTo(2.50, 2);
    });

    // ── Kill Switch ──

    it('recordUsage — triggers KILL SWITCH when budget exceeded', () => {
        // Arrange — budget = 2.00, single call should exceed
        const tracker2 = new CostTracker(0.001); // 0.1 cent budget

        // Act
        const record = tracker2.recordUsage('gpt-4o', 100_000, 50_000);

        // Assert
        expect(record.budgetSafe).toBe(false);
        expect(publishSpy).toHaveBeenCalledWith(BotEvents.SYSTEM_ERROR, expect.objectContaining({
            type: 'BUDGET_EXCEEDED'
        }));
    });

    it('recordUsage — returns budgetSafe=true when under budget', () => {
        // Act
        const record = tracker.recordUsage('gpt-4o-mini', 100, 100);

        // Assert
        expect(record.budgetSafe).toBe(true);
        expect(publishSpy).not.toHaveBeenCalled();
    });

    // ── getSessionCost ──

    it('getSessionCost — returns accumulated session total', () => {
        // Arrange
        tracker.recordUsage('gpt-4o-mini', 1_000_000, 0);

        // Act
        const cost = tracker.getSessionCost();

        // Assert
        expect(cost).toBeCloseTo(0.15, 4);
    });

    // ── reset ──

    it('reset — zeroes out session cost', () => {
        // Arrange
        tracker.recordUsage('gpt-4o', 1_000_000, 1_000_000);
        expect(tracker.getSessionCost()).toBeGreaterThan(0);

        // Act
        tracker.reset();

        // Assert
        expect(tracker.getSessionCost()).toBe(0);
    });

    // ── formatSummary ──

    it('formatSummary — returns formatted string with cost and budget', () => {
        // Arrange
        tracker.recordUsage('gpt-4o-mini', 1000, 500);

        // Act
        const summary = tracker.formatSummary();

        // Assert
        expect(summary).toContain('💰 Session:');
        expect(summary).toContain('$2.00'); // budget
    });

    // ── getSessionDuration ──

    it('getSessionDuration — returns positive duration', () => {
        // Act
        const duration = tracker.getSessionDuration();

        // Assert
        expect(duration).toBeGreaterThanOrEqual(0);
    });

    // ── Edge: pricing.json fallback ──

    it('constructor — falls back gracefully if pricing.json is missing', () => {
        // Arrange — force fs.readFileSync to throw
        (fsModule.readFileSync as jest.Mock).mockImplementationOnce(() => { throw new Error('ENOENT'); });

        // Act
        const fallbackTracker = new CostTracker();

        // Assert — should use built-in defaults, not crash
        const record = fallbackTracker.recordUsage('gpt-4o', 1_000_000, 0);
        expect(record.inputCost).toBeCloseTo(0.15, 4); // default input
    });
});
