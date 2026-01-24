import test from 'node:test';
import assert from 'node:assert';
import { resolveApiKey, resolveCredentials } from '../../../config/keyResolver.js';

test('KeyResolver', async (t) => {
    await t.test('resolveApiKey: should return null if value is null', () => {
        assert.strictEqual(resolveApiKey(null), null);
    });

    await t.test('resolveApiKey: should return value if not a placeholder', () => {
        assert.strictEqual(resolveApiKey('real_key_123'), 'real_key_123');
    });

    await t.test('resolveApiKey: should resolve placeholder from process.env', () => {
        process.env.VOTRE_TEST_KEY = 'resolved_secret';
        assert.strictEqual(resolveApiKey('VOTRE_TEST_KEY'), 'resolved_secret');
        delete process.env.VOTRE_TEST_KEY;
    });

    await t.test('resolveApiKey: should return placeholder if env var missing', () => {
        assert.strictEqual(resolveApiKey('VOTRE_MISSING_KEY'), 'VOTRE_MISSING_KEY');
    });

    await t.test('resolveCredentials: should resolve object keys', () => {
        process.env.VOTRE_IA_KEY = 'secret_ai';
        const creds = {
            familles_ia: {
                gemini: 'VOTRE_IA_KEY',
                openai: 'real_openai'
            }
        };
        const resolved = resolveCredentials(creds);
        assert.strictEqual(resolved.familles_ia.gemini, 'secret_ai');
        assert.strictEqual(resolved.familles_ia.openai, 'real_openai');
        delete process.env.VOTRE_IA_KEY;
    });
});
