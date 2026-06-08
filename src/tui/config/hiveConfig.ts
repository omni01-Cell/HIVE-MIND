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
    getGeminiClient(): unknown;
    getMessageBus(): unknown;
    getFileService(): unknown;
    getFileFilteringOptions(): unknown;
    getToolRegistry(): unknown;
    getWorkspaceContext(): unknown;
    getTargetDir(): string;
    getEnableRecursiveFileSearch(): boolean;
    validatePathAccess(path: string, mode: string): boolean;
    getIdeMode(): boolean;
    getContentGeneratorConfig(): unknown;
}

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
            getDirectories: () => [process.cwd()]
        }),
        getTargetDir: () => process.cwd(),
        getEnableRecursiveFileSearch: () => true,
        validatePathAccess: () => true,
        getIdeMode: () => false,
        getContentGeneratorConfig: () => ({
            authType: 'api_key'
        })
    };
}

export const hiveConfig = createHiveConfig();
