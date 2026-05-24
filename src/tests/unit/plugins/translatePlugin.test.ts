// tests/unit/plugins/translatePlugin.test.ts
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';

jest.unstable_mockModule('@vitalets/google-translate-api', () => ({
    translate: jest.fn()
}));

const { default: TranslatePlugin } = await import('../../../plugins/tools/translate/index.js');
const { translate } = await import('@vitalets/google-translate-api');
const mockTranslate = translate as jest.MockedFunction<typeof translate>;

describe('Translate Plugin', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should translate provided text', async () => {
        mockTranslate.mockResolvedValue({
            text: 'Bonjour',
            from: { language: { iso: 'en' } }
        } as any);

        const args = { text: 'Hello', target_lang: 'fr' };
        const context = { message: {} };

        const result = await TranslatePlugin.execute(args, context);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Bonjour');
        expect(mockTranslate).toHaveBeenCalledWith('Hello', { from: 'auto', to: 'fr' });
    });

    it('should fall back to quoted message text if no text is provided', async () => {
        mockTranslate.mockResolvedValue({
            text: 'Bonjour',
            from: { language: { iso: 'en' } }
        } as any);

        const args = { target_lang: 'fr' };
        const context = { message: { quotedMsg: { text: 'Hello' } } };

        const result = await TranslatePlugin.execute(args, context);

        expect(result.success).toBe(true);
        expect(mockTranslate).toHaveBeenCalledWith('Hello', { from: 'auto', to: 'fr' });
    });

    it('should return error if no text is provided and no quoted message', async () => {
        const args = { target_lang: 'fr' };
        const context = { message: {} };

        const result = await TranslatePlugin.execute(args, context);

        expect(result.success).toBe(false);
        expect(result.message).toContain('No text to translate');
        expect(mockTranslate).not.toHaveBeenCalled();
    });

    it('should handle translation errors gracefully', async () => {
        mockTranslate.mockRejectedValue(new Error('Network error'));

        const args = { text: 'Hello', target_lang: 'fr' };
        const context = { message: {} };

        const result = await TranslatePlugin.execute(args, context);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Translation error: Network error');
    });
});
