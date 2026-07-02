/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { AnsiOutputText, AnsiLineText } from '../AnsiOutput.js';
import { SlicingMaxSizedBox } from '../shared/SlicingMaxSizedBox.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { theme } from '../../semantic-colors.js';
import { AnsiOutput, AnsiLine } from '../../contexts/UIStateContext.js';
import { isSubagentProgress, isStructuredToolResult } from '../../contexts/UIStateContext.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { tryParseJSON } from '../../../utils/jsonoutput.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { Scrollable } from '../shared/Scrollable.js';
import { ScrollableList } from '../shared/ScrollableList.js';
import { SCROLL_TO_ITEM_END } from '../shared/VirtualizedList.js';
import { ACTIVE_SHELL_MAX_LINES } from '../../constants.js';
import { calculateToolContentMaxLines } from '../../utils/toolLayoutUtils.js';
import { SubagentProgressDisplay } from './SubagentProgressDisplay.js';

export interface ToolResultDisplayProps {
  resultDisplay: string | object | undefined;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderOutputAsMarkdown?: boolean;
  maxLines?: number;
  hasFocus?: boolean;
  overflowDirection?: 'top' | 'bottom';
}

interface FileDiffResult {
  fileDiff: string;
  fileName: string;
}

function renderToolContent(
    contentData: string | object | undefined,
    ctx: {
        childWidth: number;
        availableHeight: number | undefined;
        maxLines: number | undefined;
        renderOutputAsMarkdown: boolean;
        renderMarkdown: boolean;
        isAlternateBuffer: boolean;
        hasFocus: boolean;
    }
): React.ReactNode {
    const prettyJSON = typeof contentData === 'string' ? tryParseJSON(contentData) : null;
    const formattedJSON = prettyJSON ? JSON.stringify(prettyJSON, null, 2) : null;
    let content: React.ReactNode;
    if (formattedJSON) {
        content = <Text wrap="wrap" color={theme.text.primary}>{formattedJSON}</Text>;
    } else if (isSubagentProgress(contentData)) {
        content = <SubagentProgressDisplay progress={contentData} terminalWidth={ctx.childWidth} />;
    } else if (typeof contentData === 'string' && ctx.renderOutputAsMarkdown) {
        content = <MarkdownDisplay text={contentData} terminalWidth={ctx.childWidth} renderMarkdown={ctx.renderMarkdown} isPending={false} />;
    } else if (typeof contentData === 'string' && !ctx.renderOutputAsMarkdown) {
        content = <Text wrap="wrap" color={theme.text.primary}>{contentData}</Text>;
    } else if (isStructuredToolResult(contentData)) {
        content = ctx.renderOutputAsMarkdown
            ? <MarkdownDisplay text={contentData.summary} terminalWidth={ctx.childWidth} renderMarkdown={ctx.renderMarkdown} isPending={false} />
            : <Text wrap="wrap" color={theme.text.primary}>{contentData.summary}</Text>;
    } else if (typeof contentData === 'object' && contentData !== null && 'fileDiff' in contentData) {
        content = <DiffRenderer diffContent={(contentData as FileDiffResult).fileDiff} filename={(contentData as FileDiffResult).fileName} availableTerminalHeight={ctx.availableHeight} terminalWidth={ctx.childWidth} />;
    } else if (Array.isArray(contentData)) {
        const shouldDisableTruncation = ctx.isAlternateBuffer || (ctx.availableTerminalHeight === undefined && ctx.maxLines === undefined);
        content = <AnsiOutputText data={contentData as AnsiOutput} availableTerminalHeight={ctx.isAlternateBuffer ? undefined : ctx.availableHeight} width={ctx.childWidth} maxLines={ctx.isAlternateBuffer ? undefined : ctx.maxLines} disableTruncation={shouldDisableTruncation} />;
    } else if (typeof contentData === 'object' && contentData !== null) {
        content = <Text wrap="wrap" color={theme.text.primary}>{JSON.stringify(contentData, null, 2)}</Text>;
    } else {
        content = null;
    }
    if (ctx.isAlternateBuffer) {
        const effectiveMaxHeight = ctx.maxLines ?? ctx.availableHeight;
        return <Scrollable width={ctx.childWidth} maxHeight={effectiveMaxHeight} hasFocus={ctx.hasFocus} scrollToBottom={true} reportOverflow={true}>{content}</Scrollable>;
    }
    return content;
}

export const ToolResultDisplay: React.FC<ToolResultDisplayProps> = ({
    resultDisplay,
    availableTerminalHeight,
    terminalWidth,
    renderOutputAsMarkdown = true,
    maxLines,
    hasFocus = false,
    overflowDirection = 'top'
}) => {
    const { renderMarkdown, constrainHeight } = useUIState();
    const isAlternateBuffer = useAlternateBuffer();

    const availableHeight = calculateToolContentMaxLines({
        availableTerminalHeight,
        isAlternateBuffer,
        maxLinesLimit: maxLines
    });

    const combinedPaddingAndBorderWidth = 4;
    const childWidth = terminalWidth - combinedPaddingAndBorderWidth;

    const keyExtractor = React.useCallback(
        (_: AnsiLine, index: number) => index.toString(),
        []
    );

    const renderVirtualizedAnsiLine = React.useCallback(
        ({ item }: { item: AnsiLine }) => (
            <Box height={1} overflow="hidden">
                <AnsiLineText line={item} />
            </Box>
        ),
        []
    );

    if (!resultDisplay) return null;

    if (typeof resultDisplay === 'object' && 'todos' in resultDisplay) return null;

    const toolCtx = { childWidth, availableHeight, maxLines, renderOutputAsMarkdown, renderMarkdown, isAlternateBuffer, hasFocus };
    const renderContent = (contentData: string | object | undefined) => renderToolContent(contentData, toolCtx);

    if (Array.isArray(resultDisplay)) {
        const limit = maxLines ?? availableHeight ?? ACTIVE_SHELL_MAX_LINES;

        const data = resultDisplay as AnsiOutput;

        // Calculate list height: if not constrained, use full data length.
        // If constrained (e.g. alternate buffer), limit to available height
        // to ensure virtualization works and fits within the viewport.
        const listHeight = !constrainHeight
            ? data.length
            : Math.min(data.length, limit);

        if (isAlternateBuffer) {
            const initialScrollIndex =
        overflowDirection === 'bottom' ? 0 : SCROLL_TO_ITEM_END;

            return (
                <Box width={childWidth} flexDirection="column" maxHeight={listHeight}>
                    <ScrollableList
                        width={childWidth}
                        containerHeight={listHeight}
                        data={data}
                        renderItem={renderVirtualizedAnsiLine}
                        estimatedItemHeight={() => 1}
                        fixedItemHeight={true}
                        keyExtractor={keyExtractor}
                        initialScrollIndex={initialScrollIndex}
                        hasFocus={hasFocus}
                    />
                </Box>
            );
        } else {
            let displayData = data;
            let hiddenLines = 0;

            if (constrainHeight && data.length > listHeight) {
                hiddenLines = data.length - listHeight;
                if (overflowDirection === 'top') {
                    displayData = data.slice(hiddenLines);
                } else {
                    displayData = data.slice(0, listHeight);
                }
            }

            return (
                <Box width={childWidth} flexDirection="column">
                    <MaxSizedBox
                        maxHeight={constrainHeight ? listHeight : undefined}
                        maxWidth={childWidth}
                        overflowDirection={overflowDirection}
                        additionalHiddenLinesCount={hiddenLines}
                    >
                        {displayData.map((item, index) => {
                            const actualIndex =
                (overflowDirection === 'top' ? hiddenLines : 0) + index;
                            return (
                                <Box
                                    key={keyExtractor(item, actualIndex)}
                                    height={1}
                                    overflow="hidden"
                                >
                                    <AnsiLineText line={item} />
                                </Box>
                            );
                        })}
                    </MaxSizedBox>
                </Box>
            );
        }
    }

    // ASB Mode Handling (Interactive/Fullscreen)
    if (isAlternateBuffer) {
    // Standard path for strings/diffs in ASB
        return (
            <Box width={childWidth} flexDirection="column">
                {renderContent(resultDisplay)}
            </Box>
        );
    }

    // Standard Mode Handling (History/Scrollback)
    // We use SlicingMaxSizedBox which includes MaxSizedBox for precision truncation + hidden labels
    return (
        <Box width={childWidth} flexDirection="column">
            <SlicingMaxSizedBox
                data={resultDisplay}
                maxLines={maxLines}
                isAlternateBuffer={isAlternateBuffer}
                maxHeight={availableHeight}
                maxWidth={childWidth}
                overflowDirection={overflowDirection}
            >
                {(truncatedResultDisplay) => renderContent(truncatedResultDisplay)}
            </SlicingMaxSizedBox>
        </Box>
    );
};
