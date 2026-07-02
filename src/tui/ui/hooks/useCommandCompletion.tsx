/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../contexts/UIStateContext.js';
import { toCodePoints } from '../utils/textUtils.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { useAtCompletion } from './useAtCompletion.js';
import { useSlashCompletion } from './useSlashCompletion.js';
import { useShellCompletion } from './useShellCompletion.js';
import {
    usePromptCompletion,
    PROMPT_COMPLETION_MIN_LENGTH,
    type PromptCompletion
} from './usePromptCompletion.js';
import { HiveConfig } from '../../config/hiveConfig.js';
import { useCompletion } from './useCompletion.js';

export enum CompletionMode {
  IDLE = 'IDLE',
  AT = 'AT',
  SLASH = 'SLASH',
  PROMPT = 'PROMPT',
  SHELL = 'SHELL',
}

export interface UseCommandCompletionReturn {
  suggestions: Suggestion[];
  activeSuggestionIndex: number;
  visibleStartIndex: number;
  showSuggestions: boolean;
  isLoadingSuggestions: boolean;
  isPerfectMatch: boolean;
  forceShowShellSuggestions: boolean;
  setForceShowShellSuggestions: (value: boolean) => void;
  isShellSuggestionsVisible: boolean;
  setActiveSuggestionIndex: React.Dispatch<React.SetStateAction<number>>;
  resetCompletionState: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  handleAutocomplete: (indexToUse: number) => void;
  promptCompletion: PromptCompletion;
  getCommandFromSuggestion: (
    suggestion: Suggestion,
  ) => SlashCommand | undefined;
  slashCompletionRange: {
    completionStart: number;
    completionEnd: number;
    getCommandFromSuggestion: (
      suggestion: Suggestion,
    ) => SlashCommand | undefined;
    isArgumentCompletion: boolean;
    leafCommand: SlashCommand | null;
  };
  getCompletedText: (suggestion: Suggestion) => string | null;
  completionMode: CompletionMode;
}

export interface UseCommandCompletionOptions {
  buffer: TextBuffer;
  cwd: string;
  slashCommands: readonly SlashCommand[];
  commandContext: CommandContext;
  reverseSearchActive?: boolean;
  shellModeActive: boolean;
  config?: HiveConfig;
  active: boolean;
}

function buildSuggestionText(
    suggestion: Suggestion,
    completionMode: CompletionMode,
    start: number,
    end: number,
    buffer: TextBuffer,
    cursorRow: number,
    slashCompletionRange: { completionStart: number; completionEnd: number; getCommandFromSuggestion: (s: Suggestion) => SlashCommand | undefined },
    shellCompletionRange: { completionStart: number; completionEnd: number }
): { suggestionText: string; start: number; end: number } {
    let resolvedStart = start;
    let resolvedEnd = end;
    if (completionMode === CompletionMode.SLASH) {
        resolvedStart = slashCompletionRange.completionStart;
        resolvedEnd = slashCompletionRange.completionEnd;
    } else if (completionMode === CompletionMode.SHELL) {
        resolvedStart = shellCompletionRange.completionStart;
        resolvedEnd = shellCompletionRange.completionEnd;
    }

    let suggestionText = suggestion.insertValue ?? suggestion.value;
    if (completionMode === CompletionMode.SLASH) {
        if (resolvedStart === resolvedEnd && resolvedStart > 1 && (buffer.lines[cursorRow] || '')[resolvedStart - 1] !== ' ') {
            suggestionText = ' ' + suggestionText;
        }
    }

    const lineCodePoints = toCodePoints(buffer.lines[cursorRow] || '');
    const charAfterCompletion = lineCodePoints[resolvedEnd];

    let shouldAddSpace = true;
    if (completionMode === CompletionMode.SLASH) {
        const command = slashCompletionRange.getCommandFromSuggestion(suggestion);
        const isExecutableCommand = !!(command && command.action);
        const requiresArguments = !!(command && command.completion);
        shouldAddSpace = !isExecutableCommand || requiresArguments;
    }

    if (charAfterCompletion !== ' ' && !suggestionText.endsWith('/') && !suggestionText.endsWith('\\') && shouldAddSpace) {
        suggestionText += ' ';
    }

    return { suggestionText, start: resolvedStart, end: resolvedEnd };
}

interface CompletionModeResult {
    completionMode: CompletionMode;
    query: string | null;
    completionStart: number;
    completionEnd: number;
}

function resolveCompletionMode(
    buffer: TextBuffer,
    cursorRow: number,
    cursorCol: number,
    shellModeActive: boolean
): CompletionModeResult {
    const currentLine = buffer.lines[cursorRow] || '';
    const codePoints = toCodePoints(currentLine);

    if (shellModeActive) {
        return {
            completionMode: currentLine.trim().length === 0 ? CompletionMode.IDLE : CompletionMode.SHELL,
            query: '',
            completionStart: -1,
            completionEnd: -1
        };
    }

    for (let i = cursorCol - 1; i >= 0; i--) {
        const char = codePoints[i];
        if (char === ' ') {
            let backslashCount = 0;
            for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
                backslashCount++;
            }
            if (backslashCount % 2 === 0) break;
        } else if (char === '@') {
            let end = codePoints.length;
            for (let k = cursorCol; k < codePoints.length; k++) {
                if (codePoints[k] === ' ') {
                    let backslashCount = 0;
                    for (let j = k - 1; j >= 0 && codePoints[j] === '\\'; j--) {
                        backslashCount++;
                    }
                    if (backslashCount % 2 === 0) {
                        end = k;
                        break;
                    }
                }
            }
            const pathStart = i + 1;
            return {
                completionMode: CompletionMode.AT,
                query: currentLine.substring(pathStart, end),
                completionStart: pathStart,
                completionEnd: end
            };
        }
    }

    if (cursorRow === 0 && isSlashCommand(currentLine.trim())) {
        return {
            completionMode: CompletionMode.SLASH,
            query: currentLine,
            completionStart: 0,
            completionEnd: currentLine.length
        };
    }

    const trimmedText = buffer.text.trim();
    const isPromptCompletionEnabled = false;
    if (
        isPromptCompletionEnabled &&
        trimmedText.length >= PROMPT_COMPLETION_MIN_LENGTH &&
        !isSlashCommand(trimmedText) &&
        !trimmedText.includes('@')
    ) {
        return {
            completionMode: CompletionMode.PROMPT,
            query: trimmedText,
            completionStart: 0,
            completionEnd: trimmedText.length
        };
    }

    return { completionMode: CompletionMode.IDLE, query: null, completionStart: -1, completionEnd: -1 };
}

function getCompletedTextForMode(
    suggestion: Suggestion,
    buffer: TextBuffer,
    cursorRow: number,
    completionMode: CompletionMode,
    completionStart: number,
    completionEnd: number,
    slashCompletionRange: { completionStart: number; completionEnd: number },
    shellCompletionRange: { completionStart: number; completionEnd: number }
): string | null {
    const currentLine = buffer.lines[cursorRow] || '';
    let start = completionStart;
    let end = completionEnd;
    if (completionMode === CompletionMode.SLASH) {
        start = slashCompletionRange.completionStart;
        end = slashCompletionRange.completionEnd;
    } else if (completionMode === CompletionMode.SHELL) {
        start = shellCompletionRange.completionStart;
        end = shellCompletionRange.completionEnd;
    }
    if (start === -1 || end === -1) return null;

    let suggestionText = suggestion.insertValue ?? suggestion.value;
    if (completionMode === CompletionMode.SLASH) {
        if (start === end && start > 1 && currentLine[start - 1] !== ' ') {
            suggestionText = ' ' + suggestionText;
        }
    }
    return currentLine.substring(0, start) + suggestionText + currentLine.substring(end);
}

function buildShellPromptCompletion(
    completionMode: CompletionMode,
    suggestions: Suggestion[],
    query: string | null,
    shellCompletionRange: { completionStart: number; completionEnd: number; activeStart: number },
    buffer: TextBuffer,
    cursorRow: number,
    basePromptCompletion: PromptCompletion
): PromptCompletion {
    if (
        completionMode === CompletionMode.SHELL &&
        suggestions.length === 1 &&
        query != null &&
        shellCompletionRange.completionStart === shellCompletionRange.activeStart
    ) {
        const suggestion = suggestions[0];
        const textToInsertBase = suggestion.value;
        if (textToInsertBase.startsWith(query) && textToInsertBase.length > query.length) {
            const currentLine = buffer.lines[cursorRow] || '';
            const start = shellCompletionRange.completionStart;
            const end = shellCompletionRange.completionEnd;
            let textToInsert = textToInsertBase;
            const charAfterCompletion = currentLine[end];
            if (charAfterCompletion !== ' ' && !textToInsert.endsWith('/') && !textToInsert.endsWith('\\')) {
                textToInsert += ' ';
            }
            const newText = currentLine.substring(0, start) + textToInsert + currentLine.substring(end);
            return {
                text: newText,
                isActive: true,
                isLoading: false,
                accept: () => {
                    buffer.replaceRangeByOffset(
                        logicalPosToOffset(buffer.lines, cursorRow, start),
                        logicalPosToOffset(buffer.lines, cursorRow, end),
                        textToInsert
                    );
                },
                clear: () => {},
                markSelected: () => {}
            };
        }
    }
    return basePromptCompletion;
}

export function useCommandCompletion({
    buffer,
    cwd,
    slashCommands,
    commandContext,
    reverseSearchActive = false,
    shellModeActive,
    config,
    active
}: UseCommandCompletionOptions): UseCommandCompletionReturn {
    const [forceShowShellSuggestions, setForceShowShellSuggestions] =
    useState(false);

    const {
        suggestions,
        activeSuggestionIndex,
        visibleStartIndex,
        isLoadingSuggestions,
        isPerfectMatch,

        setSuggestions,
        setActiveSuggestionIndex,
        setIsLoadingSuggestions,
        setIsPerfectMatch,
        setVisibleStartIndex,

        resetCompletionState: baseResetCompletionState,
        navigateUp,
        navigateDown
    } = useCompletion();

    const resetCompletionState = useCallback(() => {
        baseResetCompletionState();
        setForceShowShellSuggestions(false);
    }, [baseResetCompletionState]);

    const cursorRow = buffer.cursor[0];
    const cursorCol = buffer.cursor[1];

    const {
        completionMode,
        query: memoQuery,
        completionStart,
        completionEnd
    } = useMemo(
        () => resolveCompletionMode(buffer, cursorRow, cursorCol, shellModeActive),
        [cursorRow, cursorCol, buffer, shellModeActive]
    );

    useAtCompletion({
        enabled: active && completionMode === CompletionMode.AT,
        pattern: memoQuery || '',
        config,
        cwd,
        setSuggestions,
        setIsLoadingSuggestions
    });

    const slashCompletionRange = useSlashCompletion({
        enabled:
      active && completionMode === CompletionMode.SLASH && !shellModeActive,
        query: memoQuery,
        slashCommands,
        commandContext,
        setSuggestions,
        setIsLoadingSuggestions,
        setIsPerfectMatch
    });

    const shellCompletionRange = useShellCompletion({
        enabled: active && completionMode === CompletionMode.SHELL,
        line: buffer.lines[cursorRow] || '',
        cursorCol,
        cwd,
        setSuggestions,
        setIsLoadingSuggestions
    });

    const query =
    completionMode === CompletionMode.SHELL
        ? shellCompletionRange.query
        : memoQuery;

    const basePromptCompletion = usePromptCompletion({
        buffer
    });

    const isShellSuggestionsVisible =
    completionMode !== CompletionMode.SHELL || forceShowShellSuggestions;

    const promptCompletion = useMemo(
        () => buildShellPromptCompletion(completionMode, suggestions, query, shellCompletionRange, buffer, cursorRow, basePromptCompletion),
        [completionMode, suggestions, query, basePromptCompletion, buffer, cursorRow, shellCompletionRange]
    );

    useEffect(() => {
        setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
        setVisibleStartIndex(0);

        // Generic perfect match detection for non-slash modes or as a fallback
        if (completionMode !== CompletionMode.SLASH) {
            if (suggestions.length > 0) {
                const firstSuggestion = suggestions[0];
                setIsPerfectMatch(firstSuggestion.value === query);
            } else {
                setIsPerfectMatch(false);
            }
        }
    }, [
        suggestions,
        setActiveSuggestionIndex,
        setVisibleStartIndex,
        completionMode,
        query,
        setIsPerfectMatch
    ]);

    useEffect(() => {
        if (
            !active ||
      completionMode === CompletionMode.IDLE ||
      reverseSearchActive
        ) {
            resetCompletionState();
        }
    }, [active, completionMode, reverseSearchActive, resetCompletionState]);

    const showSuggestions =
    active &&
    completionMode !== CompletionMode.IDLE &&
    !reverseSearchActive &&
    isShellSuggestionsVisible &&
    (isLoadingSuggestions || suggestions.length > 0);

    /**
   * Gets the completed text by replacing the completion range with the suggestion value.
   * This is the core string replacement logic used by both autocomplete and auto-execute.
   *
   * @param suggestion The suggestion to apply
   * @returns The completed text with the suggestion applied, or null if invalid
   */
    const getCompletedText = useCallback(
        (suggestion: Suggestion): string | null =>
            getCompletedTextForMode(
                suggestion, buffer, cursorRow, completionMode,
                completionStart, completionEnd,
                slashCompletionRange, shellCompletionRange
            ),
        [
            cursorRow,
            buffer,
            completionMode,
            completionStart,
            completionEnd,
            slashCompletionRange,
            shellCompletionRange
        ]
    );

    const handleAutocomplete = useCallback(
        (indexToUse: number) => {
            if (indexToUse < 0 || indexToUse >= suggestions.length) {
                return;
            }
            const suggestion = suggestions[indexToUse];
            const completedText = getCompletedText(suggestion);
            if (completedText === null) {
                return;
            }

            const { suggestionText, start, end } = buildSuggestionText(
                suggestion, completionMode, completionStart, completionEnd,
                buffer, cursorRow,
                slashCompletionRange, shellCompletionRange
            );

            buffer.replaceRangeByOffset(
                logicalPosToOffset(buffer.lines, cursorRow, start),
                logicalPosToOffset(buffer.lines, cursorRow, end),
                suggestionText
            );
        },
        [
            cursorRow,
            buffer,
            suggestions,
            completionMode,
            completionStart,
            completionEnd,
            slashCompletionRange,
            shellCompletionRange,
            getCompletedText
        ]
    );

    return {
        suggestions,
        activeSuggestionIndex,
        visibleStartIndex,
        showSuggestions,
        isLoadingSuggestions,
        isPerfectMatch,
        forceShowShellSuggestions,
        setForceShowShellSuggestions,
        isShellSuggestionsVisible,
        setActiveSuggestionIndex,
        resetCompletionState,
        navigateUp,
        navigateDown,
        handleAutocomplete,
        promptCompletion,
        getCommandFromSuggestion: slashCompletionRange.getCommandFromSuggestion,
        slashCompletionRange,
        getCompletedText,
        completionMode
    };
}
