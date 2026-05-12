// Quick test: try multiple Live models to find which one works
import { config } from 'dotenv';
config();
import WebSocket from 'ws';

const apiKey = process.env.GEMINI_KEY_1;
if (!apiKey) { console.error('No GEMINI_KEY_1'); process.exit(1); }

const MODELS = [
    'gemini-3.1-flash-live-preview',
    'gemini-2.5-flash-exp-native-audio-thinking-dialog',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-live-001',
    'gemini-2.5-flash-preview-native-audio-dialog',
];

async function testModel(model: string): Promise<void> {
    return new Promise((resolve) => {
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
        const ws = new WebSocket(url);
        let done = false;

        ws.on('open', () => {
            const setup = {
                setup: {
                    model: `models/${model}`,
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
                    }
                }
            };
            ws.send(JSON.stringify(setup));
        });

        ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.setupComplete) {
                console.log(`✅ ${model} — WORKS`);
                done = true;
                ws.close();
                resolve();
            }
        });

        ws.on('close', (code: number, reason: Buffer) => {
            if (!done) {
                console.log(`❌ ${model} — code=${code} reason=${reason?.toString()?.substring(0, 60)}`);
                resolve();
            }
        });

        ws.on('error', (err: any) => {
            console.log(`❌ ${model} — ERROR: ${err.message}`);
            resolve();
        });

        setTimeout(() => { if (!done) { console.log(`⏱️ ${model} — TIMEOUT`); ws.close(); resolve(); } }, 8000);
    });
}

async function main() {
    console.log(`Testing ${MODELS.length} Live models...\n`);
    for (const m of MODELS) {
        await testModel(m);
    }
    process.exit(0);
}

main();
