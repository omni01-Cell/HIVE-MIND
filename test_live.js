import WebSocket from 'ws';
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.1-flash-live-preview";
const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`);

ws.on('open', () => {
    ws.send(JSON.stringify({
        setup: { model: `models/${MODEL}` }
    }));
});
ws.on('message', (data) => {
    console.log("MSG:", data.toString());
});
ws.on('error', console.error);
ws.on('close', (c, r) => console.log("CLOSE", c, r.toString()));
setTimeout(() => ws.close(), 5000);
