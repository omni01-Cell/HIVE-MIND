import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ESM-safe mocking: MUST come before any dynamic import
jest.unstable_mockModule('child_process', () => ({
    execFile: jest.fn((file: any, args: any, options: any, cb: any) => cb(null, {
        stdout: JSON.stringify({ success: true, data: {} }),
        stderr: ''
    }))
}));

const { BrowserService } = await import('../../services/browser/BrowserService.js');

describe('BrowserService', () => {
    // WHY: BrowserService has a private constructor (singleton). Cast through `any` for test access.
    let browserService: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-ignore: Accès au singleton pour le test
        // WHY: Reset singleton to ensure clean state between tests
        (BrowserService as any).instance = null;
        browserService = (BrowserService as any).getInstance();
    });

    describe('open', () => {
        it('cas nominal — autorise l\'ouverture d\'un site légitime', async () => {
            // Arrange
            const url = 'https://wikipedia.org';

            // Act
            const result = await browserService.open(url);

            // Assert
            expect(result.success).toBe(true);
        });

        it('cas d\'erreur — refuse l\'ouverture si le domaine appartient à la blacklist', async () => {
            // Arrange
            const url = 'https://pornhub.com';

            // Act
            const result = await browserService.open(url);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/blocked by security policy/);
        });
    });
});
