import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { BrowserService } from '../../services/browser/BrowserService.js';
import * as child_process from 'child_process';

// Mocks explicites
jest.mock('child_process', () => ({
    execFile: jest.fn((file: any, args: any, options: any, cb: any) => cb(null, { stdout: JSON.stringify({ success: true, data: {} }), stderr: '' }))
}));

describe('BrowserService', () => {
    let browserService: BrowserService;

    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-ignore: Accès au singleton pour le test
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
