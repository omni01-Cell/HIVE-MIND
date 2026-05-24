import fs from 'fs';
import sysInteraction from '../plugins/base/sys_interaction/index.js';

async function testSendFile() {
    let sentMedia: {
        chatId: string;
        filePath: string;
        options: Record<string, any>;
        channel?: string;
    } | null = null;
    const mockTransport = {
        sendMedia: async (
            chatId: string,
            filePath: string,
            options: Record<string, any>,
            channel?: string
        ) => {
            sentMedia = { chatId, filePath, options, channel };
        }
    };

    const context = {
        transport: mockTransport,
        chatId: '123@c.us',
        sourceChannel: 'cli'
    };

    console.log('Testing Markdown file...');
    fs.writeFileSync('test.md', '# Hello');
    await sysInteraction.execute({ filePath: 'test.md' }, context, 'send_file');
    console.log(sentMedia);
    fs.unlinkSync('test.md');

    console.log('\nTesting PDF file...');
    fs.writeFileSync('test.pdf', '%PDF-');
    await sysInteraction.execute({ filePath: 'test.pdf' }, context, 'send_file');
    console.log(sentMedia);
    fs.unlinkSync('test.pdf');
}

testSendFile().catch(console.error);
