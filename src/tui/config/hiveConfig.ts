/**
 * hiveConfig — Configuration minimale pour le TUI HIVE-MIND
 *
 * Comme WhatsApp/Telegram/Discord, le TUI est un simple transport.
 * Pas d'OAuth, pas d'extensions, pas de MCP — juste le pont vers le core.
 */

export interface HiveConfig {
    getApiKey(): string;
    getModel(): string;
    get(key: string): unknown;
    getAll(): Record<string, unknown>;
    getUseAlternateBuffer(): boolean;
    getScreenReader(): boolean;
    getApprovalMode(): string;
    getProjectRoot(): string;
    getSessionId(): string;
    isVoiceModeEnabled(): boolean;
    isSkillsSupportEnabled(): boolean;
    getGeminiClient(): any;
    getMessageBus(): unknown;
    getFileService(): unknown;
    getFileFilteringOptions(): unknown;
    getToolRegistry(): unknown;
    getWorkspaceContext(): any;
    getTargetDir(): string;
    getEnableRecursiveFileSearch(): boolean;
    validatePathAccess(path: string, mode: string): boolean;
    getIdeMode(): boolean;
    isBrowserLaunchSuppressed(): boolean;
    getContentGeneratorConfig(): any;
    isModelSteeringEnabled(): boolean;
    isInteractiveShellEnabled(): boolean;
    isAutoMemoryEnabled(): boolean;
    reloadSkills(): Promise<void>;
    getQuotaRemaining(): number | undefined;
    getQuotaLimit(): number | undefined;
    getQuotaResetTime(): string | undefined;
    isInitialized(): boolean;
    initialize(): Promise<void>;
    getHookSystem(): any;
    refreshAuth(authType?: any): Promise<void>;
    getUserTier(): string;
    getUserPaidTier(): any;
    getMemoryContextManager(): any;
    updateSystemInstructionIfInitialized(): void;
    getUserMemory(): any;
    getGeminiMdFileCount(): number;
    getDebugMode(): boolean;
    getUseTerminalBuffer(): boolean;
    getEnableExtensionReloading(): boolean;
    getExtensionLoader(): any;
    setRemoteAdminSettings(settings: any): void;
    sanitizationConfig: any;
    sandboxManager: any;
    getRemoteAdminSettings(): any;
    getAgentRegistry(): any;
    setShellExecutionConfig(config: any): void;
    getQuestion(): string | null;
    isPlanEnabled(): boolean;
    getPolicyUpdateConfirmationRequest(): any;
    getBannerTextNoCapacityIssues(): string;
    getBannerTextCapacityIssues(): string;
    getTerminalBackground(): string;
    injectionService: any;
    storage: any;
    getExperiments(): any;
}

import { Storage } from '../ui/contexts/UIStateContext.js';

const SESSION_ID = `tui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function createHiveConfig(): HiveConfig {
    return {
        getApiKey: () => process.env.GOOGLE_AI_KEY || '',
        getModel: () => process.env.HIVE_MODEL || 'gemini-2.0-flash',
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
        getSessionId: () => SESSION_ID,
        isVoiceModeEnabled: () => false,
        isSkillsSupportEnabled: () => false,
        getGeminiClient: () => null,
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
            authType: 'api_key'
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
        getGeminiMdFileCount: () => 0,
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
            getAgents: () => []
        }),
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
