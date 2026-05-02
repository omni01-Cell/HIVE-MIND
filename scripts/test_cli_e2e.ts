import 'dotenv/config';

// Set environment for CLI testing
process.env.ACTIVE_TRANSPORTS = 'cli';
process.env.APP_ENV = 'local';

import { botCore } from '../core/index.js';
import { container } from '../core/ServiceContainer.js';
import { eventBus } from '../core/events.js';
import type { MessageData } from '../types/BotTypes.js';

async function simulateIncomingMessage(text: string) {
    console.log(`\n[E2E-TEST] 📩 Sending message: "${text}"`);
    const messageObj: any = {
        id: 'test_' + Date.now(),
        chatId: 'cli_chat_e2e',
        sender: 'test_user',
        senderName: 'Tester',
        text: text,
        isGroup: false,
        isSystem: false,
        raw: { text },
        authorityLevel: 'DIVIN (SuperUser)'
    };
    
    // Find the transport manager and emit message
    const transportManager = botCore.transport;
    
    return new Promise((resolve) => {
        // Wait for the bot to respond on the cli transport
        setTimeout(() => {
            resolve(true);
        }, 30000); // Wait 30 seconds for the agent to finish
        
        const transport = transportManager.getTransport('cli');
        if (transport && transport.messageCallback) {
             transport.messageCallback(messageObj);
        } else if (transport && transport.handleMessage) {
            // For ink-cli it might be different
             transport.handleMessage(messageObj);
        }
    });
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function runTests() {
    try {
        console.log('🚀 Initializing bot core in test mode...');
        await botCore.init();

        // 1. TTS
        await simulateIncomingMessage("Can you use text_to_speech to say '[laughs] I did NOT expect that. [short pause] Can you believe it?' in a British accent?");
        await delay(15000);

        // 2. Crawlfire
        await simulateIncomingMessage("Can you read the webpage at https://example.com and tell me what the main heading says?");
        await delay(15000);

        console.log('✅ End to End Tests complete.');
        process.exit(0);

    } catch (error) {
        console.error('❌ E2E Test failed:', error);
        process.exit(1);
    }
}

runTests();
