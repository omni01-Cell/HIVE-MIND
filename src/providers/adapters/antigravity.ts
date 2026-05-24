// providers/adapters/antigravity.ts
// Adaptateur pour Google Cloud Code Assist (Antigravity) avec authentification OAuth officielle.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Buffer } from 'buffer';
import { impersonatedRequest } from '../../utils/TlsImpersonator.js';
import { ClearcutSimulator } from '../../services/telemetry/ClearcutSimulator.js';

const AUTH_FILE_PATH = '/home/omni/.antigravity/auth.json';
const CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET || '';
const DEFAULT_PROJECT_ID = process.env.ANTIGRAVITY_PROJECT_ID || 'rising-fact-p41fc';

const GEMINI_CLI_AUTH_FILE_PATH = '/home/omni/.gemini/oauth_creds.json';
const GEMINI_CLI_CLIENT_ID = process.env.GEMINI_CLI_CLIENT_ID || '';
const GEMINI_CLI_CLIENT_SECRET = process.env.GEMINI_CLI_CLIENT_SECRET || '';

interface TokenData {
    accessToken: string | null;
    refreshToken: string | null;
    projectId: string | null;
    sourceFile?: string;
}

function decodeJwt(token: string): any {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch {
        return null;
    }
}

function loadLocalTokens(): TokenData {
    const accessToken = process.env.ANTIGRAVITY_ACCESS_TOKEN || null;
    const refreshToken = process.env.ANTIGRAVITY_REFRESH_TOKEN || null;
    const projectId = process.env.ANTIGRAVITY_PROJECT_ID || null;
    return { accessToken, refreshToken, projectId };
}

function saveLocalTokens(tokens: { access_token: string; refresh_token: string; project_id: string }): void {
    if (process.env.NODE_ENV === 'test') return;
    if (!tokens || typeof tokens !== 'object') return;
    process.env.ANTIGRAVITY_ACCESS_TOKEN = tokens.access_token;
    if (tokens.refresh_token) {
        process.env.ANTIGRAVITY_REFRESH_TOKEN = tokens.refresh_token;
    }
    if (tokens.project_id) {
        process.env.ANTIGRAVITY_PROJECT_ID = tokens.project_id;
    }
}

function isTokenExpired(accessToken: string | null): boolean {
    if (!accessToken) return true;
    const payload = decodeJwt(accessToken);
    if (!payload || typeof payload.exp !== 'number') return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp - nowSec < 300;
}

async function refreshOAuthToken(refreshToken: string, useGeminiCliClient: boolean): Promise<{ access_token: string; refresh_token: string }> {
    if (!refreshToken || typeof refreshToken !== 'string') throw new Error('Invalid refresh token');
    const clientId = useGeminiCliClient ? GEMINI_CLI_CLIENT_ID : CLIENT_ID;
    const clientSecret = useGeminiCliClient ? GEMINI_CLI_CLIENT_SECRET : CLIENT_SECRET;

    const res = await impersonatedRequest('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        }).toString()
    });
    if (!res.ok) {
        throw new Error(`Google OAuth refresh failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as any;
    if (!data.access_token) throw new Error('No access token in Google OAuth response');
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken
    };
}

async function resolveGoogleProject(accessToken: string, endpoint: string): Promise<string> {
    if (!accessToken || typeof accessToken !== 'string') throw new Error('Invalid access token');
    if (!endpoint || typeof endpoint !== 'string') throw new Error('Invalid endpoint');
    try {
        const res = await impersonatedRequest(`${endpoint}/v1internal:loadCodeAssist`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Antigravity/1.18.3'
            },
            body: JSON.stringify({
                metadata: { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED' }
            })
        });
        if (!res.ok) return DEFAULT_PROJECT_ID;
        const data = (await res.json()) as any;
        return data?.cloudaicompanionProject || data?.cloudaicompanionProject?.id || DEFAULT_PROJECT_ID;
    } catch {
        return DEFAULT_PROJECT_ID;
    }
}

async function getTokens(endpoint: string): Promise<{ accessToken: string; projectId: string }> {
    if (!endpoint || typeof endpoint !== 'string') throw new Error('Invalid endpoint parameter');
    const tokens = loadLocalTokens();
    if (!tokens.refreshToken) {
        throw new Error('Antigravity refresh token missing from environment');
    }
    let accessToken = tokens.accessToken;
    let refreshToken = tokens.refreshToken;
    let projectId = tokens.projectId;

    if (isTokenExpired(accessToken)) {
        const refreshed = await refreshOAuthToken(refreshToken, false);
        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token;
        if (!projectId) {
            projectId = await resolveGoogleProject(accessToken, endpoint);
        }
        saveLocalTokens({ access_token: accessToken, refresh_token: refreshToken, project_id: projectId });
    }
    return { accessToken: accessToken!, projectId: projectId || DEFAULT_PROJECT_ID };
}

function cleanType(type: any): string | undefined {
    if (typeof type !== 'string') return undefined;
    const mapped = type.toUpperCase();
    const validTypes = ['OBJECT', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY'];
    return validTypes.includes(mapped) ? mapped : 'STRING';
}

function cleanProperties(properties: any): any {
    if (!properties || typeof properties !== 'object') return undefined;
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(properties)) {
        clean[key] = cleanSchema(val);
    }
    return clean;
}

function cleanSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return { type: 'STRING' };
    const result: any = {};
    const type = cleanType(schema.type);
    if (type) result.type = type;
    if (schema.description && typeof schema.description === 'string') {
        result.description = schema.description;
    }
    const cleanedProps = cleanProperties(schema.properties);
    if (cleanedProps) result.properties = cleanedProps;
    if (schema.items && typeof schema.items === 'object') {
        result.items = cleanSchema(schema.items);
    }
    if (Array.isArray(schema.required)) {
        result.required = schema.required.filter((r: any) => typeof r === 'string');
    }
    if (Array.isArray(schema.enum)) {
        result.enum = schema.enum.map((e: any) => String(e));
    }
    return result;
}

function mapAssistantMessage(msg: any): any {
    if (!msg || typeof msg !== 'object') throw new Error('Invalid message');
    const parts: any[] = [];
    if (msg.content) parts.push({ text: msg.content });
    if (msg.thought) parts.push({ thought: msg.thought });

    if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        msg.tool_calls.forEach((tc: any, index: number) => {
            const args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
            const functionCall: any = { name: tc.function.name, args };
            const part: any = { functionCall };
            if (index === 0) {
                part.thoughtSignature = tc.thought_signature || 'skip_thought_signature_validator';
                part.thought_signature = part.thoughtSignature;
            }
            parts.push(part);
        });
    }
    return { role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] };
}

function mapToolMessage(msg: any): any {
    if (!msg || typeof msg !== 'object') throw new Error('Invalid message');
    if (!msg.name) throw new Error('Tool message missing name');
    const responseContent = typeof msg.content === 'string'
        ? { content: msg.content }
        : msg.content;
    return {
        role: 'function',
        parts: [{
            functionResponse: {
                name: msg.name,
                response: { name: msg.name, content: responseContent }
            }
        }]
    };
}

function mapUserMessage(msg: any): any {
    if (!msg || typeof msg !== 'object') throw new Error('Invalid message');
    const parts: any[] = [];
    if (Array.isArray(msg.content)) {
        msg.content.forEach((block: any) => {
            if (block.type === 'text') parts.push({ text: block.text });
            else if (block.type === 'image_url') {
                const match = block.image_url.url.match(/^data:image\/(\w+);base64,(.+)$/);
                if (match) parts.push({ inline_data: { mime_type: `image/${match[1]}`, data: match[2] } });
            }
        });
    } else {
        parts.push({ text: msg.content || '' });
    }
    return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
}

function mapMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) throw new Error('Messages must be an array');
    if (messages.length === 0) throw new Error('Messages cannot be empty');
    return messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => {
            if (m.role === 'assistant') return mapAssistantMessage(m);
            if (m.role === 'tool') return mapToolMessage(m);
            return mapUserMessage(m);
        });
}

function formatTools(tools: any[]): any[] | undefined {
    if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;
    const functionDeclarations = tools.map((t: any) => {
        if (!t.function || typeof t.function !== 'object') throw new Error('Invalid tool structure');
        return {
            name: t.function.name,
            description: t.function.description || '',
            parameters: cleanSchema(t.function.parameters)
        };
    });
    return [{ functionDeclarations }];
}

function buildRequestPayload(contents: any[], systemInstruction?: string, tools?: any[]): any {
    if (!Array.isArray(contents)) throw new Error('Invalid contents');
    const payload: any = {
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    };
    if (systemInstruction) {
        payload.systemInstruction = { role: 'user', parts: [{ text: systemInstruction }] };
    }
    const formatted = formatTools(tools || []);
    if (formatted) payload.tools = formatted;
    return payload;
}

async function executeAntigravityRequest(endpoint: string, accessToken: string, wrappedBody: any): Promise<any> {
    if (!endpoint || !accessToken) throw new Error('Missing endpoint or access token');
    if (!wrappedBody || typeof wrappedBody !== 'object') throw new Error('Invalid body');
    const res = await impersonatedRequest(`${endpoint}/v1internal:generateContent`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Antigravity/1.18.3'
        },
        body: JSON.stringify(wrappedBody)
    });
    if (!res.ok) {
        throw new Error(`Antigravity call failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

function extractToolCalls(parts: any[]): any[] | null {
    if (!Array.isArray(parts)) return null;
    const functionCallPart = parts.find((p: any) => p.functionCall);
    if (!functionCallPart) return null;
    const thoughtSig = functionCallPart.thoughtSignature || functionCallPart.thought_signature;
    return [{
        id: `call_${Date.now()}`,
        type: 'function',
        function: {
            name: functionCallPart.functionCall.name,
            arguments: JSON.stringify(functionCallPart.functionCall.args)
        },
        thought_signature: thoughtSig
    }];
}

function parseAntigravityResponse(data: any): any {
    if (!data || typeof data !== 'object') throw new Error('Invalid response data');
    const responseRoot = data.response || data;
    const candidate = responseRoot.candidates?.[0];
    if (!candidate) throw new Error('No candidate in Antigravity response');

    const parts = candidate.content?.parts || [];
    const textContent = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n').trim();
    const thoughtContent = parts.find((p: any) => p.thought)?.thought;

    return {
        content: textContent || null,
        thought: thoughtContent || null,
        toolCalls: extractToolCalls(parts),
        finishReason: candidate.finishReason || 'stop',
        usage: responseRoot.usageMetadata
    };
}

export async function chat(messages: any[], options: any) {
    if (!Array.isArray(messages) || !options) throw new Error('Invalid arguments');
    const { model = 'gemini-3.1-pro-high', temperature = 0.7, tools } = options;
    const physicalModel = model;
    const endpoint = process.env.ANTIGRAVITY_ENDPOINT || 'https://cloudcode-pa.googleapis.com';
    const { accessToken, projectId } = await getTokens(endpoint);

    // Déclencher les événements de télémétrie Clearcut en tâche de fond de façon asynchrone
    ClearcutSimulator.trackStartSession().catch(() => {});

    const systemMsg = messages.find((m: any) => m.role === 'system');
    const payload = buildRequestPayload(mapMessages(messages), systemMsg?.content, tools);
    payload.generationConfig.temperature = temperature;

    const requestId = `agent-${Date.now()}`;
    const wrappedBody = {
        project: projectId,
        model: physicalModel,
        request: payload,
        requestType: 'chat',
        userAgent: 'antigravity',
        requestId
    };

    // Déclencher l'événement de prompt associé
    ClearcutSimulator.trackNewPrompt(requestId).catch(() => {});

    const data = await executeAntigravityRequest(endpoint, accessToken, wrappedBody);
    return parseAntigravityResponse(data);
}

export default {
    name: 'antigravity',
    chat
};
