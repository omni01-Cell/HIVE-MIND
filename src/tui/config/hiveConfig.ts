/**
 * hiveConfig — Configuration minimale pour le TUI HIVE-MIND
 *
 * Comme WhatsApp/Telegram/Discord, le TUI est un simple transport.
 * Pas d'OAuth, pas d'extensions, pas de MCP — juste le pont vers le core.
 */

import { Storage, GeminiUserTier } from '../ui/contexts/UIStateContext.js';
import { findHiveMdFilesSync, countHiveMdFilesSync, buildHiveMdContext } from '../utils/hiveMd.js';
import { hiveTransport } from '../transport/HiveTransport.js';
import * as fsPromises from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { coreEvents } from '../utils/coreEvents.js';

export interface MessageBus {
    subscribe(type: string, handler: (payload: unknown) => void): void;
    unsubscribe(type: string, handler: (payload: unknown) => void): void;
    publish(event: { type: string; [key: string]: unknown }): void;
}

export interface WorkspaceContext {
    getDirectories(): string[];
    addReadOnlyPath(path: string): void;
}

export interface HookSystem {
    fireSessionStartEvent(source: string): Promise<unknown> | unknown;
    fireSessionEndEvent(reason: string): Promise<unknown> | unknown;
}

export interface MemoryContextManager {
    refresh(): Promise<void>;
}

export interface InjectionService {
    addInjection(content: string, type: string): void;
}

export interface AgentRegistry {
    getAgents(): unknown[];
    acknowledgeAgent(agent: unknown): void;
    /** Trouve un agent par son nom, retourne null si absent. */
    getDefinition(name: string): unknown | null;
}

export interface GeminiClient {
    isInitialized(): boolean;
    /** Optionnel — service d'enregistrement de session. */
    getChatRecordingService?(): { deleteCurrentSessionAsync(): Promise<void> } | undefined;
    /** Optionnel — remplace l'historique de la conversation. */
    setHistory?(history: unknown[]): void;
}

export interface FileService {
    /** Vérifie si le chemin doit être ignoré selon les options données. */
    shouldIgnoreFile(path: string, options?: { respectGitIgnore?: boolean; respectGeminiIgnore?: boolean }): boolean;
}

export interface ResourceRegistry {
    findResourceByUri(uri: string): { uri: string; serverName: string; mimeType?: string } | undefined;
}

export interface McpClientManager {
    getClient(serverName: string): { readResource(uri: string, opts?: { signal?: AbortSignal }): Promise<{ contents?: unknown[] }> } | undefined;
}


export interface FileFilteringOptions {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
    enableFileWatcher: boolean;
    maxFileCount: number;
    searchTimeout: number;
}

export interface ToolRegistry {
    getTool(name: string): unknown;
}

export interface ExtensionLoader {
    setRequestConsent(consent: unknown): void;
    setRequestSetting(setting: unknown): void;
    getExtensions(): unknown[];
}

export interface Experiments {
    flags: Record<string, boolean>;
}

export interface HiveConfig {
    getApiKey(): string;
    getModel(): string;
    setModel(model: string, tempOnly?: boolean): void;
    refreshUserQuota(): Promise<void>;
    get(key: string): unknown;
    getAll(): Record<string, unknown>;
    getUseAlternateBuffer(): boolean;
    getScreenReader(): boolean;
    getApprovalMode(): string;
    getProjectRoot(): string;
    getSessionId(): string;
    setSessionId(id: string): void;
    isVoiceModeEnabled(): boolean;
    isSkillsSupportEnabled(): boolean;
    getGeminiClient(): GeminiClient | null;
    getMessageBus(): MessageBus;
    getFileService(): FileService;
    getFileFilteringOptions(): FileFilteringOptions;
    getToolRegistry(): ToolRegistry;
    getWorkspaceContext(): WorkspaceContext;
    getTargetDir(): string;
    getEnableRecursiveFileSearch(): boolean;
    validatePathAccess(path: string, mode: string): boolean;
    getIdeMode(): boolean;
    isBrowserLaunchSuppressed(): boolean;
    getContentGeneratorConfig(): { authType: string; apiKey?: string } | null;
    isModelSteeringEnabled(): boolean;
    isInteractiveShellEnabled(): boolean;
    isAutoMemoryEnabled(): boolean;
    reloadSkills(): Promise<void>;
    getQuotaRemaining(): number | undefined;
    getQuotaLimit(): number | undefined;
    getQuotaResetTime(): string | undefined;
    isInitialized(): boolean;
    initialize(): Promise<void>;
    getHookSystem(): HookSystem;
    refreshAuth(authType?: unknown): Promise<void>;
    getUserTier(): string;
    getUserPaidTier(): GeminiUserTier | undefined;
    getMemoryContextManager(): MemoryContextManager;
    updateSystemInstructionIfInitialized(): void;
    getUserMemory(): unknown;
    getHiveMdFileCount(): number;
    getHiveMdContext(): string;
    getDebugMode(): boolean;
    getUseTerminalBuffer(): boolean;
    getEnableExtensionReloading(): boolean;
    getExtensionLoader(): ExtensionLoader;
    setRemoteAdminSettings(settings: unknown): void;
    sanitizationConfig: unknown;
    sandboxManager: unknown;
    getRemoteAdminSettings(): unknown;
    getAgentRegistry(): AgentRegistry;
    getResourceRegistry(): ResourceRegistry;
    getMcpClientManager(): McpClientManager | null;
    setShellExecutionConfig(config: unknown): void;
    getQuestion(): string | null;
    isPlanEnabled(): boolean;
    getPolicyUpdateConfirmationRequest(): unknown;
    getBannerTextNoCapacityIssues(): string;
    getBannerTextCapacityIssues(): string;
    getTerminalBackground(): string;
    injectionService: InjectionService;
    storage: Storage;
    getExperiments(): Experiments;
}


let currentSessionId = `tui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// hive.md helper functions are imported from utils/hiveMd.js

export function createHiveConfig(): HiveConfig {
    let currentModel = process.env.HIVE_MODEL || 'gemini-2.0-flash';
    return {
        getApiKey: () => process.env.GOOGLE_AI_KEY || '',
        getModel: () => currentModel,
        setModel: (model: string, _tempOnly?: boolean) => {
            currentModel = model;
            // Also update the core smart router
            import('../../providers/index.js').then(({ providerRouter }) => {
                const parsed = providerRouter.parseModelString(model);
                if (parsed) {
                    providerRouter.forcedFamily = parsed.family;
                    providerRouter.forcedModel = parsed.model;
                } else {
                    providerRouter.forcedFamily = undefined;
                    providerRouter.forcedModel = model;
                }
            }).catch(err => {
                console.error('[HiveConfig] Failed to update providerRouter:', err);
            });
        },
        refreshUserQuota: async () => {},
        get: (key: string) => {
            const map: Record<string, unknown> = {
                useAlternateBuffer: false,
                screenReader: false,
                approvalMode: 'default',
                theme: undefined
            };
            return map[key] ?? null;
        },
        getAll: () => ({}),
        getUseAlternateBuffer: () => false,
        getScreenReader: () => false,
        getApprovalMode: () => 'default',
        getProjectRoot: () => process.cwd(),
        getSessionId: () => currentSessionId,
        setSessionId: (id: string) => {
            currentSessionId = id;
            hiveTransport.setSessionId(id);
        },
        isVoiceModeEnabled: () => false,
        isSkillsSupportEnabled: () => false,
        getGeminiClient: () => ({
            isInitialized: () => true,
            getChatRecordingService: () => ({
                deleteCurrentSessionAsync: async () => {
                    const sessionId = currentSessionId;
                    const chatsDir = path.join(homedir(), '.hivemind', 'temp', 'chats');
                    const filePath = path.join(chatsDir, `hive_session_${sessionId}.jsonl`);
                    try {
                        await fsPromises.unlink(filePath);
                    } catch (err: unknown) {
                        const error = err as NodeJS.ErrnoException;
                        if (error.code !== 'ENOENT') {
                            coreEvents.emitFeedback('error', 'Local sync deletion failed', err);
                            throw err; // Fail closed
                        }
                    }

                    try {
                        const { semanticMemory } = await import('../../services/memory.js');
                        if (semanticMemory && semanticMemory.cleanup) {
                            await semanticMemory.cleanup(sessionId, 0); // Cleanup deletes all except keepLast
                        }
                    } catch (err: unknown) {
                        coreEvents.emitFeedback('error', 'Supabase sync deletion failed', err);
                        throw err; // Fail closed
                    }
                },
                recordMessage: async (msg: unknown) => {
                    const msgObj = msg as { type?: string; content?: string; text?: string; };
                    const role = msgObj?.type === 'user' ? 'user' : 'assistant';
                    const text = msgObj?.content || msgObj?.text || '';
                    if (!text) return;

                    const sessionId = currentSessionId;
                    const chatsDir = path.join(homedir(), '.hivemind', 'temp', 'chats');
                    const filePath = path.join(chatsDir, `hive_session_${sessionId}.jsonl`);

                    const record = JSON.stringify({
                        type: msgObj?.type || 'assistant',
                        content: text,
                        role
                    }) + '\n';

                    try {
                        await fsPromises.mkdir(chatsDir, { recursive: true });
                        await fsPromises.appendFile(filePath, record);
                    } catch (err) {
                        coreEvents.emitFeedback('error', 'Local sync failed', err);
                        throw err; // Fail closed
                    }

                    try {
                        const { semanticMemory } = await import('../../services/memory.js');
                        if (semanticMemory && semanticMemory.store) {
                            await semanticMemory.store(sessionId, String(text), role);
                        }
                    } catch (err: unknown) {
                        coreEvents.emitFeedback('error', 'Supabase sync failed', err);
                        throw err; // Fail closed
                    }
                }
            })
        }),
        getMessageBus: () => ({
            subscribe: () => { /* noop */ },
            unsubscribe: () => { /* noop */ },
            publish: () => { /* noop */ }
        }),
        getFileService: () => ({
            shouldIgnoreFile: () => false
        }),
        getFileFilteringOptions: () => ({
            respectGitIgnore: true,
            respectGeminiIgnore: true,
            enableFileWatcher: false,
            maxFileCount: 1000,
            searchTimeout: 5000
        }),
        getToolRegistry: () => ({
            getTool: () => null
        }),
        getWorkspaceContext: () => ({
            getDirectories: () => [process.cwd()],
            addReadOnlyPath: (_p: string) => { /* noop */ }
        }),
        getTargetDir: () => process.cwd(),
        getEnableRecursiveFileSearch: () => true,
        validatePathAccess: () => true,
        getIdeMode: () => false,
        isBrowserLaunchSuppressed: () => false,
        getContentGeneratorConfig: () => ({
            authType: 'api_key',
            apiKey: process.env.GOOGLE_AI_KEY || ''
        }),
        isModelSteeringEnabled: () => false,
        isInteractiveShellEnabled: () => true,
        isAutoMemoryEnabled: () => false,
        reloadSkills: () => Promise.resolve(),
        getQuotaRemaining: () => undefined,
        getQuotaLimit: () => undefined,
        getQuotaResetTime: () => undefined,
        isInitialized: () => true,
        initialize: () => Promise.resolve(),
        getHookSystem: () => ({
            fireSessionStartEvent: () => Promise.resolve(),
            fireSessionEndEvent: () => Promise.resolve()
        }),
        refreshAuth: () => Promise.resolve(),
        getUserTier: () => 'free',
        getUserPaidTier: () => undefined,
        getMemoryContextManager: () => ({
            refresh: () => Promise.resolve()
        }),
        updateSystemInstructionIfInitialized: () => {},
        getUserMemory: () => ({}),
        getHiveMdFileCount: () => {
            const root = process.cwd();
            return countHiveMdFilesSync(root);
        },
        getHiveMdContext: () => {
            const root = process.cwd();
            const files = findHiveMdFilesSync(root);
            return buildHiveMdContext(files);
        },
        getDebugMode: () => false,
        getUseTerminalBuffer: () => false,
        getEnableExtensionReloading: () => false,
        getExtensionLoader: () => ({
            setRequestConsent: () => {},
            setRequestSetting: () => {},
            getExtensions: () => []
        }),
        setRemoteAdminSettings: () => {},
        sanitizationConfig: {},
        sandboxManager: {},
        getRemoteAdminSettings: () => ({}),
        getAgentRegistry: () => ({
            getAgents: () => [],
            acknowledgeAgent: () => {},
            getDefinition: (_name: string) => null
        }),
        getResourceRegistry: () => ({
            findResourceByUri: (_uri: string) => undefined
        }),
        getMcpClientManager: () => null,
        setShellExecutionConfig: () => {},
        getQuestion: () => null,
        isPlanEnabled: () => false,
        getPolicyUpdateConfirmationRequest: () => null,
        getBannerTextNoCapacityIssues: () => 'HIVE-MIND TUI',
        getBannerTextCapacityIssues: () => 'HIVE-MIND TUI',
        getTerminalBackground: () => '#000000',
        injectionService: {
            addInjection: () => {}
        },
        storage: new Storage(),
        getExperiments: () => ({ flags: {} })
    };
}

export const hiveConfig = createHiveConfig();
hiveTransport.setSessionId(hiveConfig.getSessionId());
