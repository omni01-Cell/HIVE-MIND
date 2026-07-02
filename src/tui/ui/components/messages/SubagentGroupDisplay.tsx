/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { IndividualToolCallDisplay } from '../../contexts/UIStateContext.js';
import { checkExhaustive } from '../../../utils/errors.js';
import { isSubagentProgress, SubagentActivityItem, SubagentState } from '../../contexts/UIStateContext.js';
import {
    SubagentProgressDisplay,
    formatToolArgs
} from './SubagentProgressDisplay.js';
import { useOverflowActions } from '../../contexts/OverflowContext.js';

export interface SubagentGroupDisplayProps {
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  borderColor?: string;
  borderDimColor?: boolean;
  isFirst?: boolean;
  isExpandable?: boolean;
}

function computeSubagentHeaderText(toolCalls: Array<{ resultDisplay: unknown }>): string {
    if (toolCalls.length === 1) {
        const singleAgent = toolCalls[0].resultDisplay;
        if (isSubagentProgress(singleAgent)) {
            switch (singleAgent.state) {
                case SubagentState.COMPLETED: return 'Agent Completed';
                case SubagentState.CANCELLED: return 'Agent Cancelled';
                case SubagentState.ERROR: return 'Agent Error';
                default: return 'Running Agent...';
            }
        }
        return 'Running Agent...';
    }
    let completedCount = 0;
    let runningCount = 0;
    for (const tc of toolCalls) {
        const progress = tc.resultDisplay;
        if (isSubagentProgress(progress)) {
            if (progress.state === SubagentState.COMPLETED) completedCount++;
            else if (progress.state === SubagentState.RUNNING) runningCount++;
        } else { runningCount++; }
    }
    if (completedCount === toolCalls.length) return `${toolCalls.length} Agents Completed`;
    if (completedCount > 0) return `${toolCalls.length} Agents (${runningCount} running, ${completedCount} completed)...`;
    return `Running ${toolCalls.length} Agents...`;
}

export const SubagentGroupDisplay: React.FC<SubagentGroupDisplayProps> = ({
    toolCalls,
    availableTerminalHeight,
    terminalWidth,
    borderColor,
    borderDimColor,
    isFirst,
    isExpandable = true
}) => {
    const isExpanded = availableTerminalHeight === undefined;
    const overflowActions = useOverflowActions();
    const uniqueId = useId();
    const overflowId = `subagent-${uniqueId}`;

    useEffect(() => {
        if (isExpandable && overflowActions) {
            // Register with the global overflow system so "ctrl+o to expand" shows in the sticky footer
            // and AppContainer passes the shortcut through.
            overflowActions.addOverflowingId(overflowId);
        }
        return () => {
            if (overflowActions) {
                overflowActions.removeOverflowingId(overflowId);
            }
        };
    }, [isExpandable, overflowActions, overflowId]);

    if (toolCalls.length === 0) return null;

    const headerText = computeSubagentHeaderText(toolCalls);
    const toggleText = `(ctrl+o to ${isExpanded ? 'collapse' : 'expand'})`;

    const renderCollapsedRow = (
        key: string,
        agentName: string,
        icon: React.ReactNode,
        content: string,
        displayArgs?: string
    ) => (
        <Box key={key} flexDirection="row" marginLeft={0} marginTop={0}>
            <Box minWidth={2} flexShrink={0}>
                {icon}
            </Box>
            <Box flexShrink={0}>
                <Text bold color={theme.text.primary} wrap="truncate">
                    {agentName}
                </Text>
            </Box>
            <Box flexShrink={0}>
                <Text color={theme.text.secondary}> · </Text>
            </Box>
            <Box flexShrink={1} minWidth={0}>
                <Text color={theme.text.secondary} wrap="truncate">
                    {content}
                    {displayArgs && ` ${displayArgs}`}
                </Text>
            </Box>
        </Box>
    );

    return (
        <Box
            flexDirection="column"
            width={terminalWidth}
            borderLeft={true}
            borderRight={true}
            borderTop={isFirst}
            borderBottom={false}
            borderColor={borderColor}
            borderDimColor={borderDimColor}
            borderStyle="round"
            paddingLeft={1}
            paddingTop={0}
            paddingBottom={0}
        >
            <Box flexDirection="row" gap={1} marginBottom={isExpanded ? 1 : 0}>
                <Text color={theme.text.secondary}>≡</Text>
                <Text bold color={theme.text.primary}>
                    {headerText}
                </Text>
                {isExpandable && <Text color={theme.text.secondary}>{toggleText}</Text>}
            </Box>

            {toolCalls.map((toolCall) => {
                const progress = toolCall.resultDisplay;

                if (!isSubagentProgress(progress)) {
                    const agentName = toolCall.name || 'agent';
                    if (!isExpanded) {
                        return renderCollapsedRow(
                            toolCall.callId,
                            agentName,
                            <Text color={theme.text.primary}>!</Text>,
                            'Starting...'
                        );
                    } else {
                        return (
                            <Box
                                key={toolCall.callId}
                                flexDirection="column"
                                marginLeft={0}
                                marginBottom={1}
                            >
                                <Box flexDirection="row" gap={1}>
                                    <Text color={theme.text.primary}>!</Text>
                                    <Text bold color={theme.text.primary}>
                                        {agentName}
                                    </Text>
                                </Box>
                                <Box marginLeft={2}>
                                    <Text color={theme.text.secondary}>Starting...</Text>
                                </Box>
                            </Box>
                        );
                    }
                }

                const history = toolCall.subagentHistory ?? progress.recentActivity;
                const lastActivity: SubagentActivityItem | undefined =
          history[history.length - 1];

                // Collapsed View: Show single compact line per agent
                if (!isExpanded) {
                    let content = 'Starting...';
                    let formattedArgs: string | undefined;

                    if (progress.state === SubagentState.COMPLETED) {
                        if (
                            progress.terminateReason &&
              progress.terminateReason !== 'GOAL'
                        ) {
                            content = `Finished Early (${progress.terminateReason})`;
                        } else {
                            content = 'Completed successfully';
                        }
                    } else if (lastActivity) {
                        // Match expanded view logic exactly:
                        // Primary text: displayName || content
                        content = lastActivity.displayName || lastActivity.content;

                        // Secondary text: description || formatToolArgs(args)
                        if (lastActivity.description) {
                            formattedArgs = lastActivity.description;
                        } else if (lastActivity.type === 'tool_call' && lastActivity.args) {
                            formattedArgs = formatToolArgs(lastActivity.args);
                        }
                    }

                    const displayArgs =
            progress.state === SubagentState.COMPLETED ? '' : formattedArgs;

                    const renderStatusIcon = () => {
                        const state = progress.state ?? SubagentState.RUNNING;
                        switch (state) {
                            case SubagentState.RUNNING:
                                return <Text color={theme.text.primary}>!</Text>;
                            case SubagentState.COMPLETED:
                                return <Text color={theme.status.success}>✓</Text>;
                            case SubagentState.CANCELLED:
                                return <Text color={theme.status.warning}>ℹ</Text>;
                            case SubagentState.ERROR:
                                return <Text color={theme.status.error}>✗</Text>;
                            default:
                                return checkExhaustive(state);
                        }
                    };

                    return renderCollapsedRow(
                        toolCall.callId,
                        progress.agentName,
                        renderStatusIcon(),
                        lastActivity?.type === 'thought' ? `💭 ${content}` : content,
                        displayArgs
                    );
                }

                // Expanded View: Render full history
                return (
                    <Box
                        key={toolCall.callId}
                        flexDirection="column"
                        marginLeft={0}
                        marginBottom={1}
                    >
                        <SubagentProgressDisplay
                            progress={progress}
                            terminalWidth={terminalWidth}
                            historyOverrides={toolCall.subagentHistory}
                        />
                    </Box>
                );
            })}
        </Box>
    );
};
