/* eslint-disable */
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { type TransientMessageType } from '../../utils/events.js';
import type { DOMElement } from 'ink';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import type { TerminalBackgroundColor } from '../utils/terminalCapabilityManager.js';
import type { BackgroundTask } from '../hooks/useExecutionLifecycle.js';

export enum AuthType {
    NONE = 'none',
    API_KEY = 'api_key',
    OAUTH = 'oauth',
    USE_VERTEX_AI = 'vertex_ai',
}

export enum AuthState {
    Authenticated = 'authenticated',
    Unauthenticated = 'unauthenticated',
    Updating = 'updating',
    AwaitingLoginRestart = 'awaiting_login_restart',
    AwaitingApiKeyInput = 'awaiting_api_key_input',
}

export const Kind = {
    Text: 'text',
    Image: 'image',
    Video: 'video',
    File: 'file',
    ToolCall: 'tool_call',
    ToolResult: 'tool_result',
    Error: 'error',
    Agent: 'agent',
    Other: 'other'
} as const;
export type Kind = typeof Kind[keyof typeof Kind];

// ─────────────────────────────────────────────────────────────────────────────
// Types fondamentaux du chat / commandes slash
// ─────────────────────────────────────────────────────────────────────────────

export enum MessageType {
    TEXT = 'text',
    ERROR = 'error',
    SYSTEM = 'system',
    INFO = 'info',
    WARNING = 'warning',
    COMPRESSION = 'compression',
    ABOUT = 'about',
    HINT = 'hint',
    USER = 'user',
    ASSISTANT = 'assistant',
    HELP = 'help',
    STATS = 'stats',
    MODEL = 'model',
    QUIT = 'quit',
    MODEL_STATS = 'model_stats',
    TOOL_STATS = 'tool_stats',
}

export enum CommandKind {
    BUILT_IN = 'built-in',
    BUILTIN = 'builtin',
    USER_FILE = 'user-file',
    WORKSPACE_FILE = 'workspace-file',
    MCP_PROMPT = 'mcp-prompt',
    AGENT = 'agent',
    SKILL = 'skill',
    EXTENSION_FILE = 'extension-file',
    FILE = 'file',
    MCP = 'mcp',
}

export interface CommandContext {
    text: string;
    args?: string[];
    cwd?: string;
    invocation?: {
        raw: string;
        name: string;
        args: string;
    };
    services?: {
        agentContext: any;
        settings: any;
        git: any;
        logger: Logger;
    };
    ui?: {
        addItem: (item: HistoryItemWithoutId, timestamp?: number) => void;
        clear: () => void;
        setDebugMessage: (message: string) => void;
        pendingItem: HistoryItemWithoutId | null;
        setPendingItem: (item: HistoryItemWithoutId | null) => void;
        loadHistory: (history: HistoryItem[], postLoadInput?: string) => void;
        toggleCorgiMode: () => void;
        toggleVoiceMode: () => void;
        toggleDebugProfiler: () => void;
        toggleVimEnabled: () => Promise<boolean>;
        reloadCommands: () => void;
        openAgentConfigDialog: (name: string, displayName: string, definition: AgentDefinition) => void;
        setConfirmationRequest: (value: ConfirmationRequest | null) => void;
        removeComponent: () => void;
        toggleBackgroundTasks: () => void;
        toggleShortcutsHelp: () => void;
    };
    session?: {
        stats: SessionStatsState;
        sessionShellAllowlist: Set<string>;
    };
    overwriteConfirmed?: boolean;
}

export interface SlashCommand {
    name: string;
    altNames?: string[];
    description: string;
    hidden?: boolean;
    suggestionGroup?: string;
    kind?: CommandKind;
    autoExecute?: boolean;
    isSafeConcurrent?: boolean;
    mcpServerName?: string;
    extensionName?: string;
    extensionId?: string;
    action?: (context: CommandContext, args: string) => void | SlashCommandActionReturn | Promise<void | SlashCommandActionReturn>;
    completion?: (context: CommandContext, partialArg: string) => Promise<string[]> | string[];
    showCompletionLoading?: boolean;
    takesArgs?: boolean;
    subCommands?: SlashCommand[];
    execute?: (context: CommandContext) => Promise<unknown> | unknown;
}

export interface ICommandLoader {
    loadCommands(signal?: AbortSignal): Promise<SlashCommand[]>;
}

export interface CommandConflict {
    name: string;
    losers: Array<{
        command: SlashCommand;
        renamedTo: string;
        reason: SlashCommand;
    }>;
}

/** Ré-exports depuis commands/types.ts — types réels. */
export type { SlashCommandActionReturn, OpenDialogActionReturn, OpenCustomDialogActionReturn } from '../commands/types.js';

export enum MessageSenderType {
    USER = 'user',
    AGENT = 'agent',
    SYSTEM = 'system'
}

export interface ToolCallRequestInfo {
    name: string;
    args: Record<string, unknown>;
    callId: string;
    isClientInitiated: boolean;
    prompt_id: string;
}

export class Logger {
    private sessionId: string;
    private storage: Storage;

    constructor(sessionId: string, storage: Storage) {
        this.sessionId = sessionId;
        this.storage = storage;
    }

    async initialize(): Promise<void> {
        return Promise.resolve();
    }

    log(...args: unknown[]): void {
        console.log(...args);
    }

    error(...args: unknown[]): void {
        console.error(...args);
    }

    warn(...args: unknown[]): void {
        console.warn(...args);
    }

    logMessage(sender: MessageSenderType, message: string): void {
        console.log(`[${sender}] ${message}`);
    }

    async getPreviousUserMessages(): Promise<string[]> {
        return [];
    }
}

export type AgentEventType =
    | 'agent_start'
    | 'agent_end'
    | 'message'
    | 'tool_request'
    | 'tool_update'
    | 'tool_response'
    | 'error'
    | 'initialize'
    | 'session_update'
    | 'elicitation_request'
    | 'elicitation_response'
    | 'usage'
    | 'custom';

export interface ToolCallDisplay {
    format?: string;
    result?: unknown;
    title?: string;
    language?: string;
    filePath?: string;
    fileDiff?: string;
    [key: string]: unknown;
}

export interface AgentEventMeta {
    legacyState?: {
        displayName?: string;
        description?: string;
        isOutputMarkdown?: boolean;
        kind?: Kind;
        status?: string;
        progressMessage?: string;
        progress?: number;
        progressTotal?: number;
        pid?: number | string;
        outputFile?: string;
    };
    code?: string;
    [key: string]: unknown;
}

export interface AgentEvent {
    type: AgentEventType;
    role?: 'agent' | 'user';
    content?: Array<{ type: 'text'; text: string } | { type: 'thought'; thought: string }>;
    name?: string;
    requestId?: string;
    isError?: boolean;
    display?: ToolCallDisplay;
    message?: string;
    _meta?: AgentEventMeta;
    confirmationDetails?: ToolCallConfirmationDetails;
}

export interface AgentContentPart {
    type: 'text';
    text: string;
}

export interface AgentSendRequest {
    message: { content: AgentContentPart[] };
}

export interface AgentProtocol {
    send(request: AgentSendRequest): Promise<{ streamId: string }>;
    subscribe(listener: (event: AgentEvent) => void): () => void;
    abort(): Promise<void>;
}

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export class Storage {
    private targetDir: string;
    private data: Map<string, unknown> = new Map();

    constructor(targetDir: string = process.cwd()) {
        this.targetDir = path.resolve(targetDir);
    }

    async initialize(): Promise<void> {
        const tempDir = this.getProjectTempDir();
        const logsDir = this.getProjectTempLogsDir();
        const plansDir = this.getPlansDir();
        await fs.mkdir(tempDir, { recursive: true }).catch(() => {});
        await fs.mkdir(logsDir, { recursive: true }).catch(() => {});
        await fs.mkdir(plansDir, { recursive: true }).catch(() => {});
        await fs.mkdir(path.join(tempDir, 'chats'), { recursive: true }).catch(() => {});
    }

    getProjectTempDir(): string {
        const hash = createHash('sha256').update(this.targetDir).digest('hex').substring(0, 12);
        return path.join(homedir(), '.hive-mind', 'temp', hash);
    }

    getProjectTempLogsDir(): string {
        return path.join(this.getProjectTempDir(), 'logs');
    }

    getHistoryFilePath(): string {
        return path.join(this.getProjectTempDir(), 'history.json');
    }

    getPlansDir(): string {
        return path.join(this.getProjectTempDir(), 'plans');
    }

    isWorkspaceHomeDir(): boolean {
        return this.targetDir === homedir();
    }

    static getUserKeybindingsPath(): string {
        return path.join(homedir(), '.hive-mind', 'keybindings.json');
    }

    get(key: string): unknown {
        return this.data.get(key) ?? null;
    }

    set(key: string, value: unknown): void {
        this.data.set(key, value);
    }

    delete(key: string): void {
        this.data.delete(key);
    }
}

export function geminiPartsToContentParts(parts: Part[]): AgentContentPart[] {
    return parts
        .filter((part): part is Part & { text: string } => part.text != null && part.text !== '')
        .map((part) => ({ type: 'text', text: part.text }));
}

export interface EditorType {
    id: string;
    command?: string;
}

export const EDITOR_DISPLAY_NAMES: Record<string, string> = {};

export function allowEditorTypeInSandbox(_editor: EditorType, _sandboxDir: string): boolean {
    return true;
}

export function hasValidEditorCommand(_editor: EditorType): boolean {
    return false;
}

export const ALL_EDITORS: EditorType[] = [];

export interface ShellType {
    id: string;
    name: string;
}

export const isWindows = process.platform === 'win32';

export function isNodeError(_error: unknown): _error is Error & { code: string } {
    return _error instanceof Error && 'code' in _error;
}

export const SESSION_FILE_PREFIX = 'hive_session_';
export const TOOL_OUTPUTS_DIR = 'tool_outputs';

export function writeToStdout(text: string): void {
    process.stdout.write(text);
}

export function writeToStderr(text: string): void {
    process.stderr.write(text);
}

export function deleteStoredSession(_configOrSessionId: any, _sessionId?: string): Promise<void> {
    return Promise.resolve();
}

export function generateSummary(_itemsOrConfig: any): any {
    return '';
}

export function sanitizeFilenamePart(_part: string): string {
    return _part.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function deleteSessionArtifactsAsync(_sessionId: string, ..._args: any[]): Promise<void> {
    return Promise.resolve();
}

export function deleteSubagentSessionDirAndArtifactsAsync(_sessionId: string, ..._args: any[]): Promise<void> {
    return Promise.resolve();
}

export const startMemoryService = (..._args: any[]): Promise<any> => {
    return Promise.resolve({});
};

export interface ConsoleLogPayload {
    message: string;
    level: 'log' | 'info' | 'warn' | 'error';
}

export const ExperimentFlags = {
    CONTEXT_COMPRESSION_THRESHOLD: 'context_compression_threshold'
} as const;
export type ExperimentFlags = Record<string, boolean>;

export interface ToolConfirmationPayload {
    outcome: ToolConfirmationOutcome;
    feedback?: string;
}

// ─── Union discriminée des types de confirmation d'outil ────────────────────
// Chaque variante porte un discriminant `type` strict pour permettre le narrowing.

interface ConfirmationEditDetails {
    type: 'edit';
    id: string;
    toolName: string;
    isModifying: boolean;
    fileDiff: string;
    fileName: string;
    systemMessage?: string;
}

interface ConfirmationSandboxDetails {
    type: 'sandbox_expansion';
    id: string;
    toolName: string;
    command: string;
    additionalPermissions?: {
        fileSystem?: { read?: string[]; write?: string[] };
        network?: boolean;
    };
    systemMessage?: string;
}

interface ConfirmationExecDetails {
    type: 'exec';
    id: string;
    toolName: string;
    command: string;
    commands?: string[];
    systemMessage?: string;
}

interface ConfirmationInfoDetails {
    type: 'info';
    id: string;
    toolName: string;
    prompt: string;
    urls?: string[];
    systemMessage?: string;
}

interface ConfirmationMcpDetails {
    type: 'mcp';
    id: string;
    toolName: string;
    serverName: string;
    toolArgs?: unknown;
    toolDescription?: string;
    toolParameterSchema?: unknown;
    systemMessage?: string;
}

interface ConfirmationAskUserDetails {
    type: 'ask_user';
    id: string;
    toolName: string;
    questions: Array<{ id: string; question: string; choices?: string[] }>;
    systemMessage?: string;
}

interface ConfirmationExitPlanModeDetails {
    type: 'exit_plan_mode';
    id: string;
    toolName: string;
    planPath: string;
    systemMessage?: string;
}

export type SerializableConfirmationDetails =
    | ConfirmationEditDetails
    | ConfirmationSandboxDetails
    | ConfirmationExecDetails
    | ConfirmationInfoDetails
    | ConfirmationMcpDetails
    | ConfirmationAskUserDetails
    | ConfirmationExitPlanModeDetails;

/** Alias pour la compatibilité avec les fonctions qui utilisent le nom "ToolConfirmationDetails". */
export type ToolConfirmationDetails = SerializableConfirmationDetails;


export enum MessageBusType {
    TOOL_CONFIRMATION_RESPONSE = 'tool_confirmation_response',
    TOOL_CALLS_UPDATE = 'tool_calls_update',
    SUBAGENT_ACTIVITY = 'subagent_activity'
}

export class IdeClient {
    id = 'tui-ide';
    name = 'HIVE-MIND IDE Companion';
    private ws: WebSocket | null = null;
    private isConnected = false;
    private statusListeners = new Set<() => void>();
    private static instance: IdeClient | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    static async getInstance(): Promise<IdeClient> {
        if (!IdeClient.instance) {
            IdeClient.instance = new IdeClient();
            await IdeClient.instance.initialize();
        }
        return IdeClient.instance;
    }

    private constructor() {}

    private async initialize(): Promise<void> {
        const portStr = process.env.HIVE_MIND_IDE_SERVER_PORT || process.env.GEMINI_CLI_IDE_SERVER_PORT;
        if (!portStr) {
            return;
        }

        const port = parseInt(portStr, 10);
        if (isNaN(port)) {
            return;
        }

        this.connect(port);
    }

    private connect(port: number) {
        try {
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            this.ws = new WebSocket(`ws://127.0.0.1:${port}`);

            this.ws.on('open', () => {
                this.isConnected = true;
                this.notifyListeners();
            });

            this.ws.on('close', () => {
                this.isConnected = false;
                this.notifyListeners();
                this.reconnectTimeout = setTimeout(() => this.connect(port), 3000);
            });

            this.ws.on('error', () => {
                this.isConnected = false;
                this.notifyListeners();
            });

        } catch (e) {
            this.isConnected = false;
            this.notifyListeners();
        }
    }

    isInitialized(): boolean {
        return true;
    }

    getEditorContext(): Record<string, unknown> {
        return {};
    }

    getCurrentIde(): IdeInfo | null {
        return this.isConnected ? { name: 'VS Code / Cursor', version: '1.0.0', editor: 'vscode' } : null;
    }

    getDetectedIdeDisplayName(): string {
        return this.isConnected ? 'VS Code / Cursor (Connected)' : 'None';
    }

    isDiffingEnabled(): boolean {
        return this.isConnected;
    }

    addStatusChangeListener(listener: () => void): void {
        this.statusListeners.add(listener);
    }

    removeStatusChangeListener(listener: () => void): void {
        this.statusListeners.delete(listener);
    }

    private notifyListeners() {
        for (const listener of this.statusListeners) {
            try {
                listener();
            } catch (e) {
                // Ignore
            }
        }
    }

    async resolveDiffFromCli(filePath: string, outcome: string): Promise<void> {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const message = {
            action: 'resolve_diff',
            data: {
                filePath,
                outcome
            }
        };

        this.ws.send(JSON.stringify(message));
    }
}

export class UserAccountManager {
    id = 'local-user';

    async getUser(): Promise<{ id: string; name: string }> {
        return { id: this.id, name: 'Local User' };
    }

    getCachedGoogleAccount(): { email: string; displayName: string } | null {
        return null;
    }
}

export interface StartupWarning {
    message: string;
    severity: 'info' | 'warning' | 'error';
}

export interface UserFeedbackPayload {
    itemId?: string;
    feedback?: 'thumbs_up' | 'thumbs_down';
    severity?: 'error' | 'warning' | 'info';
    message?: string;
    error?: Error | unknown;
}

export interface QuotaStats {
    used?: number;
    limit?: number;
    remaining?: number;
    resetTime?: string;
}

export type UserTierId = 'free' | 'pro' | 'enterprise';

export interface GeminiUserTier {
    id: UserTierId;
    name: string;
}

export interface ToolCallStats {
    count: number;
    success: number;
    fail: number;
    durationMs: number;
    decisions: Partial<Record<string, number>>;
    totalCalls: number;
    totalSuccess: number;
    totalFail: number;
    totalDurationMs: number;
}

export interface ModelMetrics {
    api: {
        totalRequests: number;
        totalErrors: number;
        totalLatencyMs: number;
    };
    tokens: {
        input: number;
        prompt: number;
        candidates: number;
        total: number;
        cached: number;
        thoughts: number;
        tool: number;
    };
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

export interface RoleMetrics {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string;
    tokens?: {
        input: number;
        output: number;
        prompt?: number;
    };
}

export interface SessionMetrics {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    models: RoleMetrics[];
    toolCalls: ToolCallStats;
    duration: number;
    api: ModelMetrics['api'];
    tokens: ModelMetrics['tokens'];
}

export interface SessionInfo {
    id: string;
    title: string;
    timestamp: number;
    model: string;
    messageCount: number;
    metrics?: SessionMetrics;
}

export enum LlmRole {
    MAIN = 'main',
    UTILITY_AUTOCOMPLETE = 'utility_autocomplete'
}

export function getDisplayString(_value: unknown): string {
    return String(_value ?? '');
}

export function isAutoModel(_model: string): boolean {
    return false;
}

export function escapePath(_path: string): string {
    return _path;
}

export function unescapePath(_path: string): string {
    return _path;
}

export function supportsTrueColor(): boolean {
    return process.env.COLORTERM === 'truecolor' || process.env.TERM === 'xterm-256color';
}

export function useTheme(): { activeTheme: { border: { default: string }; status: { warning: string }; text: { primary: string; secondary: string; link: string } } } {
    return {
        activeTheme: {
            border: { default: 'gray' },
            status: { warning: 'yellow' },
            text: { primary: 'white', secondary: 'gray', link: 'blue' }
        }
    };
}

export function assumeExhaustive(_value: never): never {
    throw new Error(`Unhandled exhaustive value: ${String(_value)}`);
}

export interface CompletionResult {
    success: boolean;
    output?: string;
}

/** Union de parties pour une requête multi-modale. Utilisé comme tableau modifiable dans les processeurs de commandes. */
export type PartListUnion = PartUnion[];

export interface SubagentActivityItem {
    id: string;
    status: string;
}

export enum SubagentState {
    RUNNING = 'running',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    ERROR = 'error'
}

export interface SubagentStateContainer {
    items: SubagentActivityItem[];
}

export interface SubagentActivityMessage {
    items: SubagentActivityItem[];
}

export interface ToolCallsUpdateMessage {
    calls: IndividualToolCallDisplay[];
}

export interface ToolDisplayItem {
    name: string;
    description: string;
}

export interface ToolVisibilityContext {
    name: string;
    displayName: string;
    status: any;
    hasResult: boolean;
    approvalMode: any;
    isClientInitiated: boolean;
    parentCallId?: string;
    expanded?: Set<string>;
}

export interface HistoryItemToolGroup extends HistoryItem {
    type: 'tool_group';
    tools: IndividualToolCallDisplay[];
}

export interface Content {
    role?: string;
    parts?: Part[];
}

export interface WorkspaceContext {
    cwd: string;
    addDirectories?: (dirs: string[]) => void;
}

export const tokenLimit = (_model?: string): number => 128000;

export function spawnAsync(_command: string, _args: string[]): Promise<{ stdout: string; stderr: string }> {
    return Promise.resolve({ stdout: '', stderr: '' });
}

export function belongsInConfirmationQueue(item: any): boolean {
    if (!item) return false;
    if (item.status === 'awaiting_approval' || item.status === CoreToolCallStatus.AwaitingApproval) {
        return true;
    }
    if (item.tools && item.tools.some((t: any) => t.status === 'awaiting_approval' || t.status === CoreToolCallStatus.AwaitingApproval)) {
        return true;
    }
    return false;
}

export function hasRedirection(_text: string): boolean {
    return _text.includes('>') || _text.includes('|');
}

export interface CompletedToolCall {
    id: string;
    name: string;
    result: unknown;
}

export class AudioRecorder extends EventEmitter {
    async start(): Promise<void> {
        return Promise.resolve();
    }
    stop(): void {}
}

export function validatePlanContent(_content: string): boolean {
    return true;
}

export function enableMouseEvents(): void {}
export function disableMouseEvents(): void {}

export function enableKittyKeyboardProtocol(): void {}
export function disableKittyKeyboardProtocol(): void {}
export function enableModifyOtherKeys(): void {}
export function disableModifyOtherKeys(): void {}
export function enableBracketedPasteMode(): void {}
export function disableBracketedPasteMode(): void {}

export function isFileDiff(_item: HistoryItem): boolean {
    return false;
}

export class TranscriptionProvider extends EventEmitter {
    id = 'default-transcription';
    async connect(): Promise<void> {
        return Promise.resolve();
    }
    disconnect(): void {}
    sendAudioChunk(_chunk: any): void {}
}

export class TranscriptionFactory {
    static createProvider(_voiceSettings: unknown, _apiKey?: string): TranscriptionProvider {
        return new TranscriptionProvider();
    }
}

export interface ChatDetail {
    id: string;
    title: string;
}

export interface SkillDefinition {
    name: string;
    description: string;
}

export interface AgentDefinitionJson {
    name: string;
    displayName: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
}

export interface McpClient {
    id: string;
}

export function getMCPServerStatus(_config: MCPServerConfig): MCPServerStatus {
    return MCPServerStatus.DISCONNECTED;
}

export const WRITE_FILE_DISPLAY_NAME = 'write_file';
export const WEB_SEARCH_DISPLAY_NAME = 'web_search';
export const WEB_FETCH_DISPLAY_NAME = 'web_fetch';
export const UPDATE_TOPIC_DISPLAY_NAME = 'update_topic';
export const TOPIC_PARAM_TITLE = 'title';
export const TOPIC_PARAM_SUMMARY = 'summary';
export const TOPIC_PARAM_STRATEGIC_INTENT = 'strategic_intent';

export class ModelSlashCommandEvent {
    model: string;
    source: string;

    constructor(model: string, source: string = 'tui') {
        this.model = model;
        this.source = source;
    }
}

export function logModelSlashCommand(_configOrEvent: any, _event?: any): void {}

export const PREVIEW_GEMINI_MODEL = 'gemini-3-flash-preview';
export const PREVIEW_GEMINI_3_1_MODEL = 'gemini-3.1-pro-preview';
export const PREVIEW_GEMINI_FLASH_MODEL = 'gemini-3.5-flash';
export const PREVIEW_GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-low';
export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-3.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-low';
export const PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_MODEL_ALIAS_AUTO = 'auto';
export const GEMMA_4_31B_IT_MODEL = 'gemma-4-31b-it';
export const GEMMA_4_26B_A4B_IT_MODEL = 'gemma-4-26b-a4b-it';

export function isProModel(_model: string): boolean {
    return false;
}

export function getAutoModelDescription(): string {
    return 'Modèle automatique';
}

export enum SessionEndReason {
    QUIT = 'quit',
    ERROR = 'error',
    Clear = 'clear',
    Exit = 'exit',
}

export enum SessionStartSource {
    CLI = 'cli',
    TUI = 'tui',
    Resume = 'resume',
    Startup = 'startup',
    Clear = 'clear',
}

type TelemetryListener = () => void;

export const uiTelemetryService = {
    track: (_event: string, _data?: Record<string, unknown>): void => {},
    getMetrics: (): SessionMetrics => ({
        totalTokens: 0, inputTokens: 0, outputTokens: 0,
        models: [], toolCalls: {
            count: 0, success: 0, fail: 0, durationMs: 0, decisions: {},
            totalCalls: 0, totalSuccess: 0, totalFail: 0, totalDurationMs: 0
        },
        duration: 0,
        api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
        tokens: { input: 0, prompt: 0, candidates: 0, total: 0, cached: 0, thoughts: 0, tool: 0 }
    }),
    getLastPromptTokenCount: (): number => 0,
    _listeners: new Map<string, Set<TelemetryListener>>(),
    on: (event: string, listener: TelemetryListener): void => {
        let set = uiTelemetryService._listeners.get(event);
        if (!set) { set = new Set(); uiTelemetryService._listeners.set(event, set); }
        set.add(listener);
    },
    off: (event: string, listener: TelemetryListener): void => {
        uiTelemetryService._listeners.get(event)?.delete(listener);
    },
    reset: (): void => {},
    clear(newSessionId?: string): void {
        const listeners = uiTelemetryService._listeners.get('clear');
        if (listeners) {
            for (const listener of listeners) {
                listener();
            }
        }
    },
    hydrate(conversation: any): void {
        const listeners = uiTelemetryService._listeners.get('update');
        if (listeners) {
            for (const listener of listeners) {
                listener();
            }
        }
    }
};

export function flushTelemetry(config?: any): Promise<void> {
    return Promise.resolve();
}

export function resetBrowserSession(): void {}

export enum NewAgentsChoice {
    ACKNOWLEDGE = 'acknowledge',
    DISMISS = 'dismiss',
}

export interface FolderDiscoveryResults {
    directories: string[];
}

export interface ActiveHook {
    id: string;
    name: string;
    index?: number;
    total?: number;
}

export interface HookSystemMessagePayload {
    message: string;
    hookName?: string;
}

export interface TuiEventEmitter {
    on(event: string, listener: (payload: unknown) => void): void;
    off(event: string, listener: (payload: unknown) => void): void;
    drainBacklogs(): void;
}

export type RestartReason = string;

export interface HistoryItemAbout {
    type: 'about';
    text?: string;
    [key: string]: any;
}

export interface HistoryItemHelp {
    type: 'help';
    text?: string;
    [key: string]: any;
}

export interface HistoryItemInfo {
    type: 'info';
    text?: string;
    [key: string]: any;
}

export interface HistoryItemError {
    type: 'error';
    text?: string;
    [key: string]: any;
}

export function listMemoryFiles(_config?: any): any {
    return { content: '' };
}

export function refreshMemory(_config?: any): Promise<any> {
    return Promise.resolve({ content: '' });
}

export function showMemory(_config?: any): any {
    return { content: '' };
}

export function getVersion(): string {
    return '0.0.0';
}

export class FileCommandLoader implements ICommandLoader {
    private config: unknown;
    constructor(config?: unknown) { this.config = config; }
    // Satisfies ICommandLoader.loadCommands — returns an empty command list.
    async loadCommands(_signal?: AbortSignal): Promise<SlashCommand[]> { return []; }
}

/** Structure complète d'un thème personnalisé HIVE-MIND.
 *  Les champs racine (Background, Foreground, etc.) sont conservés pour la compatibilité
 *  avec l'API legacy. Les sections imbriquées (text/background/status/ui) ont priorité.
 */
export interface CustomTheme {
    // ─── Identité ───────────────────────────────────────────────────────────────
    name: string;
    /** Catégorie du thème — utilisée par theme-manager pour le tri et l'affichage. */
    type?: 'light' | 'dark' | 'ansi' | 'custom';

    // ─── API legacy (champs racine) ──────────────────────────────────────────────
    Background?: string;
    Foreground?: string;
    LightBlue?: string;
    AccentBlue?: string;
    AccentPurple?: string;
    AccentCyan?: string;
    AccentGreen?: string;
    AccentYellow?: string;
    AccentRed?: string;
    DiffAdded?: string;
    DiffRemoved?: string;
    Comment?: string;
    Gray?: string;
    DarkGray?: string;
    GradientColors?: string[];

    // ─── API sémantique (sections imbriquées) ────────────────────────────────────
    text?: {
        primary?: string;
        secondary?: string;
        link?: string;
        accent?: string;
        response?: string;
    };
    background?: {
        primary?: string;
        message?: string;
        input?: string;
        focus?: string;
        diff?: {
            added?: string;
            removed?: string;
        };
    };
    border?: {
        default?: string;
    };
    ui?: {
        comment?: string;
        symbol?: string;
        active?: string;
        dark?: string;
        focus?: string;
        gradient?: string[];
    };
    status?: {
        error?: string;
        success?: string;
        warning?: string;
    };
}

export interface FallbackIntent {
    choice: string;
}

export interface ValidationIntent {
    choice: string;
}

export interface PolicyUpdateConfirmationRequest {
    id: string;
    message: string;
}

export interface LoopDetectionConfirmationRequest {
    id: string;
    message: string;
}

export const ShellExecutionService = {
    execute: async (_command: string): Promise<string> => '',
    writeToPty: (_pid: number, _data: string): void => {},
    scrollPty: (_pid: number, _delta: number): void => {},
    resizePty: (_pid: number, _width: number, _height: number): void => {},
    subscribe: (_pid: number, _listener: (event: unknown) => void): (() => void) => () => {},
    getLogFilePath: (_pid: number): string => ''
};

export interface ConfirmationRequest {
    id?: string;
    title?: string;
    message?: string;
    onApprove?: () => void;
    onDeny?: () => void;
    prompt?: React.ReactNode;
    onConfirm?: (confirmed: boolean) => void;
}

export interface PermissionConfirmationRequest {
    id: string;
    permission: string;
    files: string[];
    onComplete: (result: { allowed: boolean }) => void;
    onAllow: () => void;
    onDeny: () => void;
}

export interface IdeInfo {
    name: string;
    version: string;
    editor: string;
}

export interface IdeContext {
    editors: IdeInfo[];
    trustLevel: string;
    workspaceState?: {
        openFiles?: string[];
    };
}

export interface AccountSuspensionInfo {
    message: string;
    appealUrl?: string;
    appealLinkText?: string;
}

export enum CoreToolCallStatus {
    Pending = 'pending',
    Running = 'running',
    Completed = 'completed',
    Failed = 'failed',
    Aborted = 'aborted',
    Executing = 'executing',
    Success = 'success',
    Error = 'error',
    Cancelled = 'cancelled',
    Scheduled = 'scheduled',
    AwaitingApproval = 'awaiting_approval'
}

export enum ApprovalMode {
    ALWAYS = 'always',
    NEVER = 'never',
    SEMI = 'semi',
    YOLO = 'yolo',
    AUTO_EDIT = 'auto_edit',
}

export enum StreamingState {
    Idle = 'idle',
    Responding = 'responding',
    WaitingForConfirmation = 'waiting_for_confirmation',
}

export interface ThoughtSummary {
    id: string;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    durationMs?: number;
    thoughts?: string;
    subject?: string;
}

export interface HistoryItem {
    id: number;
    type:
        | 'thinking'
        | 'hint'
        | 'user'
        | 'user_shell'
        | 'assistant'
        | 'assistant_content'
        | 'info'
        | 'warning'
        | 'error'
        | 'about'
        | 'help'
        | 'stats'
        | 'model_stats'
        | 'tool_stats'
        | 'model'
        | 'quit'
        | 'tool_group'
        | 'tool_display_group'
        | 'subagent'
        | 'compression'
        | 'export_session'
        | 'extensions_list'
        | 'tools_list'
        | 'skills_list'
        | 'agents_list'
        | 'mcp_status'
        | 'chat_list';
    text?: string;
    parts?: Part[];
    thought?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
    tools?: IndividualToolCallDisplay[];
    [key: string]: unknown;
}

export type HistoryItemWithoutId = Omit<HistoryItem, 'id'>;

export interface Part {
    kind?: Kind;
    text?: string;
    media?: unknown;
    toolCall?: unknown;
    toolResult?: unknown;
    error?: unknown;
    functionCall?: any;
    functionResponse?: any;
}

export enum MCPServerStatus {
    CONNECTED = 'connected',
    CONNECTING = 'connecting',
    DISCONNECTED = 'disconnected',
}

export interface MCPServerConfig {
    name: string;
    status: string;
    extension?: {
        name: string;
    };
    description?: string;
}

export interface JsonMcpTool {
    name: string;
    serverName: string;
    description?: string;
    schema?: {
        parametersJsonSchema?: any;
        parameters?: any;
    };
}

export interface JsonMcpPrompt {
    name: string;
    serverName: string;
    description?: string;
}

export interface JsonMcpResource {
    name: string;
    serverName: string;
    uri?: string;
    mimeType?: string;
    description?: string;
}

export interface HistoryItemMcpStatus {
    authStatus: Record<string, string>;
    enablementState: Record<string, { enabled: boolean; isSessionDisabled?: boolean }>;
}

export interface Question {
    id: string;
    text?: string;
    type: 'boolean' | 'string' | 'choice' | string;
    choices?: string[];
    header?: string;
    question?: string;
    placeholder?: string;
    unconstrainedHeight?: boolean;
    multiSelect?: boolean;
    options?: Array<{ label: string; description?: string; value?: any }>;
}

export enum WarningPriority {
    High = 'high',
    Medium = 'medium',
    Low = 'low'
}

export interface ConsoleMessageItem {
    id: string;
    text: string;
    type: 'log' | 'info' | 'warn' | 'error';
    timestamp: number;
}

export enum ToolConfirmationOutcome {
    Cancel = 'cancel',
    Proceed = 'proceed',
    ProceedAlways = 'proceed_always',
}

export interface ToolCallConfirmationDetails {
    type: string;
    title: string;
    command: string;
    rootCommand: string;
    rootCommands: string[];
    commands: string[];
    onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void> | void;
    questions?: any[];
}

export interface IndividualToolCallDisplay {
    callId: string;
    name: string;
    originalRequestName?: string;
    description: string;
    display?: ToolCallDisplay;
    status: CoreToolCallStatus | 'awaiting_approval';
    isClientInitiated?: boolean;
    renderOutputAsMarkdown?: boolean;
    kind?: Kind;
    resultDisplay?: string;
    progressMessage?: string;
    progress?: number;
    progressTotal?: number;
    ptyId?: number | string;
    outputFile?: string;
    confirmationDetails?: ToolCallConfirmationDetails;
    approvalMode?: any;
    parentCallId?: string;
}

export interface AgentDefinition {
    name: string;
    displayName: string;
    description?: string;
    kind?: string;
    experimental?: boolean;
    modelConfig?: any;
    runConfig?: any;
}

export interface RetryAttemptPayload {
    model: string;
    attempt: number;
    maxAttempts: number;
}

export enum CompressionStatus {
    NOT_COMPRESSED = 'not_compressed',
    COMPRESSED = 'compressed',
    COMPRESSION_FAILED_INFLATED_TOKEN_COUNT = 'compression_failed_inflated_token_count',
    COMPRESSION_FAILED_TOKEN_COUNT_ERROR = 'compression_failed_token_count_error',
    COMPRESSION_FAILED_EMPTY_SUMMARY = 'compression_failed_empty_summary',
    NOOP = 'noop'
}

export interface CompressionInfo {
    isCompressing: boolean;
    savingRatio?: number;
}

export interface AnsiToken {
    text: string;
    color?: string;
    bgColor?: string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    fg?: string;
    bg?: string;
    inverse?: boolean;
}

export type AnsiLine = AnsiToken[];
export type AnsiOutput = AnsiLine[];

// Stubs for extension/update types — opaque structures not implemented in the TUI layer.
export interface ExtensionUpdateState { [key: string]: unknown; }
export interface UpdateObject { [key: string]: unknown; }
export interface UIState {
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  isThemeDialogOpen: boolean;
  themeError: string | null;
  isAuthenticating: boolean;
  isConfigInitialized: boolean;
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
  isAuthDialogOpen: boolean;
  isAwaitingApiKeyInput: boolean;
  isAwaitingLoginRestart: boolean;
  loginRestartMessage?: string;
  apiKeyDefaultValue?: string;
  editorError: string | null;
  isEditorDialogOpen: boolean;
  showPrivacyNotice: boolean;
  mouseMode: boolean;
  corgiMode: boolean;
  debugMessage: string;
  quittingMessages: HistoryItem[] | null;
  isSettingsDialogOpen: boolean;
  isSessionBrowserOpen: boolean;
  isModelDialogOpen: boolean;
  isVoiceModelDialogOpen: boolean;
  isAgentConfigDialogOpen: boolean;
  selectedAgentName?: string;
  selectedAgentDisplayName?: string;
  selectedAgentDefinition?: AgentDefinition;
  isPermissionsDialogOpen: boolean;
  permissionsDialogProps: { targetDirectory?: string } | null;
  slashCommands: readonly SlashCommand[] | undefined;
  pendingSlashCommandHistoryItems: HistoryItemWithoutId[];
  commandContext: CommandContext;
  commandConfirmationRequest: ConfirmationRequest | null;
  authConsentRequest: ConfirmationRequest | null;
  confirmUpdateExtensionRequests: ConfirmationRequest[];
  loopDetectionConfirmationRequest: LoopDetectionConfirmationRequest | null;
  permissionConfirmationRequest: PermissionConfirmationRequest | null;
  hiveMdFileCount: number;
  streamingState: StreamingState;
  initError: string | null;
  pendingAssistantHistoryItems: HistoryItemWithoutId[];
  thought: ThoughtSummary | null;
  isInputActive: boolean;
  isVoiceModeEnabled: boolean;
  isResuming: boolean;
  shouldShowIdePrompt: boolean;
  isFolderTrustDialogOpen: boolean;
  folderDiscoveryResults: FolderDiscoveryResults | null;
  isPolicyUpdateDialogOpen: boolean;
  policyUpdateConfirmationRequest: PolicyUpdateConfirmationRequest | undefined;
  isTrustedFolder: boolean | undefined;
  constrainHeight: boolean;
  showErrorDetails: boolean;
  ideContextState: IdeContext | undefined;
  renderMarkdown: boolean;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  shortcutsHelpVisible: boolean;
  cleanUiDetailsVisible: boolean;
  elapsedTime: number;
  currentLoadingPhrase: string | undefined;
  currentTip: string | undefined;
  currentWittyPhrase: string | undefined;
  historyRemountKey: number;
  activeHooks: ActiveHook[];
  messageQueue: string[];
  queueErrorMessage: string | null;
  showApprovalModeIndicator: ApprovalMode;
  allowPlanMode: boolean;
  currentModel: string;
  contextFileNames: string[];
  errorCount: number;
  availableTerminalHeight: number | undefined;
  stableControlsHeight: number;
  mainAreaWidth: number;
  staticAreaMaxItemHeight: number;
  staticExtraHeight: number;
  dialogsVisible: boolean;
  pendingHistoryItems: HistoryItemWithoutId[];
  nightly: boolean;
  branchName: string | undefined;
  sessionStats: SessionStatsState;
  terminalWidth: number;
  terminalHeight: number;
  mainControlsRef: (node: DOMElement | null) => void;
  // NOTE: This is for performance profiling only.
  rootUiRef: React.MutableRefObject<DOMElement | null>;
  currentIDE: IdeInfo | null;
  updateInfo: UpdateObject | null;
  showIdeRestartPrompt: boolean;
  ideTrustRestartReason: RestartReason;
  isRestarting: boolean;
  extensionsUpdateState: Map<string, ExtensionUpdateState>;
  activePtyId: number | undefined;
  backgroundTaskCount: number;
  isBackgroundTaskVisible: boolean;
  embeddedShellFocused: boolean;
  showDebugProfiler: boolean;
  showFullTodos: boolean;
  bannerData: {
    defaultText: string;
    warningText: string;
  };
  bannerVisible: boolean;
  customDialog: React.ReactNode | null;
  terminalBackgroundColor: TerminalBackgroundColor;
  settingsNonce: number;
  backgroundTasks: Map<number, BackgroundTask>;
  activeBackgroundTaskPid: number | null;
  backgroundTaskHeight: number;
  isBackgroundTaskListOpen: boolean;
  adminSettingsChanged: boolean;
  newAgents: AgentDefinition[] | null;
  showIsExpandableHint: boolean;
  hintMode: boolean;
  hintBuffer: string;
  transientMessage: {
    text: string;
    type: TransientMessageType;
  } | null;
}

export const UIStateContext = createContext<UIState | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Stubs et aliases pour les imports Gemini CLI encore présents dans la TUI
// ─────────────────────────────────────────────────────────────────────────────

export const REFERENCE_CONTENT_START = '<reference_content>';
export const REFERENCE_CONTENT_END = '</reference_content>';
export type PartUnion = Part;
export enum QuestionType {
    BOOLEAN = 'boolean',
    STRING = 'string',
    CHOICE = 'choice'
}

export const isEditorAvailable = (_editor: EditorType): boolean => false;
export const validatePlanPath = (_path: string): boolean => true;
export const processSingleFileContent = (content: string): string => content;
export const isUserVisibleHook = (_hook: ActiveHook): boolean => true;
export const hasSummary = (_value: unknown): boolean => false;
export const isGrepResult = (_value: unknown): boolean => false;
export const isListResult = (_value: unknown): boolean => false;
export const isReadManyFilesResult = (_value: unknown): boolean => false;
export const isStructuredToolResult = (_value: unknown): boolean => false;
export const isSubagentProgress = (_value: unknown): boolean => false;
export const isTodoList = (_value: unknown): boolean => false;
export const isVisibleInToolGroup = (_item: HistoryItem): boolean => false;
export const isCompletedAskUserTool = (_value: unknown): boolean => false;
export const mapCoreStatusToDisplayStatus = (status: CoreToolCallStatus): CoreToolCallStatus => status;

export const SHELL_TOOL_NAME = 'execute_bash_command';
export const EDIT_DISPLAY_NAME = 'edit_file';
export const GLOB_DISPLAY_NAME = 'glob_search';
export const READ_FILE_DISPLAY_NAME = 'read_file';
export const LS_DISPLAY_NAME = 'list_directory';
export const GREP_DISPLAY_NAME = 'grep_search';
export const READ_MANY_FILES_DISPLAY_NAME = 'read_many_files';
export const UPDATE_TOPIC_TOOL_NAME = 'update_topic';
export const AGENT_TOOL_NAME = 'agent';
export const ROOT_SCHEDULER_ID = 'root';

export const makeSlashCommandEvent = (_opts?: Record<string, unknown>): unknown => ({});
export const logSlashCommand = (_config: unknown, _event?: unknown): void => {};
export const addMCPStatusChangeListener = (_listener?: unknown): void => {};
export const removeMCPStatusChangeListener = (_listener?: unknown): void => {};

export const isBinary = (_data: unknown): boolean => false;
export const isGuiEditor = (_editor: any): boolean => false;
export const isTerminalEditor = (_editor: any): boolean => false;
export const isValidEditorType = (_editor: string): boolean => true;
export const getEditorCommand = (_editor: EditorType): string => '';
export const getEditorExtraArgs = (_editor: EditorType, ..._args: any[]): string[] => [];
export const getEditorWaitFlag = (_editor: EditorType): string => '';
export const resolveEditorTypeFromCommand = (_command: string): EditorType | null => null;
export const getAbsoluteGitDir = (_cwd: string): string | null => null;
export const getCodeAssistServer = (): unknown => null;
export const convertSessionToClientHistory = (_session: unknown[]): unknown[] => [];
export const getResponseText = (_response: unknown): string => '';
export const getAdminErrorMessage = (_error: unknown): string => '';
export const recordFlickerFrame = (): void => {};

export const enterAlternateScreen = (): void => {};
export const exitAlternateScreen = (): void => {};
export const enableLineWrapping = (): void => {};
export const disableLineWrapping = (): void => {};


// ─── Types réels — remplaçants des stubs `any` ──────────────────────────────

/** Surcharge d'agent : remplace temporairement le modèle ou le prompt système. */
export interface AgentOverride {
    model?: string;
    systemPrompt?: string;
}

/** Propriétés d'affichage d'un bloc de compression de contexte. */
export interface CompressionProps {
    originalTokenCount: number;
    compressedTokenCount: number;
    ratio: number;
}

/** Représentation d'un diff de fichier pour l'outil d'édition. */
export interface FileDiff {
    filePath: string;
    oldContent: string;
    newContent: string;
    patch?: string;
}

/** Résultat d'un listing de répertoire. */
export interface ListDirectoryResult {
    entries: Array<{ name: string; isDirectory: boolean; size?: number }>;
    path: string;
}

/** Résultat de la lecture de plusieurs fichiers. */
export interface ReadManyFilesResult {
    files: Array<{ path: string; content: string; mimeType?: string }>;
    errors?: Array<{ path: string; error: string }>;
}

/** Représentation d'un résultat d'outil pour l'affichage UI. */
export interface ToolResultDisplay {
    summary: string;
    detail?: string;
    isError?: boolean;
}

/** Liste de tâches (outil /todo). */
export interface TodoList {
    items: Array<{ id: string; text: string; completed: boolean; priority?: 'high' | 'medium' | 'low' }>;
    title?: string;
}

/** Entrée d'historique pour un sous-agent. */
export interface HistoryItemSubagent {
    type: 'subagent';
    id: number;
    agentName: string;
    status: 'running' | 'completed' | 'error';
    result?: string;
}

/** Entrée d'historique pour un groupe d'outils avec affichage détaillé. */
export interface HistoryItemToolDisplayGroup {
    type: 'tool_display_group';
    id: number;
    tools: IndividualToolCallDisplay[];
}

/** Entrée d'historique pour le statut Gemma (modèle local). */
export interface HistoryItemGemmaStatus {
    type: 'gemma_status';
    id: number;
    status: 'loading' | 'ready' | 'error';
    message?: string;
}

/** Requête d'affichage du dialog quota Pro. */
export interface ProQuotaDialogRequest {
    currentUsage?: number;
    limit?: number;
    resetTime?: string;
}

/** Requête de validation (dialog de validation d'action critique). */
export interface ValidationDialogRequest {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Requête du menu de dépassement (overage). */
export interface OverageMenuDialogRequest {
    currentCost: number;
    intent: OverageMenuIntent;
}

/** Requête du dialog de portefeuille vide. */
export interface EmptyWalletDialogRequest {
    intent: EmptyWalletIntent;
}

/** Intention de dépassement de quota. */
export type OverageMenuIntent = 'upgrade' | 'dismiss' | 'learn_more';

/** Intention de portefeuille vide. */
export type EmptyWalletIntent = 'add_credits' | 'dismiss';

/** Fournisseur de complétion shell (bash/zsh). */
export interface ShellCompletionProvider {
    getCompletions(input: string, cwd: string): Promise<string[]>;
}

export const ToolCallStatus = CoreToolCallStatus;

/** Propriétés pour l'export de session (JSON/Markdown). */
export interface ExportSessionProps {
    format: 'json' | 'markdown' | 'text';
    includeTools?: boolean;
    outputPath?: string;
}

// NOTE : GeminiClient est défini dans hiveConfig.ts et importé depuis là.
// Ce re-export évite les imports circulaires pour les composants qui l'utilisent via UIStateContext.
export type { GeminiClient } from '../../config/hiveConfig.js';

/** Serveur Code Assist (stub pour compatibilité IDE). */
export interface CodeAssistServer {
    readonly serverUrl: string;
    isConnected(): boolean;
}

export class FileDiscoveryService {
    constructor(_dir: string, _options?: unknown) {}

    async discoverFiles(): Promise<string[]> {
        return [];
    }
}

export class FileSearch {
    constructor(_options: unknown) {}

    async search(_query: string): Promise<string[]> {
        return [];
    }
}

export class FileSearchFactory {
    static create(_options: unknown): FileSearch {
        return new FileSearch(_options);
    }
}
/** Service de cycle de vie d'exécution (gère start/stop d'une inférence). */
export interface ExecutionLifecycleService {
    start(signal: AbortSignal): void;
    stop(): void;
    isRunning(): boolean;
}

/** Planificateur de tâches asynchrones (outil /schedule). */
export interface Scheduler {
    schedule(taskId: string, fn: () => Promise<void>, intervalMs: number): void;
    cancel(taskId: string): void;
    getActiveTasks(): string[];
}

/** Enregistrement complet d'une conversation (pour export et persistance). */
export interface ConversationRecord {
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    turns: HistoryTurn[];
}

/** Enregistrement d'un message individuel dans une conversation. */
export interface MessageRecord {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: unknown }>;
}

/** Un tour de conversation (paire user → assistant). */
export interface HistoryTurn {
    userMessage: MessageRecord;
    assistantMessage?: MessageRecord;
    timestamp: Date;
}

/** Payload envoyé au début d'un hook (pre-exec). */
export interface HookStartPayload {
    hookName: string;
    args: Record<string, unknown>;
    timestamp: Date;
}

/** Payload envoyé à la fin d'un hook (post-exec). */
export interface HookEndPayload {
    hookName: string;
    result: unknown;
    error?: string;
    durationMs: number;
}

/** État de découverte MCP (liste des serveurs et leur statut de connexion). */
export interface MCPDiscoveryState {
    servers: Array<{
        name: string;
        status: 'connecting' | 'connected' | 'error' | 'disconnected';
        error?: string;
        tools?: string[];
    }>;
    isDiscovering: boolean;
}

/** Action de mise à jour d'extension (install/uninstall/reload). */
export type ExtensionUpdateAction =
    | { type: 'install'; extensionId: string }
    | { type: 'uninstall'; extensionId: string }
    | { type: 'reload'; extensionId: string }
    | { type: 'enable'; extensionId: string }
    | { type: 'disable'; extensionId: string };

/** Statut de mise à jour d'une extension. */
export type ExtensionUpdateStatus = 'pending' | 'in_progress' | 'success' | 'error';

/** Événement émis au démarrage des extensions. */
export interface ExtensionsStartingEvent {
    extensionIds: string[];
    timestamp: Date;
}

/** Événement émis à l'arrêt des extensions. */
export interface ExtensionsStoppingEvent {
    extensionIds: string[];
    timestamp: Date;
}

// ─── Types SlashCommand (union discriminée réelle) ────────────────────────────

/** Résultat d'une commande slash — union de toutes les actions possibles. */
export type SlashCommandResult =
    | { type: 'tool'; toolName: string; toolArgs: Record<string, unknown>; postSubmitPrompt?: string }
    | { type: 'message'; content: string; messageType: 'info' | 'error' | 'warning' }
    | { type: 'logout' }
    | { type: 'dialog'; dialog: string; props?: Record<string, unknown> }
    | { type: 'load_history'; clientHistory: unknown[]; history: HistoryItem[] }
    | { type: 'quit'; messages: HistoryItem[]; deleteSession?: boolean }
    | { type: 'submit_prompt'; content: PartListUnion | string }
    | { type: 'confirm_shell_commands'; commandsToConfirm: string[]; originalInvocation: { raw: string } }
    | { type: 'confirm_action'; prompt: React.ReactNode; originalInvocation: { raw: string } }
    | { type: 'custom_dialog'; component: React.ReactNode };

/** Résultat retourné par le processeur de commandes slash au hook appelant. */
export type SlashCommandProcessorResult =
    | { type: 'handled' }
    | { type: 'submit_prompt'; content: PartListUnion | string }
    | { type: 'schedule_tool'; toolName: string; toolArgs: Record<string, unknown>; postSubmitPrompt?: string };

/** Statut d'une commande slash pour la télémétrie. */
export const SlashCommandStatus = {
    SUCCESS: 'success',
    ERROR: 'error',
    CANCELLED: 'cancelled',
} as const;
export type SlashCommandStatus = typeof SlashCommandStatus[keyof typeof SlashCommandStatus];

/** Données d'une session reprise (résumé chargé depuis le disque). */
export interface ResumedSessionData {
    sessionId: string;
    history: HistoryItem[];
    startTime: Date;
    summary?: string;
}

/** Service Git (lecture de l'état du dépôt). */
export interface GitService {
    readonly projectRoot: string;
    getCurrentBranch(): Promise<string | null>;
    getStatus(): Promise<{ modified: string[]; staged: string[]; untracked: string[] }>;
    getLog(limit?: number): Promise<Array<{ hash: string; message: string; author: string; date: Date }>>;
}

/** Comportement de complétion du prompt utilisateur. */
export type CompletionBehavior = 'accept' | 'dismiss' | 'next' | 'prev';
/** Message TUI interne — produit par les commandes slash et consommé par addMessage(). */
export interface Message {
    type: MessageType | string;
    timestamp: Date;
    /** Champs pour /about */
    cliVersion?: string;
    osVersion?: string;
    sandboxEnv?: string;
    modelVersion?: string;
    selectedAuthType?: string;
    gcpProject?: string;
    ideClient?: string;
    /** Champs pour /help */
    // (aucun champ supplémentaire requis)
    /** Champs pour /stats, /quit */
    duration?: number;
    /** Champs pour /compression */
    compression?: unknown;
    /** Champs pour /stats, /model_stats, /tool_stats */
    stats?: unknown;
    /** Contenu texte générique (utilisé par les messages simples) */
    content?: string;
}
// (types SlashCommandResult, SlashCommandProcessorResult, SlashCommandStatus, ResumedSessionData, GitService, CompletionBehavior — définis plus haut)
export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};
