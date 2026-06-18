/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { escapeAnsiCtrlCodes } from '../utils/textUtils.js';
import { HistoryItem } from '../contexts/UIStateContext.js';
import { UserMessage } from './messages/UserMessage.js';
import { UserShellMessage } from './messages/UserShellMessage.js';
import { AssistantMessage } from './messages/AssistantMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { ToolGroupDisplay } from './messages/ToolGroupDisplay.js';
import { AssistantMessageContent } from './messages/AssistantMessageContent.js';
import { CompressionMessage } from './messages/CompressionMessage.js';
import { ExportSessionMessage } from './messages/ExportSessionMessage.js';
import { WarningMessage } from './messages/WarningMessage.js';
import { SubagentHistoryMessage } from './messages/SubagentHistoryMessage.js';
import { Box } from 'ink';
import { AboutBox } from './AboutBox.js';
import { StatsDisplay } from './StatsDisplay.js';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import { Help } from './Help.js';
import { SlashCommand } from '../contexts/UIStateContext.js';
// ExtensionsList removed
import { getMCPServerStatus } from '../contexts/UIStateContext.js';
import { ToolsList } from './views/ToolsList.js';
import { SkillsList } from './views/SkillsList.js';
import { AgentsStatus } from './views/AgentsStatus.js';
import { McpStatus } from './views/McpStatus.js';
import { GemmaStatus } from './views/GemmaStatus.js';
import { ChatList } from './views/ChatList.js';
import { ModelMessage } from './messages/ModelMessage.js';
import { ThinkingMessage } from './messages/ThinkingMessage.js';
import { HintMessage } from './messages/HintMessage.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight?: number;
  terminalWidth: number;
  isPending: boolean;
  commands?: readonly SlashCommand[];
  availableTerminalHeightHive?: number;
  isExpandable?: boolean;
  isFirstThinking?: boolean;
  isFirstAfterThinking?: boolean;
  isToolGroupBoundary?: boolean;
}

const hasQuotaStats = (item: HistoryItem): boolean =>
    item.type === 'model_stats' &&
    (item.pooledRemaining !== undefined ||
     item.pooledLimit !== undefined ||
     item.pooledResetTime !== undefined);

const renderHistoryItemByType = (
    itemForDisplay: HistoryItem,
    isPending: boolean,
    terminalWidth: number,
    availableTerminalHeight: number | undefined,
    availableTerminalHeightHive: number | undefined,
    commands: readonly SlashCommand[] | undefined,
    isExpandable: boolean | undefined,
    isFirstThinking: boolean,
    inlineThinkingMode: string,
    isToolGroupBoundary: boolean
): React.ReactNode => {
    const hiveHeight = availableTerminalHeightHive ?? availableTerminalHeight;
    switch (itemForDisplay.type) {
        case 'thinking':
            return inlineThinkingMode !== 'off' ? (
                <ThinkingMessage
                    thought={itemForDisplay.thought}
                    terminalWidth={terminalWidth}
                    isFirstThinking={isFirstThinking}
                />
            ) : null;
        case 'hint':
            return <HintMessage text={itemForDisplay.text} />;
        case 'user':
            return <UserMessage text={itemForDisplay.text} width={terminalWidth} />;
        case 'user_shell':
            return <UserShellMessage text={itemForDisplay.text} width={terminalWidth} />;
        case 'assistant':
            return (
                <AssistantMessage
                    text={itemForDisplay.text}
                    isPending={isPending}
                    availableTerminalHeight={hiveHeight}
                    terminalWidth={terminalWidth}
                />
            );
        case 'assistant_content':
            return (
                <AssistantMessageContent
                    text={itemForDisplay.text}
                    isPending={isPending}
                    availableTerminalHeight={hiveHeight}
                    terminalWidth={terminalWidth}
                />
            );
        case 'info':
            return (
                <InfoMessage
                    text={itemForDisplay.text}
                    secondaryText={itemForDisplay.secondaryText}
                    source={itemForDisplay.source}
                    icon={itemForDisplay.icon}
                    color={itemForDisplay.color}
                    marginBottom={itemForDisplay.marginBottom}
                />
            );
        case 'warning':
            return <WarningMessage text={itemForDisplay.text} />;
        case 'error':
            return <ErrorMessage text={itemForDisplay.text} />;
        case 'about':
            return (
                <AboutBox
                    cliVersion={itemForDisplay.cliVersion}
                    osVersion={itemForDisplay.osVersion}
                    sandboxEnv={itemForDisplay.sandboxEnv}
                    modelVersion={itemForDisplay.modelVersion}
                    selectedAuthType={itemForDisplay.selectedAuthType}
                    gcpProject={itemForDisplay.gcpProject}
                    ideClient={itemForDisplay.ideClient}
                    userEmail={itemForDisplay.userEmail}
                    tier={itemForDisplay.tier}
                />
            );
        case 'help':
            return commands ? <Help commands={commands} /> : null;
        case 'stats':
            return (
                <StatsDisplay
                    duration={itemForDisplay.duration}
                    selectedAuthType={itemForDisplay.selectedAuthType}
                    userEmail={itemForDisplay.userEmail}
                    tier={itemForDisplay.tier}
                />
            );
        case 'model_stats':
            return (
                <ModelStatsDisplay
                    selectedAuthType={itemForDisplay.selectedAuthType}
                    userEmail={itemForDisplay.userEmail}
                    tier={itemForDisplay.tier}
                    currentModel={itemForDisplay.currentModel}
                    quotaStats={
                        hasQuotaStats(itemForDisplay)
                            ? {
                                remaining: itemForDisplay.pooledRemaining,
                                limit: itemForDisplay.pooledLimit,
                                resetTime: itemForDisplay.pooledResetTime
                            }
                            : undefined
                    }
                />
            );
        case 'tool_stats':
            return <ToolStatsDisplay />;
        case 'model':
            return <ModelMessage model={itemForDisplay.model} />;
        case 'quit':
            return <SessionSummaryDisplay duration={itemForDisplay.duration} />;
        default:
            return renderHistoryItemByType2(
                itemForDisplay, terminalWidth, availableTerminalHeight,
                isExpandable, isToolGroupBoundary
            );
    }
};

const renderHistoryItemByType2 = (
    itemForDisplay: HistoryItem,
    terminalWidth: number,
    availableTerminalHeight: number | undefined,
    isExpandable: boolean | undefined,
    isToolGroupBoundary: boolean
): React.ReactNode => {
    switch (itemForDisplay.type) {
        case 'tool_group':
            return (
                <ToolGroupMessage
                    item={itemForDisplay}
                    toolCalls={itemForDisplay.tools}
                    availableTerminalHeight={availableTerminalHeight}
                    terminalWidth={terminalWidth}
                    borderTop={itemForDisplay.borderTop}
                    borderBottom={itemForDisplay.borderBottom}
                    isExpandable={isExpandable}
                />
            );
        case 'tool_display_group':
            return <ToolGroupDisplay item={itemForDisplay} isToolGroupBoundary={isToolGroupBoundary} />;
        case 'subagent':
            return <SubagentHistoryMessage item={itemForDisplay} terminalWidth={terminalWidth} />;
        case 'compression':
            return <CompressionMessage compression={itemForDisplay.compression} />;
        case 'export_session':
            return <ExportSessionMessage exportSession={itemForDisplay.exportSession} />;
        case 'extensions_list':
            return <Text color={theme.ui.comment}>Extensions are not supported in HIVE-MIND.</Text>;
        case 'tools_list':
            return (
                <ToolsList
                    terminalWidth={terminalWidth}
                    tools={itemForDisplay.tools}
                    showDescriptions={itemForDisplay.showDescriptions}
                />
            );
        case 'skills_list':
            return (
                <SkillsList
                    skills={itemForDisplay.skills}
                    showDescriptions={itemForDisplay.showDescriptions}
                />
            );
        case 'agents_list':
            return <AgentsStatus agents={itemForDisplay.agents} terminalWidth={terminalWidth} />;
        case 'mcp_status':
            return <McpStatus {...itemForDisplay} serverStatus={getMCPServerStatus} />;
        case 'gemma_status':
            return <GemmaStatus {...itemForDisplay} />;
        case 'chat_list':
            return <ChatList chats={itemForDisplay.chats} />;
        default:
            return null;
    }
};

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
    item,
    availableTerminalHeight,
    terminalWidth,
    isPending,
    commands,
    availableTerminalHeightHive,
    isExpandable,
    isFirstThinking = false,
    isFirstAfterThinking = false,
    isToolGroupBoundary = false
}) => {
    const settings = useSettings();
    const inlineThinkingMode = getInlineThinkingMode(settings);
    const itemForDisplay = useMemo(() => escapeAnsiCtrlCodes(item), [item]);

    const needTopMargin = !!(
        (isFirstAfterThinking && inlineThinkingMode !== 'off') ||
    isToolGroupBoundary
    );

    return (
        <Box
            flexDirection="column"
            key={itemForDisplay.id}
            width={terminalWidth}
            marginTop={needTopMargin ? 1 : 0}
        >
            {renderHistoryItemByType(
                itemForDisplay, isPending, terminalWidth,
                availableTerminalHeight, availableTerminalHeightHive,
                commands, isExpandable, isFirstThinking,
                inlineThinkingMode, isToolGroupBoundary
            )}
        </Box>
    );
};
