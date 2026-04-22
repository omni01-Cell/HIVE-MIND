// tests/unit/transport/handlers/audioHandler.test.ts
import { describe, it, beforeEach, jest, expect } from '@jest/globals';
import { AudioHandler } from '../../../../core/transport/handlers/audioHandler.js';

describe('AudioHandler unit tests', () => {
  let mockTransport: any;
  let mockLogger: any;
  let handler: AudioHandler;

  beforeEach(() => {
    jest.restoreAllMocks();
    
    mockTransport = {
      container: {
        has: jest.fn((name: string) => name === 'transcriptionService'),
        get: jest.fn((name: string) => ({
          transcribe: async (path: string) => 'transcribed text'
        }))
      },
      groupService: {
        getGroupSettings: jest.fn(async () => ({ audio_mode: 'full' }))
      },
      sock: {
        updateMediaMessage: jest.fn(async () => ({})),
        user: { id: 'bot_id:1@s.whatsapp.net' }
      }
    };

    mockLogger = {
      log: jest.fn(() => {}),
      error: jest.fn(() => {}),
      warn: jest.fn(() => {})
    };

    handler = new AudioHandler(mockTransport, mockLogger);
  });

  it('should skip if not audio message', async () => {
    const msg = { message: { conversation: 'hello' } };
    const result = await handler.processAudioMessage(msg, {});
    expect(result).toBeNull();
  });

  it('should identify reply to bot', () => {
    const msg = {
      message: {
        audioMessage: {
          contextInfo: { participant: 'bot_id@s.whatsapp.net' }
        }
      }
    };
    // Accessing private method for testing
    // @ts-ignore
    const result = handler._isReplyToBot(msg);
    expect(result).toBe(true);
  });

  it('should identify reply to bot using LID', () => {
    mockTransport.sock.user.lid = 'bot_lid:1@s.whatsapp.net';
    const msg = {
      message: {
        audioMessage: {
          contextInfo: { participant: 'bot_lid@s.whatsapp.net' }
        }
      }
    };
    // @ts-ignore
    const result = handler._isReplyToBot(msg);
    expect(result).toBe(true);
  });
});
