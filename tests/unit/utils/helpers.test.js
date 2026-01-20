// tests/unit/utils/helpers.test.js
// ============================================================================
// Tests Unitaires pour les helpers utilitaires
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Test des fonctions pures (sans dépendances externes)

describe('isStorable()', () => {
    // Simuler la fonction isStorable
    const isStorable = (text, role) => {
        if (!text || typeof text !== 'string') return false;
        if (text.length < 10) return false;
        if (role === 'system') return false;
        // Filtrer les commandes et messages techniques
        if (text.startsWith('.') || text.startsWith('/')) return false;
        return true;
    };

    it('should return false for empty text', () => {
        assert.strictEqual(isStorable('', 'user'), false);
        assert.strictEqual(isStorable(null, 'user'), false);
        assert.strictEqual(isStorable(undefined, 'user'), false);
    });

    it('should return false for very short text', () => {
        assert.strictEqual(isStorable('Hi', 'user'), false);
        assert.strictEqual(isStorable('Ok', 'user'), false);
    });

    it('should return false for system role', () => {
        assert.strictEqual(isStorable('This is a system message', 'system'), false);
    });

    it('should return false for commands', () => {
        assert.strictEqual(isStorable('.help please', 'user'), false);
        assert.strictEqual(isStorable('/start command', 'user'), false);
    });

    it('should return true for valid user messages', () => {
        assert.strictEqual(isStorable('Bonjour, comment allez-vous ?', 'user'), true);
        assert.strictEqual(isStorable('Cette phrase est assez longue pour être stockée', 'assistant'), true);
    });
});

describe('delay()', () => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    it('should resolve after specified time', async () => {
        const start = Date.now();
        await delay(50);
        const elapsed = Date.now() - start;

        assert.ok(elapsed >= 45, 'Should wait at least 45ms');
        assert.ok(elapsed < 150, 'Should not wait too long');
    });
});

describe('formatToWhatsApp()', () => {
    // Simuler la fonction de formatage
    const formatToWhatsApp = (text) => {
        if (!text) return '';
        // Conversion basique Markdown -> WhatsApp
        return text
            .replace(/\*\*(.*?)\*\*/g, '*$1*')  // Bold
            .replace(/__(.*?)__/g, '_$1_')      // Italic
            .replace(/~~(.*?)~~/g, '~$1~');     // Strikethrough
    };

    it('should convert markdown bold to WhatsApp bold', () => {
        assert.strictEqual(formatToWhatsApp('**bold**'), '*bold*');
    });

    it('should convert markdown italic to WhatsApp italic', () => {
        assert.strictEqual(formatToWhatsApp('__italic__'), '_italic_');
    });

    it('should handle empty input', () => {
        assert.strictEqual(formatToWhatsApp(''), '');
        assert.strictEqual(formatToWhatsApp(null), '');
    });

    it('should handle mixed formatting', () => {
        const input = '**bold** and __italic__';
        const expected = '*bold* and _italic_';
        assert.strictEqual(formatToWhatsApp(input), expected);
    });
});
