// Diagnostic: test Gemini Live setup with minimal payload then add tools one by one
import { config } from 'dotenv';
config();
import WebSocket from 'ws';
import { envResolver } from '../services/envResolver.js';

const apiKey = envResolver.resolveProviderKey('gemini') || process.env.GEMINI_KEY || process.env.GEMINI_KEY_1;
if (!apiKey) { console.error('No GEMINI key'); process.exit(1); }

const model = 'gemini-3.1-flash-live-preview';
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

async function testSetup(label: string, setupMsg: any): Promise<boolean> {
    return new Promise((resolve) => {
        const ws = new WebSocket(url);
        let done = false;

        ws.on('open', () => {
            const payload = JSON.stringify(setupMsg);
            console.log(`\n[${label}] Sending setup (${payload.length} bytes)...`);
            ws.send(payload);
        });

        ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.setupComplete) {
                console.log(`[${label}] ✅ setupComplete received`);
                done = true;
                ws.close();
                resolve(true);
            } else {
                console.log(`[${label}] 📨 Keys:`, Object.keys(msg).join(', '));
            }
        });

        ws.on('close', (code: number, reason: Buffer) => {
            if (!done) {
                console.log(`[${label}] ❌ CLOSED code=${code} reason=${reason?.toString()}`);
                resolve(false);
            }
        });

        ws.on('error', (err: any) => {
            console.log(`[${label}] ❌ ERROR: ${err.message}`);
            resolve(false);
        });

        setTimeout(() => { if (!done) { ws.close(); resolve(false); } }, 10000);
    });
}

async function main() {
    // Test 1: Bare minimum — no tools, no system prompt
    const ok1 = await testSetup('BARE', {
        setup: {
            model: `models/${model}`,
            generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            }
        }
    });

    // Test 2: With system prompt only (short)
    const ok2 = await testSetup('PROMPT', {
        setup: {
            model: `models/${model}`,
            generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            },
            systemInstruction: {
                parts: [{ text: 'You are a helpful voice assistant. Reply concisely.' }]
            }
        }
    });

    // Test 3: With 1 simple tool
    const ok3 = await testSetup('1-TOOL', {
        setup: {
            model: `models/${model}`,
            generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            },
            tools: [{
                functionDeclarations: [{
                    name: 'send_message',
                    description: 'Send a text message',
                    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
                }]
            }]
        }
    });

    // Test 4: Load actual tools from pluginLoader and test each one individually
    console.log('\n--- Loading actual plugin tools ---');
    const { pluginLoader } = await import('../plugins/loader.js');
    await pluginLoader.loadAll();
    const allTools = (pluginLoader as any).toolDefinitions || [];
    
    const TARGET_TOOLS = ['send_message', 'get_my_capabilities', 'google_ai_search', 'start_deep_search', 'search_wikipedia'];
    
    for (const toolName of TARGET_TOOLS) {
        const toolDef = allTools.find((t: any) => t?.function?.name === toolName);
        if (!toolDef) { console.log(`[${toolName}] NOT FOUND in toolDefinitions`); continue; }
        
        // Sanitize like _sendSetup does
        const sanitized = {
            name: toolDef.function.name,
            description: (toolDef.function.description || '').substring(0, 300),
            parameters: sanitizeParams(toolDef.function.parameters)
        };
        
        console.log(`\n[${toolName}] Sanitized tool size: ${JSON.stringify(sanitized).length} bytes`);
        console.log(`[${toolName}] Parameters:`, JSON.stringify(sanitized.parameters, null, 2).substring(0, 300));
        
        const ok = await testSetup(`TOOL-${toolName}`, {
            setup: {
                model: `models/${model}`,
                generationConfig: {
                    responseModalities: ['AUDIO', 'TEXT'],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
                },
                tools: [{ functionDeclarations: [sanitized] }]
            }
        });
    }

    // Test 5: All 5 tools together
    const allSanitized = TARGET_TOOLS.map(name => {
        const toolDef = allTools.find((t: any) => t?.function?.name === name);
        if (!toolDef) return null;
        return {
            name: toolDef.function.name,
            description: (toolDef.function.description || '').substring(0, 300),
            parameters: sanitizeParams(toolDef.function.parameters)
        };
    }).filter(Boolean);

    await testSetup('ALL-5', {
        setup: {
            model: `models/${model}`,
            generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            },
            systemInstruction: {
                parts: [{ text: 'You are a helpful voice assistant. Reply concisely.' }]
            },
            tools: [{ functionDeclarations: allSanitized }]
        }
    });

    console.log('\n--- Done ---');
    process.exit(0);
}

function sanitizeParams(params: any): any {
    if (!params || typeof params !== 'object') return params;
    const cleaned: any = {};
    for (const [key, value] of Object.entries(params)) {
        if (key === 'additionalProperties') continue;
        if (key === 'properties' && typeof value === 'object' && value !== null) {
            const cp: any = {};
            for (const [pn, pv] of Object.entries(value as Record<string, any>)) {
                cp[pn] = sanitizeParams(pv);
            }
            cleaned[key] = cp;
        } else if (key === 'items' && typeof value === 'object') {
            cleaned[key] = sanitizeParams(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

main().catch(e => { console.error(e); process.exit(1); });
