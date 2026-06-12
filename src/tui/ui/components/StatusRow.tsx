/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, ResizeObserver, type DOMElement } from 'ink';
import { ThoughtSummary } from '../utils/formatters.js';
import { isUserVisibleHook } from '../contexts/UIStateContext.js';
import stripAnsi from 'strip-ansi';
import { ActiveHook } from '../contexts/UIStateContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { theme } from '../semantic-colors.js';
import { GENERIC_WORKING_LABEL } from '../textConstants.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StatusDisplay } from './StatusDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { HorizontalLine } from './shared/HorizontalLine.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { ShellModeIndicator } from './ShellModeIndicator.js';
import { RawMarkdownIndicator } from './RawMarkdownIndicator.js';
import { useComposerStatus } from '../hooks/useComposerStatus.js';

/**
 * Layout constants to prevent magic numbers.
 */
const LAYOUT = {
    STATUS_MIN_HEIGHT: 1,
    TIP_LEFT_MARGIN: 2,
    TIP_RIGHT_MARGIN_NARROW: 0,
    TIP_RIGHT_MARGIN_WIDE: 1,
    INDICATOR_LEFT_MARGIN: 1,
    CONTEXT_DISPLAY_TOP_MARGIN_NARROW: 1,
    CONTEXT_DISPLAY_LEFT_MARGIN_NARROW: 1,
    CONTEXT_DISPLAY_LEFT_MARGIN_WIDE: 0,
    COLLISION_GAP: 10
};

interface StatusRowProps {
  showUiDetails: boolean;
  isNarrow: boolean;
  terminalWidth: number;
  hideContextSummary: boolean;
  hideUiDetailsForSuggestions: boolean;
  hasPendingActionRequired: boolean;
}

/**
 * Renders the loading or hook execution status.
 */
export const StatusNode: React.FC<{
  showTips: boolean;
  showWit: boolean;
  thought: ThoughtSummary | null;
  elapsedTime: number;
  currentWittyPhrase: string | undefined;
  activeHooks: ActiveHook[];
  showLoadingIndicator: boolean;
  errorVerbosity: 'low' | 'full' | undefined;
  onResize?: (width: number) => void;
}> = ({
    showTips,
    showWit,
    thought,
    elapsedTime,
    currentWittyPhrase,
    activeHooks,
    showLoadingIndicator,
    errorVerbosity,
    onResize
}) => {
    const observerRef = useRef<ResizeObserver | null>(null);

    useEffect(
        () => () => {
            observerRef.current?.disconnect();
        },
        []
    );

    const onRefChange = useCallback(
        (node: DOMElement | null) => {
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }

            if (node && onResize) {
                const observer = new ResizeObserver((entries) => {
                    const entry = entries[0];
                    if (entry) {
                        onResize(Math.round(entry.contentRect.width));
                    }
                });
                observer.observe(node);
                observerRef.current = observer;
            }
        },
        [onResize]
    );

    if (activeHooks.length === 0 && !showLoadingIndicator) return null;

    let currentLoadingPhrase: string | undefined = undefined;
    let currentThought: ThoughtSummary | null = null;

    if (activeHooks.length > 0) {
        const userVisibleHooks = activeHooks.filter((h) =>
            isUserVisibleHook(h.source)
        );

        if (userVisibleHooks.length > 0) {
            const label =
        userVisibleHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
            const displayNames = userVisibleHooks.map((h) => {
                let name = stripAnsi(h.name);
                if (h.index && h.total && h.total > 1) {
                    name += ` (${h.index}/${h.total})`;
                }
                return name;
            });
            currentLoadingPhrase = `${label}: ${displayNames.join(', ')}`;
        } else {
            currentLoadingPhrase = GENERIC_WORKING_LABEL;
        }
    } else {
    // Sanitize thought subject to prevent terminal injection
        currentThought = thought
            ? { ...thought, subject: stripAnsi(thought.subject) }
            : null;
    }

    return (
        <Box ref={onRefChange}>
            <LoadingIndicator
                inline
                showTips={showTips}
                showWit={showWit}
                errorVerbosity={errorVerbosity}
                thought={currentThought}
                currentLoadingPhrase={currentLoadingPhrase}
                elapsedTime={elapsedTime}
                forceRealStatusOnly={false}
                wittyPhrase={currentWittyPhrase}
            />
        </Box>
    );
};

import { useInputState } from '../contexts/InputContext.js';

function computeTipContent(
    showTips: boolean,
    currentTip: string | undefined,
    isInteractiveShellWaiting: boolean,
    showShortcutsHint: boolean,
    hideUiDetailsForSuggestions: boolean,
    hasPendingActionRequired: boolean,
    bufferTextLength: number,
    showUiDetails: boolean
): string | undefined {
    if (
        showTips &&
        currentTip &&
        !(isInteractiveShellWaiting && currentTip === INTERACTIVE_SHELL_WAITING_PHRASE)
    ) {
        return currentTip;
    }
    if (
        showShortcutsHint &&
        !hideUiDetailsForSuggestions &&
        !hasPendingActionRequired &&
        bufferTextLength === 0
    ) {
        return showUiDetails ? '? for shortcuts' : 'press tab twice for more';
    }
    return undefined;
}

const TipNode: React.FC<{
    tipContentStr: string;
    currentTip: string | undefined;
    currentWittyPhrase: string | undefined;
    shortcutsHelpVisible: boolean;
    onTipRefChange: (node: DOMElement | null) => void;
}> = ({ tipContentStr, currentTip, currentWittyPhrase, shortcutsHelpVisible, onTipRefChange }) => {
    const isShortcutHint =
        tipContentStr === '? for shortcuts' || tipContentStr === 'press tab twice for more';
    const color =
        isShortcutHint && shortcutsHelpVisible ? theme.text.accent : theme.text.secondary;
    return (
        <Box flexDirection="row" justifyContent="flex-end" ref={onTipRefChange}>
            <Text
                color={color}
                wrap="truncate-end"
                italic={!isShortcutHint && tipContentStr === currentWittyPhrase}
            >
                {tipContentStr === currentTip ? `Tip: ${tipContentStr}` : tipContentStr}
            </Text>
        </Box>
    );
};

const StatusRowRow1: React.FC<{
    showUiDetails: boolean;
    showRow1Minimal: boolean;
    showRow2Minimal: boolean;
    isInteractiveShellWaiting: boolean;
    isNarrow: boolean;
    showTipLine: boolean;
    tipContentStr: string | undefined;
    modeContentObj: { color: string; text: string } | null;
    statusNode: React.ReactNode;
    currentTip: string | undefined;
    currentWittyPhrase: string | undefined;
    shortcutsHelpVisible: boolean;
    onTipRefChange: (node: DOMElement | null) => void;
}> = ({
    showUiDetails, showRow1Minimal, showRow2Minimal, isInteractiveShellWaiting,
    isNarrow, showTipLine, tipContentStr, modeContentObj, statusNode,
    currentTip, currentWittyPhrase, shortcutsHelpVisible, onTipRefChange
}) => (
    <Box
        width="100%"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        minHeight={LAYOUT.STATUS_MIN_HEIGHT}
    >
        <Box flexDirection="row" flexGrow={1} flexShrink={1}>
            {!showUiDetails && showRow1Minimal ? (
                <Box flexDirection="row" columnGap={1}>
                    {statusNode}
                    {!showUiDetails && showRow2Minimal && modeContentObj && (
                        <Box>
                            <Text color={modeContentObj.color}>● {modeContentObj.text}</Text>
                        </Box>
                    )}
                </Box>
            ) : isInteractiveShellWaiting ? (
                <Box width="100%" marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
                    <Text color={theme.status.warning}>{INTERACTIVE_SHELL_WAITING_PHRASE}</Text>
                </Box>
            ) : (
                <Box
                    flexDirection="row"
                    alignItems={isNarrow ? 'flex-start' : 'center'}
                    flexGrow={1}
                    flexShrink={0}
                    marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}
                >
                    {statusNode}
                </Box>
            )}
        </Box>
        <Box
            flexShrink={0}
            marginLeft={showTipLine ? LAYOUT.TIP_LEFT_MARGIN : 0}
            marginRight={showTipLine ? (isNarrow ? LAYOUT.TIP_RIGHT_MARGIN_NARROW : LAYOUT.TIP_RIGHT_MARGIN_WIDE) : 0}
            position={showTipLine ? 'relative' : 'absolute'}
            {...(showTipLine ? {} : { top: -100, left: -100 })}
        >
            {!isNarrow && tipContentStr && (
                <TipNode
                    tipContentStr={tipContentStr}
                    currentTip={currentTip}
                    currentWittyPhrase={currentWittyPhrase}
                    shortcutsHelpVisible={shortcutsHelpVisible}
                    onTipRefChange={onTipRefChange}
                />
            )}
        </Box>
    </Box>
);

const StatusRowRow2: React.FC<{
    showUiDetails: boolean;
    isNarrow: boolean;
    hideUiDetailsForSuggestions: boolean;
    shellModeActive: boolean;
    showApprovalModeIndicator: boolean;
    allowPlanMode: boolean;
    renderMarkdown: boolean;
    showMinimalContext: boolean;
    modeContentObj: { color: string; text: string } | null;
    hideContextSummary: boolean;
    lastPromptTokenCount: number;
    currentModel: string;
    terminalWidth: number;
}> = ({
    showUiDetails, isNarrow, hideUiDetailsForSuggestions, shellModeActive,
    showApprovalModeIndicator, allowPlanMode, renderMarkdown, showMinimalContext,
    modeContentObj, hideContextSummary, lastPromptTokenCount, currentModel, terminalWidth
}) => (
    <Box
        width="100%"
        flexDirection={isNarrow ? 'column' : 'row'}
        alignItems={isNarrow ? 'flex-start' : 'center'}
        justifyContent="space-between"
    >
        <Box flexDirection="row" alignItems="center" marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
            {showUiDetails ? (
                <>
                    {!hideUiDetailsForSuggestions && !shellModeActive && (
                        <ApprovalModeIndicator approvalMode={showApprovalModeIndicator} allowPlanMode={allowPlanMode} />
                    )}
                    {shellModeActive && (
                        <Box marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}><ShellModeIndicator /></Box>
                    )}
                    {!renderMarkdown && (
                        <Box marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}><RawMarkdownIndicator /></Box>
                    )}
                </>
            ) : (
                showRow2Minimal && modeContentObj && (
                    <Text color={modeContentObj.color}>● {modeContentObj.text}</Text>
                )
            )}
        </Box>
        <Box
            marginTop={isNarrow ? LAYOUT.CONTEXT_DISPLAY_TOP_MARGIN_NARROW : 0}
            flexDirection="row"
            alignItems="center"
            marginLeft={isNarrow ? LAYOUT.CONTEXT_DISPLAY_LEFT_MARGIN_NARROW : LAYOUT.CONTEXT_DISPLAY_LEFT_MARGIN_WIDE}
        >
            {(showUiDetails || showMinimalContext) && (
                <StatusDisplay hideContextSummary={hideContextSummary} />
            )}
            {showMinimalContext && !showUiDetails && (
                <Box marginLeft={LAYOUT.INDICATOR_LEFT_MARGIN}>
                    <ContextUsageDisplay
                        promptTokenCount={lastPromptTokenCount}
                        model={typeof currentModel === 'string' ? currentModel : undefined}
                        terminalWidth={terminalWidth}
                    />
                </Box>
            )}
        </Box>
    </Box>
);

export const StatusRow: React.FC<StatusRowProps> = ({
    showUiDetails,
    isNarrow,
    terminalWidth,
    hideContextSummary,
    hideUiDetailsForSuggestions,
    hasPendingActionRequired
}) => {
    const uiState = useUIState();
    const inputState = useInputState();
    const settings = useSettings();
    const {
        isInteractiveShellWaiting,
        showLoadingIndicator,
        showTips,
        showWit,
        modeContentObj,
        showMinimalContext
    } = useComposerStatus();

    const [statusWidth, setStatusWidth] = useState(0);
    const [tipWidth, setTipWidth] = useState(0);
    const tipObserverRef = useRef<ResizeObserver | null>(null);

    useEffect(() => () => { tipObserverRef.current?.disconnect(); }, []);

    const onTipRefChange = useCallback((node: DOMElement | null) => {
        if (tipObserverRef.current) {
            tipObserverRef.current.disconnect();
            tipObserverRef.current = null;
        }
        if (node) {
            const observer = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (entry) {
                    const width = Math.round(entry.contentRect.width);
                    if (width > 0) setTipWidth(width);
                }
            });
            observer.observe(node);
            tipObserverRef.current = observer;
        }
    }, []);

    const tipContentStr = computeTipContent(
        showTips, uiState.currentTip, isInteractiveShellWaiting,
        settings.merged.ui.showShortcutsHint, hideUiDetailsForSuggestions,
        hasPendingActionRequired, inputState.buffer.text.length, showUiDetails
    );

    const willCollideTip = statusWidth + tipWidth + LAYOUT.COLLISION_GAP > terminalWidth;
    const showTipLine = Boolean(!hasPendingActionRequired && tipContentStr && !willCollideTip && !isNarrow);
    const showRow1Minimal = showLoadingIndicator || uiState.activeHooks.length > 0 || showTipLine;
    const showRow2Minimal = (Boolean(modeContentObj) && !hideUiDetailsForSuggestions) || showMinimalContext;

    const onStatusResize = useCallback((width: number) => {
        if (width > 0) setStatusWidth(width);
    }, []);

    const statusNode = (
        <StatusNode
            showTips={showTips}
            showWit={showWit}
            thought={uiState.thought}
            elapsedTime={uiState.elapsedTime}
            currentWittyPhrase={uiState.currentWittyPhrase}
            activeHooks={uiState.activeHooks}
            showLoadingIndicator={showLoadingIndicator}
            errorVerbosity={settings.merged.ui.errorVerbosity as 'low' | 'full' | undefined}
            onResize={onStatusResize}
        />
    );

    if (!showUiDetails && !showRow1Minimal && !showRow2Minimal) {
        return <Box height={LAYOUT.STATUS_MIN_HEIGHT} />;
    }

    return (
        <Box flexDirection="column" width="100%">
            {showRow1 && (
                <StatusRowRow1
                    showUiDetails={showUiDetails}
                    showRow1Minimal={showRow1Minimal}
                    showRow2Minimal={showRow2Minimal}
                    isInteractiveShellWaiting={isInteractiveShellWaiting}
                    isNarrow={isNarrow}
                    showTipLine={showTipLine}
                    tipContentStr={tipContentStr}
                    modeContentObj={modeContentObj}
                    statusNode={statusNode}
                    currentTip={uiState.currentTip}
                    currentWittyPhrase={uiState.currentWittyPhrase}
                    shortcutsHelpVisible={uiState.shortcutsHelpVisible}
                    onTipRefChange={onTipRefChange}
                />
            )}
            {showRow1 && showRow2 && (showUiDetails || (showRow1Minimal && showRow2Minimal)) && (
                <Box width="100%"><HorizontalLine dim /></Box>
            )}
            {showRow2 && (
                <StatusRowRow2
                    showUiDetails={showUiDetails}
                    isNarrow={isNarrow}
                    hideUiDetailsForSuggestions={hideUiDetailsForSuggestions}
                    shellModeActive={inputState.shellModeActive}
                    showApprovalModeIndicator={uiState.showApprovalModeIndicator}
                    allowPlanMode={uiState.allowPlanMode}
                    renderMarkdown={uiState.renderMarkdown}
                    showMinimalContext={showMinimalContext}
                    modeContentObj={modeContentObj}
                    hideContextSummary={hideContextSummary}
                    lastPromptTokenCount={uiState.sessionStats.lastPromptTokenCount}
                    currentModel={typeof uiState.currentModel === 'string' ? uiState.currentModel : ''}
                    terminalWidth={terminalWidth}
                />
            )}
        </Box>
    );
};
