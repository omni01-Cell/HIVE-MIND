// tests/unit/plugins/SystemScratchpadTool.test.ts
// MOD 2 — SystemScratchpadTool (run_scratchpad)
import { describe, it, beforeEach, afterEach, jest, expect, beforeAll } from '@jest/globals';

// Mock loader BEFORE import
jest.unstable_mockModule('../../../plugins/loader.js', () => ({
    pluginLoader: {
        getToolDefinitions: jest.fn(() => [
            { function: { name: 'list_directory' } },
            { function: { name: 'grep_search' } },
            { function: { name: 'read_file' } },
            { function: { name: 'duckduck_search' } },
            { function: { name: 'execute_bash_command' } } // must be filtered out
        ]),
        execute: jest.fn(async () => ({ success: true, message: 'mock result' }))
    }
}));

describe('SystemScratchpadTool (run_scratchpad)', () => {
    let SystemScratchpadTool: any;
    let pluginLoader: any;
    let providersModule: any;
    let chatSpy: any;

    beforeAll(async () => {
        // Dynamic import AFTER mock registration
        const mod1 = await import('../../../plugins/base/dev_tools/SystemScratchpadTool.js');
        SystemScratchpadTool = mod1.default;
        
        const mod2 = await import('../../../plugins/loader.js');
        pluginLoader = mod2.pluginLoader;
        
        providersModule = await import('../../../providers/index.js');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Use spyOn since ESM module exports are live bindings
        chatSpy = jest.spyOn(providersModule.providerRouter, 'chat').mockResolvedValue({
            content: 'Scratchpad report: found 5 TS files.',
            toolCalls: null
        } as any);
    });

    afterEach(() => {
        chatSpy?.mockRestore();
    });

    it('returns null for wrong toolName', async () => {
        const result = await SystemScratchpadTool.execute({}, {}, 'wrong_tool');
        expect(result).toBeNull();
    });

    it('returns a report with success=true on normal completion', async () => {
        const result = await SystemScratchpadTool.execute(
            { instructions: 'Find all TS files in services/' },
            {},
            'run_scratchpad'
        );

        expect(result).not.toBeNull();
        expect(result!.success).toBe(true);
        expect(result!.message).toContain('Rapport de SystemScratchpad');
        expect(result!.message).toContain('found 5 TS files');
    });

    it('filters tools to READ-ONLY whitelist only', async () => {
        await SystemScratchpadTool.execute({ instructions: 'test' }, {}, 'run_scratchpad');

        expect(chatSpy).toHaveBeenCalled();
        const options = chatSpy.mock.calls[0][1] as any;
        expect(options.tools).toBeDefined();

        const toolNames = options.tools.map((t: any) => t.function.name);
        expect(toolNames).toContain('list_directory');
        expect(toolNames).toContain('grep_search');
        expect(toolNames).toContain('read_file');
        expect(toolNames).not.toContain('execute_bash_command');
    });

    it('blocks forbidden tools during execution without calling pluginLoader', async () => {
        // First call: LLM requests a forbidden tool
        chatSpy
            .mockResolvedValueOnce({
                content: null,
                toolCalls: [{ id: 'tc1', function: { name: 'execute_bash_command', arguments: '{}' } }]
            } as any)
            // Second call: LLM produces final text
            .mockResolvedValueOnce({ content: 'Done.', toolCalls: null } as any);

        await SystemScratchpadTool.execute({ instructions: 'test' }, {}, 'run_scratchpad');

        const executeCalls = (pluginLoader.execute as jest.Mock).mock.calls;
        const bashCalls = executeCalls.filter((c: any) => c[0] === 'execute_bash_command');
        expect(bashCalls).toHaveLength(0);
    });

    it('respects MAX_ITERATIONS (5) limit', async () => {
        // LLM always returns tool calls (infinite loop scenario)
        chatSpy.mockResolvedValue({
            content: null,
            toolCalls: [{ id: 'tc', function: { name: 'read_file', arguments: '{"file_path":"test"}' } }]
        } as any);

        await SystemScratchpadTool.execute({ instructions: 'loop forever' }, {}, 'run_scratchpad');

        expect(chatSpy.mock.calls.length).toBeLessThanOrEqual(6); // 5 iterations + 1 forced conclusion
    });

    it('returns error on LLM failure', async () => {
        chatSpy.mockRejectedValueOnce(new Error('API timeout') as never);

        const result = await SystemScratchpadTool.execute({ instructions: 'fail' }, {}, 'run_scratchpad');

        expect(result).not.toBeNull();
        expect(result!.success).toBe(false);
        expect(result!.message).toContain('Impossible de terminer la tâche');
        expect(result!.message).toContain('API timeout');
    });

    it('uses isolated history starting with system role', async () => {
        await SystemScratchpadTool.execute({ instructions: 'Explore services/' }, {}, 'run_scratchpad');

        expect(chatSpy).toHaveBeenCalled();
        const history = chatSpy.mock.calls[0][0] as any[];

        expect(history[0].role).toBe('system');
        expect(history[0].content).toContain('Scratchpad');
    });
});
