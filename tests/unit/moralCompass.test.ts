import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { moralCompass } from '../../services/moralCompass.js';
import { providerRouter } from '../../providers/index.js';
import * as fs from 'fs';

// Mocks explicites
jest.mock('../../providers/index.js', () => ({
    providerRouter: {
        callServiceRecipe: jest.fn()
    }
}));

describe('moralCompass', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(fs, 'readFileSync').mockReturnValue('<priority_2_security_boundaries>Mock Boundaries</priority_2_security_boundaries>');
    });

    it('cas nominal — contourne le LLM (FAST PATH) et autorise un outil sûr', async () => {
        // Arrange
        const toolCall = { function: { name: 'list_directory', arguments: '{}' } };
        const context = { senderName: 'Alice', authorityLevel: 'User', isGroup: false };

        // Act
        const result = await moralCompass.evaluate(toolCall, context);

        // Assert
        expect(result).toEqual({ allowed: true, reason: null, risk_level: 'low' });
        expect(providerRouter.callServiceRecipe).not.toHaveBeenCalled();
    });

    it('cas nominal — contourne le LLM (FAST PATH) si l\'utilisateur est Global Admin', async () => {
        // Arrange
        const toolCall = { function: { name: 'execute_bash_command', arguments: '{"command": "rm -rf /"}' } };
        const context = { senderName: 'Admin', authorityLevel: 'Global Admin', isGroup: false };

        // Act
        const result = await moralCompass.evaluate(toolCall, context);

        // Assert
        expect(result).toEqual({ allowed: true, reason: null, risk_level: 'low' });
        expect(providerRouter.callServiceRecipe).not.toHaveBeenCalled();
    });

    it('cas nominal — appelle le LLM et autorise l\'action si le LLM répond allowed: true', async () => {
        // Arrange
        const toolCall = { function: { name: 'execute_bash_command', arguments: '{"command": "echo hello"}' } };
        const context = { senderName: 'Bob', authorityLevel: 'User', isGroup: false };
        
        (providerRouter.callServiceRecipe as any).mockResolvedValue({
            content: JSON.stringify({ allowed: true, confidence: 0.9, reason: null, risk_level: 'low' })
        });

        // Act
        const result = await moralCompass.evaluate(toolCall, context);

        // Assert
        expect(result).toEqual({ allowed: true, reason: null, risk_level: 'low' });
        expect(providerRouter.callServiceRecipe).toHaveBeenCalledTimes(1);
    });

    it('cas d\'erreur — bloque l\'action si le LLM répond allowed: false', async () => {
        // Arrange
        const toolCall = { function: { name: 'execute_bash_command', arguments: '{"command": "sudo rm -rf /"}' } };
        const context = { senderName: 'Eve', authorityLevel: 'User', isGroup: false };
        
        (providerRouter.callServiceRecipe as any).mockResolvedValue({
            content: JSON.stringify({ allowed: false, confidence: 0.99, reason: 'Privilege escalation', risk_level: 'high' })
        });

        // Act
        const result = await moralCompass.evaluate(toolCall, context);

        // Assert
        expect(result).toEqual({ allowed: false, reason: 'Privilege escalation', risk_level: 'high' });
    });

    it('cas d\'erreur réseau — fait un fallback sur allowed: true, medium risk si l\'API crash', async () => {
        // Arrange
        const toolCall = { function: { name: 'unknown_tool', arguments: '{}' } };
        const context = { senderName: 'Charlie', authorityLevel: 'User', isGroup: false };
        
        (providerRouter.callServiceRecipe as any).mockRejectedValue(new Error('Network error'));

        // Act
        const result = await moralCompass.evaluate(toolCall, context);

        // Assert
        expect(result).toEqual({ allowed: true, reason: null, risk_level: 'medium' });
    });
});
