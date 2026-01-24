import test from 'node:test';
import assert from 'node:assert';
import { AudioHandler } from '../../../../core/transport/handlers/audioHandler.js';

test('AudioHandler', async (t) => {
    const mockTransport = {
        container: {
            has: (name) => name === 'transcriptionService',
            get: (name) => ({
                transcribe: async (path) => 'transcribed text'
            })
        },
        groupService: {
            getGroupSettings: async () => ({ audio_mode: 'full' })
        },
        sock: {
            updateMediaMessage: async () => ({})
        }
    };

    const mockLogger = {
        log: () => {},
        error: () => {},
        warn: () => {}
    };

    const handler = new AudioHandler(mockTransport, mockLogger);

    await t.test('should skip if not audio message', async () => {
        const msg = { message: { conversation: 'hello' } };
        const result = await handler.processAudioMessage(msg, {});
        assert.strictEqual(result, null);
    });

    await t.test('should identify reply to bot', async () => {
        mockTransport.sock.user = { id: 'bot_id:1@s.whatsapp.net' };
        const msg = {
            message: {
                audioMessage: {
                    contextInfo: { participant: 'bot_id@s.whatsapp.net' }
                }
            }
        };
        // @ts-ignore
        const result = handler._isReplyToBot(msg);
        assert.strictEqual(result, true);
    });
});
