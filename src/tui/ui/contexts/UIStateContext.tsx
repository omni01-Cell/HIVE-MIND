/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { createContext, useContext } from 'react';
import { CommandContext, SlashCommand } from './UIStateContext.js';
import { type TransientMessageType } from '../../utils/events.js';
import type { DOMElement } from 'ink';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import type { ExtensionUpdateState } from '../state/extensions.js';
import type { UpdateObject } from '../utils/updateCheck.js';
import { AuthType } from '../../config/hiveSettingsSchema.js';

export type Kind = 'text' | 'image' | 'video' | 'file' | 'tool_call' | 'tool_result' | 'error';

export interface Part {
    kind?: Kind;
    text?: string;
    media?: any;
    toolCall?: any;
    toolResult?: any;
    error?: any;
}

export type CoreToolCallStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'executing' | 'success' | 'error' | 'cancelled' | 'scheduled';

export enum ApprovalMode {
    ALWAYS = 'always',
    NEVER = 'never',
    SEMI = 'semi',
}

export enum StreamingState {
    Idle = 'idle',
    Responding = 'responding',
    WaitingForConfirmation = 'waiting_for_confirmation'
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
        | 'gemma_status'
        | 'chat_list';
    text?: string;
    parts?: Part[];
    thought?: string;
    timestamp?: number;
    metadata?: Record<string, any>;
    [key: string]: any;
}

export type HistoryItemWithoutId = Omit<HistoryItem, 'id'>;

export interface ConfirmationRequest {
    id?: string;
    title?: string;
    message?: string;
    onApprove?: () => void;
    onDeny?: () => void;
    prompt?: any;
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
}

export interface IndividualToolCallDisplay {
    callId: string;
    name: string;
    description: string;
    status: CoreToolCallStatus | 'awaiting_approval';
    isClientInitiated?: boolean;
    resultDisplay?: any;
    confirmationDetails?: ToolCallConfirmationDetails;
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

export interface CompressionStatus {
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

export type CustomTheme = any;
export type FallbackIntent = any;
export type ValidationIntent = any;
export type FolderDiscoveryResults = any;
export type PolicyUpdateConfirmationRequest = any;
export type ActiveHook = any;
export type LoopDetectionConfirmationRequest = any;


export interface ProQuotaDialogRequest {
  failedModel: string;
  fallbackModel: string;
  message: string;
  isTerminalQuotaError: boolean;
  isModelNotFoundError?: boolean;
  authType?: AuthType;
  resolve: (intent: FallbackIntent) => void;
}

export interface ValidationDialogRequest {
  validationLink?: string;
  validationDescription?: string;
  learnMoreUrl?: string;
  resolve: (intent: ValidationIntent) => void;
}

/** Intent for overage menu dialog */
export type OverageMenuIntent =
  | 'use_credits'
  | 'use_fallback'
  | 'manage'
  | 'stop';

export interface OverageMenuDialogRequest {
  failedModel: string;
  fallbackModel?: string;
  resetTime?: string;
  creditBalance: number;
  userEmail?: string;
  resolve: (intent: OverageMenuIntent) => void;
}

/** Intent for empty wallet dialog */
export type EmptyWalletIntent = 'get_credits' | 'use_fallback' | 'stop';

export interface EmptyWalletDialogRequest {
  failedModel: string;
  fallbackModel?: string;
  resetTime?: string;
  userEmail?: string;
  onGetCredits: () => void;
  resolve: (intent: EmptyWalletIntent) => void;
}

import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
export type RestartReason = any;
import type { TerminalBackgroundColor } from '../utils/terminalCapabilityManager.js';
import type { BackgroundTask } from '../hooks/useExecutionLifecycle.js';

export interface AccountSuspensionInfo {
  message: string;
  appealUrl?: string;
  appealLinkText?: string;
}

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
  geminiMdFileCount: number;
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

export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};
