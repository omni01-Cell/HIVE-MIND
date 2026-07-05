/**
 * @license
 * Copyright 2025 HIVE-MIND
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    useCallback,
    useMemo,
    useEffect,
    useState,
    useRef
} from 'react';
import process from 'node:process';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { CommandService } from '../../services/CommandService.js';
import { BuiltinCommandLoader } from '../../services/BuiltinCommandLoader.js';
import { parseSlashCommand } from '../../utils/commands.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { coreEvents } from '../../utils/coreEvents.js';
import { HiveConfig } from '../../config/hiveConfig.js';
import {
    CommandContext,
    SlashCommand,
    HistoryItem,
    HistoryItemWithoutId,
    ConfirmationRequest,
    AgentDefinition,
    MessageType,
    ToolConfirmationOutcome,
    ToolCallConfirmationDetails,
    IndividualToolCallDisplay,
    CoreToolCallStatus,
    IdeClient,
    Message,
    SlashCommandResult,
    SlashCommandProcessorResult,
    MCPDiscoveryState,
    SlashCommandStatus,
    makeSlashCommandEvent,
    logSlashCommand,
    addMCPStatusChangeListener,
    removeMCPStatusChangeListener,
    GitService,
    Logger,
    Storage,
    ExtensionsStartingEvent,
    ExtensionsStoppingEvent,
    ExtensionUpdateAction,
    ExtensionUpdateStatus,
    PartListUnion
} from '../contexts/UIStateContext.js';

interface SlashCommandProcessorActions {
  openAuthDialog: () => void;
  openThemeDialog: () => void;
  openEditorDialog: () => void;
  openPrivacyNotice: () => void;
  openSettingsDialog: () => void;
  openSessionBrowser: () => void;
  openModelDialog: () => void;
  openVoiceModelDialog: () => void;
  openAgentConfigDialog: (
    name: string,
    displayName: string,
    definition: AgentDefinition,
  ) => void;
  openPermissionsDialog: (props?: { targetDirectory?: string }) => void;
  quit: (messages: HistoryItem[]) => void;
  setDebugMessage: (message: string) => void;
  toggleCorgiMode: () => void;
  toggleVoiceMode: () => void;
  toggleDebugProfiler: () => void;
  dispatchExtensionStateUpdate: (action: ExtensionUpdateAction) => void;
  addConfirmUpdateExtensionRequest: (request: ConfirmationRequest) => void;
  toggleBackgroundTasks: () => void;
  toggleShortcutsHelp: () => void;
  setText: (text: string) => void;
}

/**
 * Deletes the current session recording if a chat recording service is available.
 */
async function deleteCurrentSessionRecording(config: HiveConfig | null): Promise<void> {
    const chatRecordingService = config
        ?.getGeminiClient()
        ?.getChatRecordingService();
    if (chatRecordingService) {
        await chatRecordingService.deleteCurrentSessionAsync();
    }
}

interface SlashCommandResultContext {
    commandContext: CommandContext;
    addItem: UseHistoryManagerReturn['addItem'];
    addMessage: (message: Message) => void;
    actions: SlashCommandProcessorActions;
    setCustomDialog: (dialog: React.ReactNode | null) => void;
    setPendingItem: React.Dispatch<React.SetStateAction<HistoryItemWithoutId | null>>;
    setSessionShellAllowlist: React.Dispatch<React.SetStateAction<Set<string>>>;
    setConfirmationRequest: React.Dispatch<React.SetStateAction<{ prompt: React.ReactNode; onConfirm: (confirmed: boolean) => void } | null>>;
    config: HiveConfig | null;
    handleSlashCommand: (rawQuery: PartListUnion | string, oneTimeShellAllowlist?: Set<string>, overwriteConfirmed?: boolean, addToHistory?: boolean) => Promise<SlashCommandProcessorResult | false>;
}

async function handleCommandResult(
    result: SlashCommandResult,
    ctx: SlashCommandResultContext
): Promise<SlashCommandProcessorResult> {
    switch (result.type) {
        case 'tool':
            return { type: 'schedule_tool', toolName: result.toolName, toolArgs: result.toolArgs, postSubmitPrompt: result.postSubmitPrompt };
        case 'message':
            ctx.addItem({ type: result.messageType === 'error' ? MessageType.ERROR : MessageType.INFO, text: result.content }, Date.now());
            return { type: 'handled' };
        case 'logout':
            ctx.addItem({ type: MessageType.INFO, text: 'Logging out and exiting...' }, Date.now());
            await runExitCleanup();
            process.exit(0);
            return { type: 'handled' };
        case 'dialog':
            return handleDialogResult(result, ctx);
        case 'load_history':
            ctx.config?.getGeminiClient()?.setHistory(result.clientHistory);
            ctx.commandContext.ui.clear();
            result.history.forEach((item, index) => { ctx.commandContext.ui.addItem(item, index); });
            return { type: 'handled' };
        case 'quit':
            if (result.deleteSession) { try { await deleteCurrentSessionRecording(ctx.config); } catch { /* ok */ } }
            ctx.actions.quit(result.messages);
            return { type: 'handled' };
        case 'submit_prompt':
            return { type: 'submit_prompt', content: result.content };
        case 'confirm_shell_commands':
            return handleConfirmShellCommands(result, ctx);
        case 'confirm_action':
            return handleConfirmAction(result, ctx);
        case 'custom_dialog':
            ctx.setCustomDialog(result.component);
            return { type: 'handled' };
        default: {
            // SlashCommandResult est typé `any` dans les stubs — le guard `never` est désactivé.
            const unhandled = result as unknown;
            throw new Error(`Unhandled slash command result: ${String(unhandled)}`);
        }
    }
}

function handleDialogResult(result: Extract<SlashCommandResult, { type: 'dialog' }>, ctx: SlashCommandResultContext): SlashCommandProcessorResult {
    const a = ctx.actions;
    const dialogMap: Record<string, () => void> = {
        auth: () => a.openAuthDialog(), theme: () => a.openThemeDialog(),
        editor: () => a.openEditorDialog(), privacy: () => a.openPrivacyNotice(),
        sessionBrowser: () => a.openSessionBrowser(), settings: () => a.openSettingsDialog(),
        model: () => a.openModelDialog(), 'voice-model': () => a.openVoiceModelDialog(),
        permissions: () => a.openPermissionsDialog(result.props as { targetDirectory?: string }),
        help: () => {}
    };
    if (result.dialog === 'agentConfig') {
        const props = result.props as Record<string, unknown>;
        if (!props || typeof props['name'] !== 'string' || typeof props['displayName'] !== 'string' || !props['definition']) {
            throw new Error('Received invalid properties for agentConfig dialog action.');
        }
        a.openAgentConfigDialog(props['name'], props['displayName'], props['definition'] as AgentDefinition);
        return { type: 'handled' };
    }
    const handler = dialogMap[result.dialog];
    if (handler) { handler(); return { type: 'handled' }; }
    // SlashCommandResult est typé `any` — le guard `never` est désactivé.
    const unhandled = result.dialog as unknown;
    throw new Error(`Unhandled dialog type: ${String(unhandled)}`);
}

async function handleConfirmShellCommands(
    result: Extract<SlashCommandResult, { type: 'confirm_shell_commands' }>,
    ctx: SlashCommandResultContext
): Promise<SlashCommandProcessorResult> {
    const callId = `expansion-${Date.now()}`;
    const { outcome, approvedCommands } = await new Promise<{ outcome: ToolConfirmationOutcome; approvedCommands?: string[] }>((resolve) => {
        const confirmationDetails: ToolCallConfirmationDetails = {
            type: 'exec', title: 'Confirm Shell Expansion',
            command: result.commandsToConfirm[0] || '', rootCommand: result.commandsToConfirm[0] || '',
            rootCommands: result.commandsToConfirm, commands: result.commandsToConfirm,
            onConfirm: async (resolvedOutcome) => {
                resolve({ outcome: resolvedOutcome, approvedCommands: resolvedOutcome === ToolConfirmationOutcome.Cancel ? [] : result.commandsToConfirm });
            }
        };
        const toolDisplay: IndividualToolCallDisplay = {
            callId, name: 'Expansion', description: 'Command expansion needs shell access',
            status: CoreToolCallStatus.AwaitingApproval, isClientInitiated: true,
            resultDisplay: undefined, confirmationDetails
        };
        ctx.setPendingItem({ type: 'tool_group', tools: [toolDisplay] });
    });
    ctx.setPendingItem(null);
    if (outcome === ToolConfirmationOutcome.Cancel || !approvedCommands || approvedCommands.length === 0) {
        ctx.addItem({ type: MessageType.INFO, text: 'Slash command shell execution declined.' }, Date.now());
        return { type: 'handled' };
    }
    if (outcome === ToolConfirmationOutcome.ProceedAlways) {
        ctx.setSessionShellAllowlist((prev) => new Set([...prev, ...approvedCommands]));
    }
    return await ctx.handleSlashCommand(result.originalInvocation.raw, new Set(approvedCommands), undefined, false);
}

async function handleConfirmAction(
    result: Extract<SlashCommandResult, { type: 'confirm_action' }>,
    ctx: SlashCommandResultContext
): Promise<SlashCommandProcessorResult> {
    const { confirmed } = await new Promise<{ confirmed: boolean }>((resolve) => {
        ctx.setConfirmationRequest({
            prompt: result.prompt,
            onConfirm: (resolvedConfirmed) => { ctx.setConfirmationRequest(null); resolve({ confirmed: resolvedConfirmed }); }
        });
    });
    if (!confirmed) {
        ctx.addItem({ type: MessageType.INFO, text: 'Operation cancelled.' }, Date.now());
        return { type: 'handled' };
    }
    return await ctx.handleSlashCommand(result.originalInvocation.raw, undefined, true);
}

interface SlashCommandHandlerContext {
    commands: readonly SlashCommand[];
    config: HiveConfig | null;
    commandContext: CommandContext;
    addItem: UseHistoryManagerReturn['addItem'];
    addMessage: (message: Message) => void;
    setIsProcessing: (isProcessing: boolean) => void;
    actions: SlashCommandProcessorActions;
    setCustomDialog: (dialog: React.ReactNode | null) => void;
    setPendingItem: React.Dispatch<React.SetStateAction<HistoryItemWithoutId | null>>;
    setSessionShellAllowlist: React.Dispatch<React.SetStateAction<Set<string>>>;
    setConfirmationRequest: React.Dispatch<React.SetStateAction<{ prompt: React.ReactNode; onConfirm: (confirmed: boolean) => void } | null>>;
}

async function executeSlashCommand(
    rawQuery: PartListUnion | string,
    oneTimeShellAllowlist: Set<string> | undefined,
    overwriteConfirmed: boolean | undefined,
    addToHistory: boolean,
    hctx: SlashCommandHandlerContext,
    selfRef: { current: ((rawQuery: PartListUnion | string, oneTimeShellAllowlist?: Set<string>, overwriteConfirmed?: boolean, addToHistory?: boolean) => Promise<SlashCommandProcessorResult | false>) | null }
): Promise<SlashCommandProcessorResult | false> {
    if (!hctx.commands) return false;
    const queryString = typeof rawQuery === 'string'
        ? rawQuery
        : rawQuery.parts?.map((p) => p.text).join('') || '';
    if (!queryString) return false;

    const trimmed = queryString.trim();
    if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) return false;

    const { commandToExecute, args, canonicalPath: resolvedCommandPath } = parseSlashCommand(trimmed, hctx.commands);

    if (!commandToExecute) {
        const isMcpLoading = hctx.config?.getMcpClientManager()?.getDiscoveryState() === MCPDiscoveryState.IN_PROGRESS;
        if (isMcpLoading) {
            hctx.setIsProcessing(true);
            if (addToHistory) hctx.addItem({ type: MessageType.USER, text: trimmed }, Date.now());
            hctx.addMessage({ type: MessageType.ERROR, content: `Unknown command: ${trimmed}. Command might have been from an MCP server but MCP servers are not done loading.`, timestamp: new Date() });
            hctx.setIsProcessing(false);
            return { type: 'handled' };
        }
        return false;
    }

    hctx.setIsProcessing(true);
    if (addToHistory) hctx.addItem({ type: MessageType.USER, text: trimmed }, Date.now());

    let hasError = false;
    const subcommand = resolvedCommandPath.length > 1 ? resolvedCommandPath.slice(1).join(' ') : undefined;

    try {
        if (!commandToExecute.action) {
            if (commandToExecute.subCommands) {
                const helpText = `Command '/${commandToExecute.name}' requires a subcommand. Available:\n${commandToExecute.subCommands.map((sc) => `  - ${sc.name}: ${sc.description || ''}`).join('\n')}`;
                hctx.addMessage({ type: MessageType.INFO, content: helpText, timestamp: new Date() });
            }
            return { type: 'handled' };
        }

        const fullCommandContext: CommandContext = {
            ...hctx.commandContext,
            invocation: { raw: trimmed, name: commandToExecute.name, args },
            overwriteConfirmed
        };

        if (oneTimeShellAllowlist && oneTimeShellAllowlist.size > 0) {
            fullCommandContext.session = {
                ...fullCommandContext.session,
                sessionShellAllowlist: new Set([...fullCommandContext.session.sessionShellAllowlist, ...oneTimeShellAllowlist])
            };
        }

        const result = await commandToExecute.action(fullCommandContext, args);
        if (result) {
            return await handleCommandResult(result, {
                commandContext: hctx.commandContext, addItem: hctx.addItem, addMessage: hctx.addMessage,
                actions: hctx.actions, setCustomDialog: hctx.setCustomDialog, setPendingItem: hctx.setPendingItem,
                setSessionShellAllowlist: hctx.setSessionShellAllowlist, setConfirmationRequest: hctx.setConfirmationRequest,
                config: hctx.config, handleSlashCommand: (q, al, oc, ah) => selfRef.current?.(q, al, oc, ah) ?? Promise.resolve(false)
            });
        }
        return { type: 'handled' };
    } catch (e: unknown) {
        hasError = true;
        if (hctx.config) {
            const event = makeSlashCommandEvent({ command: resolvedCommandPath[0], subcommand, status: SlashCommandStatus.ERROR, extension_id: commandToExecute?.extensionId });
            logSlashCommand(hctx.config, event);
        }
        hctx.addItem({ type: MessageType.ERROR, text: e instanceof Error ? e.message : String(e) }, Date.now());
        return { type: 'handled' };
    } finally {
        if (hctx.config && resolvedCommandPath[0] && !hasError) {
            const event = makeSlashCommandEvent({ command: resolvedCommandPath[0], subcommand, status: SlashCommandStatus.SUCCESS, extension_id: commandToExecute?.extensionId });
            logSlashCommand(hctx.config, event);
        }
        hctx.setIsProcessing(false);
    }
}

/**
 * Hook to define and process slash commands (e.g., /help, /clear).
 */
export const useSlashCommandProcessor = (
    config: HiveConfig | null,
    settings: LoadedSettings,
    addItem: UseHistoryManagerReturn['addItem'],
    clearItems: UseHistoryManagerReturn['clearItems'],
    loadHistory: UseHistoryManagerReturn['loadHistory'],
    refreshStatic: () => void,
    toggleVimEnabled: () => Promise<boolean>,
    setIsProcessing: (isProcessing: boolean) => void,
    actions: SlashCommandProcessorActions,
    extensionsUpdateState: Map<string, ExtensionUpdateStatus>,
    isConfigInitialized: boolean,
    setBannerVisible: (visible: boolean) => void,
    setCustomDialog: (dialog: React.ReactNode | null) => void
) => {
    const session = useSessionStats();
    const [commands, setCommands] = useState<readonly SlashCommand[] | undefined>(
        undefined
    );
    const [reloadTrigger, setReloadTrigger] = useState(0);

    const reloadCommands = useCallback(() => {
        setReloadTrigger((v) => v + 1);
    }, []);
    const [confirmationRequest, setConfirmationRequest] = useState<null | {
    prompt: React.ReactNode;
    onConfirm: (confirmed: boolean) => void;
        }>(null);

    const [sessionShellAllowlist, setSessionShellAllowlist] = useState(
        new Set<string>()
    );
    const gitService = useMemo(() => {
        if (!config?.getProjectRoot()) {
            return;
        }
        return new GitService(config.getProjectRoot(), config.storage);
    }, [config]);

    const logger = useMemo(() => {
        const l = new Logger(
            config?.getSessionId() || '',
            config?.storage ?? new Storage(process.cwd())
        );
        // The logger's initialize is async, but we can create the instance
        // synchronously. Commands that use it will await its initialization.
        return l;
    }, [config]);

    const [pendingItem, setPendingItem] = useState<HistoryItemWithoutId | null>(
        null
    );

    const pendingHistoryItems = useMemo(() => {
        const items: HistoryItemWithoutId[] = [];
        if (pendingItem != null) {
            items.push(pendingItem);
        }
        return items;
    }, [pendingItem]);

    const addMessage = useCallback(
        (message: Message) => {
            const typeMap: Record<string, string> = {
                [MessageType.ABOUT]: 'about', [MessageType.HELP]: 'help', [MessageType.STATS]: 'stats',
                [MessageType.MODEL_STATS]: 'model_stats', [MessageType.TOOL_STATS]: 'tool_stats',
                [MessageType.QUIT]: 'quit', [MessageType.COMPRESSION]: 'compression'
            };
            const mappedType = typeMap[message.type];
            let historyItemContent: HistoryItemWithoutId;
            if (mappedType) {
                historyItemContent = { type: mappedType, ...(message.type === MessageType.ABOUT ? { cliVersion: message.cliVersion, osVersion: message.osVersion, sandboxEnv: message.sandboxEnv, modelVersion: message.modelVersion, selectedAuthType: message.selectedAuthType, gcpProject: message.gcpProject, ideClient: message.ideClient } : {}), ...(message.type === MessageType.HELP ? { timestamp: message.timestamp } : {}), ...(message.type === MessageType.STATS ? { duration: message.duration } : {}), ...(message.type === MessageType.QUIT ? { duration: message.duration } : {}), ...(message.type === MessageType.COMPRESSION ? { compression: message.compression } : {}) } as HistoryItemWithoutId;
            } else {
                historyItemContent = { type: message.type, text: message.content };
            }
            addItem(historyItemContent, message.timestamp.getTime());
        },
        [addItem]
    );
    const commandContext = useMemo(
        (): CommandContext => ({
            services: { agentContext: config, settings, git: gitService, logger },
            ui: {
                addItem, clear: () => { clearItems(); refreshStatic(); setBannerVisible(false); },
                loadHistory: (history, postLoadInput) => { loadHistory(history); refreshStatic(); if (postLoadInput !== undefined) actions.setText(postLoadInput); },
                setDebugMessage: actions.setDebugMessage, pendingItem, setPendingItem,
                toggleCorgiMode: actions.toggleCorgiMode, toggleVoiceMode: actions.toggleVoiceMode,
                toggleDebugProfiler: actions.toggleDebugProfiler, toggleVimEnabled, reloadCommands,
                openAgentConfigDialog: actions.openAgentConfigDialog, extensionsUpdateState,
                dispatchExtensionStateUpdate: actions.dispatchExtensionStateUpdate,
                addConfirmUpdateExtensionRequest: actions.addConfirmUpdateExtensionRequest,
                setConfirmationRequest, removeComponent: () => setCustomDialog(null),
                toggleBackgroundTasks: actions.toggleBackgroundTasks, toggleShortcutsHelp: actions.toggleShortcutsHelp
            },
            session: { stats: session.stats, sessionShellAllowlist }
        }),
        [config, settings, gitService, logger, loadHistory, addItem, clearItems, refreshStatic, session.stats, actions, pendingItem, setPendingItem, setConfirmationRequest, toggleVimEnabled, sessionShellAllowlist, reloadCommands, extensionsUpdateState, setBannerVisible, setCustomDialog]
    );

    useEffect(() => {
        if (!config) {
            return;
        }

        const listener = () => {
            reloadCommands();
        };
        let isActive = true;
        let activeIdeClient: IdeClient | undefined;


        (async () => {
            const ideClient = await IdeClient.getInstance();
            if (!isActive) {
                return;
            }
            activeIdeClient = ideClient;
            ideClient.addStatusChangeListener(listener);
        })();

        // Listen for MCP server status changes (e.g. connection, discovery completion)
        // to reload slash commands (since they may include MCP prompts).
        addMCPStatusChangeListener(listener);

        // Ideally this would happen more directly inside the ExtensionLoader,
        // but the CommandService today is not conducive to that since it isn't a
        // long lived service but instead gets fully re-created based on reload
        // events within this hook.
        const extensionEventListener = (
            _event: ExtensionsStartingEvent | ExtensionsStoppingEvent
        ) => {
            // We only care once at least one extension has completed
            // starting/stopping
            reloadCommands();
        };
        coreEvents.on('extensionsStarting', extensionEventListener);
        coreEvents.on('extensionsStopping', extensionEventListener);

        return () => {
            isActive = false;
            activeIdeClient?.removeStatusChangeListener(listener);
            removeMCPStatusChangeListener(listener);
            coreEvents.off('extensionsStarting', extensionEventListener);
            coreEvents.off('extensionsStopping', extensionEventListener);
        };
    }, [config, reloadCommands]);

    useEffect(() => {
        const controller = new AbortController();


        (async () => {
            const commandService = await CommandService.create(
                [
                    new BuiltinCommandLoader(config)
                ],
                controller.signal
            );

            if (controller.signal.aborted) {
                return;
            }

            setCommands(commandService.getCommands());
        })();

        return () => {
            controller.abort();
        };
    }, [config, reloadTrigger, isConfigInitialized]);

    const selfRef = useRef<((rawQuery: PartListUnion | string, oneTimeShellAllowlist?: Set<string>, overwriteConfirmed?: boolean, addToHistory?: boolean) => Promise<SlashCommandProcessorResult | false>) | null>(null);

    const handleSlashCommand = useCallback(
        (rawQuery: PartListUnion | string, oneTimeShellAllowlist?: Set<string>, overwriteConfirmed?: boolean, addToHistory: boolean = true): Promise<SlashCommandProcessorResult | false> => {
            return executeSlashCommand(rawQuery, oneTimeShellAllowlist, overwriteConfirmed, addToHistory,
                { commands, config, commandContext, addItem, addMessage, setIsProcessing, actions, setCustomDialog, setPendingItem, setSessionShellAllowlist, setConfirmationRequest },
                selfRef
            );
        },
        [config, addItem, actions, commands, commandContext, addMessage, setSessionShellAllowlist, setIsProcessing, setConfirmationRequest, setCustomDialog]
    );
    selfRef.current = handleSlashCommand;

    return {
        handleSlashCommand,
        slashCommands: commands,
        pendingHistoryItems,
        commandContext,
        confirmationRequest
    };
};
