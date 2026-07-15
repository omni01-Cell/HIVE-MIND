type Config = any;
  type Storage = any;
  type StubLogger = any;
  type ExitCodes = any;
  type SlashCommand = any;
  type CommandKind = any;
  type CommandContext = any;
  type PromptPipelineContent = any;
  type IPromptProcessor = any;
  type SessionInfo = any;
  type SlashCommandActionReturn = any;

const SHELL_INJECTION_TRIGGER: any;
const AT_FILE_INJECTION_TRIGGER: any;
const SHORTHAND_ARGS_PLACEHOLDER: any;
const getSessionFiles: any;
const formatRelativeTime: any;
const loadApiKey: any;
const getErrorMessage: any;
const isAccountSuspendedError: any;
const ProjectIdRequiredError: any;
const keyMatchers: any;
const showRow2Minimal: any;
const showRow1: any;
const showRow2: any;
const mode: any;
  type ApprovalMode = any;
  type AuthType = any;
  type LlmRole = any;
  type QuestionType = any;
  type SubagentState = any;
  type WarningPriority = any;
  type MCPServerStatus = any;
  type SessionEndReason = any;
  type SessionStartSource = any;
  type ToolConfirmationOutcome = any;
  type ToolErrorType = any;
  type TrustLevel = any;
  type AdminControlsSettings = any;
  type AgentDefinition = any;
  type AgentEvent = any;
  type AgentLoopContext = any;
  type AgentOverride = any;
  type AgentProtocol = any;
  type AgentsDiscoveredPayload = any;
  type AnsiLine = any;
  type AnsiOutput = any;
  type AnsiToken = any;
  type ApprovalModeChangedPayload = any;
  type BugCommandSettings = any;
  type ChatRecordingService = any;
  type CodeAssistServer = any;
  type CompletedToolCall = any;
  type CompressionStatus = any;
  type ConfigParameters = any;
  type ConsentRequestPayload = any;
  type ConsoleLogPayload = any;
  type ConversationRecord = any;
  type CoreEvents = any;
  type CustomTheme = any;
  type EditorType = any;
  type ExtensionEvents = any;
  type ExtensionInstallMetadata = any;
  type ExtensionSetting = any;
  type FallbackIntent = any;
  type FallbackModelHandler = any;
  type File = any;
  type FileDiff = any;
  type FileSearch = any;
  type FileSystemService = any;
  type FilterFilesOptions = any;
  type FolderDiscoveryResults = any;
  type GeminiCLIExtension = any;
  type GeminiChat = any;
  type GeminiClient = any;
  type GeminiUserTier = any;
  type HeadlessModeOptions = any;
  type HookDefinition = any;
  type HookEndPayload = any;
  type HookEventName = any;
  type HookStartPayload = any;
  type HookSystemMessagePayload = any;
  type IDEConnectionState = any;
  type IExtensionIntegrity = any;
  type IdeContext = any;
  type IdeInfo = any;
  type InboxMemoryPatch = any;
  type InboxPatch = any;
  type InboxSkill = any;
  type InboxSkillDestination = any;
  type InjectionSource = any;
  type ListDirectoryResult = any;
  type LoadedTrustedFolders = any;
  type MCPServerConfig = any;
  type McpClient = any;
  type MemoryChangedPayload = any;
  type MessageActionReturn = any;
  type MessageBus = any;
  type MessageRecord = any;
  type OutputFormat = any;
  type OutputPayload = any;
  type OverageOption = any;
  type Part = any;
  type PolicyEngine = any;
  type PolicyEngineConfig = any;
  type PolicyRule = any;
  type PolicySettings = any;
  type PolicyUpdateConfirmationRequest = any;
  type Question = any;
  type ReadManyFilesResult = any;
  type RequiredMcpServerConfig = any;
  type ResolvedAtCommandPath = any;
  type ResolvedExtensionSetting = any;
  type ResumedSessionData = any;
  type RetrieveUserQuotaResponse = any;
  type RetryAttemptPayload = any;
  type SafetyCheckerRule = any;
  type SandboxConfig = any;
  type SerializableConfirmationDetails = any;
  type ShellType = any;
  type SkillDefinition = any;
  type SlashCommandConflict = any;
  type SlashCommandConflictsPayload = any;
  type StartupWarning = any;
  type SubagentActivityItem = any;
  type SubagentActivityMessage = any;
  type SubagentProgress = any;
  type TelemetrySettings = any;
  type ThoughtSummary = any;
  type TodoList = any;
  type ToolCall = any;
  type ToolCallConfirmationDetails = any;
  type ToolCallData = any;
  type ToolCallRequestInfo = any;
  type ToolCallsUpdateMessage = any;
  type ToolConfirmationPayload = any;
  type ToolConfirmationRequest = any;
  type ToolDisplay = any;
  type ToolResult = any;
  type ToolResultDisplay = any;
  type ToolVisibilityContext = any;
  type TranscriptionProvider = any;
  type UserFeedbackPayload = any;
  type UserTierId = any;
  type ValidationHandler = any;
  type ValidationIntent = any;
  type VertexAiRoutingConfig = any;
  type WhisperModelProgress = any;
  type WorkspaceContext = any;
  type WorktreeInfo = any;
  type WorktreeSettings = any;

// Global variables/functions in runtime
const resetBrowserSession: any;
const isTelemetrySdkInitialized: any;
const shutdownTelemetry: any;
const ExitCodes: any;
const coreEvents: any;
const debugLogger: any;
const Storage: any;
const Config: any;
const AuthType: any;
const ApprovalMode: any;
const CoreEvent: any;
const LlmRole: any;
const MCPServerStatus: any;
const getFileDiffFromResultDisplay: any;
const computeModelAddedAndRemovedLines: any;
const checkPathTrust: any;
const loadTrustedFolders: any;
const saveTrustedFolders: any;

  type HistoryItem = any;
  type HistoryItemWithoutId = any;
  type Message = any;
  type Suggestion = any;
  type UIActions = any;
  type UIState = any;
  type BackgroundTask = any;
  type ConfirmationRequest = any;
  type PermissionConfirmationRequest = any;
  type LoopDetectionConfirmationRequest = any;
  type ActiveHook = any;
  type Keyboard = any;
  type Key = any;
  type Theme = any;

  enum MessageType {
    INFO = 'info',
    ERROR = 'error',
    WARNING = 'warning',
    USER = 'user',
    ABOUT = 'about',
    HELP = 'help',
    STATS = 'stats',
    MODEL_STATS = 'model_stats',
    TOOL_STATS = 'tool_stats',
    QUIT = 'quit',
    COMPRESSION = 'compression',
    EXPORT_SESSION = 'export_session',
    MCP_STATUS = 'mcp_status',
    GEMMA_STATUS = 'gemma-status',
    CHAT_LIST = 'chat_list',
    THINKING = 'thinking',
    SUBAGENT = 'subagent',
    TOOLS_LIST = 'tools_list',
    SKILLS_LIST = 'skills_list',
    AGENTS_LIST = 'agents_list'
  }

  enum AuthState {
    Unauthenticated = 'unauthenticated',
    Updating = 'updating',
    AwaitingApiKeyInput = 'awaiting_api_key_input',
    Authenticated = 'authenticated',
    AwaitingLoginRestart = 'awaiting_login_restart'
  }

  enum StreamingState {
    Idle = 'idle',
    Responding = 'responding',
    WaitingForConfirmation = 'waiting_for_confirmation'
  }

  enum ToolCallStatus {
    Pending = 'Pending',
    Canceled = 'Canceled',
    Confirming = 'Confirming',
    Executing = 'Executing',
    Success = 'Success',
    Error = 'Error'
  }
