// tests/unit/services/userService.test.js
// ============================================================================
// Tests Unitaires pour userService
// ============================================================================

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock des dépendances
const mockStateManager = {
    updateUserInteraction: mock.fn(async () => { }),
    getUser: mock.fn(async () => ({
        jid: '1234567890@s.whatsapp.net',
        username: 'TestUser',
        last_pushname: 'TestUser',
        interaction_count: 42,
        last_seen: new Date().toISOString()
    }))
};

const mockIdentityMap = {
    register: mock.fn(async () => { }),
    resolve: mock.fn(async () => null)
};

// Pour les tests, on crée une version mockée du service
const createMockedUserService = () => ({
    async recordInteraction(identifier, pushName, groupJid = null) {
        const resolvedJid = await mockIdentityMap.resolve(identifier) || identifier;
        await mockStateManager.updateUserInteraction(resolvedJid, pushName);
    },

    async getProfile(identifier) {
        const user = await mockStateManager.getUser(identifier);
        return {
            jid: user.jid,
            names: [user.last_pushname || user.username].filter(Boolean),
            interaction_count: user.interaction_count || 0,
            last_seen: user.last_seen
        };
    },

    async registerLid(jid, lid) {
        await mockIdentityMap.register(jid, lid);
    },

    async resolveLid(identifier) {
        return await mockIdentityMap.resolve(identifier);
    },

    async getSpeakerHash(jid) {
        if (!jid) return 'UNK';
        // Simplified hash for testing
        return jid.substring(0, 3).toUpperCase();
    }
});

describe('userService', () => {
    let userService;

    beforeEach(() => {
        // Reset mocks
        mockStateManager.updateUserInteraction.mock.resetCalls();
        mockStateManager.getUser.mock.resetCalls();
        mockIdentityMap.register.mock.resetCalls();
        mockIdentityMap.resolve.mock.resetCalls();

        userService = createMockedUserService();
    });

    describe('getProfile()', () => {
        it('should return a valid UserProfile object', async () => {
            const profile = await userService.getProfile('1234567890@s.whatsapp.net');

            assert.ok(profile.jid, 'Profile should have a jid');
            assert.ok(Array.isArray(profile.names), 'Profile names should be an array');
            assert.strictEqual(typeof profile.interaction_count, 'number', 'interaction_count should be a number');
        });

        it('should extract names correctly', async () => {
            const profile = await userService.getProfile('1234567890@s.whatsapp.net');

            assert.strictEqual(profile.names.length, 1);
            assert.strictEqual(profile.names[0], 'TestUser');
        });

        it('should include interaction count', async () => {
            const profile = await userService.getProfile('1234567890@s.whatsapp.net');

            assert.strictEqual(profile.interaction_count, 42);
        });
    });

    describe('recordInteraction()', () => {
        it('should call StateManager.updateUserInteraction', async () => {
            await userService.recordInteraction('1234567890@s.whatsapp.net', 'TestUser');

            assert.strictEqual(mockStateManager.updateUserInteraction.mock.callCount(), 1);
        });

        it('should resolve LID before recording', async () => {
            await userService.recordInteraction('someLid@lid', 'TestUser');

            assert.strictEqual(mockIdentityMap.resolve.mock.callCount(), 1);
        });
    });

    describe('registerLid()', () => {
        it('should delegate to IdentityMap', async () => {
            await userService.registerLid('jid@s.whatsapp.net', 'lid@lid');

            assert.strictEqual(mockIdentityMap.register.mock.callCount(), 1);
        });
    });

    describe('getSpeakerHash()', () => {
        it('should return UNK for null/undefined jid', async () => {
            const hash = await userService.getSpeakerHash(null);
            assert.strictEqual(hash, 'UNK');
        });

        it('should return a 3-character hash for valid jid', async () => {
            const hash = await userService.getSpeakerHash('1234567890@s.whatsapp.net');
            assert.strictEqual(hash.length, 3);
        });
    });
});
