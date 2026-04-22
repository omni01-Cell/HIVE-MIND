// tests/unit/utils/helpers.test.ts
import { describe, it, expect } from '@jest/globals';
import { 
  isStorable, 
  formatToWhatsApp, 
  truncate, 
  delay, 
  jidToPhone, 
  phoneToJid, 
  extractMentions 
} from '../../../utils/helpers.js';

describe('helpers.ts unit tests', () => {
  
  describe('isStorable()', () => {
    it('should return false for empty or null text', () => {
      expect(isStorable('', 'user')).toBe(false);
      expect(isStorable(null, 'user')).toBe(false);
      expect(isStorable(undefined, 'user')).toBe(false);
    });

    it('should return false for commands', () => {
      expect(isStorable('!help', 'user')).toBe(false);
      expect(isStorable('/start', 'user')).toBe(false);
      expect(isStorable('.config', 'user')).toBe(false);
      expect(isStorable('?whoami', 'user')).toBe(false);
    });

    it('should return false for very short text (< 5 chars)', () => {
      expect(isStorable('Hi', 'user')).toBe(false);
      expect(isStorable('Ok  ', 'user')).toBe(false);
    });

    it('should return false for noise patterns', () => {
      expect(isStorable('🤖 Démarrage du bot', 'assistant')).toBe(false);
      expect(isStorable('❌ Erreur critique', 'assistant')).toBe(false);
    });

    it('should return false for assistant refusals', () => {
      expect(isStorable('Désolé, je ne peux pas faire ça', 'assistant')).toBe(false);
      expect(isStorable('Je ne peux pas accéder à cette info', 'assistant')).toBe(false);
    });

    it('should return true for valid user messages', () => {
      expect(isStorable('Bonjour, quel est le programme aujourd\'hui ?', 'user')).toBe(true);
    });
  });

  describe('formatToWhatsApp()', () => {
    it('should convert bold, italic and strikethrough', () => {
      expect(formatToWhatsApp('**bold**')).toBe('*bold*');
      expect(formatToWhatsApp('__italic__')).toBe('_italic_');
      expect(formatToWhatsApp('~~strike~~')).toBe('~strike~');
    });

    it('should convert titles to bold caps', () => {
      expect(formatToWhatsApp('# Hello World')).toBe('*HELLO WORLD*');
    });

    it('should convert markdown links', () => {
      expect(formatToWhatsApp('[Google](https://google.com)')).toBe('Google (https://google.com)');
    });

    it('should convert lists to bullet points', () => {
      const input = '- Item 1\n* Item 2';
      const output = formatToWhatsApp(input);
      expect(output).toContain('• Item 1');
      expect(output).toContain('• Item 2');
    });

    it('should handle code blocks', () => {
      const input = '```js\nconst x = 1;\n```';
      const output = formatToWhatsApp(input);
      expect(output).toContain('```\nconst x = 1;\n```');
    });
  });

  describe('truncate()', () => {
    it('should not truncate short text', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated';
      const truncated = truncate(text, 10);
      expect(truncated.length).toBe(10);
      expect(truncated.endsWith('...')).toBe(true);
    });
  });

  describe('JID helpers', () => {
    it('jidToPhone should extract number', () => {
      expect(jidToPhone('33612345678@s.whatsapp.net')).toBe('33612345678');
    });

    it('phoneToJid should format number', () => {
      expect(phoneToJid('+33 6 12 34 56 78')).toBe('33612345678@s.whatsapp.net');
    });
  });

  describe('extractMentions()', () => {
    it('should extract mentions from text', () => {
      const text = 'Hello @33612345678 and @33687654321';
      const mentions = extractMentions(text);
      expect(mentions).toEqual([
        '33612345678@s.whatsapp.net',
        '33687654321@s.whatsapp.net'
      ]);
    });

    it('should return empty array if no mentions', () => {
      expect(extractMentions('Hello world')).toEqual([]);
    });
  });

  describe('delay()', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });
});
