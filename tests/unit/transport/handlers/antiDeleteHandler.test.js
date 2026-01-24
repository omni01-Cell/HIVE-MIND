import test from 'node:test';
import assert from 'node:assert';
import { AntiDeleteHandler } from '../../../../core/transport/handlers/antiDeleteHandler.js';

test('AntiDeleteHandler', async (t) => {
    const mockTransport = {
        sock: {
            sendMessage: async (chatId, content) => {
                mockTransport.sent = { chatId, content };
                return {};
            }
        }
    };
    mockTransport.sent = null;

    const mockLogger = {
        log: () => {},
        error: () => {}
    };

    const handler = new AntiDeleteHandler(mockTransport, mockLogger);

    await t.test('should not handle update if not a delete', async () => {
        const updates = [{ update: { messageStubType: 0 } }];
        await handler.handleUpdate(updates);
        assert.strictEqual(mockTransport.sent, null);
    });

    await t.test('should skip if not a group', async () => {
        const updates = [{
            key: { remoteJid: '123@s.whatsapp.net', id: 'msg1' },
            update: { messageStubType: 1 }
        }];
        await handler.handleUpdate(updates);
        assert.strictEqual(mockTransport.sent, null);
    });
});
