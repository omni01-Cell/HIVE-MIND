// Test: AUDIO vs AUDIO+TEXT modalities
import { config } from 'dotenv';
config();
import WebSocket from 'ws';

const apiKey = process.env.GEMINI_KEY_1;
if (!apiKey) { console.error('No key'); process.exit(1); }

const model = 'gemini-3.1-flash-live-preview';
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

async function test(label: string, modalities: string[]): Promise<void> {
    return new Promise((resolve) => {
        const ws = new WebSocket(url);
        let done = false;

        ws.on('open', () => {
            const setup = {
                setup: {
                    model: `models/${model}`,
                    generationConfig: {
                        responseModalities: modalities,
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
                    }
                }
            };
            const p = JSON.stringify(setup);
            console.log(`[${label}] Sending (${p.length}B) modalities=${JSON.stringify(modalities)}`);
            ws.send(p);
        });

        ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.setupComplete) { console.log(`[${label}] ✅ OK`); done = true; ws.close(); resolve(); }
        });

        ws.on('close', (code: number, reason: Buffer) => {
            if (!done) { console.log(`[${label}] ❌ code=${code} ${reason?.toString()?.substring(0, 80)}`); resolve(); }
        });

        ws.on('error', (e: any) => { console.log(`[${label}] ERR ${e.message}`); resolve(); });
        setTimeout(() => { if (!done) { ws.close(); resolve(); } }, 8000);
    });
}

async function main() {
    await test('AUDIO_ONLY', ['AUDIO']);
    await test('AUDIO_TEXT', ['AUDIO', 'TEXT']);
    await test('TEXT_ONLY', ['TEXT']);
    
    // Try with tools + AUDIO only
    await test('AUDIO+TOOL', ['AUDIO']);
    // wait then test with system instruction
    const ws2 = new WebSocket(url);
    await new Promise<void>((resolve) => {
        let done2 = false;
        ws2.on('open', () => {
            ws2.send(JSON.stringify({
                setup: {
                    model: `models/${model}`,
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
                    },
                    systemInstruction: {
                        parts: [{ text: 'You are a helpful assistant. Reply concisely in the same language the user speaks.' }]
                    },
                    tools: [{
                        functionDeclarations: [{
                            name: 'search_web',
                            description: 'Search the web for information.',
                            parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
                        }]
                    }]
                }
            }));
        });
        ws2.on('message', (d: any) => {
            const m = JSON.parse(d.toString());
            if (m.setupComplete) { console.log('[AUDIO+PROMPT+TOOL] ✅ OK'); done2 = true; ws2.close(); resolve(); }
        });
        ws2.on('close', (c: number, r: Buffer) => {
            if (!done2) { console.log(`[AUDIO+PROMPT+TOOL] ❌ code=${c} ${r?.toString()?.substring(0, 80)}`); resolve(); }
        });
        setTimeout(() => { if (!done2) { ws2.close(); resolve(); } }, 8000);
    });

    process.exit(0);
}

main();
