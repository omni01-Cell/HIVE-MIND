/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-multiple-empty-lines, react-hooks/exhaustive-deps, object-shorthand */
/**
 * @license
 * Copyright 2026 HIVE-MIND
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
    useMemo,
    useState,
    useCallback,
    useEffect,
    useRef,
    useLayoutEffect,
    useContext
} from 'react';
import {
    type DOMElement,
    ResizeObserver,
    useApp,
    useStdout,
    useStdin,
    type AppProps,
    AppContext as InkAppContext
} from 'ink';
import { App } from './App.js';
import { AppContext } from './contexts/AppContext.js';
import {
    UIStateContext,
    type UIState,
    HistoryItem,
    HistoryItemInfo,
    ConfirmationRequest,
    PermissionConfirmationRequest,
    StreamingState,
    IdeInfo,
    IdeContext,
    ApprovalMode,
    AgentDefinition,
    SlashCommand,
    AuthState,
    QuotaStats,
    UserTierId,
    GeminiUserTier,
    UserFeedbackPayload,
    MessageType,
    StartupWarning,
    HookSystemMessagePayload,
    TuiEventEmitter,
    NewAgentsChoice,
    Part,
    IdeClient,
    PartListUnion
} from './contexts/UIStateContext.js';
import { QuotaContext } from './contexts/QuotaContext.js';
import {
    UIActionsContext,
    type UIActions
} from './contexts/UIActionsContext.js';
import { ConfigContext } from './contexts/ConfigContext.js';
import { checkPermissions } from './hooks/atCommandProcessor.js';
import { ToolActionsProvider } from './contexts/ToolActionsContext.js';
import { MouseProvider } from './contexts/MouseContext.js';
import { ScrollProvider } from './contexts/ScrollProvider.js';
import { getErrorMessage, debugLogger } from '../utils/errors.js';
import { HiveConfig } from '../config/hiveConfig.js';
import { coreEvents, CoreEvent } from '../utils/coreEvents.js';
import { AuthType } from '../config/hiveSettingsSchema.js';
// validateAuthMethod supprimé — non nécessaire pour HIVE-MIND
import process from 'node:process';
import { useHistory } from './hooks/useHistoryManager.js';
import { useMemoryMonitor } from './hooks/useMemoryMonitor.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { useModelCommand } from './hooks/useModelCommand.js';
import { useVoiceModelCommand } from './hooks/useVoiceModelCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useVimMode } from './contexts/VimModeContext.js';
import {
    useOverflowActions,
    useOverflowState
} from './contexts/OverflowContext.js';
import { useErrorCount } from './hooks/useConsoleMessages.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { calculatePromptWidths } from './components/InputPrompt.js';
import { calculateMainAreaWidth } from './utils/ui-sizing.js';
import ansiEscapes from 'ansi-escapes';
import { basename } from 'node:path';
import { computeTerminalTitle } from '../utils/windowTitle.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
// IdeIntegrationNudgeResult, UpdateObject, setUpdateHandler, relaunchApp, useExtensionUpdates, useConfirmUpdateRequests, ExtensionManager, requestConsentInteractive mockes localement :

const useConfirmUpdateRequests = () => {
    return {
        addConfirmUpdateExtensionRequest: () => {},
        confirmUpdateExtensionRequests: []
    };
};

const useExtensionUpdates = (..._args: any[]) => {
    return {
        extensionsUpdateState: new Map(),
        extensionsUpdateStateInternal: new Map(),
        dispatchExtensionStateUpdate: () => {}
    };
};

type ExtensionManager = any;
const requestConsentInteractive = (..._args: any[]) => {};
type IdeIntegrationNudgeResult = any;
type UpdateObject = any;
const setUpdateHandler = (..._args: any[]) => {};
const relaunchApp = () => {};



// IdeClient est importé de UIStateContext.js

export const ideContextStore = {
    subscribe: (callback: (state: any) => void) => {
        // noop
        return () => {};
    },
    get: () => ({ editors: [], trustLevel: 'trusted' })
};

export const getAllHiveMdFilenames = () => [];
export const clearCachedCredentialFile = () => {};
export type ResumedSessionData = any;
export const recordExitFail = (..._args: any[]) => {};
export const ShellExecutionService = {
    kill: (_pid: number) => {}
};
export const saveApiKey = (_key: string) => {};
export const isValidEditorType = (_editor: string) => true;
export const flattenMemory = (_memory?: unknown) => [];
export type MemoryChangedPayload = any;
export const writeToStdout = (data: string) => process.stdout.write(data);
export const disableMouseEvents = () => {};
export const enterAlternateScreen = () => {};
export const enableMouseEvents = () => {};
export const disableLineWrapping = () => {};
export const shouldEnterAlternateScreen = (_isAlt?: boolean, _screenReader?: boolean) => false;
export const startupProfiler = {
    start: () => {},
    stop: () => {},
    mark: () => {},
    flush: (_config?: any) => {}
};

export enum SessionStartSource {
    CLI = 'cli',
    TUI = 'tui',
    Resume = 'resume',
    Startup = 'startup',
    Clear = 'clear',
}

export enum SessionEndReason {
    QUIT = 'quit',
    ERROR = 'error',
    Clear = 'clear',
    Exit = 'exit',
}

export const generateSummary = () => Promise.resolve();
export type ConsentRequestPayload = any;
export type AgentsDiscoveredPayload = any;

export class ChangeAuthRequestedError extends Error {}
export class ProjectIdRequiredError extends Error {}

export const buildUserSteeringHintPrompt = (_hint?: unknown) => '';
export const logBillingEvent = (..._args: any[]) => {};

export class ApiKeyUpdatedEvent {
    constructor(..._args: any[]) {}
}
export const LegacyAgentProtocol = { V1: 'v1', V2: 'v2' } as any;
export enum InjectionSource { USER = 'user', SYSTEM = 'system' }

import { useAgentStream } from './hooks/useAgentStream.js';
import { hiveCoreConnection } from '../core/connection.js';
import { type BackgroundTask } from './hooks/useExecutionLifecycle.js';
import { useVim } from './hooks/vim.js';
import { type LoadableSettingScope, SettingScope } from '../config/settings.js';
import { type InitializationResult } from '../core/initializer.js';
import { startAutoMemoryIfEnabled } from '../utils/autoMemory.js';
import { useFocus } from './hooks/useFocus.js';
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { KeypressPriority } from './contexts/KeypressContext.js';
import { Command } from './key/keyMatchers.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useShellInactivityStatus } from './hooks/useShellInactivityStatus.js';
import { appEvents, AppEvent, TransientMessageType } from '../utils/events.js';
import {
    registerCleanup,
    removeCleanup,
    runExitCleanup
} from '../utils/cleanup.js';
import type { SessionInfo } from '../utils/sessionUtils.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useMcpStatus } from './hooks/useMcpStatus.js';
import { useApprovalModeIndicator } from './hooks/useApprovalModeIndicator.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { ShellFocusContext } from './contexts/ShellFocusContext.js';
import { useSessionBrowser } from './hooks/useSessionBrowser.js';
import { useSessionResume } from './hooks/useSessionResume.js';
import { useSettings } from './contexts/SettingsContext.js';
import { terminalCapabilityManager } from './utils/terminalCapabilityManager.js';
import { useInputHistoryStore } from './hooks/useInputHistoryStore.js';
import { useBanner } from './hooks/useBanner.js';
import { useTerminalSetupPrompt } from './utils/terminalSetup.js';
import { useHookDisplayState } from './hooks/useHookDisplayState.js';
import { useBackgroundTaskManager } from './hooks/useBackgroundTaskManager.js';
import {
    WARNING_PROMPT_DURATION_MS,
    QUEUE_ERROR_DISPLAY_DURATION_MS,
    EXPAND_HINT_DURATION_MS
} from './constants.js';
import { isSlashCommand } from './utils/commandUtils.js';
import { parseSlashCommand } from '../utils/commands.js';
import { useTerminalTheme } from './hooks/useTerminalTheme.js';
import { useTimedMessage } from './hooks/useTimedMessage.js';
import { useIsHelpDismissKey } from './utils/shortcutsHelp.js';
import { useSuspend } from './hooks/useSuspend.js';
import { useRunEventNotifications } from './hooks/useRunEventNotifications.js';
import {
    isNotificationsEnabled,
    getNotificationMethod
} from '../utils/terminalNotifications.js';
import {
    getLastTurnToolCallIds,
    isToolExecuting,
    isToolAwaitingConfirmation,
    getAllToolCalls
} from './utils/historyUtils.js';

interface AppContainerProps {
  config: HiveConfig;
  startupWarnings?: StartupWarning[];
  version: string;
  initializationResult: InitializationResult;
  resumedSessionData?: ResumedSessionData;
}

import { useRepeatedKeyPress } from './hooks/useRepeatedKeyPress.js';
import {
    useVisibilityToggle,
    APPROVAL_MODE_REVEAL_DURATION_MS
} from './hooks/useVisibilityToggle.js';
import { useKeyMatchers } from './hooks/useKeyMatchers.js';

import { InputContext } from './contexts/InputContext.js';

/**
 * The fraction of the terminal width to allocate to the shell.
 * This provides horizontal padding.
 */
const SHELL_WIDTH_FRACTION = 0.89;

/**
 * The number of lines to subtract from the available terminal height
 * for the shell. This provides vertical padding and space for other UI elements.
 */
const SHELL_HEIGHT_PADDING = 10;

interface GlobalKeypressContext {
    // Settings
    debugKeystrokeLogging: boolean;
    devtoolsEnabled: boolean;
    // State
    shortcutsHelpVisible: boolean;
    mouseMode: boolean;
    constrainHeight: boolean;
    isAlternateBuffer: boolean;
    embeddedShellFocused: boolean;
    isBackgroundTaskVisible: boolean;
    activePtyId: string | null | undefined;
    ideContextState: unknown;
    showErrorDetails: boolean;
    // Refs
    bufferRef: React.RefObject<{text: string}>;
    recordingFilenameRef: React.RefObject<string | null>;
    lastOutputTimeRef: React.RefObject<number>;
    tabFocusTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
    backgroundTasks: Map<number, unknown>;
    // Actions
    setShortcutsHelpVisible: (v: boolean) => void;
    setMouseMode: (fn: boolean | ((prev: boolean) => boolean)) => void;
    setConstrainHeight: (fn: boolean | ((prev: boolean) => boolean)) => void;
    setCopyModeEnabled: (v: boolean) => void;
    setShowErrorDetails: (fn: boolean | ((prev: boolean) => boolean)) => void;
    setShowFullTodos: (fn: boolean | ((prev: boolean) => boolean)) => void;
    setRenderMarkdown: (fn: boolean | ((prev: boolean) => boolean)) => void;
    setEmbeddedShellFocused: (v: boolean) => void;
    setIsBackgroundTaskListOpen: (v: boolean) => void;
    handleCtrlCPress: () => void;
    handleCtrlDPress: () => void;
    handleSuspend: () => void;
    handleSlashCommand: (cmd: PartListUnion | string) => void;
    cancelOngoingRequest?: () => void;
    backgroundCurrentExecution?: () => void;
    toggleBackgroundTasks: () => void;
    refreshStatic: () => void;
    showTransientMessage: (msg: any) => void;
    triggerExpandHint: (v: boolean) => void;
    toggleAllExpansion: (callIds: string[]) => void;
    dumpCurrentFrame?: (filename: string) => void;
    startRecording?: (filename: string) => void;
    stopRecording?: () => void;
    keyMatchers: Record<string, (key: Key) => boolean>;
    isHelpDismissKey: (key: Key) => boolean;
    history: HistoryItem[];
    pendingHistoryItems: HistoryItem[];
    TransientMessageType: typeof TransientMessageType;
    config: HiveConfig;
}


function handleDebugAndHelpKeys(ctx: GlobalKeypressContext, key: Key): boolean | null {
    if (ctx.debugKeystrokeLogging) {
        debugLogger.log('[DEBUG] Keystroke:', JSON.stringify(key));
    }
    if (ctx.shortcutsHelpVisible && ctx.isHelpDismissKey(key)) {
        ctx.setShortcutsHelpVisible(false);
    }
    return null; // Continue to next handlers
}

function handleMouseAndCopyKeys(ctx: GlobalKeypressContext, key: Key): boolean | null {
    if (ctx.keyMatchers[Command.TOGGLE_MOUSE_MODE](key)) {
        ctx.setMouseMode((prev: boolean) => !prev);
        if (ctx.mouseMode && !ctx.isAlternateBuffer) {
            appEvents.emit(AppEvent.ScrollToBottom);
        }
        return true;
    }
    if (ctx.isAlternateBuffer && ctx.keyMatchers[Command.TOGGLE_COPY_MODE](key)) {
        ctx.setCopyModeEnabled(true);
        disableMouseEvents();
        return true;
    }
    return null;
}

function handleAppControlKeys(ctx: GlobalKeypressContext, key: Key): boolean | null {
    if (ctx.keyMatchers[Command.QUIT](key)) {
        void ctx.cancelOngoingRequest?.();
        ctx.handleCtrlCPress();
        return true;
    }
    if (ctx.keyMatchers[Command.EXIT](key)) {
        if (ctx.bufferRef.current.text.length > 0) {
            return false;
        }
        ctx.handleCtrlDPress();
        return true;
    }
    if (ctx.keyMatchers[Command.SUSPEND_APP](key)) {
        ctx.handleSuspend();
        return null;
    }
    if (ctx.keyMatchers[Command.DUMP_FRAME](key)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `snapshot-${timestamp}.json`;
        if (ctx.dumpCurrentFrame) {
            ctx.dumpCurrentFrame(filename);
            debugLogger.log(`Dumped frame to: ${filename}`);
        }
        return true;
    }
    if (ctx.keyMatchers[Command.START_RECORDING](key)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${timestamp}.json`;
        if (ctx.startRecording) {
            ctx.startRecording(filename);
            ctx.recordingFilenameRef.current = filename;
            debugLogger.log(`Started recording to: ${filename}`);
        }
        return true;
    }
    if (ctx.keyMatchers[Command.STOP_RECORDING](key)) {
        if (ctx.stopRecording) {
            ctx.stopRecording();
            debugLogger.log(
                `Stopped recording, saved to: ${ctx.recordingFilenameRef.current ?? 'unknown'}`
            );
            ctx.recordingFilenameRef.current = null;
        }
        return true;
    }
    if (ctx.keyMatchers[Command.TOGGLE_COPY_MODE](key) && !ctx.isAlternateBuffer) {
        ctx.showTransientMessage({
            text: 'Use Ctrl+O to expand and collapse blocks of content.',
            type: ctx.TransientMessageType.Warning
        });
        return true;
    }
    return null;
}

function handleDisplayKeys(ctx: GlobalKeypressContext, key: Key): boolean | null {
    const toggleLastTurnTools = () => {
        ctx.triggerExpandHint(true);
        const targetToolCallIds = getLastTurnToolCallIds(
            ctx.history,
            ctx.pendingHistoryItems
        );
        if (targetToolCallIds.length > 0) {
            ctx.toggleAllExpansion(targetToolCallIds);
        }
    };

    let enteringConstrainHeightMode = false;
    if (!ctx.constrainHeight) {
        enteringConstrainHeightMode = true;
        ctx.setConstrainHeight(true);
        if (ctx.keyMatchers[Command.SHOW_MORE_LINES](key)) {
            toggleLastTurnTools();
        }
        if (!ctx.isAlternateBuffer) {
            ctx.refreshStatic();
        }
    }

    if (ctx.keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
        ctx.setShowErrorDetails((prev: boolean) => !prev);
        return true;
    }
    if (ctx.keyMatchers[Command.SHOW_FULL_TODOS](key)) {
        ctx.setShowFullTodos((prev: boolean) => !prev);
        return true;
    }
    if (ctx.keyMatchers[Command.TOGGLE_MARKDOWN](key)) {
        ctx.setRenderMarkdown((prev: boolean) => {
            const newValue = !prev;
            ctx.refreshStatic();
            return newValue;
        });
        return true;
    }
    if (
        ctx.keyMatchers[Command.SHOW_IDE_CONTEXT_DETAIL](key) &&
        ctx.config.getIdeMode() &&
        ctx.ideContextState
    ) {
        ctx.handleSlashCommand('/ide status');
        return true;
    }
    if (
        ctx.keyMatchers[Command.SHOW_MORE_LINES](key) &&
        !enteringConstrainHeightMode
    ) {
        ctx.setConstrainHeight(false);
        toggleLastTurnTools();
        ctx.refreshStatic();
        return true;
    }
    return null;
}

function handleShellFocusKeys(ctx: GlobalKeypressContext, key: Key): boolean | null {
    if (
        (ctx.keyMatchers[Command.FOCUS_SHELL_INPUT](key) ||
            ctx.keyMatchers[Command.UNFOCUS_BACKGROUND_SHELL_LIST](key)) &&
        (ctx.activePtyId || (ctx.isBackgroundTaskVisible && ctx.backgroundTasks.size > 0))
    ) {
        if (ctx.embeddedShellFocused) {
            const capturedTime = ctx.lastOutputTimeRef.current;
            if (ctx.tabFocusTimeoutRef.current)
                clearTimeout(ctx.tabFocusTimeoutRef.current);
            ctx.tabFocusTimeoutRef.current = setTimeout(() => {
                if (ctx.lastOutputTimeRef.current === capturedTime) {
                    ctx.setEmbeddedShellFocused(false);
                } else {
                    ctx.showTransientMessage({
                        text: 'Use Shift+Tab to unfocus',
                        type: ctx.TransientMessageType.Warning
                    });
                }
            }, 150);
            return false;
        }

        const isIdle = Date.now() - ctx.lastOutputTimeRef.current >= 100;
        if (isIdle && !ctx.activePtyId && !ctx.isBackgroundTaskVisible) {
            if (ctx.tabFocusTimeoutRef.current)
                clearTimeout(ctx.tabFocusTimeoutRef.current);
            ctx.toggleBackgroundTasks();
            ctx.setEmbeddedShellFocused(true);
            if (ctx.backgroundTasks.size > 1) ctx.setIsBackgroundTaskListOpen(true);
            return true;
        }

        ctx.setEmbeddedShellFocused(true);
        return true;
    }
    if (
        ctx.keyMatchers[Command.UNFOCUS_SHELL_INPUT](key) ||
        ctx.keyMatchers[Command.UNFOCUS_BACKGROUND_SHELL](key)
    ) {
        if (ctx.embeddedShellFocused) {
            ctx.setEmbeddedShellFocused(false);
            return true;
        }
        return false;
    }
    if (ctx.keyMatchers[Command.TOGGLE_BACKGROUND_SHELL](key)) {
        if (ctx.activePtyId) {
            ctx.backgroundCurrentExecution?.();
        } else {
            ctx.toggleBackgroundTasks();
            if (!ctx.isBackgroundTaskVisible && ctx.backgroundTasks.size > 0) {
                ctx.setEmbeddedShellFocused(true);
                if (ctx.backgroundTasks.size > 1) {
                    ctx.setIsBackgroundTaskListOpen(true);
                }
            } else {
                ctx.setEmbeddedShellFocused(false);
            }
        }
        return true;
    }
    if (ctx.keyMatchers[Command.TOGGLE_BACKGROUND_SHELL_LIST](key)) {
        if (ctx.backgroundTasks.size > 0 && ctx.isBackgroundTaskVisible) {
            if (!ctx.embeddedShellFocused) {
                ctx.setEmbeddedShellFocused(true);
            }
            ctx.setIsBackgroundTaskListOpen(true);
        }
        return true;
    }
    return null;
}


interface SubmitContext {
    isSlash: boolean;
    isIdle: boolean;
    isAgentRunning: boolean;
    isMcpOrConfigReady: boolean;
    isCompressing: boolean;
    isConfigInitialized: boolean;
    config: HiveConfig;
    submittedValue: string;
    slashCommands: readonly SlashCommand[] | null | undefined;
    handleSlashCommand: (cmd: PartListUnion | string) => void;
    handleHintSubmit: (hint: string) => void;
    submitQuery: (query: any, options?: any, _prompt_id?: string) => void | Promise<void>;
    addInput: (input: string) => void;
    addMessage: (msg: string) => void;
    setPermissionConfirmationRequest: (req: any) => void;
    messageQueueLength: number;
}

type SubmitResult = 'handled' | 'queued' | 'pending';

function trySlashCommandWhileRunning(ctx: SubmitContext): SubmitResult | null {
    if (!ctx.isSlash || !ctx.isAgentRunning) return null;
    const { commandToExecute } = parseSlashCommand(ctx.submittedValue, ctx.slashCommands ?? []);
    if (commandToExecute?.isSafeConcurrent) {
        void ctx.handleSlashCommand(ctx.submittedValue);
        return 'handled';
    }
    return null;
}

function tryHintWhileRunning(ctx: SubmitContext): SubmitResult | null {
    if (!ctx.config.isModelSteeringEnabled() || !ctx.isAgentRunning || ctx.isSlash) return null;
    ctx.handleHintSubmit(ctx.submittedValue);
    return 'handled';
}

async function trySubmitWithPermissions(ctx: SubmitContext): Promise<SubmitResult> {
    const canSubmit = (ctx.isSlash && ctx.isConfigInitialized) ||
        (!ctx.isCompressing && ctx.isIdle && ctx.isMcpOrConfigReady);
    if (!canSubmit) return 'queued';

    if (!ctx.isSlash) {
        const permissions = await checkPermissions(ctx.submittedValue, ctx.config);
        if (permissions.length > 0) {
            ctx.setPermissionConfirmationRequest({
                files: permissions,
                onComplete: (result: { allowed: boolean }) => {
                    ctx.setPermissionConfirmationRequest(null);
                    if (result.allowed) {
                        permissions.forEach((p: string) =>
                            ctx.config.getWorkspaceContext().addReadOnlyPath(p)
                        );
                    }
                    void ctx.submitQuery(ctx.submittedValue);
                }
            });
            return 'pending';
        }
    }
    ctx.submitQuery(ctx.submittedValue);
    return 'handled';
}

function handleQueuedSubmit(ctx: SubmitContext): void {
    if (ctx.isIdle && !ctx.isCompressing && !ctx.isMcpOrConfigReady && ctx.messageQueueLength === 0) {
        coreEvents.emitFeedback(
            'info',
            !ctx.isConfigInitialized
                ? 'Initializing... Prompts will be queued.'
                : 'Waiting for MCP servers to initialize... Slash commands are still available and prompts will be queued.'
        );
    }
    ctx.addMessage(ctx.submittedValue);
}

// eslint-disable-next-line max-lines-per-function, complexity
export const AppContainer = (props: AppContainerProps) => {
    const isHelpDismissKey = useIsHelpDismissKey();
    const keyMatchers = useKeyMatchers();
    const { config, initializationResult, resumedSessionData } = props;
    const settings = useSettings();
    const { reset } = useOverflowActions()!;
    const notificationsEnabled = isNotificationsEnabled(settings);
    const notificationMethod = getNotificationMethod(settings);

    const { setOptions, dumpCurrentFrame, startRecording, stopRecording } =
    useContext(InkAppContext);
    const recordingFilenameRef = useRef<string | null>(null);
    const historyManager = useHistory({
        chatRecordingService: (config.getGeminiClient() as any)?.getChatRecordingService()
    });

    useMemoryMonitor(historyManager);
    const isAlternateBuffer = config.getUseAlternateBuffer();
    const [mouseMode, setMouseMode] = useState(() =>
        config.getUseAlternateBuffer()
    );

    useEffect(() => {
        setOptions({
            stickyHeadersInBackbuffer: mouseMode
        });
        if (mouseMode) {
            enableMouseEvents();
        } else {
            disableMouseEvents();
        }
    }, [mouseMode, setOptions]);

    const [corgiMode, setCorgiMode] = useState(false);
    const [debugMessage, setDebugMessage] = useState<string>('');
    const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
    const [showPrivacyNotice, setShowPrivacyNotice] = useState<boolean>(false);
    const [themeError, setThemeError] = useState<string | null>(
        initializationResult.themeError as string | null
    );
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [embeddedShellFocused, setEmbeddedShellFocused] = useState(false);
    const [showDebugProfiler, setShowDebugProfiler] = useState(false);
    const [customDialog, setCustomDialog] = useState<React.ReactNode | null>(
        null
    );
    const [copyModeEnabled, setCopyModeEnabled] = useState(false);
    const [pendingRestorePrompt, setPendingRestorePrompt] = useState(false);
    const toggleBackgroundTasksRef = useRef<() => void>(() => {});
    const isBackgroundTaskVisibleRef = useRef<boolean>(false);
    const backgroundTasksRef = useRef<Map<number, BackgroundTask>>(new Map());

    const [adminSettingsChanged, setAdminSettingsChanged] = useState(false);

    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

    const toggleExpansion = useCallback((callId: string) => {
        setExpandedTools((prev) => {
            const next = new Set(prev);
            if (next.has(callId)) {
                next.delete(callId);
            } else {
                next.add(callId);
            }
            return next;
        });
    }, []);

    const toggleAllExpansion = useCallback((callIds: string[]) => {
        setExpandedTools((prev) => {
            const next = new Set(prev);
            const anyCollapsed = callIds.some((id) => !next.has(id));

            if (anyCollapsed) {
                callIds.forEach((id) => next.add(id));
            } else {
                callIds.forEach((id) => next.delete(id));
            }
            return next;
        });
    }, []);

    const isExpanded = useCallback(
        (callId: string) => expandedTools.has(callId),
        [expandedTools]
    );

    const [shellModeActive, setShellModeActive] = useState(false);
    const [isVoiceModeEnabled, setVoiceModeEnabled] = useState(false);
    const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
    const [historyRemountKey, setHistoryRemountKey] = useState(0);
    const [settingsNonce, setSettingsNonce] = useState(0);
    const activeHooks = useHookDisplayState();
    const [updateInfo, setUpdateInfo] = useState<UpdateObject | null>(null);
    const [isTrustedFolder, setIsTrustedFolder] = useState<boolean | undefined>(
        true
    );

    const [queueErrorMessage, setQueueErrorMessage] = useTimedMessage<string>(
        QUEUE_ERROR_DISPLAY_DURATION_MS
    );

    const [newAgents, setNewAgents] = useState<AgentDefinition[] | null>(null);
    const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
    const [expandHintTrigger, triggerExpandHint] = useTimedMessage<boolean>(
        EXPAND_HINT_DURATION_MS
    );
    const showIsExpandableHint = Boolean(expandHintTrigger);
    const overflowState = useOverflowState();
    const overflowingIdsSize = overflowState?.overflowingIds.size ?? 0;
    const hasOverflowState = overflowingIdsSize > 0 || !constrainHeight;

    /**
   * Manages the visibility and x-second timer for the expansion hint.
   *
   * This effect triggers the timer countdown whenever an overflow is detected
   * or the user manually toggles the expansion state with Ctrl+O.
   * By depending on overflowingIdsSize, the timer resets when *new* views
   * overflow, but avoids infinitely resetting during single-view streaming.
   *
   * In alternate buffer mode, we don't trigger the hint automatically on overflow
   * to avoid noise, but the user can still trigger it manually with Ctrl+O.
   */
    useEffect(() => {
        if (hasOverflowState) {
            triggerExpandHint(true);
        }
    }, [hasOverflowState, overflowingIdsSize, triggerExpandHint]);

    const [defaultBannerText, setDefaultBannerText] = useState('');
    const [warningBannerText, setWarningBannerText] = useState('');
    const [bannerVisible, setBannerVisible] = useState(true);

    const bannerData = useMemo(
        () => ({
            defaultText: defaultBannerText,
            warningText: warningBannerText
        }),
        [defaultBannerText, warningBannerText]
    );

    const { bannerText } = useBanner(bannerData);


    const extensionManager = config.getExtensionLoader() as ExtensionManager;
    // We are in the interactive CLI, update how we request consent and settings.
    extensionManager.setRequestConsent((description: any) =>
        requestConsentInteractive(description, addConfirmUpdateExtensionRequest)
    );
    extensionManager.setRequestSetting();

    const { addConfirmUpdateExtensionRequest, confirmUpdateExtensionRequests } =
    useConfirmUpdateRequests();
    const {
        extensionsUpdateState,
        extensionsUpdateStateInternal,
        dispatchExtensionStateUpdate
    } = useExtensionUpdates(
        extensionManager,
        historyManager.addItem,
        config.getEnableExtensionReloading()
    );

    const [isPermissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
    const [permissionsDialogProps, setPermissionsDialogProps] = useState<{
    targetDirectory?: string;
  } | null>(null);
    const openPermissionsDialog = useCallback(
        (dialogProps?: { targetDirectory?: string }) => {
            setPermissionsDialogOpen(true);
            setPermissionsDialogProps(dialogProps ?? null);
        },
        []
    );
    const closePermissionsDialog = useCallback(() => {
        setPermissionsDialogOpen(false);
        setPermissionsDialogProps(null);
    }, []);

    const [isAgentConfigDialogOpen, setIsAgentConfigDialogOpen] = useState(false);
    const [selectedAgentName, setSelectedAgentName] = useState<
    string | undefined
  >();
    const [selectedAgentDisplayName, setSelectedAgentDisplayName] = useState<
    string | undefined
  >();
    const [selectedAgentDefinition, setSelectedAgentDefinition] = useState<
    AgentDefinition | undefined
  >();

    const openAgentConfigDialog = useCallback(
        (name: string, displayName: string, definition: AgentDefinition) => {
            setSelectedAgentName(name);
            setSelectedAgentDisplayName(displayName);
            setSelectedAgentDefinition(definition);
            setIsAgentConfigDialogOpen(true);
        },
        []
    );

    const closeAgentConfigDialog = useCallback(() => {
        setIsAgentConfigDialogOpen(false);
        setSelectedAgentName(undefined);
        setSelectedAgentDisplayName(undefined);
        setSelectedAgentDefinition(undefined);
    }, []);

    const toggleDebugProfiler = useCallback(
        () => setShowDebugProfiler((prev) => !prev),
        []
    );

    const [currentModel, setCurrentModel] = useState(config.getModel());

    const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);
    const [quotaStats, setQuotaStats] = useState<QuotaStats | undefined>(() => {
        const remaining = config.getQuotaRemaining();
        const limit = config.getQuotaLimit();
        const resetTime = config.getQuotaResetTime();
        return remaining !== undefined ||
      limit !== undefined ||
      resetTime !== undefined
            ? { remaining, limit, resetTime }
            : undefined;
    });
    const [paidTier, setPaidTier] = useState<GeminiUserTier | undefined>(
        undefined
    );

    const [isConfigInitialized, setConfigInitialized] = useState(false);

    const logger = useLogger(config);
    const { inputHistory, addInput, initializeFromLogger } =
    useInputHistoryStore();

    // Terminal and layout hooks
    const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
    const { stdin, setRawMode } = useStdin();
    const { stdout } = useStdout();
    const app: AppProps = useApp();

    // Additional hooks moved from App.tsx
    const { stats: sessionStats } = useSessionStats();
    const branchName = useGitBranchName(config.getTargetDir());

    // Layout measurements
    // For performance profiling only
    const rootUiRef = useRef<DOMElement>(null);
    const lastTitleRef = useRef<string | null>(null);
    const staticExtraHeight = 3;

    useEffect(() => {

        (async () => {
            // Note: the program will not work if this fails so let errors be
            // handled by the global catch.
            if (!config.isInitialized()) {
                await config.initialize();
            }
            setConfigInitialized(true);
            startupProfiler.flush(config);

            startAutoMemoryIfEnabled(config);

            const sessionStartSource = resumedSessionData
                ? SessionStartSource.Resume
                : SessionStartSource.Startup;
            const result = await config
                .getHookSystem()
                ?.fireSessionStartEvent(sessionStartSource);

            if (result && 'getAdditionalContext' in result && typeof result.getAdditionalContext === 'function') {
                const additionalContext = result.getAdditionalContext();
                const geminiClient = config.getGeminiClient() as any;
                if (additionalContext && geminiClient) {
                    await geminiClient.addHistory({
                        role: 'user',
                        parts: [
                            { text: `<hook_context>${additionalContext}</hook_context>` }
                        ]
                    });
                }
            }
        })();
        const cleanupFn = async () => {
            // Turn off mouse scroll.
            disableMouseEvents();

            // Kill all background shells
            await Promise.all(
                Array.from(backgroundTasksRef.current.keys()).map((pid) =>
                    ShellExecutionService.kill(pid)
                )
            );

            // Fire SessionEnd hook on cleanup (only if hooks are enabled)
            await config?.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Exit);
        };
        registerCleanup(cleanupFn);

        return () => {
            removeCleanup(cleanupFn);
            cleanupFn().catch((e: unknown) =>
                debugLogger.error('Error during cleanup:', e)
            );
        };
    }, [config, resumedSessionData]);

    useEffect(
        () => setUpdateHandler(historyManager.addItem, setUpdateInfo),
        [historyManager.addItem]
    );

    // Subscribe to fallback mode and model changes from core
    useEffect(() => {
        const handleModelChanged = () => {
            setCurrentModel(config.getModel());
        };

        const handleQuotaChanged = (payload: {
      remaining: number | undefined;
      limit: number | undefined;
      resetTime?: string;
    }) => {
            setQuotaStats({
                remaining: payload.remaining,
                limit: payload.limit,
                resetTime: payload.resetTime
            });
        };

        coreEvents.on(CoreEvent.ModelChanged, handleModelChanged);
        coreEvents.on(CoreEvent.QuotaChanged, handleQuotaChanged);
        return () => {
            coreEvents.off(CoreEvent.ModelChanged, handleModelChanged);
            coreEvents.off(CoreEvent.QuotaChanged, handleQuotaChanged);
        };
    }, [config]);

    useEffect(() => {
        const handleSettingsChanged = () => {
            setSettingsNonce((prev) => prev + 1);
        };

        const handleAdminSettingsChanged = () => {
            setAdminSettingsChanged(true);
        };

        const handleAgentsDiscovered = (payload: AgentsDiscoveredPayload) => {
            setNewAgents(payload.agents);
        };

        coreEvents.on(CoreEvent.SettingsChanged, handleSettingsChanged);
        coreEvents.on(CoreEvent.AdminSettingsChanged, handleAdminSettingsChanged);
        coreEvents.on(CoreEvent.AgentsDiscovered, handleAgentsDiscovered);
        return () => {
            coreEvents.off(CoreEvent.SettingsChanged, handleSettingsChanged);
            coreEvents.off(
                CoreEvent.AdminSettingsChanged,
                handleAdminSettingsChanged
            );
            coreEvents.off(CoreEvent.AgentsDiscovered, handleAgentsDiscovered);
        };
    }, [settings]);

    const { errorCount, clearErrorCount } = useErrorCount();

    const mainAreaWidth = calculateMainAreaWidth(terminalWidth, config);
    // Derive widths for InputPrompt using shared helper
    const { inputWidth, suggestionsWidth } = useMemo(() => {
        const { inputWidth: computedInputWidth, suggestionsWidth: computedSuggestionsWidth } =
      calculatePromptWidths(mainAreaWidth);
        return { inputWidth: computedInputWidth, suggestionsWidth: computedSuggestionsWidth };
    }, [mainAreaWidth]);

    const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);

    const getPreferredEditor = useCallback(() => {
        const val = settings.merged.general.preferredEditor;
        return isValidEditorType(val) ? { id: val } as EditorType : undefined;
    }, [settings.merged.general.preferredEditor]);

    const buffer = useTextBuffer({
        initialText: '',
        viewport: { height: 10, width: inputWidth },
        stdin,
        setRawMode,
        escapePastedPaths: true,
        shellModeActive,
        getPreferredEditor
    });
    const bufferRef = useRef(buffer);
    useEffect(() => {
        bufferRef.current = buffer;
    }, [buffer]);

    const stableSetText = useCallback((text: string) => {
        bufferRef.current.setText(text);
    }, []);

    // Initialize input history from logger (past sessions)
    useEffect(() => {

        initializeFromLogger(logger);
    }, [logger, initializeFromLogger]);

    // One-time prompt to suggest running /terminal-setup when it would help.
    useTerminalSetupPrompt({
        addConfirmUpdateExtensionRequest,
        addItem: historyManager.addItem
    });

    const refreshStatic = useCallback(() => {
        if (!isAlternateBuffer && !config.getUseTerminalBuffer()) {
            stdout.write(ansiEscapes.clearTerminal);
            setHistoryRemountKey((prev) => prev + 1);
        }
    }, [setHistoryRemountKey, isAlternateBuffer, stdout, config]);

    const shouldUseAlternateScreen = shouldEnterAlternateScreen(
        isAlternateBuffer,
        config.getScreenReader()
    );

    const handleEditorClose = useCallback(() => {
        if (shouldUseAlternateScreen) {
            // The editor may have exited alternate buffer mode so we need to
            // enter it again to be safe.
            enterAlternateScreen();
            enableMouseEvents();
            disableLineWrapping();
            app.rerender();
        }
        terminalCapabilityManager.enableSupportedModes();
        refreshStatic();
    }, [refreshStatic, shouldUseAlternateScreen, app]);

    const [editorError, setEditorError] = useState<string | null>(null);
    const {
        isEditorDialogOpen,
        openEditorDialog,
        handleEditorSelect,
        exitEditorDialog
    } = useEditorSettings(settings, setEditorError, historyManager.addItem);

    useEffect(() => {
        coreEvents.on(CoreEvent.ExternalEditorClosed, handleEditorClose);
        coreEvents.on(CoreEvent.RequestEditorSelection, openEditorDialog);
        return () => {
            coreEvents.off(CoreEvent.ExternalEditorClosed, handleEditorClose);
            coreEvents.off(CoreEvent.RequestEditorSelection, openEditorDialog);
        };
    }, [handleEditorClose, openEditorDialog]);

    useEffect(() => {
        if (
            !(settings.merged.ui.hideBanner || config.getScreenReader()) &&
      bannerVisible &&
      bannerText
        ) {
            // The header should show a banner but the Header is rendered in static
            // so we must trigger a static refresh for it to be visible.
            refreshStatic();
        }
    }, [bannerVisible, bannerText, settings, config, refreshStatic]);

    const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
    useSettingsCommand();

    const {
        isThemeDialogOpen,
        openThemeDialog,
        closeThemeDialog,
        handleThemeSelect,
        handleThemeHighlight
    } = useThemeCommand(
        settings,
        setThemeError,
        historyManager.addItem,
        initializationResult.themeError as string | null,
        refreshStatic
    );
    // Poll for terminal background color changes to auto-switch theme
    useTerminalTheme(handleThemeSelect, config, refreshStatic);
    // Auth command simulated locally (no auth for local admin TUI)
    const [authState, setAuthState] = useState<AuthState>(AuthState.Authenticated);
    const [authError, setAuthError] = useState<string | null>(null);
    const onAuthError = useCallback((err: string | null) => { setAuthError(err); }, []);
    const setAuthContext = useCallback((_ctx: any) => {}, []);
    const apiKeyDefaultValue = undefined;
    const reloadApiKey = useCallback(async () => '', []);
    const accountSuspensionInfo = null;
    const setAccountSuspensionInfo = useCallback((_info: any) => {}, []);

    const proQuotaRequest = null;
    const handleProQuotaChoice = useCallback(() => {}, []);
    const validationRequest = null;
    const handleValidationChoice = useCallback(() => {}, []);
    const overageMenuRequest = null;
    const handleOverageMenuChoice = useCallback(() => {}, []);
    const emptyWalletRequest = null;
    const handleEmptyWalletChoice = useCallback(() => {}, []);

    // Derive auth state variables for backward compatibility with UIStateContext
    const isAuthDialogOpen = authState === AuthState.Updating;
    // Consider handling other auth types that should also skip the blocking screen
    const isAuthenticating =
    authState === AuthState.Unauthenticated &&
    settings.merged.security.auth.selectedType !== AuthType.USE_GEMINI;

    // Session browser and resume functionality
    const isGeminiClientInitialized = config.getGeminiClient()?.isInitialized();

    const { loadHistoryForResume, isResuming } = useSessionResume({
        config,
        historyManager,
        refreshStatic,
        isGeminiClientInitialized,
        setQuittingMessages,
        resumedSessionData,
        isAuthenticating
    });
    const {
        isSessionBrowserOpen,
        openSessionBrowser,
        closeSessionBrowser,
        handleResumeSession,
        handleDeleteSession: handleDeleteSessionSync
    } = useSessionBrowser(config, loadHistoryForResume);
    // Wrap handleDeleteSession to return a Promise for UIActions interface
    const handleDeleteSession = useCallback(
        async (session: SessionInfo): Promise<void> => {
            await handleDeleteSessionSync(session);
        },
        [handleDeleteSessionSync]
    );

    // Create handleAuthSelect wrapper for backward compatibility
    const handleAuthSelect = useCallback(
        async (authType: AuthType | undefined, scope: LoadableSettingScope) => {
            if (authType) {
                const previousAuthType =
          config.getContentGeneratorConfig()?.authType ?? 'unknown';
                if (authType === AuthType.LOGIN_WITH_GOOGLE) {
                    setAuthContext({ requiresRestart: true });
                } else {
                    setAuthContext({});
                }
                await clearCachedCredentialFile();
                settings.setValue(scope, 'security.auth.selectedType', authType);

                try {
                    config.setRemoteAdminSettings(undefined);
                    await config.refreshAuth(authType);
                    setAuthState(AuthState.Authenticated);
                    logBillingEvent(
                        config,
                        new ApiKeyUpdatedEvent(previousAuthType, authType)
                    );
                } catch (e) {
                    if (e instanceof ChangeAuthRequestedError) {
                        return;
                    }
                    if (e instanceof ProjectIdRequiredError) {
                        // OAuth succeeded but account setup requires project ID
                        // Show the error message directly without "Failed to authenticate" prefix
                        onAuthError(getErrorMessage(e));
                        return;
                    }
                    onAuthError(
                        `Failed to authenticate: ${e instanceof Error ? e.message : String(e)}`
                    );
                    return;
                }

                if (
                    authType === AuthType.LOGIN_WITH_GOOGLE &&
          config.isBrowserLaunchSuppressed()
                ) {
                    writeToStdout(`
----------------------------------------------------------------
Logging in... Restarting HIVE-MIND TUI to continue.
----------------------------------------------------------------
          `);
                    await relaunchApp();
                }
            }
            setAuthState(AuthState.Authenticated);
        },
        [settings, config, setAuthState, onAuthError, setAuthContext]
    );

    const handleApiKeySubmit = useCallback(
        async (apiKey: string) => {
            try {
                onAuthError(null);
                if (!apiKey.trim()) {
                    onAuthError('API key cannot be empty or whitespace only.');
                    return;
                }

                await saveApiKey(apiKey);
                await reloadApiKey();
                await config.refreshAuth(AuthType.USE_GEMINI);
                setAuthState(AuthState.Authenticated);
            } catch (e) {
                onAuthError(
                    `Failed to save API key: ${e instanceof Error ? e.message : String(e)}`
                );
            }
        },
        [setAuthState, onAuthError, reloadApiKey, config]
    );

    const handleApiKeyCancel = useCallback(() => {
    // Go back to auth method selection
        setAuthState(AuthState.Updating);
    }, [setAuthState]);

    // Sync user tier from config when authentication changes
    useEffect(() => {
    // Only sync when not currently authenticating
        if (authState === AuthState.Authenticated) {
            setUserTier(config.getUserTier() as any);
            setPaidTier(config.getUserPaidTier());
        }
    }, [config, authState]);

    // Check for enforced auth type mismatch
    useEffect(() => {
        if (
            settings.merged.security.auth.enforcedType &&
      settings.merged.security.auth.selectedType &&
      settings.merged.security.auth.enforcedType !==
        settings.merged.security.auth.selectedType
        ) {
            onAuthError(
                `Authentication is enforced to be ${settings.merged.security.auth.enforcedType}, but you are currently using ${settings.merged.security.auth.selectedType}.`
            );
        } else if (
            settings.merged.security.auth.selectedType &&
      !settings.merged.security.auth.useExternal
        ) {
            // We skip validation for HIVE-MIND API key here because it might be stored
            // in the keychain, which we can't check synchronously.
            // The useAuth hook handles validation for this case.
            if (settings.merged.security.auth.selectedType === AuthType.USE_GEMINI) {
                return;
            }

            // Validation d'auth supprimée — non nécessaire pour HIVE-MIND
        }
    }, [
        settings.merged.security.auth.selectedType,
        settings.merged.security.auth.enforcedType,
        settings.merged.security.auth.useExternal,
        onAuthError
    ]);

    const { isModelDialogOpen, openModelDialog, closeModelDialog } =
    useModelCommand();

    const {
        isVoiceModelDialogOpen,
        openVoiceModelDialog,
        closeVoiceModelDialog
    } = useVoiceModelCommand();

    const { toggleVimEnabled } = useVimMode();

    const setIsBackgroundTaskListOpenRef = useRef<(open: boolean) => void>(
        () => {}
    );
    const [shortcutsHelpVisible, setShortcutsHelpVisible] = useState(false);

    const {
        cleanUiDetailsVisible,
        setCleanUiDetailsVisible,
        toggleCleanUiDetailsVisible,
        revealCleanUiDetailsTemporarily
    } = useVisibilityToggle();

    const slashCommandActions = useMemo(
        () => ({
            openAuthDialog: () => setAuthState(AuthState.Updating),
            openThemeDialog,
            openEditorDialog,
            openPrivacyNotice: () => setShowPrivacyNotice(true),
            openSettingsDialog,
            openSessionBrowser,
            openModelDialog,
            openVoiceModelDialog,
            openAgentConfigDialog,
            openPermissionsDialog,
            quit: (messages: HistoryItem[]) => {
                closeThemeDialog();
                setQuittingMessages(messages);
                setTimeout(async () => {
                    await runExitCleanup();
                    process.exit(0);
                }, 100);
            },
            setDebugMessage,
            toggleCorgiMode: () => setCorgiMode((prev) => !prev),
            toggleVoiceMode: () => setVoiceModeEnabled((prev) => !prev),
            toggleDebugProfiler,
            dispatchExtensionStateUpdate,
            addConfirmUpdateExtensionRequest,
            toggleBackgroundTasks: () => {
                toggleBackgroundTasksRef.current();
                if (!isBackgroundTaskVisibleRef.current) {
                    setEmbeddedShellFocused(true);
                    if (backgroundTasksRef.current.size > 1) {
                        setIsBackgroundTaskListOpenRef.current(true);
                    } else {
                        setIsBackgroundTaskListOpenRef.current(false);
                    }
                }
            },
            toggleShortcutsHelp: () => setShortcutsHelpVisible((visible) => !visible),
            setText: stableSetText
        }),
        [
            setAuthState,
            openThemeDialog,
            closeThemeDialog,
            openEditorDialog,
            openSettingsDialog,
            openSessionBrowser,
            openModelDialog,
            openVoiceModelDialog,
            openAgentConfigDialog,
            setQuittingMessages,
            setDebugMessage,
            setShowPrivacyNotice,
            setCorgiMode,
            dispatchExtensionStateUpdate,
            openPermissionsDialog,
            addConfirmUpdateExtensionRequest,
            toggleDebugProfiler,
            setShortcutsHelpVisible,
            stableSetText
        ]
    );

    const {
        handleSlashCommand,
        slashCommands,
        pendingHistoryItems: pendingSlashCommandHistoryItems,
        commandContext,
        confirmationRequest: commandConfirmationRequest
    } = useSlashCommandProcessor(
        config,
        settings,
        historyManager.addItem,
        historyManager.clearItems,
        historyManager.loadHistory,
        refreshStatic,
        toggleVimEnabled,
        setIsProcessing,
        slashCommandActions,
        extensionsUpdateStateInternal,
        isConfigInitialized,
        setBannerVisible,
        setCustomDialog
    );

    const [authConsentRequest, setAuthConsentRequest] =
    useState<ConfirmationRequest | null>(null);
    const [permissionConfirmationRequest, setPermissionConfirmationRequest] =
    useState<PermissionConfirmationRequest | null>(null);

    useEffect(() => {
        const handleConsentRequest = (payload: ConsentRequestPayload) => {
            setAuthConsentRequest({
                prompt: payload.prompt,
                onConfirm: (confirmed: boolean) => {
                    setAuthConsentRequest(null);
                    payload.onConfirm(confirmed);
                }
            });
        };

        coreEvents.on(CoreEvent.ConsentRequest, handleConsentRequest);
        return () => {
            coreEvents.off(CoreEvent.ConsentRequest, handleConsentRequest);
        };
    }, []);

    const performMemoryRefresh = useCallback(async () => {
        historyManager.addItem(
            {
                type: MessageType.INFO,
                text: 'Refreshing hierarchical memory (hive.md or other context files)...'
            },
            Date.now()
        );
        try {
            await config.getMemoryContextManager()?.refresh();
            config.updateSystemInstructionIfInitialized();
            const flattenedMemory = flattenMemory(config.getUserMemory());
            const fileCount = config.getHiveMdFileCount();

            historyManager.addItem(
                {
                    type: MessageType.INFO,
                    text: `Memory reloaded successfully. ${
                        flattenedMemory.length > 0
                            ? `Loaded ${flattenedMemory.length} characters from ${fileCount} file(s)`
                            : 'No memory content found'
                    }`
                },
                Date.now()
            );
            if (config.getDebugMode()) {
                debugLogger.log(
                    `[DEBUG] Refreshed memory content in config: ${JSON.stringify(flattenedMemory).substring(
                        0,
                        200
                    )}...`
                );
            }
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            historyManager.addItem(
                {
                    type: MessageType.ERROR,
                    text: `Error refreshing memory: ${errorMessage}`
                },
                Date.now()
            );
            debugLogger.warn('Error refreshing memory:', error);
        }
    }, [config, historyManager]);

    const cancelHandlerRef = useRef<
    (shouldRestorePrompt?: boolean, clearBuffer?: boolean) => void
        >(() => {});

    const onCancelSubmit = useCallback(
        (shouldRestorePrompt?: boolean, clearBuffer: boolean = false) => {
            if (shouldRestorePrompt) {
                setPendingRestorePrompt(true);
            } else {
                setPendingRestorePrompt(false);
                cancelHandlerRef.current(false, clearBuffer);
            }
        },
        []
    );

    useEffect(() => {
        if (pendingRestorePrompt) {
            const lastHistoryUserMsg = [...historyManager.history].reverse().find(
                (h: any) => h.type === 'user'
            );
            const lastUserMsg = inputHistory.at(-1);

            if (
                !lastHistoryUserMsg ||
        (typeof lastHistoryUserMsg.text === 'string' &&
          lastHistoryUserMsg.text === lastUserMsg)
            ) {
                cancelHandlerRef.current(true);
                setPendingRestorePrompt(false);
            }
        }
    }, [pendingRestorePrompt, inputHistory, historyManager.history]);

    const pendingHintsRef = useRef<string[]>([]);
    const [pendingHintCount, setPendingHintCount] = useState(0);

    const consumePendingHints = useCallback(() => {
        if (pendingHintsRef.current.length === 0) {
            return null;
        }
        const hint = pendingHintsRef.current.join('\n');
        pendingHintsRef.current = [];
        setPendingHintCount(0);
        return hint;
    }, []);

    const streamAgent = hiveCoreConnection;

    const agentStreamResult = useAgentStream({
        agent: streamAgent,
        addItem: historyManager.addItem,
        onCancelSubmit,
        isShellFocused: embeddedShellFocused,
        logger
    });
    const activeStream = agentStreamResult;

    const {
        streamingState,
        submitQuery,
        initError,
        pendingHistoryItems: pendingAssistantHistoryItems,
        thought,
        cancelOngoingRequest,
        pendingToolCalls,
        handleApprovalModeChange,
        activePtyId,
        loopDetectionConfirmationRequest,
        lastOutputTime,
        backgroundTaskCount,
        isBackgroundTaskVisible,
        toggleBackgroundTasks,
        backgroundCurrentExecution,
        backgroundTasks,
        dismissBackgroundTask,
        retryStatus
    } = activeStream;

    const pendingHistoryItems = useMemo(
        () => [...pendingSlashCommandHistoryItems, ...pendingAssistantHistoryItems],
        [pendingSlashCommandHistoryItems, pendingAssistantHistoryItems]
    );

    toggleBackgroundTasksRef.current = toggleBackgroundTasks;
    isBackgroundTaskVisibleRef.current = isBackgroundTaskVisible;
    backgroundTasksRef.current = backgroundTasks;

    const {
        activeBackgroundTaskPid,
        setIsBackgroundTaskListOpen,
        isBackgroundTaskListOpen,
        setActiveBackgroundTaskPid,
        backgroundTaskHeight
    } = useBackgroundTaskManager({
        backgroundTasks,
        backgroundTaskCount,
        isBackgroundTaskVisible,
        activePtyId,
        embeddedShellFocused,
        setEmbeddedShellFocused,
        terminalHeight
    });

    setIsBackgroundTaskListOpenRef.current = setIsBackgroundTaskListOpen;

    const lastOutputTimeRef = useRef(0);

    useEffect(() => {
        lastOutputTimeRef.current = lastOutputTime;
    }, [lastOutputTime]);

    const { shouldShowFocusHint, inactivityStatus } = useShellInactivityStatus({
        activePtyId,
        lastOutputTime,
        streamingState,
        pendingToolCalls,
        embeddedShellFocused,
        isInteractiveShellEnabled: config.isInteractiveShellEnabled()
    });

    const shouldShowActionRequiredTitle = inactivityStatus === 'action_required';
    const shouldShowSilentWorkingTitle = inactivityStatus === 'silent_working';

    const handleApprovalModeChangeWithUiReveal = useCallback(
        (mode: ApprovalMode) => {
            void handleApprovalModeChange(mode);
            if (!cleanUiDetailsVisible) {
                revealCleanUiDetailsTemporarily(APPROVAL_MODE_REVEAL_DURATION_MS);
            }
        },
        [
            handleApprovalModeChange,
            cleanUiDetailsVisible,
            revealCleanUiDetailsTemporarily
        ]
    );

    const { isMcpReady } = useMcpStatus(config);

    const isCompressing = useMemo(
        () =>
            pendingHistoryItems.some(
                (item) =>
                    item.type === MessageType.COMPRESSION && (item.compression as any)?.isPending
            ),
        [pendingHistoryItems]
    );

    const {
        messageQueue,
        addMessage,
        clearQueue,
        getQueuedMessagesText,
        popAllMessages
    } = useMessageQueue({
        isConfigInitialized,
        streamingState,
        submitQuery,
        isMcpReady,
        isCompressing
    });

    cancelHandlerRef.current = useCallback(
        (shouldRestorePrompt: boolean = true, clearBuffer: boolean = false) => {
            if (!clearBuffer && isToolAwaitingConfirmation(pendingHistoryItems)) {
                return; // Don't clear - user may be composing a follow-up message
            }

            // If cancelling (shouldRestorePrompt=false):
            if (!shouldRestorePrompt) {
                // Clear the buffer if explicitly requested (e.g., Ctrl+C)
                if (clearBuffer) {
                    buffer.setText('');
                }
                // Otherwise (e.g., Escape), user is in control - preserve whatever text they typed
                return;
            }

            // Restore the last message when shouldRestorePrompt=true
            const lastUserMessage = inputHistory.at(-1);
            let textToSet = lastUserMessage || '';

            const queuedText = getQueuedMessagesText();
            if (queuedText) {
                textToSet = textToSet ? `${textToSet}\n\n${queuedText}` : queuedText;
                clearQueue();
            }

            if (textToSet) {
                buffer.setText(textToSet);
            }
        },
        [
            buffer,
            inputHistory,
            getQueuedMessagesText,
            clearQueue,
            pendingHistoryItems
        ]
    );

    const handleHintSubmit = useCallback(
        (hint: string) => {
            const trimmed = hint.trim();
            if (!trimmed) {
                return;
            }
            config.injectionService.addInjection(trimmed, 'user_steering');
            // Render hints with a distinct style.
            historyManager.addItem({
                type: 'hint',
                text: trimmed
            });
        },
        [config, historyManager]
    );

    const handleFinalSubmit = useCallback(
        async (submittedValue: string) => {
            reset();
            triggerExpandHint(null);
            if (!constrainHeight) {
                setConstrainHeight(true);
                if (!isAlternateBuffer) {
                    refreshStatic();
                }
            }

            const ctx: SubmitContext = {
                isSlash: isSlashCommand(submittedValue.trim()),
                isIdle: streamingState === StreamingState.Idle,
                isAgentRunning: streamingState === StreamingState.Responding || isToolExecuting(pendingHistoryItems),
                isMcpOrConfigReady: isConfigInitialized && isMcpReady,
                isCompressing,
                isConfigInitialized,
                config,
                submittedValue,
                slashCommands,
                handleSlashCommand,
                handleHintSubmit,
                submitQuery,
                addInput,
                addMessage,
                setPermissionConfirmationRequest,
                messageQueueLength: messageQueue.length
            };

            const slashResult = trySlashCommandWhileRunning(ctx);
            if (slashResult) { addInput(submittedValue); return; }

            const hintResult = tryHintWhileRunning(ctx);
            if (hintResult) { return; }

            const submitResult = await trySubmitWithPermissions(ctx);
            if (submitResult === 'handled') { addInput(submittedValue); return; }
            if (submitResult === 'pending') { addInput(submittedValue); return; }

            handleQueuedSubmit(ctx);
            addInput(submittedValue);
        },
        [
            addMessage,
            addInput,
            submitQuery,
            handleSlashCommand,
            slashCommands,
            isMcpReady,
            streamingState,
            isCompressing,
            messageQueue.length,
            pendingHistoryItems,
            config,
            constrainHeight,
            setConstrainHeight,
            isAlternateBuffer,
            refreshStatic,
            reset,
            handleHintSubmit,
            isConfigInitialized,
            triggerExpandHint
        ]
    );

    const handleClearScreen = useCallback(() => {
        reset();
        // Explicitly hide the expansion hint and clear its x-second timer when clearing the screen.
        triggerExpandHint(null);
        historyManager.clearItems();
        clearErrorCount();
        refreshStatic();
    }, [
        historyManager,
        clearErrorCount,
        refreshStatic,
        reset,
        triggerExpandHint
    ]);

    const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);

    /**
   * Determines if the input prompt should be active and accept user input.
   * Input is disabled during:
   * - Initialization errors
   * - Slash command processing
   * - Tool confirmations (WaitingForConfirmation state)
   * - Any future streaming states not explicitly allowed
   */
    const isInputActive =
    !initError &&
    !isProcessing &&
    !isResuming &&
    (streamingState === StreamingState.Idle ||
      streamingState === StreamingState.Responding ||
      streamingState === StreamingState.WaitingForConfirmation) &&
    !proQuotaRequest;

    const observerRef = useRef<ResizeObserver | null>(null);

    useEffect(
        () => () => {
            observerRef.current?.disconnect();
        },
        []
    );

    const [controlsHeight, setControlsHeight] = useState(0);
    const [lastNonCopyControlsHeight, setLastNonCopyControlsHeight] = useState(0);

    useLayoutEffect(() => {
        if (!copyModeEnabled && controlsHeight > 0) {
            setLastNonCopyControlsHeight(controlsHeight);
        }
    }, [copyModeEnabled, controlsHeight]);

    const stableControlsHeight =
    copyModeEnabled && lastNonCopyControlsHeight > 0
        ? lastNonCopyControlsHeight
        : controlsHeight;

    const mainControlsRef = useCallback((node: DOMElement | null) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        if (node) {
            const observer = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (entry) {
                    const roundedHeight = Math.round(entry.contentRect.height);
                    setControlsHeight((prev) =>
                        roundedHeight !== prev ? roundedHeight : prev
                    );
                }
            });
            observer.observe(node);
            observerRef.current = observer;
        }
    }, []);

    // Compute available terminal height based on stable controls measurement
    const availableTerminalHeight = Math.max(
        0,
        terminalHeight - stableControlsHeight - backgroundTaskHeight - 1
    );

    config.setShellExecutionConfig({
        terminalWidth: Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
        terminalHeight: Math.max(
            Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING),
            1
        ),
        pager: settings.merged.tools.shell.pager,
        showColor: settings.merged.tools.shell.showColor,
        sanitizationConfig: config.sanitizationConfig,
        sandboxManager: config.sandboxManager
    });

    const { isFocused, hasReceivedFocusEvent } = useFocus();

    // Context file names computation
    const contextFileNames = useMemo(() => {
        const fromSettings = settings.merged.context.fileName;
        return fromSettings
            ? Array.isArray(fromSettings)
                ? fromSettings
                : [fromSettings]
            : getAllHiveMdFilenames();
    }, [settings.merged.context.fileName]);
    // Initial prompt handling
    const initialPrompt = useMemo(() => config.getQuestion(), [config]);
    const initialPromptSubmitted = useRef(false);
    const geminiClient = config.getGeminiClient();

    useEffect(() => {
        if (
            initialPrompt &&
      isConfigInitialized &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !showPrivacyNotice &&
      geminiClient?.isInitialized?.()
        ) {
            void handleFinalSubmit(initialPrompt);
            initialPromptSubmitted.current = true;
        }
    }, [
        initialPrompt,
        isConfigInitialized,
        handleFinalSubmit,
        isAuthenticating,
        isAuthDialogOpen,
        isThemeDialogOpen,
        isEditorDialogOpen,
        showPrivacyNotice,
        geminiClient
    ]);

    const [idePromptAnswered, setIdePromptAnswered] = useState(false);
    const [currentIDE, setCurrentIDE] = useState<IdeInfo | null>(null);

    useEffect(() => {
        const getIde = async () => {
            const ideClient = await IdeClient.getInstance();
            const currentIde = ideClient.getCurrentIde();
            setCurrentIDE(currentIde || null);
        };

        getIde();
    }, []);
    const shouldShowIdePrompt = Boolean(
        currentIDE &&
      !config.getIdeMode() &&
      !settings.merged.ide.hasSeenNudge &&
      !idePromptAnswered
    );

    const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
    const [showFullTodos, setShowFullTodos] = useState<boolean>(false);
    const [renderMarkdown, setRenderMarkdown] = useState<boolean>(true);

    const handleExitRepeat = useCallback(
        (count: number) => {
            if (count > 2) {
                recordExitFail(config);
            }
            if (count > 1) {
                void handleSlashCommand('/quit', undefined, undefined, false);
            }
        },
        [config, handleSlashCommand]
    );

    const { pressCount: ctrlCPressCount, handlePress: handleCtrlCPress } =
    useRepeatedKeyPress({
        windowMs: WARNING_PROMPT_DURATION_MS,
        onRepeat: handleExitRepeat
    });

    const { pressCount: ctrlDPressCount, handlePress: handleCtrlDPress } =
    useRepeatedKeyPress({
        windowMs: WARNING_PROMPT_DURATION_MS,
        onRepeat: handleExitRepeat
    });

    const [ideContextState, setIdeContextState] = useState<
    IdeContext | undefined
  >();
    const [showEscapePrompt, setShowEscapePrompt] = useState(false);
    const [showIdeRestartPrompt, setShowIdeRestartPrompt] = useState(false);

    const [transientMessage, showTransientMessage] = useTimedMessage<{
    text: string;
    type: TransientMessageType;
  }>(WARNING_PROMPT_DURATION_MS);

    const isFolderTrustDialogOpen = false;
    const folderDiscoveryResults = null;
    const handleFolderTrustSelect = useCallback(() => {}, []);
    const isRestarting = false;

    const policyUpdateConfirmationRequest =
    config.getPolicyUpdateConfirmationRequest() as any;
    const [isPolicyUpdateDialogOpen, setIsPolicyUpdateDialogOpen] = useState(
        !!policyUpdateConfirmationRequest
    );
    const ideNeedsRestart = false;
    const ideTrustRestartReason = undefined;

    const tabFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleTransientMessage = (payload: {
      message: string;
      type: TransientMessageType;
    }) => {
            showTransientMessage({ text: payload.message, type: payload.type });
        };

        const handleSelectionWarning = () => {
            showTransientMessage({
                text: 'Press Ctrl-S to enter selection mode to copy text.',
                type: TransientMessageType.Warning
            });
        };
        const handlePasteTimeout = () => {
            showTransientMessage({
                text: 'Paste Timed out. Possibly due to slow connection.',
                type: TransientMessageType.Warning
            });
        };

        appEvents.on(AppEvent.TransientMessage, handleTransientMessage);
        appEvents.on(AppEvent.SelectionWarning, handleSelectionWarning);
        appEvents.on(AppEvent.PasteTimeout, handlePasteTimeout);

        return () => {
            appEvents.off(AppEvent.TransientMessage, handleTransientMessage);
            appEvents.off(AppEvent.SelectionWarning, handleSelectionWarning);
            appEvents.off(AppEvent.PasteTimeout, handlePasteTimeout);
            if (tabFocusTimeoutRef.current) {
                clearTimeout(tabFocusTimeoutRef.current);
            }
        };
    }, [showTransientMessage]);

    const handleWarning = useCallback(
        (message: string) => {
            showTransientMessage({
                text: message,
                type: TransientMessageType.Warning
            });
        },
        [showTransientMessage]
    );

    const { handleSuspend } = useSuspend({
        handleWarning,
        setRawMode,
        shouldUseAlternateScreen
    });

    useEffect(() => {
        if (ideNeedsRestart) {
            // IDE trust changed, force a restart.
            setShowIdeRestartPrompt(true);
        }
    }, [ideNeedsRestart]);

    useEffect(() => {
        const unsubscribe = ideContextStore.subscribe(setIdeContextState);
        setIdeContextState(ideContextStore.get());
        return unsubscribe;
    }, []);

    useEffect(() => {
        const openDebugConsole = () => {
            setShowErrorDetails(true);
            setConstrainHeight(false);
        };
        appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);

        return () => {
            appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
        };
    }, [config]);

    const handleEscapePromptChange = useCallback((showPrompt: boolean) => {
        setShowEscapePrompt(showPrompt);
    }, []);

    const handleIdePromptComplete = useCallback(
        (result: IdeIntegrationNudgeResult) => {
            if (result.userSelection === 'yes') {

                handleSlashCommand('/ide install');
                settings.setValue(SettingScope.User, 'ide.hasSeenNudge', true);
            } else if (result.userSelection === 'dismiss') {
                settings.setValue(SettingScope.User, 'ide.hasSeenNudge', true);
            }
            setIdePromptAnswered(true);
        },
        [handleSlashCommand, settings]
    );

    const handleGlobalKeypress = useCallback(
        (key: Key): boolean => {
            const ctx: GlobalKeypressContext = {
                debugKeystrokeLogging: settings.merged.general.debugKeystrokeLogging,
                devtoolsEnabled: settings.merged.general.devtools,
                shortcutsHelpVisible,
                mouseMode,
                constrainHeight,
                isAlternateBuffer,
                embeddedShellFocused,
                isBackgroundTaskVisible,
                activePtyId,
                ideContextState,
                showErrorDetails,
                bufferRef,
                recordingFilenameRef,
                lastOutputTimeRef,
                tabFocusTimeoutRef,
                backgroundTasks,
                setShortcutsHelpVisible,
                setMouseMode,
                setConstrainHeight,
                setCopyModeEnabled,
                setShowErrorDetails,
                setShowFullTodos,
                setRenderMarkdown,
                setEmbeddedShellFocused,
                setIsBackgroundTaskListOpen,
                handleCtrlCPress,
                handleCtrlDPress,
                handleSuspend,
                handleSlashCommand,
                cancelOngoingRequest,
                backgroundCurrentExecution,
                toggleBackgroundTasks,
                refreshStatic,
                showTransientMessage,
                triggerExpandHint,
                toggleAllExpansion,
                dumpCurrentFrame,
                startRecording,
                stopRecording,
                keyMatchers,
                isHelpDismissKey,
                history: historyManager.history,
                pendingHistoryItems,
                TransientMessageType,
                config
            };
            const handlers = [
                handleDebugAndHelpKeys,
                handleMouseAndCopyKeys,
                handleAppControlKeys,
                handleDisplayKeys,
                handleShellFocusKeys
            ];
            for (const handler of handlers) {
                const result = handler(ctx, key);
                if (result !== null) return result;
            }
            return false;
        },
        [
            constrainHeight,
            setConstrainHeight,
            setShowErrorDetails,
            config,
            ideContextState,
            handleCtrlCPress,
            handleCtrlDPress,
            handleSlashCommand,
            cancelOngoingRequest,
            activePtyId,
            handleSuspend,
            embeddedShellFocused,
            settings.merged.general.debugKeystrokeLogging,
            refreshStatic,
            setCopyModeEnabled,
            tabFocusTimeoutRef,
            isAlternateBuffer,
            shortcutsHelpVisible,
            backgroundCurrentExecution,
            toggleBackgroundTasks,
            backgroundTasks,
            isBackgroundTaskVisible,
            setIsBackgroundTaskListOpen,
            lastOutputTimeRef,
            showTransientMessage,
            settings.merged.general.devtools,
            showErrorDetails,
            triggerExpandHint,
            keyMatchers,
            isHelpDismissKey,
            historyManager.history,
            pendingHistoryItems,
            toggleAllExpansion,
            dumpCurrentFrame,
            startRecording,
            stopRecording,
            mouseMode
        ]
    );


    useKeypress(handleGlobalKeypress, { isActive: true, priority: true });

    useKeypress(
        (key: Key) => {
            if (
                keyMatchers[Command.SCROLL_UP](key) ||
        keyMatchers[Command.SCROLL_DOWN](key) ||
        keyMatchers[Command.PAGE_UP](key) ||
        keyMatchers[Command.PAGE_DOWN](key) ||
        keyMatchers[Command.SCROLL_HOME](key) ||
        keyMatchers[Command.SCROLL_END](key)
            ) {
                return false;
            }

            setCopyModeEnabled(false);
            if (mouseMode) {
                enableMouseEvents();
            }
            return true;
        },
        {
            isActive: copyModeEnabled,
            // We need to receive keypresses first so they do not bubble to other
            // handlers.
            priority: KeypressPriority.Critical
        }
    );

    useEffect(() => {
    // Respect hideWindowTitle settings
        if (settings.merged.ui.hideWindowTitle) return;

        const paddedTitle = computeTerminalTitle({
            streamingState,
            thoughtSubject: thought?.subject,
            isConfirming:
        !!commandConfirmationRequest || shouldShowActionRequiredTitle,
            isSilentWorking: shouldShowSilentWorkingTitle,
            folderName: basename(config.getTargetDir()),
            showThoughts: !!settings.merged.ui.showStatusInTitle,
            useDynamicTitle: settings.merged.ui.dynamicWindowTitle
        });

        // Only update the title if it's different from the last value we set
        if (lastTitleRef.current !== paddedTitle) {
            lastTitleRef.current = paddedTitle;
            stdout.write(`\x1b]0;${paddedTitle}\x07`);
        }
    // Note: We don't need to reset the window title on exit because HIVE-MIND is already doing that elsewhere
    }, [
        streamingState,
        thought,
        commandConfirmationRequest,
        shouldShowActionRequiredTitle,
        shouldShowSilentWorkingTitle,
        settings.merged.ui.showStatusInTitle,
        settings.merged.ui.dynamicWindowTitle,
        settings.merged.ui.hideWindowTitle,
        config,
        stdout
    ]);

    useEffect(() => {
        const handleUserFeedback = (payload: UserFeedbackPayload) => {
            let type: MessageType;
            switch (payload.severity) {
                case 'error':
                    type = MessageType.ERROR;
                    break;
                case 'warning':
                    type = MessageType.WARNING;
                    break;
                case 'info':
                    type = MessageType.INFO;
                    break;
                default:
                    throw new Error(
                        `Unexpected severity for user feedback: ${payload.severity}`
                    );
            }

            historyManager.addItem(
                {
                    type,
                    text: payload.message
                },
                Date.now()
            );

            // If there is an attached error object, log it to the debug drawer.
            if (payload.error) {
                debugLogger.warn(
                    `[Feedback Details for "${payload.message}"]`,
                    payload.error
                );
            }
        };

        const handleHookSystemMessage = (payload: HookSystemMessagePayload) => {
            historyManager.addItem(
        {
            type: MessageType.INFO,
            text: payload.message,
            source: payload.hookName
        } as any,
        Date.now()
            );
        };

        coreEvents.on(CoreEvent.UserFeedback, handleUserFeedback);
        coreEvents.on(CoreEvent.HookSystemMessage, handleHookSystemMessage);

        // Flush any messages that happened during startup before this component
        // mounted.
        coreEvents.drainBacklogs();

        return () => {
            coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
            coreEvents.off(CoreEvent.HookSystemMessage, handleHookSystemMessage);
        };
    }, [historyManager]);

    const nightly = props.version.includes('nightly');

    const isAwaitingLoginRestart = authState === AuthState.AwaitingLoginRestart;
    const loginRestartMessage =
    settings.merged.security.auth.selectedType === AuthType.USE_VERTEX_AI
        ? 'Authenticating to Vertex AI in Cloud Shell requires a restart to apply project settings.'
        : undefined;

    const dialogsVisible =
    shouldShowIdePrompt ||
    isFolderTrustDialogOpen ||
    isPolicyUpdateDialogOpen ||
    adminSettingsChanged ||
    !!commandConfirmationRequest ||
    !!authConsentRequest ||
    !!permissionConfirmationRequest ||
    !!customDialog ||
    confirmUpdateExtensionRequests.length > 0 ||
    !!loopDetectionConfirmationRequest ||
    isThemeDialogOpen ||
    isSettingsDialogOpen ||
    isModelDialogOpen ||
    isVoiceModelDialogOpen ||
    isAgentConfigDialogOpen ||
    isPermissionsDialogOpen ||
    isAuthenticating ||
    isAuthDialogOpen ||
    isEditorDialogOpen ||
    showPrivacyNotice ||
    showIdeRestartPrompt ||
    !!proQuotaRequest ||
    !!validationRequest ||
    !!overageMenuRequest ||
    !!emptyWalletRequest ||
    isSessionBrowserOpen ||
    authState === AuthState.AwaitingApiKeyInput ||
    isAwaitingLoginRestart ||
    !!newAgents;

    const hasPendingToolConfirmation = useMemo(
        () => isToolAwaitingConfirmation(pendingHistoryItems),
        [pendingHistoryItems]
    );

    const hasConfirmUpdateExtensionRequests =
    confirmUpdateExtensionRequests.length > 0;
    const hasLoopDetectionConfirmationRequest =
    !!loopDetectionConfirmationRequest;

    const hasPendingActionRequired =
    hasPendingToolConfirmation ||
    !!commandConfirmationRequest ||
    !!authConsentRequest ||
    hasConfirmUpdateExtensionRequests ||
    hasLoopDetectionConfirmationRequest ||
    !!proQuotaRequest ||
    !!validationRequest ||
    !!overageMenuRequest ||
    !!emptyWalletRequest ||
    !!customDialog;

    const loadingPhrases = settings.merged.ui.loadingPhrases;
    const showStatusTips = loadingPhrases === 'tips' || loadingPhrases === 'all';
    const showStatusWit = loadingPhrases === 'witty' || loadingPhrases === 'all';

    const showLoadingIndicator =
    (!embeddedShellFocused || isBackgroundTaskVisible) &&
    streamingState === StreamingState.Responding &&
    !hasPendingActionRequired;

    let estimatedStatusLength = 0;
    if (activeHooks.length > 0 && settings.merged.hooksConfig.notifications) {
        const hookLabel =
      activeHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
        const hookNames = activeHooks
            .map(
                (h) =>
                    h.name +
          (h.index && h.total && h.total > 1 ? ` (${h.index}/${h.total})` : '')
            )
            .join(', ');
        estimatedStatusLength = hookLabel.length + hookNames.length + 10;
    } else if (showLoadingIndicator) {
        const thoughtText = thought?.subject || 'Waiting for model...';
        estimatedStatusLength = thoughtText.length + 25;
    } else if (hasPendingActionRequired) {
        estimatedStatusLength = 35;
    }

    const maxLength = terminalWidth - estimatedStatusLength - 5;

    const { elapsedTime, currentLoadingPhrase, currentTip, currentWittyPhrase } =
    useLoadingIndicator({
        streamingState,
        shouldShowFocusHint,
        retryStatus,
        showTips: showStatusTips,
        showWit: showStatusWit,
        customWittyPhrases: settings.merged.ui.customWittyPhrases,
        errorVerbosity: settings.merged.ui.errorVerbosity as 'low' | 'full',
        maxLength
    });

    const allowPlanMode =
    config.isPlanEnabled() &&
    streamingState === StreamingState.Idle &&
    !hasPendingActionRequired;

    const showApprovalModeIndicator = useApprovalModeIndicator({
        config,
        addItem: historyManager.addItem,
        onApprovalModeChange: handleApprovalModeChangeWithUiReveal,
        isActive: !embeddedShellFocused,
        allowPlanMode
    });

    useRunEventNotifications({
        notificationsEnabled,
        notificationMethod,
        isFocused,
        hasReceivedFocusEvent,
        streamingState,
        hasPendingActionRequired,
        pendingHistoryItems,
        commandConfirmationRequest,
        authConsentRequest,
        permissionConfirmationRequest,
        hasConfirmUpdateExtensionRequests,
        hasLoopDetectionConfirmationRequest
    });

    const isPassiveShortcutsHelpState =
    isInputActive &&
    streamingState === StreamingState.Idle &&
    !hasPendingActionRequired;

    useEffect(() => {
        if (shortcutsHelpVisible && !isPassiveShortcutsHelpState) {
            setShortcutsHelpVisible(false);
        }
    }, [
        shortcutsHelpVisible,
        isPassiveShortcutsHelpState,
        setShortcutsHelpVisible
    ]);

    useEffect(() => {
        if (
            !isConfigInitialized ||
      !config.isModelSteeringEnabled() ||
      streamingState !== StreamingState.Idle ||
      !isMcpReady ||
      isToolAwaitingConfirmation(pendingHistoryItems)
        ) {
            return;
        }

        const pendingHint = consumePendingHints();
        if (!pendingHint) {
            return;
        }

        void submitQuery([{ text: buildUserSteeringHintPrompt(pendingHint) }]);
    }, [
        config,
        historyManager,
        isConfigInitialized,
        isMcpReady,
        streamingState,
        submitQuery,
        consumePendingHints,
        pendingHistoryItems,
        pendingHintCount
    ]);

    const allToolCalls = useMemo(
        () => getAllToolCalls(pendingHistoryItems),
        [pendingHistoryItems]
    );

    const [hiveMdFileCount, setHiveMdFileCount] = useState<number>(
        config.getHiveMdFileCount()
    );
    useEffect(() => {
        const handleMemoryChanged = (result: MemoryChangedPayload) => {
            setHiveMdFileCount(result.fileCount);
        };
        coreEvents.on(CoreEvent.MemoryChanged, handleMemoryChanged);
        return () => {
            coreEvents.off(CoreEvent.MemoryChanged, handleMemoryChanged);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const fetchBannerTexts = async () => {
            const [defaultBanner, warningBanner] = await Promise.all([
                config.getBannerTextNoCapacityIssues(),
                config.getBannerTextCapacityIssues()
            ]);

            if (isMounted) {
                setDefaultBannerText(defaultBanner);
                setWarningBannerText(warningBanner);
                setBannerVisible(true);
            }
        };

        fetchBannerTexts();

        return () => {
            isMounted = false;
        };
    }, [config, refreshStatic]);

    const inputState = useMemo(
        () => ({
            buffer,
            userMessages: inputHistory,
            shellModeActive,
            showEscapePrompt,
            copyModeEnabled,
            inputWidth,
            suggestionsWidth
        }),
        [
            buffer,
            inputHistory,
            shellModeActive,
            showEscapePrompt,
            copyModeEnabled,
            inputWidth,
            suggestionsWidth
        ]
    );

    const quotaState = useMemo(
        () => ({
            userTier,
            stats: quotaStats,
            proQuotaRequest,
            validationRequest,
            // G1 AI Credits dialog state
            overageMenuRequest,
            emptyWalletRequest
        }),
        [
            userTier,
            quotaStats,
            proQuotaRequest,
            validationRequest,
            overageMenuRequest,
            emptyWalletRequest
        ]
    );

    const uiState: UIState = useMemo(
        () => ({
            history: historyManager.history,
            historyManager,
            isThemeDialogOpen,

            themeError,
            isAuthenticating,
            isConfigInitialized,
            authError,
            accountSuspensionInfo,
            isAuthDialogOpen,
            isAwaitingApiKeyInput: authState === AuthState.AwaitingApiKeyInput,
            isAwaitingLoginRestart,
            loginRestartMessage,
            apiKeyDefaultValue,
            editorError,
            isEditorDialogOpen,
            showPrivacyNotice,
            mouseMode,
            corgiMode,
            debugMessage,
            quittingMessages,
            isSettingsDialogOpen,
            isSessionBrowserOpen,
            isModelDialogOpen,
            isVoiceModelDialogOpen,
            isAgentConfigDialogOpen,
            selectedAgentName,
            selectedAgentDisplayName,
            selectedAgentDefinition,
            isPermissionsDialogOpen,
            permissionsDialogProps,
            slashCommands,
            pendingSlashCommandHistoryItems,
            commandContext,
            commandConfirmationRequest,
            authConsentRequest,
            confirmUpdateExtensionRequests,
            loopDetectionConfirmationRequest,
            permissionConfirmationRequest,
            hiveMdFileCount,
            streamingState,
            initError,
            pendingAssistantHistoryItems: pendingAssistantHistoryItems,
            thought,
            isInputActive,
            isVoiceModeEnabled,
            isResuming,
            shouldShowIdePrompt,
            isFolderTrustDialogOpen: isFolderTrustDialogOpen ?? false,
            folderDiscoveryResults,
            isPolicyUpdateDialogOpen,
            policyUpdateConfirmationRequest,
            isTrustedFolder,
            constrainHeight,
            showErrorDetails,
            showFullTodos,
            ideContextState,
            renderMarkdown,
            ctrlCPressedOnce: ctrlCPressCount >= 1,
            ctrlDPressedOnce: ctrlDPressCount >= 1,
            shortcutsHelpVisible,
            cleanUiDetailsVisible,
            isFocused,
            elapsedTime,
            currentLoadingPhrase,
            currentTip,
            currentWittyPhrase,
            historyRemountKey,
            activeHooks,
            messageQueue,
            queueErrorMessage,
            showApprovalModeIndicator,
            allowPlanMode,
            currentModel,
            contextFileNames,
            errorCount,
            availableTerminalHeight,
            stableControlsHeight,
            mainAreaWidth,
            staticAreaMaxItemHeight,
            staticExtraHeight,
            dialogsVisible,
            pendingHistoryItems,
            nightly,
            branchName,
            sessionStats,
            terminalWidth,
            terminalHeight,
            mainControlsRef,
            rootUiRef,
            currentIDE,
            updateInfo,
            showIdeRestartPrompt,
            ideTrustRestartReason,
            isRestarting,
            extensionsUpdateState,
            activePtyId,
            backgroundTaskCount,
            isBackgroundTaskVisible,
            embeddedShellFocused,
            showDebugProfiler,
            customDialog,
            transientMessage,
            bannerData,
            bannerVisible,
            terminalBackgroundColor: config.getTerminalBackground(),
            settingsNonce,
            backgroundTasks,
            activeBackgroundTaskPid,
            backgroundTaskHeight,
            isBackgroundTaskListOpen,
            adminSettingsChanged,
            newAgents,
            showIsExpandableHint,
            hintMode:
        config.isModelSteeringEnabled() && isToolExecuting(pendingHistoryItems),
            hintBuffer: ''
        }),
        [
            isThemeDialogOpen,

            themeError,
            isAuthenticating,
            isConfigInitialized,
            authError,
            accountSuspensionInfo,
            isAuthDialogOpen,
            editorError,
            isEditorDialogOpen,
            showPrivacyNotice,
            mouseMode,
            corgiMode,
            debugMessage,
            quittingMessages,
            isSettingsDialogOpen,
            isSessionBrowserOpen,
            isModelDialogOpen,
            isVoiceModelDialogOpen,
            isAgentConfigDialogOpen,
            selectedAgentName,
            selectedAgentDisplayName,
            selectedAgentDefinition,
            isPermissionsDialogOpen,
            permissionsDialogProps,
            slashCommands,
            pendingSlashCommandHistoryItems,
            commandContext,
            commandConfirmationRequest,
            authConsentRequest,
            confirmUpdateExtensionRequests,
            loopDetectionConfirmationRequest,
            permissionConfirmationRequest,
            hiveMdFileCount,
            streamingState,
            initError,
            pendingAssistantHistoryItems,
            thought,
            isInputActive,
            isVoiceModeEnabled,
            isResuming,
            shouldShowIdePrompt,
            isFolderTrustDialogOpen,
            folderDiscoveryResults,
            isPolicyUpdateDialogOpen,
            policyUpdateConfirmationRequest,
            isTrustedFolder,
            constrainHeight,
            showErrorDetails,
            showFullTodos,
            ideContextState,
            renderMarkdown,
            ctrlCPressCount,
            ctrlDPressCount,
            shortcutsHelpVisible,
            cleanUiDetailsVisible,
            isFocused,
            elapsedTime,
            currentLoadingPhrase,
            currentTip,
            currentWittyPhrase,
            historyRemountKey,
            activeHooks,
            messageQueue,
            queueErrorMessage,
            showApprovalModeIndicator,
            allowPlanMode,
            contextFileNames,
            errorCount,
            availableTerminalHeight,
            stableControlsHeight,
            mainAreaWidth,
            staticAreaMaxItemHeight,
            staticExtraHeight,
            dialogsVisible,
            pendingHistoryItems,
            nightly,
            branchName,
            sessionStats,
            terminalWidth,
            terminalHeight,
            mainControlsRef,
            rootUiRef,
            currentIDE,
            updateInfo,
            showIdeRestartPrompt,
            ideTrustRestartReason,
            isRestarting,
            currentModel,
            extensionsUpdateState,
            activePtyId,
            backgroundTaskCount,
            isBackgroundTaskVisible,
            historyManager,
            embeddedShellFocused,
            showDebugProfiler,
            customDialog,
            apiKeyDefaultValue,
            authState,
            isAwaitingLoginRestart,
            loginRestartMessage,
            transientMessage,
            bannerData,
            bannerVisible,
            config,
            settingsNonce,
            backgroundTaskHeight,
            isBackgroundTaskListOpen,
            activeBackgroundTaskPid,
            backgroundTasks,
            adminSettingsChanged,
            newAgents,
            showIsExpandableHint
        ]
    );

    const exitPrivacyNotice = useCallback(
        () => setShowPrivacyNotice(false),
        [setShowPrivacyNotice]
    );

    const uiActions: UIActions = useMemo(
        () => ({
            handleThemeSelect,
            closeThemeDialog,
            handleThemeHighlight,
            handleAuthSelect,
            setAuthState,
            onAuthError,
            handleEditorSelect,
            exitEditorDialog,
            exitPrivacyNotice,
            closeSettingsDialog,
            closeModelDialog,
            openVoiceModelDialog,
            closeVoiceModelDialog,
            openAgentConfigDialog,
            closeAgentConfigDialog,
            openPermissionsDialog,
            closePermissionsDialog,
            setShellModeActive,
            vimHandleInput,
            handleIdePromptComplete,
            handleFolderTrustSelect,
            setIsPolicyUpdateDialogOpen,
            setConstrainHeight,
            onEscapePromptChange: handleEscapePromptChange,
            refreshStatic,
            handleFinalSubmit,
            handleClearScreen,
            handleProQuotaChoice,
            handleValidationChoice,
            // G1 AI Credits handlers
            handleOverageMenuChoice,
            handleEmptyWalletChoice,
            openSessionBrowser,
            closeSessionBrowser,
            handleResumeSession,
            handleDeleteSession,
            setQueueErrorMessage,
            addMessage,
            popAllMessages,
            handleApiKeySubmit,
            handleApiKeyCancel,
            setBannerVisible,
            setShortcutsHelpVisible,
            setCleanUiDetailsVisible,
            toggleCleanUiDetailsVisible,
            revealCleanUiDetailsTemporarily,
            handleWarning,
            setEmbeddedShellFocused,
            dismissBackgroundTask,
            setActiveBackgroundTaskPid,
            setIsBackgroundTaskListOpen,
            setAuthContext,
            dismissLoginRestart: () => {
                setAuthContext({});
                setAuthState(AuthState.Updating);
            },
            onHintInput: () => {},
            onHintBackspace: () => {},
            onHintClear: () => {},
            onHintSubmit: () => {},
            handleRestart: async () => {
                if (process.send) {
                    const remoteSettings = config.getRemoteAdminSettings();
                    if (remoteSettings) {
                        process.send({
                            type: 'admin-settings-update',
                            settings: remoteSettings
                        });
                    }
                }
                await relaunchApp();
            },
            handleNewAgentsSelect: async (choice: NewAgentsChoice) => {
                if (newAgents && choice === NewAgentsChoice.ACKNOWLEDGE) {
                    const registry = config.getAgentRegistry();
                    try {
                        await Promise.all(
                            newAgents.map((agent) => registry.acknowledgeAgent(agent))
                        );
                    } catch (error) {
                        debugLogger.error('Failed to acknowledge agents:', error);
                        historyManager.addItem(
                            {
                                type: MessageType.ERROR,
                                text: `Failed to acknowledge agents: ${getErrorMessage(error)}`
                            },
                            Date.now()
                        );
                    }
                }
                setNewAgents(null);
            },
            getPreferredEditor,
            clearAccountSuspension: () => {
                setAccountSuspensionInfo(null);
                setAuthState(AuthState.Updating);
            },
            setVoiceModeEnabled: (value: boolean) => {
                setVoiceModeEnabled(value);
            }
        }) as any,
        [
            handleThemeSelect,
            closeThemeDialog,
            handleThemeHighlight,
            handleAuthSelect,
            setAuthState,
            onAuthError,
            handleEditorSelect,
            exitEditorDialog,
            exitPrivacyNotice,
            closeSettingsDialog,
            closeModelDialog,
            openVoiceModelDialog,
            closeVoiceModelDialog,
            openAgentConfigDialog,
            closeAgentConfigDialog,
            openPermissionsDialog,
            closePermissionsDialog,
            setShellModeActive,
            vimHandleInput,
            handleIdePromptComplete,
            handleFolderTrustSelect,
            setIsPolicyUpdateDialogOpen,
            setConstrainHeight,
            handleEscapePromptChange,
            refreshStatic,
            handleFinalSubmit,
            handleClearScreen,
            handleProQuotaChoice,
            handleValidationChoice,
            handleOverageMenuChoice,
            handleEmptyWalletChoice,
            openSessionBrowser,
            closeSessionBrowser,
            handleResumeSession,
            handleDeleteSession,
            setQueueErrorMessage,
            addMessage,
            popAllMessages,
            handleApiKeySubmit,
            handleApiKeyCancel,
            setBannerVisible,
            setShortcutsHelpVisible,
            setCleanUiDetailsVisible,
            toggleCleanUiDetailsVisible,
            revealCleanUiDetailsTemporarily,
            handleWarning,
            setEmbeddedShellFocused,
            dismissBackgroundTask,
            setActiveBackgroundTaskPid,
            setIsBackgroundTaskListOpen,
            setAuthContext,
            setAccountSuspensionInfo,
            newAgents,
            config,
            historyManager,
            getPreferredEditor,
            setVoiceModeEnabled
        ]
    );

    return (
        <UIStateContext.Provider value={uiState}>
            <QuotaContext.Provider value={quotaState}>
                <InputContext.Provider value={inputState}>
                    <UIActionsContext.Provider value={uiActions}>
                        <ConfigContext.Provider value={config}>
                            <AppContext.Provider
                                value={{
                                    version: props.version,
                                    startupWarnings: props.startupWarnings || []
                                }}
                            >
                                <ToolActionsProvider
                                    config={config}
                                    toolCalls={allToolCalls}
                                    isExpanded={isExpanded}
                                    toggleExpansion={toggleExpansion}
                                    toggleAllExpansion={toggleAllExpansion}
                                >
                                    <ShellFocusContext.Provider value={isFocused}>
                                        <MouseProvider mouseEventsEnabled={mouseMode}>
                                            <ScrollProvider>
                                                <App />
                                            </ScrollProvider>
                                        </MouseProvider>
                                    </ShellFocusContext.Provider>
                                </ToolActionsProvider>
                            </AppContext.Provider>
                        </ConfigContext.Provider>
                    </UIActionsContext.Provider>
                </InputContext.Provider>
            </QuotaContext.Provider>
        </UIStateContext.Provider>
    );
};
