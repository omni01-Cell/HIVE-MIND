import { jest } from '@jest/globals';

const mockEmbed = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);

jest.unstable_mockModule('../../../services/ai/EmbeddingsService.js', () => ({
    EmbeddingsService: class {
        embed = mockEmbed;
    }
}));

jest.unstable_mockModule('../../../services/supabase.js', () => ({
    supabase: {
        from: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn()
    }
}));

jest.unstable_mockModule('fs', () => ({
    readFileSync: jest.fn(() => JSON.stringify({
        familles_ia: {
            gemini: 'test-key',
            openai: 'test-key'
        }
    }))
}));

jest.unstable_mockModule('../../../config/keyResolver.js', () => ({
    resolveApiKey: jest.fn(() => 'resolved-key')
}));

const { graphMemory } = await import('../../../services/graphMemory.js');
const { supabase } = await import('../../../services/supabase.js') as any;

describe('GraphMemory', () => {
    let consoleErrorSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    describe('upsertEntity', () => {
        it('should handle happy path successfully', async () => {
            const mockData = { id: '1', name: 'Test Entity' };

            (supabase.from as jest.Mock).mockReturnValue({
                upsert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockData, error: null })
                    })
                })
            } as any);

            const result = await graphMemory.upsertEntity('chat-123', {
                name: 'Test Entity',
                description: 'A test entity'
            });

            expect(result).toEqual(mockData);
        });

        it('should handle error path correctly and return null', async () => {
            const mockError = new Error('Database Error');

            (supabase.from as jest.Mock).mockReturnValue({
                upsert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: mockError })
                    })
                })
            } as any);

            const result = await graphMemory.upsertEntity('chat-123', {
                name: 'Error Entity',
                description: 'An entity causing error'
            });

            expect(result).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[GraphMemory] Erreur upsertEntity:',
                'Database Error'
            );
        });
    });
});
