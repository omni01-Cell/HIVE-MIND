import WebSocket from 'ws';
const API_KEY = process.env.GEMINI_API_KEY || ''; // Needs actual key, but let's see if we get an auth error or something else.
if (!API_KEY) { console.log("NO API KEY"); process.exit(0); }
const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`);

ws.on('open', () => {
    ws.send(JSON.stringify({
        setup: { model: `models/gemini-3.1-flash-live-preview`, generationConfig: { responseModalities: ["AUDIO"] } }
    }));
});
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log("MSG KEYS:", Object.keys(msg));
    if (msg.setupComplete) {
        ws.send(JSON.stringify({
            clientContent: { turns: [{ parts: [{ text: "Hello, say hi!" }], role: "user" }], turnComplete: true }
        }));
    }
    if (msg.serverContent) {
        console.log("SERVER CONTENT:", JSON.stringify(msg.serverContent));
    }
});
ws.on('error', console.error);
ws.on('close', (c, r) => console.log("CLOSE", c, r.toString()));
setTimeout(() => ws.close(), 10000);
