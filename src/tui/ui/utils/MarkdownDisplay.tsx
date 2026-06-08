/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../semantic-colors.js';
import { colorizeCode } from './CodeColorizer.js';
import { TableRenderer } from './TableRenderer.js';
import { RenderInline } from './InlineMarkdownRenderer.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

interface MarkdownDisplayProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderMarkdown?: boolean;
}

// Constants for Markdown parsing and rendering

const EMPTY_LINE_HEIGHT = 1;
const CODE_BLOCK_PREFIX_PADDING = 1;
const LIST_ITEM_PREFIX_PADDING = 1;
const LIST_ITEM_TEXT_FLEX_GROW = 1;

interface LineParseState {
  inCodeBlock: boolean;
  lastLineEmpty: boolean;
  codeBlockContent: string[];
  codeBlockLang: string | null;
  codeBlockFence: string;
  inTable: boolean;
  tableRows: string[][];
  tableHeaders: string[];
}

function renderHeaderNode(
    level: number,
    headerText: string,
    responseColor: string
): React.ReactNode {
    switch (level) {
        case 1:
        case 2:
            return (
                <Text bold color={theme.text.link}>
                    <RenderInline text={headerText} defaultColor={theme.text.link} />
                </Text>
            );
        case 3:
            return (
                <Text bold color={responseColor}>
                    <RenderInline text={headerText} defaultColor={responseColor} />
                </Text>
            );
        case 4:
            return (
                <Text italic color={theme.text.secondary}>
                    <RenderInline text={headerText} defaultColor={theme.text.secondary} />
                </Text>
            );
        default:
            return (
                <Text color={responseColor}>
                    <RenderInline text={headerText} defaultColor={responseColor} />
                </Text>
            );
    }
}

function processMarkdownLine(
    line: string,
    index: number,
    lines: string[],
    state: LineParseState,
    contentBlocks: React.ReactNode[],
    responseColor: string,
    isPending: boolean,
    availableTerminalHeight: number | undefined,
    terminalWidth: number,
    isAlternateBuffer: boolean
): void {
    const key = `line-${index}`;
    const headerRegex = /^ *(#{1,4}) +(.*)/;
    const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\w*?) *$/;
    const ulItemRegex = /^([ \t]*)([-*+]) +(.*)/;
    const olItemRegex = /^([ \t]*)(\d+)\. +(.*)/;
    const hrRegex = /^ *([-*_] *){3,} *$/;
    const tableRowRegex = /^\s*\|(.+)\|\s*$/;
    const tableSeparatorRegex = /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/;

    const addContentBlock = (block: React.ReactNode) => {
        if (block) {
            contentBlocks.push(block);
            state.lastLineEmpty = false;
        }
    };

    if (state.inCodeBlock) {
        const fenceMatch = line.match(codeFenceRegex);
        if (
            fenceMatch &&
            fenceMatch[1].startsWith(state.codeBlockFence[0]) &&
            fenceMatch[1].length >= state.codeBlockFence.length
        ) {
            addContentBlock(
                <RenderCodeBlock
                    key={key}
                    content={state.codeBlockContent}
                    lang={state.codeBlockLang}
                    isPending={isPending}
                    availableTerminalHeight={
                        isAlternateBuffer ? undefined : availableTerminalHeight
                    }
                    terminalWidth={terminalWidth}
                />
            );
            state.inCodeBlock = false;
            state.codeBlockContent = [];
            state.codeBlockLang = null;
            state.codeBlockFence = '';
        } else {
            state.codeBlockContent.push(line);
        }
        return;
    }

    const codeFenceMatch = line.match(codeFenceRegex);
    const headerMatch = line.match(headerRegex);
    const ulMatch = line.match(ulItemRegex);
    const olMatch = line.match(olItemRegex);
    const hrMatch = line.match(hrRegex);
    const tableRowMatch = line.match(tableRowRegex);
    const tableSeparatorMatch = line.match(tableSeparatorRegex);

    if (codeFenceMatch) {
        state.inCodeBlock = true;
        state.codeBlockFence = codeFenceMatch[1];
        state.codeBlockLang = codeFenceMatch[2] || null;
    } else if (tableRowMatch && !state.inTable) {
        if (
            index + 1 < lines.length &&
            lines[index + 1].match(tableSeparatorRegex)
        ) {
            state.inTable = true;
            state.tableHeaders = tableRowMatch[1].split('|').map((cell) => cell.trim());
            state.tableRows = [];
        } else {
            addContentBlock(
                <Box key={key}>
                    <Text wrap="wrap" color={responseColor}>
                        <RenderInline text={line} defaultColor={responseColor} />
                    </Text>
                </Box>
            );
        }
    } else if (state.inTable && tableSeparatorMatch) {
        // Skip separator line
    } else if (state.inTable && tableRowMatch) {
        const cells = tableRowMatch[1].split('|').map((cell) => cell.trim());
        while (cells.length < state.tableHeaders.length) cells.push('');
        if (cells.length > state.tableHeaders.length) cells.length = state.tableHeaders.length;
        state.tableRows.push(cells);
    } else if (state.inTable && !tableRowMatch) {
        if (state.tableHeaders.length > 0 && state.tableRows.length > 0) {
            addContentBlock(
                <RenderTable
                    key={`table-${contentBlocks.length}`}
                    headers={state.tableHeaders}
                    rows={state.tableRows}
                    terminalWidth={terminalWidth}
                />
            );
        }
        state.inTable = false;
        state.tableRows = [];
        state.tableHeaders = [];
        if (line.trim().length > 0) {
            addContentBlock(
                <Box key={key}>
                    <Text wrap="wrap" color={responseColor}>
                        <RenderInline text={line} defaultColor={responseColor} />
                    </Text>
                </Box>
            );
        }
    } else if (hrMatch) {
        addContentBlock(
            <Box key={key}>
                <Text dimColor>---</Text>
            </Box>
        );
    } else if (headerMatch) {
        const level = headerMatch[1].length;
        const headerNode = renderHeaderNode(level, headerMatch[2], responseColor);
        if (headerNode) addContentBlock(<Box key={key}>{headerNode}</Box>);
    } else if (ulMatch) {
        addContentBlock(
            <RenderListItem
                key={key}
                itemText={ulMatch[3]}
                type="ul"
                marker={ulMatch[2]}
                leadingWhitespace={ulMatch[1]}
            />
        );
    } else if (olMatch) {
        addContentBlock(
            <RenderListItem
                key={key}
                itemText={olMatch[3]}
                type="ol"
                marker={olMatch[2]}
                leadingWhitespace={olMatch[1]}
            />
        );
    } else if (line.trim().length === 0) {
        if (!state.lastLineEmpty) {
            contentBlocks.push(
                <Box key={`spacer-${index}`} height={EMPTY_LINE_HEIGHT} />
            );
            state.lastLineEmpty = true;
        }
    } else {
        addContentBlock(
            <Box key={key}>
                <Text wrap="wrap" color={responseColor}>
                    <RenderInline text={line} defaultColor={responseColor} />
                </Text>
            </Box>
        );
    }
}

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({
    text,
    isPending,
    availableTerminalHeight,
    terminalWidth,
    renderMarkdown = true
}) => {
    const settings = useSettings();
    const isAlternateBuffer = useAlternateBuffer();
    const responseColor = theme.text.response ?? theme.text.primary;

    if (!text) return <></>;

    // Raw markdown mode - display syntax-highlighted markdown without rendering
    if (!renderMarkdown) {
    // Hide line numbers in raw markdown mode as they are confusing due to chunked output
        const colorizedMarkdown = colorizeCode({
            code: text,
            language: 'markdown',
            availableHeight: isAlternateBuffer ? undefined : availableTerminalHeight,
            maxWidth: terminalWidth - CODE_BLOCK_PREFIX_PADDING,
            settings,
            hideLineNumbers: true
        });
        return (
            <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
                {colorizedMarkdown}
            </Box>
        );
    }

    const lines = text.split(/\r?\n/);

    const contentBlocks: React.ReactNode[] = [];
    const state: LineParseState = {
        inCodeBlock: false,
        lastLineEmpty: true,
        codeBlockContent: [],
        codeBlockLang: null,
        codeBlockFence: '',
        inTable: false,
        tableRows: [],
        tableHeaders: []
    };

    lines.forEach((line, index) => {
        processMarkdownLine(
            line, index, lines, state, contentBlocks,
            responseColor, isPending, availableTerminalHeight,
            terminalWidth, isAlternateBuffer
        );
    });

    if (state.inCodeBlock) {
        contentBlocks.push(
            <RenderCodeBlock
                key="line-eof"
                content={state.codeBlockContent}
                lang={state.codeBlockLang}
                isPending={isPending}
                availableTerminalHeight={
                    isAlternateBuffer ? undefined : availableTerminalHeight
                }
                terminalWidth={terminalWidth}
            />
        );
    }

    if (state.inTable && state.tableHeaders.length > 0 && state.tableRows.length > 0) {
        contentBlocks.push(
            <RenderTable
                key={`table-${contentBlocks.length}`}
                headers={state.tableHeaders}
                rows={state.tableRows}
                terminalWidth={terminalWidth}
            />
        );
    }

    return <>{contentBlocks}</>;
};

// Helper functions (adapted from static methods of MarkdownRenderer)

interface RenderCodeBlockProps {
  content: string[];
  lang: string | null;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

const RenderCodeBlockInternal: React.FC<RenderCodeBlockProps> = ({
    content,
    lang,
    isPending,
    availableTerminalHeight,
    terminalWidth
}) => {
    const settings = useSettings();
    const isAlternateBuffer = useAlternateBuffer();
    const MIN_LINES_FOR_MESSAGE = 1; // Minimum lines to show before the "generating more" message
    const RESERVED_LINES = 2; // Lines reserved for the message itself and potential padding

    // When not in alternate buffer mode we need to be careful that we don't
    // trigger flicker when the pending code is too long to fit in the terminal
    if (
        !isAlternateBuffer &&
    isPending &&
    availableTerminalHeight !== undefined
    ) {
        const MAX_CODE_LINES_WHEN_PENDING = Math.max(
            0,
            availableTerminalHeight - RESERVED_LINES
        );

        if (content.length > MAX_CODE_LINES_WHEN_PENDING) {
            if (MAX_CODE_LINES_WHEN_PENDING < MIN_LINES_FOR_MESSAGE) {
                // Not enough space to even show the message meaningfully
                return (
                    <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING}>
                        <Text color={theme.text.secondary}>
              ... code is being written ...
                        </Text>
                    </Box>
                );
            }
            const truncatedContent = content.slice(0, MAX_CODE_LINES_WHEN_PENDING);
            const colorizedTruncatedCode = colorizeCode({
                code: truncatedContent.join('\n'),
                language: lang,
                availableHeight: availableTerminalHeight,
                maxWidth: terminalWidth - CODE_BLOCK_PREFIX_PADDING,
                settings
            });
            return (
                <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
                    {colorizedTruncatedCode}
                    <Text color={theme.text.secondary}>... generating more ...</Text>
                </Box>
            );
        }
    }

    const fullContent = content.join('\n');
    const colorizedCode = colorizeCode({
        code: fullContent,
        language: lang,
        availableHeight: isAlternateBuffer ? undefined : availableTerminalHeight,
        maxWidth: terminalWidth - CODE_BLOCK_PREFIX_PADDING,
        settings
    });

    return (
        <Box
            paddingLeft={CODE_BLOCK_PREFIX_PADDING}
            flexDirection="column"
            width={terminalWidth}
            flexShrink={0}
        >
            {colorizedCode}
        </Box>
    );
};

const RenderCodeBlock = React.memo(RenderCodeBlockInternal);

interface RenderListItemProps {
  itemText: string;
  type: 'ul' | 'ol';
  marker: string;
  leadingWhitespace?: string;
}

const RenderListItemInternal: React.FC<RenderListItemProps> = ({
    itemText,
    type,
    marker,
    leadingWhitespace = ''
}) => {
    const prefix = type === 'ol' ? `${marker}. ` : `${marker} `;
    const prefixWidth = prefix.length;
    // Account for leading whitespace (indentation level) plus the standard prefix padding
    const indentation = leadingWhitespace.length;
    const listResponseColor = theme.text.response ?? theme.text.primary;

    return (
        <Box
            paddingLeft={indentation + LIST_ITEM_PREFIX_PADDING}
            flexDirection="row"
        >
            <Box width={prefixWidth} flexShrink={0}>
                <Text color={listResponseColor}>{prefix}</Text>
            </Box>
            <Box flexGrow={LIST_ITEM_TEXT_FLEX_GROW}>
                <Text wrap="wrap" color={listResponseColor}>
                    <RenderInline text={itemText} defaultColor={listResponseColor} />
                </Text>
            </Box>
        </Box>
    );
};

const RenderListItem = React.memo(RenderListItemInternal);

interface RenderTableProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const RenderTableInternal: React.FC<RenderTableProps> = ({
    headers,
    rows,
    terminalWidth
}) => (
    <TableRenderer headers={headers} rows={rows} terminalWidth={terminalWidth} />
);

const RenderTable = React.memo(RenderTableInternal);

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal);
