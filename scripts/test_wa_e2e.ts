import 'dotenv/config';

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    proto
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import { Command } from 'commander';

// --- CONFIGURATION ---
const program = new Command();
program
  .option('-a, --account <type>', 'Account type (admin or user)', 'user')
  .option('-t, --target <jid>', 'Target bot JID (e.g. 123456789@s.whatsapp.net)')
  .option('--no-logs', 'Disable Railway logs streaming')
  .parse(process.argv);

const options = program.opts();

// Default target detection from local session
let defaultTarget = '2250704414707@s.whatsapp.net';
try {
    const creds = JSON.parse(fs.readFileSync('./session/creds.json', 'utf-8'));
    if (creds?.me?.id) {
        defaultTarget = creds.me.id.split(':')[0] + '@s.whatsapp.net';
    }
} catch (e) {}

const targetJID = options.target || defaultTarget;
const SESSION_BASE_PATH = './session_test_';
const accountType = options.account;
const sessionPath = path.join(process.cwd(), `${SESSION_BASE_PATH}${accountType}`);

if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
}

// --- LOG FILTERING ---
const filterTerms = [
    'SessionEntry',
    'Decrypted message',
    'Closing open session',
    'Closing session',
    'registrationId',
    '<Buffer',
    'printQRInTerminal'
];

function shouldFilter(message: string) {
    if (message.includes('[TEST-RUNNER]') || message.includes('[RAILWAY]')) return false;
    return filterTerms.some(term => message.includes(term));
}

// --- RAILWAY LOGS MANAGER ---
let railwayProcess: ChildProcess | null = null;

function startRailwayLogs() {
    if (options.noLogs) return;
    console.log(`\n[TEST-RUNNER] 🛰️ Spawning Railway logs stream...`);
    // 'railway logs' streams by default
    railwayProcess = spawn('railway', ['logs'], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    railwayProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                console.log(`\x1b[2m[RAILWAY]\x1b[0m ${line}`);
            }
        }
    });

    railwayProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                console.log(`\x1b[31m[RAILWAY-ERROR]\x1b[0m ${line}`);
            }
        }
    });

    railwayProcess.on('error', (err) => {
        console.log(`\x1b[31m[TEST-RUNNER] ❌ Failed to start Railway process:\x1b[0m ${err.message}`);
    });
}

function stopRailwayLogs() {
    if (railwayProcess) {
        console.log('[TEST-RUNNER] 🛑 Stopping Railway logs stream...');
        railwayProcess.kill();
        railwayProcess = null;
    }
}

// --- WHATSAPP CLIENT ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'debug' }) as any,
        browser: ['HIVE-MIND E2E Tester', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    return new Promise<any>((resolve, reject) => {
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log(`\n[TEST-RUNNER] 📷 QR Code generated for account: \x1b[1m${accountType}\x1b[0m`);
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    connectToWhatsApp().then(resolve).catch(reject);
                } else {
                    reject(new Error('Logged out'));
                }
            } else if (connection === 'open') {
                console.log(`[TEST-RUNNER] ✅ Connected successfully as \x1b[32m${accountType}\x1b[0m (${sock.user?.id})`);
                resolve(sock);
            }
        });
    });
}

// --- PROGRAMMATIC TEST UTILS ---

async function sendAndWaitForResponse(sock: any, jid: string, content: any, expectedMatch: (msg: proto.IWebMessageInfo) => boolean, timeoutMs: number = 30000): Promise<boolean> {
    console.log(`[TEST-RUNNER] 📤 Sending: ${typeof content === 'string' ? content : JSON.stringify(content)}`);
    
    if (typeof content === 'string') {
        await sock.sendMessage(jid, { text: content });
    } else {
        await sock.sendMessage(jid, content);
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            sock.ev.off('messages.upsert', messageListener);
            resolve(false);
        }, timeoutMs);

        const messageListener = (upsert: { messages: proto.IWebMessageInfo[] }) => {
            for (const msg of upsert.messages) {
                if (msg.key.remoteJid === jid && !msg.key.fromMe) {
                    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                    if (!shouldFilter(text)) {
                        console.log(`\n[TEST-RUNNER] 📥 Received:\n---\n${text}\n---`);
                    }
                    
                    if (expectedMatch(msg)) {
                        clearTimeout(timeout);
                        sock.ev.off('messages.upsert', messageListener);
                        resolve(true);
                    }
                }
            }
        };
        sock.ev.on('messages.upsert', messageListener);
    });
}

// --- MAIN TEST RUN ---

async function run() {
    let sock: any;
    try {
        sock = await connectToWhatsApp();
    } catch (err) {
        console.error('Failed to connect:', err);
        process.exit(1);
    }

    startRailwayLogs();

    try {
        // Test: Tâche agentique complexe pour saturer le Smart Router (RPM)
        // Implique: web browsing, script dev (python), file generation, et >5 itérations
        console.log('[TEST-RUNNER] 📤 Sending intense agentic task to stress test Smart Router...');
        
        const intensePrompt = `Va sur le site Hacker News (news.ycombinator.com), lis le titre des 3 premiers articles. Ensuite, utilise tes outils développeur pour créer un script Python qui génère un rapport au format PDF résumant ces 3 articles. Exécute ce script et envoie-moi le PDF final en pièce jointe. Fais-le étape par étape.`;

        await sendAndWaitForResponse(
            sock, targetJID,
            intensePrompt,
            (msg) => {
                const hasDocument = !!msg.message?.documentMessage;
                const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                
                if (hasDocument) {
                    console.log(`\n[TEST-RUNNER] 🎯 Bot sent a document: ${msg.message?.documentMessage?.fileName}`);
                } else if (text) {
                    console.log(`\n[TEST-RUNNER] 🤖 Bot thinking/replying: ${text}`);
                }
                
                // Stop when we receive the PDF document
                return hasDocument && msg.message?.documentMessage?.mimetype?.includes('pdf') === true;
            },
            420000 // 7 minutes timeout (agentic loops can be very long)
        );

    } catch (error) {
        console.error('Test Execution Error:', error);
    } finally {
        await delay(3000);
        stopRailwayLogs();
        console.log('\n[TEST-RUNNER] Finished.');
        process.exit(0);
    }
}

process.on('SIGINT', () => {
    stopRailwayLogs();
    process.exit(0);
});

run();
