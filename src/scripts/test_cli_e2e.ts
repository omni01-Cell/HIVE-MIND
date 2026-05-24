import 'dotenv/config';

// Set environment for CLI testing
process.env.ACTIVE_TRANSPORTS = 'cli';
process.env.APP_ENV = 'local';

import { botCore } from '../core/index.js';
import { container } from '../core/ServiceContainer.js';
import { eventBus } from '../core/events.js';
import type { MessageData } from '../core/types/BotTypes.js';

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
        }, 300000); // Wait 5 minutes for the complex agentic loop to finish
        
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

        // Intense Agentic Task to stress test the Smart Router V2 RPM
        const intensePrompt = `Va sur le site Hacker News (news.ycombinator.com), lis le titre des 3 premiers articles. Ensuite, utilise tes outils développeur pour créer un script Python qui génère un rapport au format PDF résumant ces 3 articles. Exécute ce script et donne moi le rapport final. Fais-le étape par étape et montre moi tes reflexions.`;
        
        await simulateIncomingMessage(intensePrompt);
        await delay(300000); // 5 min delay to observe all logs, RPM exhaustion, and key rotation

        console.log('✅ End to End Stress Test complete.');
        process.exit(0);

    } catch (error) {
        console.error('❌ E2E Test failed:', error);
        process.exit(1);
    }
}

runTests();
