// tests/unit/transport/handlers/antiDeleteHandler.test.ts
import { describe, it, beforeEach, jest, expect } from '@jest/globals';
import { AntiDeleteHandler } from '../../../../core/transport/handlers/antiDeleteHandler.js';
import { workingMemory } from '../../../../services/workingMemory.js';

describe('AntiDeleteHandler unit tests', () => {
  let mockTransport: any;
  let mockLogger: any;
  let handler: AntiDeleteHandler;

  beforeEach(() => {
    jest.restoreAllMocks();
    
    mockTransport = {
      sock: {
        sendMessage: jest.fn(async () => ({}))
      }
    };

    mockLogger = {
      log: jest.fn(() => {}),
      error: jest.fn(() => {}),
      warn: jest.fn(() => {})
    };

    handler = new AntiDeleteHandler(mockTransport, mockLogger);
    
    // Mock workingMemory
    jest.spyOn(workingMemory, 'isAntiDeleteEnabled').mockImplementation(async () => true);
    jest.spyOn(workingMemory, 'getStoredMessage').mockImplementation(async () => null);
    jest.spyOn(workingMemory, 'trackDeletedMessage').mockImplementation(async () => {});
    jest.spyOn(workingMemory, 'storeMessage').mockImplementation(async () => {});
  });

  it('should not handle update if not a delete', async () => {
    const updates = [{ update: { messageStubType: 0 } }];
    await handler.handleUpdate(updates);
    expect(mockTransport.sock.sendMessage).not.toHaveBeenCalled();
  });

  it('should skip if not a group', async () => {
    const updates = [{
      key: { remoteJid: '123@s.whatsapp.net', id: 'msg1' },
      update: { messageStubType: 1 }
    }];
    await handler.handleUpdate(updates);
    expect(mockTransport.sock.sendMessage).not.toHaveBeenCalled();
  });

  it('should restore message if stored and enabled', async () => {
    const chatId = '123@g.us';
    const updates = [{
      key: { remoteJid: chatId, id: 'msg1' },
      update: { messageStubType: 1 }
    }];
    
    const storedMsg = {
      senderName: 'TestUser',
      text: 'Hello world'
    };
    
    jest.spyOn(workingMemory, 'getStoredMessage').mockImplementation(async () => storedMsg);

    await handler.handleUpdate(updates);
    
    expect(mockTransport.sock.sendMessage).toHaveBeenCalledTimes(1);
    const sentContent = (mockTransport.sock.sendMessage as jest.Mock).mock.calls[0][1] as any;
    expect(sentContent.text).toContain('Hello world');
    expect(sentContent.text).toContain('TestUser');
  });
});
