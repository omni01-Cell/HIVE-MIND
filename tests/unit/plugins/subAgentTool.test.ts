// tests/unit/plugins/subAgentTool.test.ts
// MOD 2 — SubAgent Isolé (delegate_task)
// Note: ESM modules require jest.unstable_mockModule instead of jest.fn() on module members
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';

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

// Dynamic import AFTER mock registration
const { default: SubAgentTool } = await import('../../../plugins/base/dev_tools/SubAgentTool.js');
const { pluginLoader } = await import('../../../plugins/loader.js');
const providersModule = await import('../../../providers/index.js');

describe('SubAgentTool (MOD 2)', () => {
    let chatSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // Use spyOn since ESM module exports are live bindings
        chatSpy = jest.spyOn(providersModule.providerRouter, 'chat').mockResolvedValue({
            content: 'SubAgent report: found 5 TS files.',
            toolCalls: null
        } as any);
    });

    afterEach(() => {
        chatSpy?.mockRestore();
    });

    it('returns null for wrong toolName', async () => {
        const result = await SubAgentTool.execute({}, {}, 'wrong_tool');
        expect(result).toBeNull();
    });

    it('returns a report with success=true on normal completion', async () => {
        const result = await SubAgentTool.execute(
            { instructions: 'Find all TS files in services/' },
            {},
            'delegate_task'
        );

        expect(result).not.toBeNull();
        expect(result!.success).toBe(true);
        expect(result!.message).toContain('RAPPORT DU SOUS-AGENT');
        expect(result!.message).toContain('found 5 TS files');
    });

    it('filters tools to READ-ONLY whitelist only', async () => {
        await SubAgentTool.execute({ instructions: 'test' }, {}, 'delegate_task');

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

        await SubAgentTool.execute({ instructions: 'test' }, {}, 'delegate_task');

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

        await SubAgentTool.execute({ instructions: 'loop forever' }, {}, 'delegate_task');

        expect(chatSpy.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('returns error on LLM failure', async () => {
        chatSpy.mockRejectedValueOnce(new Error('API timeout') as never);

        const result = await SubAgentTool.execute({ instructions: 'fail' }, {}, 'delegate_task');

        expect(result).not.toBeNull();
        expect(result!.success).toBe(false);
        expect(result!.message).toContain('itération');
        expect(result!.message).toContain('API timeout');
    });

    it('uses isolated history starting with system role', async () => {
        await SubAgentTool.execute({ instructions: 'Explore services/' }, {}, 'delegate_task');

        expect(chatSpy).toHaveBeenCalled();
        const history = chatSpy.mock.calls[0][0] as any[];

        expect(history[0].role).toBe('system');
        expect(history[0].content).toContain('Sous-Agent');
    });
});
