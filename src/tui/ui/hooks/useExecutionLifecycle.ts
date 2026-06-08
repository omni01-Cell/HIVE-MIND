/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
    HistoryItemWithoutId,
    IndividualToolCallDisplay
} from '../types.js';
import { useCallback, useReducer, useRef, useEffect } from 'react';
import { type PartListUnion } from '@google/genai';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import { formatBytes } from '../utils/formatters.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { themeManager } from '../../ui/themes/theme-manager.js';
import {
    shellReducer,
    initialState,
    type BackgroundTask
} from './shellReducer.js';
export { type BackgroundTask };

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const RESTORE_VISIBILITY_DELAY_MS = 300;
const MAX_OUTPUT_LENGTH = 10000;

function addShellCommandToGeminiHistory(
    geminiClient: GeminiClient,
    rawQuery: string,
    resultText: string
) {
    const modelContent =
    resultText.length > MAX_OUTPUT_LENGTH
        ? resultText.substring(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
        : resultText;

    // Escape backticks to prevent prompt injection breakouts
    const safeQuery = rawQuery.replace(/\\/g, '\\\\').replace(/\x60/g, '\\\x60');
    const safeModelContent = modelContent
        .replace(/\\/g, '\\\\')
        .replace(/\x60/g, '\\\x60');


    geminiClient.addHistory({
        role: 'user',
        parts: [
            {
                text: `I ran the following shell command:\n\`\`\`sh\n${safeQuery}\n\`\`\`\n\nThis produced the following result:\n\`\`\`\n${safeModelContent}\n\`\`\``
            }
        ]
    });
}

type ManagerRef = {
    wasVisibleBeforeForeground: boolean;
    restoreTimeout: NodeJS.Timeout | null;
    backgroundedPids: Set<number>;
    subscriptions: Map<number, () => void>;
};

function wrapCommandForPwd(rawQuery: string): { commandToExecute: string; pwdFilePath: string } {
    let command = rawQuery.trim();
    if (command.endsWith('\\')) {
        command += ' ';
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-shell-'));
    const pwdFilePath = path.join(tmpDir, 'pwd.tmp');
    const escapedPwdFilePath = escapeShellArg(pwdFilePath, 'bash');
    const commandToExecute = `{\n${command}\n}\n__code=$?; pwd > ${escapedPwdFilePath}; exit $__code`;
    return { commandToExecute, pwdFilePath };
}

interface ShellEventState {
    cumulativeStdout: string | AnsiOutput;
    isBinaryStream: boolean;
    binaryBytesReceived: number;
    executionPid: number | undefined;
    callId: string;
    m: ManagerRef;
    dispatch: React.Dispatch<ShellAction>;
    setPendingHistoryItem: React.Dispatch<React.SetStateAction<HistoryItemWithoutId | null>>;
}

function createShellEventHandler(state: ShellEventState) {
    return (event: ShellOutputEvent) => {
        let shouldUpdate = false;

        switch (event.type) {
            case 'data':
                if (state.isBinaryStream) break;
                if (typeof event.chunk === 'string') {
                    if (typeof state.cumulativeStdout === 'string') {
                        state.cumulativeStdout += event.chunk;
                    } else {
                        state.cumulativeStdout = event.chunk;
                    }
                } else {
                    state.cumulativeStdout = event.chunk;
                }
                shouldUpdate = true;
                break;
            case 'binary_detected':
                state.isBinaryStream = true;
                shouldUpdate = true;
                break;
            case 'binary_progress':
                state.isBinaryStream = true;
                state.binaryBytesReceived = event.bytesReceived;
                shouldUpdate = true;
                break;
            case 'exit':
                break;
            default:
                throw new Error('An unhandled ShellOutputEvent was found.');
        }

        if (state.executionPid && state.m.backgroundedPids.has(state.executionPid)) {
            state.dispatch({
                type: 'APPEND_TASK_OUTPUT',
                pid: state.executionPid,
                chunk: event.type === 'data' ? event.chunk : state.cumulativeStdout
            });
            return;
        }

        let currentDisplayOutput: string | AnsiOutput;
        if (state.isBinaryStream) {
            currentDisplayOutput =
                state.binaryBytesReceived > 0
                    ? `[Receiving binary output... ${formatBytes(state.binaryBytesReceived)} received]`
                    : '[Binary output detected. Halting stream...]';
        } else {
            currentDisplayOutput = state.cumulativeStdout;
        }

        if (shouldUpdate) {
            state.dispatch({ type: 'SET_OUTPUT_TIME', time: Date.now() });
            state.setPendingHistoryItem((prevItem) => {
                if (prevItem?.type === 'tool_group') {
                    return {
                        ...prevItem,
                        tools: prevItem.tools.map((tool) =>
                            tool.callId === state.callId
                                ? { ...tool, resultDisplay: currentDisplayOutput }
                                : tool
                        )
                    };
                }
                return prevItem;
            });
        }
    };
}

function prependToAnsiOutput(output: AnsiOutput, text: string): AnsiOutput {
    const newLines: AnsiOutput = text.split('\n').map((line) => [
        { text: line, fg: '', bg: '', dim: false, bold: false, italic: false, underline: false, inverse: false, isUninitialized: false }
    ]);
    return [...newLines, [], ...output];
}

function computeFinalShellOutput(
    result: { output: string; rawOutput: unknown; ansiOutput?: AnsiOutput; error?: Error; aborted?: boolean; backgrounded?: boolean; pid?: number; signal?: string; exitCode?: number },
    mainContent: string
): { finalOutput: string | AnsiOutput; finalStatus: CoreToolCallStatus; mainContent: string } {
    let finalOutput: string | AnsiOutput =
        result.ansiOutput && result.ansiOutput.length > 0 ? result.ansiOutput : mainContent;
    let finalStatus = CoreToolCallStatus.Success;
    let prefix = '';
    let outputMainContent = mainContent;

    if (result.error) {
        finalStatus = CoreToolCallStatus.Error;
        prefix = result.error.message;
    } else if (result.aborted) {
        finalStatus = CoreToolCallStatus.Cancelled;
        prefix = 'Command was cancelled.';
    } else if (result.backgrounded) {
        finalStatus = CoreToolCallStatus.Success;
        finalOutput = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
        outputMainContent = finalOutput;
    } else if (result.signal) {
        finalStatus = CoreToolCallStatus.Error;
        prefix = `Command terminated by signal: ${result.signal}.`;
    } else if (result.exitCode !== 0) {
        finalStatus = CoreToolCallStatus.Error;
        prefix = `Command exited with code ${result.exitCode}.`;
    }

    if (prefix) {
        finalOutput = typeof finalOutput === 'string'
            ? `${prefix}\n${finalOutput}`
            : prependToAnsiOutput(finalOutput, prefix);
        outputMainContent = `${prefix}\n${outputMainContent}`;
    }

    return { finalOutput, finalStatus, mainContent: outputMainContent };
}

function finalizeShellResult(
    result: { backgrounded?: boolean; pid?: number },
    eventState: ShellEventState,
    rawQuery: string,
    mainContent: string,
    finalOutput: string | AnsiOutput,
    finalStatus: CoreToolCallStatus,
    initialToolDisplay: IndividualToolCallDisplay,
    userMessageTimestamp: number,
    config: Config,
    geminiClient: GeminiClient,
    addItemToHistory: UseHistoryManagerReturn['addItem'],
    registerBackgroundTask: (pid: number, command: string, initialOutput: string | AnsiOutput, completionBehavior?: CompletionBehavior) => void,
    dispatch: React.Dispatch<ShellAction>,
    pwdFilePath: string | undefined
): void {
    if (result.backgrounded && result.pid) {
        registerBackgroundTask(result.pid, rawQuery, eventState.cumulativeStdout, 'notify');
        dispatch({ type: 'SET_ACTIVE_PTY', pid: null });
    }

    let outputMainContent = mainContent;
    let outputFinalOutput = finalOutput;

    if (pwdFilePath && fs.existsSync(pwdFilePath)) {
        const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
        if (finalPwd && config.getTargetDir()) {
            const warning = `WARNING: shell mode is stateless; the directory change to '${finalPwd}' will not persist.`;
            outputFinalOutput = typeof finalOutput === 'string'
                ? `${warning}\n\n${finalOutput}`
                : prependToAnsiOutput(finalOutput, warning);
            outputMainContent = `${warning}\n\n${mainContent}`;
        }
    }

    const finalToolDisplay: IndividualToolCallDisplay = {
        ...initialToolDisplay,
        status: finalStatus,
        resultDisplay: outputFinalOutput
    };

    if (finalStatus !== CoreToolCallStatus.Cancelled) {
        addItemToHistory({ type: 'tool_group', tools: [finalToolDisplay] } as HistoryItemWithoutId, userMessageTimestamp);
    }

    addShellCommandToGeminiHistory(geminiClient, rawQuery, outputMainContent);
}

interface ShellCommandParams {
    rawQuery: string;
    callId: string;
    userMessageTimestamp: number;
    isWindows: boolean;
    targetDir: string;
    config: Config;
    terminalWidth: number | undefined;
    terminalHeight: number | undefined;
    onDebugMessage: (msg: string) => void;
    addItemToHistory: UseHistoryManagerReturn['addItem'];
    setPendingHistoryItem: React.Dispatch<React.SetStateAction<HistoryItemWithoutId | null>>;
    onExec: (command: Promise<void>) => void;
    geminiClient: GeminiClient;
    setShellInputFocused: (value: boolean) => void;
    registerBackgroundTask: (pid: number, command: string, initialOutput: string | AnsiOutput, completionBehavior?: CompletionBehavior) => void;
    m: ManagerRef;
    dispatch: React.Dispatch<ShellAction>;
    abortSignal: AbortSignal;
}

function registerTaskSubscriptions(
    pid: number,
    completionBehavior: CompletionBehavior | undefined,
    m: ManagerRef,
    dispatch: React.Dispatch<ShellAction>
): void {
    const exitUnsubscribe = ExecutionLifecycleService.onExit(pid, (code) => {
        dispatch({ type: 'UPDATE_TASK', pid, update: { status: 'exited', exitCode: code } });
        if (completionBehavior !== 'silent') {
            dispatch({ type: 'DISMISS_TASK', pid });
        }
        const unsub = m.subscriptions.get(pid);
        if (unsub) { unsub(); m.subscriptions.delete(pid); }
        m.backgroundedPids.delete(pid);
    });

    const dataUnsubscribe = ExecutionLifecycleService.subscribe(pid, (event) => {
        if (event.type === 'data') {
            dispatch({ type: 'APPEND_TASK_OUTPUT', pid, chunk: event.chunk });
        } else if (event.type === 'binary_detected') {
            dispatch({ type: 'UPDATE_TASK', pid, update: { isBinary: true } });
        } else if (event.type === 'binary_progress') {
            dispatch({ type: 'UPDATE_TASK', pid, update: { isBinary: true, binaryBytesReceived: event.bytesReceived } });
        }
    });

    m.subscriptions.set(pid, () => { exitUnsubscribe(); dataUnsubscribe(); });
}

async function executeShellCommandAsync(p: ShellCommandParams): Promise<void> {
    let commandToExecute = p.rawQuery;
    let pwdFilePath: string | undefined;

    const initialToolDisplay: IndividualToolCallDisplay = {
        callId: p.callId, name: SHELL_COMMAND_NAME, description: p.rawQuery,
        status: CoreToolCallStatus.Executing, isClientInitiated: true,
        resultDisplay: '', confirmationDetails: undefined
    };

    p.setPendingHistoryItem({ type: 'tool_group', tools: [initialToolDisplay] });

    let executionPid: number | undefined;
    const abortHandler = () => {
        p.onDebugMessage(`Aborting shell command (PID: ${executionPid ?? 'unknown'})`);
    };
    p.abortSignal.addEventListener('abort', abortHandler, { once: true });

    try {
        if (!p.isWindows) {
            const wrapped = wrapCommandForPwd(p.rawQuery);
            commandToExecute = wrapped.commandToExecute;
            pwdFilePath = wrapped.pwdFilePath;
        }

        p.onDebugMessage(`Executing in ${p.targetDir}: ${commandToExecute}`);

        const shellExecutionConfig = {
            ...p.config.getShellExecutionConfig(),
            sessionId: p.config.getSessionId(),
            terminalWidth: p.terminalWidth,
            terminalHeight: p.terminalHeight,
            defaultFg: themeManager.getActiveTheme().colors.Foreground,
            defaultBg: themeManager.getActiveTheme().colors.Background
        };

        const eventState: ShellEventState = {
            cumulativeStdout: '', isBinaryStream: false, binaryBytesReceived: 0,
            executionPid: undefined, callId: p.callId, m: p.m, dispatch: p.dispatch,
            setPendingHistoryItem: p.setPendingHistoryItem
        };

        const { pid, result: resultPromise } = await ShellExecutionService.execute(
            commandToExecute, p.targetDir, createShellEventHandler(eventState),
            p.abortSignal, p.config.getEnableInteractiveShell(), shellExecutionConfig
        );

        executionPid = pid;
        eventState.executionPid = pid;

        if (pid) {
            p.dispatch({ type: 'SET_ACTIVE_PTY', pid });
            p.setPendingHistoryItem((prevItem) => {
                if (prevItem?.type === 'tool_group') {
                    return { ...prevItem, tools: prevItem.tools.map((tool) => tool.callId === p.callId ? { ...tool, ptyId: pid } : tool) };
                }
                return prevItem;
            });
        }

        const result = await resultPromise;
        p.setPendingHistoryItem(null);

        let mainContent: string;
        if (eventState.isBinaryStream || isBinary(result.rawOutput)) {
            mainContent = '[Command produced binary output, which is not shown.]';
        } else {
            mainContent = result.output.trim() || '(Command produced no output)';
        }

        const { finalOutput, finalStatus, mainContent: outMain } = computeFinalShellOutput(result, mainContent);

        finalizeShellResult(
            result, eventState, p.rawQuery, outMain, finalOutput, finalStatus,
            initialToolDisplay, p.userMessageTimestamp, p.config, p.geminiClient,
            p.addItemToHistory, p.registerBackgroundTask, p.dispatch, pwdFilePath
        );
    } catch (err) {
        p.setPendingHistoryItem(null);
        const errorMessage = err instanceof Error ? err.message : String(err);
        p.addItemToHistory({ type: 'error', text: `An unexpected error occurred: ${errorMessage}` }, p.userMessageTimestamp);
    } finally {
        p.abortSignal.removeEventListener('abort', abortHandler);
        if (pwdFilePath) {
            const tmpDir = path.dirname(pwdFilePath);
            try {
                if (fs.existsSync(pwdFilePath)) fs.unlinkSync(pwdFilePath);
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch { /* Ignore cleanup errors */ }
        }
        p.dispatch({ type: 'SET_ACTIVE_PTY', pid: null });
        p.setShellInputFocused(false);
    }
}

/**
 * Hook to process shell commands.
 * Orchestrates command execution and updates history and agent context.
 */
export const useExecutionLifecycle = (
    addItemToHistory: UseHistoryManagerReturn['addItem'],
    setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
    onExec: (command: Promise<void>) => void,
    onDebugMessage: (message: string) => void,
    config: Config,
    geminiClient: GeminiClient,
    setShellInputFocused: (value: boolean) => void,
    terminalWidth?: number,
    terminalHeight?: number,
    activeBackgroundExecutionId?: number,
    isWaitingForConfirmation?: boolean
) => {
    const [state, dispatch] = useReducer(shellReducer, initialState);

    const manager = useRef<ManagerRef | null>(null);
    if (!manager.current) {
        manager.current = { wasVisibleBeforeForeground: false, restoreTimeout: null, backgroundedPids: new Set(), subscriptions: new Map() };
    }
    const m = manager.current;

    const activePtyId =
    state.activeShellPtyId ?? activeBackgroundExecutionId ?? undefined;

    useEffect(() => {
        const isForegroundActive = !!activePtyId || !!isWaitingForConfirmation;

        if (isForegroundActive) {
            if (m.restoreTimeout) {
                clearTimeout(m.restoreTimeout);
                m.restoreTimeout = null;
            }

            if (state.isBackgroundTaskVisible && !m.wasVisibleBeforeForeground) {
                m.wasVisibleBeforeForeground = true;
                dispatch({ type: 'SET_VISIBILITY', visible: false });
            }
        } else if (m.wasVisibleBeforeForeground && !m.restoreTimeout) {
            // Restore if it was automatically hidden, with a small delay to avoid
            // flickering between model turn segments.
            m.restoreTimeout = setTimeout(() => {
                dispatch({ type: 'SET_VISIBILITY', visible: true });
                m.wasVisibleBeforeForeground = false;
                m.restoreTimeout = null;
            }, RESTORE_VISIBILITY_DELAY_MS);
        }

        return () => {
            if (m.restoreTimeout) {
                clearTimeout(m.restoreTimeout);
            }
        };
    }, [
        activePtyId,
        isWaitingForConfirmation,
        state.isBackgroundTaskVisible,
        m,
        dispatch
    ]);

    useEffect(
        () => () => {
            // Unsubscribe from all background task events on unmount
            for (const unsubscribe of m.subscriptions.values()) {
                unsubscribe();
            }
            m.subscriptions.clear();
        },
        [m]
    );

    const toggleBackgroundTasks = useCallback(() => {
        if (state.backgroundTasks.size > 0) {
            const willBeVisible = !state.isBackgroundTaskVisible;
            dispatch({ type: 'TOGGLE_VISIBILITY' });

            const isForegroundActive = !!activePtyId || !!isWaitingForConfirmation;
            // If we are manually showing it during foreground, we set the restore flag
            // so that useEffect doesn't immediately hide it again.
            // If we are manually hiding it, we clear the restore flag so it stays hidden.
            if (willBeVisible && isForegroundActive) {
                m.wasVisibleBeforeForeground = true;
            } else {
                m.wasVisibleBeforeForeground = false;
            }

            if (willBeVisible) {
                dispatch({ type: 'SYNC_BACKGROUND_TASKS' });
            }
        } else {
            dispatch({ type: 'SET_VISIBILITY', visible: false });
            addItemToHistory(
                {
                    type: 'info',
                    text: 'No background tasks are currently active.'
                },
                Date.now()
            );
        }
    }, [
        addItemToHistory,
        state.backgroundTasks.size,
        state.isBackgroundTaskVisible,
        activePtyId,
        isWaitingForConfirmation,
        m,
        dispatch
    ]);

    const backgroundCurrentExecution = useCallback(() => {
        const pidToBackground =
      state.activeShellPtyId ?? activeBackgroundExecutionId;
        if (pidToBackground) {
            // TRACK THE PID BEFORE TRIGGERING THE BACKGROUND ACTION
            // This prevents the onBackground listener from double-registering.
            m.backgroundedPids.add(pidToBackground);

            // Use ShellExecutionService for shell PTYs (handles log files, etc.),
            // fall back to ExecutionLifecycleService for non-shell executions
            // (e.g. remote agents, MCP tools, local agents).
            if (state.activeShellPtyId) {
                ShellExecutionService.background(pidToBackground);
            } else {
                ExecutionLifecycleService.background(pidToBackground);
            }
            // Ensure backgrounding is silent and doesn't trigger restoration
            m.wasVisibleBeforeForeground = false;
            if (m.restoreTimeout) {
                clearTimeout(m.restoreTimeout);
                m.restoreTimeout = null;
            }
        }
    }, [state.activeShellPtyId, activeBackgroundExecutionId, m]);

    const dismissBackgroundTask = useCallback(
        async (pid: number) => {
            const shell = state.backgroundTasks.get(pid);
            if (shell) {
                if (shell.status === 'running') {
                    // ExecutionLifecycleService.kill handles both shell and non-shell
                    // executions. For shells, ShellExecutionService.kill delegates to it.
                    ExecutionLifecycleService.kill(pid);
                }
                dispatch({ type: 'DISMISS_TASK', pid });
                m.backgroundedPids.delete(pid);

                // Unsubscribe from updates
                const unsubscribe = m.subscriptions.get(pid);
                if (unsubscribe) {
                    unsubscribe();
                    m.subscriptions.delete(pid);
                }
            }
        },
        [state.backgroundTasks, dispatch, m]
    );

    const registerBackgroundTask = useCallback(
        (pid: number, command: string, initialOutput: string | AnsiOutput, completionBehavior?: CompletionBehavior) => {
            m.backgroundedPids.add(pid);
            dispatch({ type: 'REGISTER_TASK', pid, command, initialOutput, completionBehavior });
            registerTaskSubscriptions(pid, completionBehavior, m, dispatch);
        },
        [dispatch, m]
    );

    // Auto-register any execution that gets backgrounded, regardless of type.
    // This is the agnostic hook: any tool that calls
    // ExecutionLifecycleService.createExecution() or attachExecution()
    // automatically gets Ctrl+B support — no UI changes needed per tool.
    useEffect(() => {
        const listener = (info: {
      executionId: number;
      label: string;
      output: string;
      completionBehavior: CompletionBehavior;
    }) => {
            // Skip if already registered (e.g. shells register via their own flow)
            if (m.backgroundedPids.has(info.executionId)) {
                return;
            }
            registerBackgroundTask(
                info.executionId,
                info.label,
                info.output,
                info.completionBehavior
            );
        };
        ExecutionLifecycleService.onBackground(listener);
        return () => {
            ExecutionLifecycleService.offBackground(listener);
        };
    }, [registerBackgroundTask, m]);

    const handleShellCommand = useCallback(
        (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
            if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
                return false;
            }

            const userMessageTimestamp = Date.now();
            const callId = `shell-${userMessageTimestamp}`;
            addItemToHistory({ type: 'user_shell', text: rawQuery }, userMessageTimestamp);

            const isWindows = os.platform() === 'win32';
            const targetDir = config.getTargetDir();

            onExec(executeShellCommandAsync({
                rawQuery, callId, userMessageTimestamp, isWindows, targetDir,
                config, terminalWidth, terminalHeight, onDebugMessage,
                addItemToHistory, setPendingHistoryItem, onExec, geminiClient,
                setShellInputFocused, registerBackgroundTask, m, dispatch, abortSignal
            }));
            return true;
        },
        [config, onDebugMessage, addItemToHistory, setPendingHistoryItem, onExec, geminiClient, setShellInputFocused, terminalHeight, terminalWidth, registerBackgroundTask, m, dispatch]
    );

    const backgroundTaskCount = Array.from(state.backgroundTasks.values()).filter(
        (s: BackgroundTask) => s.status === 'running'
    ).length;

    return {
        handleShellCommand,
        activeShellPtyId: state.activeShellPtyId,
        lastShellOutputTime: state.lastShellOutputTime,
        backgroundTaskCount,
        isBackgroundTaskVisible: state.isBackgroundTaskVisible,
        toggleBackgroundTasks,
        backgroundCurrentExecution,
        registerBackgroundTask,
        dismissBackgroundTask,
        backgroundTasks: state.backgroundTasks
    };
};
