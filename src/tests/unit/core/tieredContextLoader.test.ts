import { describe, it, beforeEach, jest, expect } from '@jest/globals';

// 1. Mock fs readFileSync and existsSync
import * as fsActual from 'fs';
jest.unstable_mockModule('fs', () => ({
    ...fsActual,
    readFileSync: jest.fn((path: any, options: any) => {
        const pathStr = String(path);
        if (pathStr.includes('system.md')) {
            return 'System Template: {{CURRENT_CHANNEL}} | {{CURRENT_TIMESTAMP}} | {{USER_PASSPORT}} | {{SCRATCHPAD}} | {{ACTION_HISTORY}}';
        }
        return fsActual.readFileSync(path, options);
    }),
    existsSync: jest.fn((path: any) => {
        const pathStr = String(path);
        if (pathStr.includes('system.md')) {
            return true;
        }
        return fsActual.existsSync(path);
    })
}));

// 2. Mock blueprintManager
const dummyBlueprint = {
    metadata: { id: 'hive_main', name: 'Hive Main', version: '1.0.0' },
    mindos: {
        drives: ['drive_a', 'drive_b']
    },
    action_space: { allowed_tools: ['tool_a'] },
    constraints: { read_only_fs: true, max_budget_usd: 0.5, max_iterations: 5 }
};

jest.unstable_mockModule('../../../core/blueprint/AgentBlueprint.js', () => ({
    blueprintManager: {
        loadBlueprint: jest.fn((id: string) => {
            if (id === 'custom_agent') {
                return {
                    ...dummyBlueprint,
                    metadata: { ...dummyBlueprint.metadata, id: 'custom_agent' },
                    mindos: { drives: ['custom_drive'] }
                };
            }
            return dummyBlueprint;
        })
    }
}));

// Imports dynamically
const { tieredContextLoader } = await import('../../../core/context/TieredContextLoader.js');

describe('TieredContextLoader (MindOS & Constraints Integration)', () => {
    // Mock implementations
    const mockWorkingMemory = {
        getContext: jest.fn(async () => []),
        getPassport: jest.fn(async () => null),
        getScratchpad: jest.fn(async () => 'mock_scratchpad'),
        getActionHistory: jest.fn(async () => []),
        formatPassport: jest.fn((p: any) => `FormattedPassport:${p.name}`),
        formatActionHistory: jest.fn(() => 'FormattedHistory'),
        setPassport: jest.fn(async () => {})
    };

    const mockUserService = {
        getProfile: jest.fn(async () => ({
            names: ['John Doe'],
            interaction_count: 42,
            last_seen: '2026-05-20T00:00:00Z'
        }))
    };

    const mockGroupService = {
        getContext: jest.fn(async (chatId: string) => {
            if (chatId === 'custom_group@g.us') {
                return { group: { name: 'Custom Group', blueprintId: 'custom_agent' } };
            }
            return { group: { name: 'Hive Mind Group', blueprintId: 'hive_main' } };
        })
    };

    const mockAdminService = {
        isSuperUser: jest.fn(async () => false),
        isGlobalAdmin: jest.fn(async () => false)
    };

    const mockFacts = {
        getAll: jest.fn(async () => ({
            'fact:one': 'Likes coffee',
            'pref:two': 'Prefers dark mode'
        }))
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Inject mocks directly into singleton
        tieredContextLoader.workingMemory = mockWorkingMemory;
        tieredContextLoader.userService = mockUserService;
        tieredContextLoader.groupService = mockGroupService;
        tieredContextLoader.adminService = mockAdminService;
        tieredContextLoader.factsMemory = mockFacts;
    });

    it('should load unified context and inject mindos drives & economic constraints in prompt', async () => {
        const context = await tieredContextLoader.load('group123@g.us', {
            sender: 'user123',
            senderName: 'John',
            sourceChannel: 'whatsapp'
        });

        // Vérifier le prompt système et ses balises XML injectées
        expect(context.systemPrompt).toContain('<mindos_drives>');
        expect(context.systemPrompt).toContain('- drive_a');
        expect(context.systemPrompt).toContain('- drive_b');
        expect(context.systemPrompt).toContain('<economic_constraint>');
        expect(context.systemPrompt).toContain('<read_only_fs>true</read_only_fs>');
        expect(context.systemPrompt).toContain('<max_budget_usd>0.5</max_budget_usd>');
        expect(context.systemPrompt).toContain('<max_iterations>5</max_iterations>');

        // Vérifier que le blueprint est bien exposé dans l'objet de retour
        expect(context.blueprint).toBeDefined();
        expect((context.blueprint.metadata as Record<string, unknown>).id).toBe('hive_main');
    });

    it('should support dynamic blueprint resolution per group settings', async () => {
        const context = await tieredContextLoader.load('custom_group@g.us', {
            sender: 'user123',
            senderName: 'John',
            sourceChannel: 'whatsapp'
        });

        expect((context.blueprint.metadata as Record<string, unknown>).id).toBe('custom_agent');
        expect(context.systemPrompt).toContain('<mindos_drives>');
        expect(context.systemPrompt).toContain('- custom_drive');
        expect(context.systemPrompt).not.toContain('- drive_a');
    });
});
