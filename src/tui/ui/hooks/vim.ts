/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useReducer, useEffect, useRef } from 'react';
import type { Key } from './useKeypress.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { debugLogger } from '../../utils/errors.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from './useKeyMatchers.js';
import { toCodePoints } from '../utils/textUtils.js';

export type VimMode = 'NORMAL' | 'INSERT';

// Constants
const DIGIT_MULTIPLIER = 10;
const DEFAULT_COUNT = 1;
const DIGIT_1_TO_9 = /^[1-9]$/;
const DOUBLE_ESCAPE_TIMEOUT_MS = 500; // Timeout for double-escape to clear input

// Command types
const CMD_TYPES = {
    DELETE_WORD_FORWARD: 'dw',
    DELETE_WORD_BACKWARD: 'db',
    DELETE_WORD_END: 'de',
    DELETE_BIG_WORD_FORWARD: 'dW',
    DELETE_BIG_WORD_BACKWARD: 'dB',
    DELETE_BIG_WORD_END: 'dE',
    CHANGE_WORD_FORWARD: 'cw',
    CHANGE_WORD_BACKWARD: 'cb',
    CHANGE_WORD_END: 'ce',
    CHANGE_BIG_WORD_FORWARD: 'cW',
    CHANGE_BIG_WORD_BACKWARD: 'cB',
    CHANGE_BIG_WORD_END: 'cE',
    DELETE_CHAR: 'x',
    DELETE_CHAR_BEFORE: 'X',
    TOGGLE_CASE: '~',
    REPLACE_CHAR: 'r',
    DELETE_LINE: 'dd',
    CHANGE_LINE: 'cc',
    DELETE_TO_EOL: 'D',
    CHANGE_TO_EOL: 'C',
    CHANGE_MOVEMENT: {
        LEFT: 'ch',
        DOWN: 'cj',
        UP: 'ck',
        RIGHT: 'cl'
    },
    DELETE_MOVEMENT: {
        LEFT: 'dh',
        DOWN: 'dj',
        UP: 'dk',
        RIGHT: 'dl'
    },
    DELETE_TO_SOL: 'd0',
    DELETE_TO_FIRST_NONWS: 'd^',
    CHANGE_TO_SOL: 'c0',
    CHANGE_TO_FIRST_NONWS: 'c^',
    DELETE_TO_FIRST_LINE: 'dgg',
    DELETE_TO_LAST_LINE: 'dG',
    CHANGE_TO_FIRST_LINE: 'cgg',
    CHANGE_TO_LAST_LINE: 'cG',
    YANK_LINE: 'yy',
    YANK_WORD_FORWARD: 'yw',
    YANK_BIG_WORD_FORWARD: 'yW',
    YANK_WORD_END: 'ye',
    YANK_BIG_WORD_END: 'yE',
    YANK_TO_EOL: 'y$',
    PASTE_AFTER: 'p',
    PASTE_BEFORE: 'P'
} as const;

type PendingFindOp = {
  op: 'f' | 'F' | 't' | 'T' | 'r';
  operator: 'd' | 'c' | undefined;
  count: number; // captured at keypress time, before CLEAR_PENDING_STATES resets it
};

const createClearPendingState = () => ({
    count: 0,
    pendingOperator: null as 'g' | 'd' | 'c' | 'dg' | 'cg' | null,
    pendingFindOp: undefined as PendingFindOp | undefined
});

type VimState = {
  mode: VimMode;
  count: number;
  pendingOperator: 'g' | 'd' | 'c' | 'y' | 'dg' | 'cg' | null;
  pendingFindOp: PendingFindOp | undefined;
  lastCommand: { type: string; count: number; char?: string } | null;
  lastFind: { op: 'f' | 'F' | 't' | 'T'; char: string } | undefined;
};

interface VimNormalModeContext {
    normalizedKey: Key;
    state: VimState;
    dispatch: React.Dispatch<VimAction>;
    buffer: TextBuffer;
    updateMode: (mode: VimMode) => void;
    getCurrentCount: () => number;
    executeCommand: (cmdType: string, count: number, char?: string) => boolean;
    handleDeleteMovement: (movement: string) => boolean;
    handleChangeMovement: (movement: string) => boolean;
    handleOperatorMotion: (operator: string, motion: string) => boolean;
    checkDoubleEscape: () => boolean;
    keyMatchers: ReturnType<typeof useKeyMatchers>;
    lastEscapeTimestampRef: React.MutableRefObject<number>;
}

type VimAction =
  | { type: 'SET_MODE'; mode: VimMode }
  | { type: 'SET_COUNT'; count: number }
  | { type: 'INCREMENT_COUNT'; digit: number }
  | { type: 'CLEAR_COUNT' }
  | {
      type: 'SET_PENDING_OPERATOR';
      operator: 'g' | 'd' | 'c' | 'y' | 'dg' | 'cg' | null;
    }
  | { type: 'SET_PENDING_FIND_OP'; pendingFindOp: PendingFindOp | undefined }
  | {
      type: 'SET_LAST_FIND';
      find: { op: 'f' | 'F' | 't' | 'T'; char: string } | undefined;
    }
  | {
      type: 'SET_LAST_COMMAND';
      command: { type: string; count: number; char?: string } | null;
    }
  | { type: 'CLEAR_PENDING_STATES' }
  | { type: 'ESCAPE_TO_NORMAL' };

const initialVimState: VimState = {
    mode: 'INSERT',
    count: 0,
    pendingOperator: null,
    pendingFindOp: undefined,
    lastCommand: null,
    lastFind: undefined
};

// Reducer function
const vimReducer = (state: VimState, action: VimAction): VimState => {
    switch (action.type) {
        case 'SET_MODE':
            return { ...state, mode: action.mode };

        case 'SET_COUNT':
            return { ...state, count: action.count };

        case 'INCREMENT_COUNT':
            return { ...state, count: state.count * DIGIT_MULTIPLIER + action.digit };

        case 'CLEAR_COUNT':
            return { ...state, count: 0 };

        case 'SET_PENDING_OPERATOR':
            return { ...state, pendingOperator: action.operator };

        case 'SET_PENDING_FIND_OP':
            return { ...state, pendingFindOp: action.pendingFindOp };

        case 'SET_LAST_FIND':
            return { ...state, lastFind: action.find };

        case 'SET_LAST_COMMAND':
            return { ...state, lastCommand: action.command };

        case 'CLEAR_PENDING_STATES':
            return {
                ...state,
                ...createClearPendingState()
            };

        case 'ESCAPE_TO_NORMAL':
            // Handle escape - clear all pending states (mode is updated via context)
            return {
                ...state,
                ...createClearPendingState()
            };

        default:
            return state;
    }
};

// ============================================================
// Helper functions for executeCommand
// ============================================================

function executeDeleteCommands(cmdType: string, count: number, buf: TextBuffer): boolean {
    const deleteMap: Record<string, () => void> = {
        [CMD_TYPES.DELETE_WORD_FORWARD]: () => buf.vimDeleteWordForward(count),
        [CMD_TYPES.DELETE_WORD_BACKWARD]: () => buf.vimDeleteWordBackward(count),
        [CMD_TYPES.DELETE_WORD_END]: () => buf.vimDeleteWordEnd(count),
        [CMD_TYPES.DELETE_BIG_WORD_FORWARD]: () => buf.vimDeleteBigWordForward(count),
        [CMD_TYPES.DELETE_BIG_WORD_BACKWARD]: () => buf.vimDeleteBigWordBackward(count),
        [CMD_TYPES.DELETE_BIG_WORD_END]: () => buf.vimDeleteBigWordEnd(count),
        [CMD_TYPES.DELETE_CHAR]: () => buf.vimDeleteChar(count),
        [CMD_TYPES.DELETE_CHAR_BEFORE]: () => buf.vimDeleteCharBefore(count),
        [CMD_TYPES.DELETE_LINE]: () => buf.vimDeleteLine(count),
        [CMD_TYPES.DELETE_TO_EOL]: () => buf.vimDeleteToEndOfLine(count),
        [CMD_TYPES.DELETE_TO_SOL]: () => buf.vimDeleteToStartOfLine(),
        [CMD_TYPES.DELETE_TO_FIRST_NONWS]: () => buf.vimDeleteToFirstNonWhitespace(),
        [CMD_TYPES.DELETE_TO_FIRST_LINE]: () => buf.vimDeleteToFirstLine(count),
        [CMD_TYPES.DELETE_TO_LAST_LINE]: () => buf.vimDeleteToLastLine(count)
    };
    const fn = deleteMap[cmdType];
    if (fn) { fn(); return true; }
    const movementDeleteMap: Record<string, () => void> = {
        [CMD_TYPES.DELETE_MOVEMENT.LEFT]: () => buf.vimChangeMovement('h', count),
        [CMD_TYPES.DELETE_MOVEMENT.DOWN]: () => buf.vimChangeMovement('j', count),
        [CMD_TYPES.DELETE_MOVEMENT.UP]: () => buf.vimChangeMovement('k', count),
        [CMD_TYPES.DELETE_MOVEMENT.RIGHT]: () => buf.vimChangeMovement('l', count)
    };
    const mfn = movementDeleteMap[cmdType];
    if (mfn) { mfn(); return true; }
    return false;
}

function executeChangeCommands(cmdType: string, count: number, buf: TextBuffer, updateModeFn: (mode: VimMode) => void): boolean {
    const changeMap: Record<string, () => void> = {
        [CMD_TYPES.CHANGE_WORD_FORWARD]: () => { buf.vimChangeWordForward(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_WORD_BACKWARD]: () => { buf.vimChangeWordBackward(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_WORD_END]: () => { buf.vimChangeWordEnd(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_BIG_WORD_FORWARD]: () => { buf.vimChangeBigWordForward(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_BIG_WORD_BACKWARD]: () => { buf.vimChangeBigWordBackward(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_BIG_WORD_END]: () => { buf.vimChangeBigWordEnd(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_LINE]: () => { buf.vimChangeLine(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_TO_EOL]: () => { buf.vimChangeToEndOfLine(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_TO_SOL]: () => { buf.vimChangeToStartOfLine(); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_TO_FIRST_NONWS]: () => { buf.vimChangeToFirstNonWhitespace(); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_TO_FIRST_LINE]: () => { buf.vimDeleteToFirstLine(count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_TO_LAST_LINE]: () => { buf.vimDeleteToLastLine(count); updateModeFn('INSERT'); }
    };
    const fn = changeMap[cmdType];
    if (fn) { fn(); return true; }
    const movementChangeMap: Record<string, () => void> = {
        [CMD_TYPES.CHANGE_MOVEMENT.LEFT]: () => { buf.vimChangeMovement('h', count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_MOVEMENT.DOWN]: () => { buf.vimChangeMovement('j', count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_MOVEMENT.UP]: () => { buf.vimChangeMovement('k', count); updateModeFn('INSERT'); },
        [CMD_TYPES.CHANGE_MOVEMENT.RIGHT]: () => { buf.vimChangeMovement('l', count); updateModeFn('INSERT'); }
    };
    const mfn = movementChangeMap[cmdType];
    if (mfn) { mfn(); return true; }
    return false;
}

function executeYankCommands(cmdType: string, count: number, buf: TextBuffer): boolean {
    const yankMap: Record<string, () => void> = {
        [CMD_TYPES.YANK_LINE]: () => buf.vimYankLine(count),
        [CMD_TYPES.YANK_WORD_FORWARD]: () => buf.vimYankWordForward(count),
        [CMD_TYPES.YANK_BIG_WORD_FORWARD]: () => buf.vimYankBigWordForward(count),
        [CMD_TYPES.YANK_WORD_END]: () => buf.vimYankWordEnd(count),
        [CMD_TYPES.YANK_BIG_WORD_END]: () => buf.vimYankBigWordEnd(count),
        [CMD_TYPES.YANK_TO_EOL]: () => buf.vimYankToEndOfLine(count)
    };
    const fn = yankMap[cmdType];
    if (fn) { fn(); return true; }
    return false;
}

function executeMiscCommands(cmdType: string, count: number, buf: TextBuffer, _updateModeFn: (mode: VimMode) => void, char?: string): boolean {
    if (cmdType === CMD_TYPES.TOGGLE_CASE) { buf.vimToggleCase(count); return true; }
    if (cmdType === CMD_TYPES.REPLACE_CHAR) { if (char) buf.vimReplaceChar(char, count); return true; }
    if (cmdType === CMD_TYPES.PASTE_AFTER) { buf.vimPasteAfter(count); return true; }
    if (cmdType === CMD_TYPES.PASTE_BEFORE) { buf.vimPasteBefore(count); return true; }
    return false;
}

/**
 * React hook that provides vim-style editing functionality for text input.
 *
 * Features:
 * - Modal editing (INSERT/NORMAL modes)
 * - Navigation: h,j,k,l,w,b,e,0,$,^,gg,G with count prefixes
 * - Editing: x,a,i,o,O,A,I,d,c,D,C with count prefixes
 * - Complex operations: dd,cc,dw,cw,db,cb,de,ce
 * - Command repetition (.)
 * - Settings persistence
 *
 * @param buffer - TextBuffer instance for text manipulation
 * @param onSubmit - Optional callback for command submission
 * @returns Object with vim state and input handler
 */
function handlePendingFindOp(vctx: VimNormalModeContext): boolean {
    if (vctx.state.pendingFindOp === undefined) return false;
    const targetChar = vctx.normalizedKey.sequence;
    const { op, operator, count: findCount } = vctx.state.pendingFindOp;
    vctx.dispatch({ type: 'SET_PENDING_FIND_OP', pendingFindOp: undefined });
    vctx.dispatch({ type: 'CLEAR_COUNT' });
    if (targetChar && toCodePoints(targetChar).length === 1) {
        if (op === 'r') {
            vctx.buffer.vimReplaceChar(targetChar, findCount);
            vctx.dispatch({
                type: 'SET_LAST_COMMAND',
                command: { type: CMD_TYPES.REPLACE_CHAR, count: findCount, char: targetChar }
            });
        } else {
            const isBackward = op === 'F' || op === 'T';
            const isTill = op === 't' || op === 'T';
            if (operator === 'd' || operator === 'c') {
                const del = isBackward
                    ? vctx.buffer.vimDeleteToCharBackward
                    : vctx.buffer.vimDeleteToCharForward;
                del(targetChar, findCount, isTill);
            } else {
                const find = isBackward
                    ? vctx.buffer.vimFindCharBackward
                    : vctx.buffer.vimFindCharForward;
                find(targetChar, findCount, isTill);
                vctx.dispatch({
                    type: 'SET_LAST_FIND',
                    find: { op, char: targetChar }
                });
            }
            if (operator === 'c') vctx.updateMode('INSERT');
        }
    }
    return true;
}

function handleMovementKeys(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, state, dispatch, buffer: buf, handleDeleteMovement, handleChangeMovement } = vctx;
    const keyToMotion: Record<string, 'h' | 'j' | 'k' | 'l'> = {
        'h': 'h', 'j': 'j', 'k': 'k', 'l': 'l',
        'left': 'h', 'down': 'j', 'up': 'k', 'right': 'l'
    };
    const motion = keyToMotion[nk.sequence] ?? keyToMotion[nk.name];
    if (!motion) return null;
    if (state.pendingOperator === 'd') return handleDeleteMovement(motion);
    if (state.pendingOperator === 'c') return handleChangeMovement(motion);
    const moveFns: Record<string, () => void> = {
        'h': () => buf.vimMoveLeft(repeatCount),
        'j': () => buf.vimMoveDown(repeatCount),
        'k': () => buf.vimMoveUp(repeatCount),
        'l': () => buf.vimMoveRight(repeatCount)
    };
    moveFns[motion]();
    dispatch({ type: 'CLEAR_COUNT' });
    return true;
}

function handleWordMotions(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, state, dispatch, buffer: buf, getCurrentCount, executeCommand, handleOperatorMotion } = vctx;
    type WordDef = { key: string; moveFn: () => void; yankType?: string };
    const wordDefs: WordDef[] = [
        { key: 'w', moveFn: () => buf.vimMoveWordForward(repeatCount), yankType: CMD_TYPES.YANK_WORD_FORWARD },
        { key: 'W', moveFn: () => buf.vimMoveBigWordForward(repeatCount), yankType: CMD_TYPES.YANK_BIG_WORD_FORWARD },
        { key: 'b', moveFn: () => buf.vimMoveWordBackward(repeatCount) },
        { key: 'B', moveFn: () => buf.vimMoveBigWordBackward(repeatCount) },
        { key: 'e', moveFn: () => buf.vimMoveWordEnd(repeatCount), yankType: CMD_TYPES.YANK_WORD_END },
        { key: 'E', moveFn: () => buf.vimMoveBigWordEnd(repeatCount), yankType: CMD_TYPES.YANK_BIG_WORD_END }
    ];
    const def = wordDefs.find(d => d.key === nk.sequence);
    if (!def) return null;
    if (state.pendingOperator === 'd') return handleOperatorMotion('d', def.key);
    if (state.pendingOperator === 'c') return handleOperatorMotion('c', def.key);
    if (state.pendingOperator === 'y' && def.yankType) {
        const cnt = getCurrentCount();
        executeCommand(def.yankType, cnt);
        dispatch({ type: 'SET_LAST_COMMAND', command: { type: def.yankType, count: cnt } });
        dispatch({ type: 'CLEAR_COUNT' });
        dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
        return true;
    }
    def.moveFn();
    dispatch({ type: 'CLEAR_COUNT' });
    return true;
}

function handleLineMotions(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, state, dispatch, buffer: buf, updateMode, executeCommand } = vctx;
    if (nk.sequence === '0') {
        if (state.pendingOperator === 'd') {
            buf.vimDeleteToStartOfLine();
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.DELETE_TO_SOL, count: 1 } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        }
        if (state.pendingOperator === 'c') {
            buf.vimChangeToStartOfLine();
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.CHANGE_TO_SOL, count: 1 } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            updateMode('INSERT');
            return true;
        }
        buf.vimMoveToLineStart();
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    if (nk.sequence === '$') {
        if (state.pendingOperator === 'd') {
            buf.vimDeleteToEndOfLine(repeatCount);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.DELETE_TO_EOL, count: repeatCount } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        }
        if (state.pendingOperator === 'c') {
            buf.vimChangeToEndOfLine(repeatCount);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.CHANGE_TO_EOL, count: repeatCount } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            updateMode('INSERT');
            return true;
        }
        if (state.pendingOperator === 'y') {
            executeCommand(CMD_TYPES.YANK_TO_EOL, repeatCount);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.YANK_TO_EOL, count: repeatCount } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        }
        if (repeatCount > 1) { buf.vimMoveDown(repeatCount - 1); }
        buf.vimMoveToLineEnd();
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    if (nk.sequence === '^') {
        if (state.pendingOperator === 'd') {
            buf.vimDeleteToFirstNonWhitespace();
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.DELETE_TO_FIRST_NONWS, count: 1 } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        }
        if (state.pendingOperator === 'c') {
            buf.vimChangeToFirstNonWhitespace();
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.CHANGE_TO_FIRST_NONWS, count: 1 } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            updateMode('INSERT');
            return true;
        }
        buf.vimMoveToFirstNonWhitespace();
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handleFindKeys(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, state, dispatch, buffer: buf } = vctx;
    if (nk.sequence === 'r') {
        dispatch({ type: 'CLEAR_PENDING_STATES' });
        dispatch({ type: 'SET_PENDING_FIND_OP', pendingFindOp: { op: 'r', operator: undefined, count: repeatCount } });
        return true;
    }
    if (nk.sequence === 'f' || nk.sequence === 'F' || nk.sequence === 't' || nk.sequence === 'T') {
        const op = nk.sequence;
        const operator = state.pendingOperator === 'd' || state.pendingOperator === 'c' ? state.pendingOperator : undefined;
        dispatch({ type: 'CLEAR_PENDING_STATES' });
        dispatch({ type: 'SET_PENDING_FIND_OP', pendingFindOp: { op, operator, count: repeatCount } });
        return true;
    }
    if (nk.sequence === ';' || nk.sequence === ',') {
        if (state.lastFind) {
            const { op, char } = state.lastFind;
            const isForward = op === 'f' || op === 't';
            const isTill = op === 't' || op === 'T';
            const reverse = nk.sequence === ',';
            const shouldMoveForward = reverse ? !isForward : isForward;
            if (shouldMoveForward) { buf.vimFindCharForward(char, repeatCount, isTill); }
            else { buf.vimFindCharBackward(char, repeatCount, isTill); }
        }
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handleGoOps(vctx: VimNormalModeContext): boolean | null {
    const { normalizedKey: nk, state, dispatch, buffer: buf, updateMode } = vctx;
    if (nk.sequence === 'g') {
        if (state.pendingOperator === 'd') { dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'dg' }); return true; }
        if (state.pendingOperator === 'c') { dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'cg' }); return true; }
        if (state.pendingOperator === 'dg') {
            buf.vimDeleteToFirstLine(state.count);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.DELETE_TO_FIRST_LINE, count: state.count } });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
        }
        if (state.pendingOperator === 'cg') {
            buf.vimDeleteToFirstLine(state.count);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.CHANGE_TO_FIRST_LINE, count: state.count } });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            dispatch({ type: 'CLEAR_COUNT' });
            updateMode('INSERT');
            return true;
        }
        if (state.pendingOperator === 'g') {
            if (state.count > 0) { buf.vimMoveToLine(state.count); } else { buf.vimMoveToFirstLine(); }
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            dispatch({ type: 'CLEAR_COUNT' });
        } else {
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'g' });
        }
        return true;
    }
    if (nk.sequence === 'G') {
        if (state.pendingOperator === 'd') {
            buf.vimDeleteToLastLine(state.count);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.DELETE_TO_LAST_LINE, count: state.count } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        }
        if (state.pendingOperator === 'c') {
            buf.vimDeleteToLastLine(state.count);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.CHANGE_TO_LAST_LINE, count: state.count } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            updateMode('INSERT');
            return true;
        }
        if (state.count > 0) { buf.vimMoveToLine(state.count); } else { buf.vimMoveToLastLine(); }
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handlePendingOps(vctx: VimNormalModeContext): boolean | null {
    const { normalizedKey: nk, state, dispatch, getCurrentCount, executeCommand } = vctx;
    if (nk.sequence === 'd') {
        if (state.pendingOperator === 'd') {
            const cnt = getCurrentCount();
            executeCommand(CMD_TYPES.DELETE_LINE, cnt);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.DELETE_LINE, count: cnt } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
        } else {
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'd' });
        }
        return true;
    }
    if (nk.sequence === 'c') {
        if (state.pendingOperator === 'c') {
            const cnt = getCurrentCount();
            executeCommand(CMD_TYPES.CHANGE_LINE, cnt);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.CHANGE_LINE, count: cnt } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
        } else {
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'c' });
        }
        return true;
    }
    if (nk.sequence === 'y') {
        if (state.pendingOperator === 'y') {
            const cnt = getCurrentCount();
            executeCommand(CMD_TYPES.YANK_LINE, cnt);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: CMD_TYPES.YANK_LINE, count: cnt } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
        } else if (state.pendingOperator === null) {
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'y' });
        } else {
            dispatch({ type: 'CLEAR_PENDING_STATES' });
        }
        return true;
    }
    return null;
}

function handleEditKeys(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, dispatch, buffer: buf } = vctx;
    const editDefs: Record<string, { fn: () => void; cmdType: string }> = {
        'x': { fn: () => buf.vimDeleteChar(repeatCount), cmdType: CMD_TYPES.DELETE_CHAR },
        'X': { fn: () => buf.vimDeleteCharBefore(repeatCount), cmdType: CMD_TYPES.DELETE_CHAR_BEFORE },
        '~': { fn: () => buf.vimToggleCase(repeatCount), cmdType: CMD_TYPES.TOGGLE_CASE }
    };
    const def = editDefs[nk.sequence];
    if (def) {
        def.fn();
        dispatch({ type: 'SET_LAST_COMMAND', command: { type: def.cmdType, count: repeatCount } });
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handlePasteAndEolKeys(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, dispatch, getCurrentCount, executeCommand } = vctx;
    const pasteDefs: Record<string, string> = {
        'p': CMD_TYPES.PASTE_AFTER,
        'P': CMD_TYPES.PASTE_BEFORE,
        'D': CMD_TYPES.DELETE_TO_EOL,
        'C': CMD_TYPES.CHANGE_TO_EOL,
        'Y': CMD_TYPES.YANK_TO_EOL
    };
    const cmdType = pasteDefs[nk.sequence];
    if (cmdType) {
        const count = nk.sequence === 'Y' ? getCurrentCount() : repeatCount;
        executeCommand(cmdType, count);
        dispatch({ type: 'SET_LAST_COMMAND', command: { type: cmdType, count } });
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handleModeKeys(vctx: VimNormalModeContext): boolean | null {
    const { normalizedKey: nk, dispatch, buffer: buf, updateMode } = vctx;
    const modeDefs: Record<string, () => void> = {
        'i': () => buf.vimInsertAtCursor(),
        'a': () => buf.vimAppendAtCursor(),
        'o': () => buf.vimOpenLineBelow(),
        'O': () => buf.vimOpenLineAbove(),
        'I': () => buf.vimInsertAtLineStart(),
        'A': () => buf.vimAppendAtLineEnd()
    };
    const fn = modeDefs[nk.sequence];
    if (fn) {
        fn();
        updateMode('INSERT');
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handleMiscKeys(vctx: VimNormalModeContext, repeatCount: number): boolean | null {
    const { normalizedKey: nk, state, dispatch, buffer: buf, executeCommand } = vctx;
    if (nk.sequence === 'u') {
        for (let i = 0; i < repeatCount; i++) { buf.undo(); }
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    if (nk.sequence === '.') {
        if (state.lastCommand) {
            const cmdData = state.lastCommand;
            const count = state.count > 0 ? state.count : cmdData.count;
            executeCommand(cmdData.type, count, cmdData.char);
        }
        dispatch({ type: 'CLEAR_COUNT' });
        return true;
    }
    return null;
}

function handleNormalModeSwitch(vctx: VimNormalModeContext, repeatCount: number): boolean {
    const handlers = [
        handleMovementKeys,
        handleWordMotions,
        handleLineMotions,
        handleFindKeys,
        handleGoOps,
        handlePendingOps,
        handleEditKeys,
        handlePasteAndEolKeys,
        handleModeKeys,
        handleMiscKeys
    ];
    for (const handler of handlers) {
        const result = handler(vctx, repeatCount);
        if (result !== null) return result;
    }
    vctx.dispatch({ type: 'CLEAR_PENDING_STATES' });
    if (vctx.normalizedKey.insertable && !vctx.normalizedKey.ctrl && !vctx.normalizedKey.alt && !vctx.normalizedKey.cmd) return true;
    return false;
}

export function useVim(buffer: TextBuffer, onSubmit?: (value: string) => void) {
    const keyMatchers = useKeyMatchers();
    const { vimEnabled, vimMode, setVimMode } = useVimMode();
    const [state, dispatch] = useReducer(vimReducer, initialVimState);

    // Track last escape timestamp for double-escape detection
    const lastEscapeTimestampRef = useRef<number>(0);

    // Sync vim mode from context to local state
    useEffect(() => {
        dispatch({ type: 'SET_MODE', mode: vimMode });
    }, [vimMode]);

    // Helper to update mode in both reducer and context
    const updateMode = useCallback(
        (mode: VimMode) => {
            setVimMode(mode);
            dispatch({ type: 'SET_MODE', mode });
        },
        [setVimMode]
    );

    // Helper functions using the reducer state
    const getCurrentCount = useCallback(
        () => state.count || DEFAULT_COUNT,
        [state.count]
    );

    // Returns true if two escapes occurred within DOUBLE_ESCAPE_TIMEOUT_MS.
    const checkDoubleEscape = useCallback((): boolean => {
        const now = Date.now();
        const lastEscape = lastEscapeTimestampRef.current;
        lastEscapeTimestampRef.current = now;

        if (now - lastEscape <= DOUBLE_ESCAPE_TIMEOUT_MS) {
            lastEscapeTimestampRef.current = 0;
            return true;
        }
        return false;
    }, []);

    /** Executes common commands to eliminate duplication in dot (.) repeat command */
    const executeCommand = useCallback(
        (cmdType: string, count: number, char?: string) => {
            if (executeDeleteCommands(cmdType, count, buffer)) return true;
            if (executeChangeCommands(cmdType, count, buffer, updateMode)) return true;
            if (executeYankCommands(cmdType, count, buffer)) return true;
            if (executeMiscCommands(cmdType, count, buffer, updateMode, char)) return true;
            return false;
        },
        [buffer, updateMode]
    );

    const handleInsertModeInput = useCallback(
        (normalizedKey: Key): boolean => {
            if (keyMatchers[Command.ESCAPE](normalizedKey)) {
                checkDoubleEscape();
                buffer.vimEscapeInsertMode();
                dispatch({ type: 'ESCAPE_TO_NORMAL' });
                updateMode('NORMAL');
                return true;
            }
            if (normalizedKey.name === 'tab' || (normalizedKey.name === 'enter' && !normalizedKey.ctrl) || normalizedKey.name === 'up' || normalizedKey.name === 'down' || (normalizedKey.ctrl && normalizedKey.name === 'r')) {
                return false;
            }
            if (normalizedKey.ctrl && (normalizedKey.name === 'u' || normalizedKey.name === 'k')) {
                return false;
            }
            if (normalizedKey.ctrl && normalizedKey.name === 'v') {
                return false;
            }
            if (normalizedKey.sequence === '!' && buffer.text.length === 0) {
                return false;
            }
            if (normalizedKey.name === 'enter' && !normalizedKey.alt && !normalizedKey.ctrl && !normalizedKey.cmd) {
                if (buffer.text.trim() && onSubmit) {
                    const submittedValue = buffer.text;
                    buffer.setText('');
                    onSubmit(submittedValue);
                    return true;
                }
                return true;
            }
            return buffer.handleInput(normalizedKey);
        },
        [buffer, dispatch, updateMode, onSubmit, checkDoubleEscape, keyMatchers]
    );

    /**
   * Normalizes key input to ensure all required properties are present
   * @param key - Raw key input
   * @returns Normalized key with all properties
   */
    const normalizeKey = useCallback(
        (key: Key): Key => ({
            name: key.name || '',
            sequence: key.sequence || '',
            shift: key.shift || false,
            alt: key.alt || false,
            ctrl: key.ctrl || false,
            cmd: key.cmd || false,
            insertable: key.insertable || false
        }),
        []
    );

    /**
   * Handles change movement commands (ch, cj, ck, cl)
   * @param movement - The movement direction
   * @returns boolean indicating if command was handled
   */
    const handleChangeMovement = useCallback(
        (movement: 'h' | 'j' | 'k' | 'l'): boolean => {
            const count = getCurrentCount();
            dispatch({ type: 'CLEAR_COUNT' });
            buffer.vimChangeMovement(movement, count);
            updateMode('INSERT');
            const cmdTypeMap = { h: CMD_TYPES.CHANGE_MOVEMENT.LEFT, j: CMD_TYPES.CHANGE_MOVEMENT.DOWN, k: CMD_TYPES.CHANGE_MOVEMENT.UP, l: CMD_TYPES.CHANGE_MOVEMENT.RIGHT };
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: cmdTypeMap[movement], count } });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        },
        [getCurrentCount, dispatch, buffer, updateMode]
    );

    /**
   * Handles delete movement commands (dh, dj, dk, dl)
   * @param movement - The movement direction
   * @returns boolean indicating if command was handled
   */
    const handleDeleteMovement = useCallback(
        (movement: 'h' | 'j' | 'k' | 'l'): boolean => {
            const count = getCurrentCount();
            dispatch({ type: 'CLEAR_COUNT' });
            buffer.vimChangeMovement(movement, count);
            const cmdTypeMap = { h: CMD_TYPES.DELETE_MOVEMENT.LEFT, j: CMD_TYPES.DELETE_MOVEMENT.DOWN, k: CMD_TYPES.DELETE_MOVEMENT.UP, l: CMD_TYPES.DELETE_MOVEMENT.RIGHT };
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: cmdTypeMap[movement], count } });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        },
        [getCurrentCount, dispatch, buffer]
    );

    /**
   * Handles operator-motion commands (dw/cw, db/cb, de/ce)
   * @param operator - The operator type ('d' for delete, 'c' for change)
   * @param motion - The motion type ('w', 'b', 'e')
   * @returns boolean indicating if command was handled
   */
    const handleOperatorMotion = useCallback(
        (operator: 'd' | 'c', motion: 'w' | 'b' | 'e' | 'W' | 'B' | 'E'): boolean => {
            const count = getCurrentCount();
            const commandMap = {
                d: { w: CMD_TYPES.DELETE_WORD_FORWARD, b: CMD_TYPES.DELETE_WORD_BACKWARD, e: CMD_TYPES.DELETE_WORD_END, W: CMD_TYPES.DELETE_BIG_WORD_FORWARD, B: CMD_TYPES.DELETE_BIG_WORD_BACKWARD, E: CMD_TYPES.DELETE_BIG_WORD_END },
                c: { w: CMD_TYPES.CHANGE_WORD_FORWARD, b: CMD_TYPES.CHANGE_WORD_BACKWARD, e: CMD_TYPES.CHANGE_WORD_END, W: CMD_TYPES.CHANGE_BIG_WORD_FORWARD, B: CMD_TYPES.CHANGE_BIG_WORD_BACKWARD, E: CMD_TYPES.CHANGE_BIG_WORD_END }
            };
            const cmdType = commandMap[operator][motion];
            executeCommand(cmdType, count);
            dispatch({ type: 'SET_LAST_COMMAND', command: { type: cmdType, count } });
            dispatch({ type: 'CLEAR_COUNT' });
            dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            return true;
        },
        [getCurrentCount, executeCommand, dispatch]
    );

    const handleInput = useCallback(
        (key: Key): boolean => {
            if (!vimEnabled) return false;
            let normalizedKey: Key;
            try { normalizedKey = normalizeKey(key); } catch (error) {
                debugLogger.warn('Malformed key input in vim mode:', key, error);
                return false;
            }
            if (keyMatchers[Command.CLEAR_INPUT](normalizedKey)) return false;
            if (state.mode === 'INSERT') return handleInsertModeInput(normalizedKey);
            if (state.mode === 'NORMAL') {
                if (keyMatchers[Command.ESCAPE](normalizedKey)) {
                    if (state.pendingOperator || state.pendingFindOp) {
                        dispatch({ type: 'CLEAR_PENDING_STATES' });
                        lastEscapeTimestampRef.current = 0;
                        return true;
                    }
                    if (checkDoubleEscape()) { buffer.setText(''); return true; }
                    return false;
                }
                if (DIGIT_1_TO_9.test(normalizedKey.sequence) || (normalizedKey.sequence === '0' && state.count > 0)) {
                    dispatch({ type: 'INCREMENT_COUNT', digit: parseInt(normalizedKey.sequence, 10) });
                    return true;
                }
                const repeatCount = getCurrentCount();
                const vctx: VimNormalModeContext = {
                    normalizedKey, state, dispatch, buffer, updateMode,
                    getCurrentCount, executeCommand, handleDeleteMovement,
                    handleChangeMovement, handleOperatorMotion, checkDoubleEscape,
                    keyMatchers, lastEscapeTimestampRef
                };
                if (handlePendingFindOp(vctx)) return true;
                return handleNormalModeSwitch(vctx, repeatCount);
            }
            return false;
        },
        [
            vimEnabled,
            normalizeKey,
            handleInsertModeInput,
            state.mode,
            state.count,
            state.pendingOperator,
            state.pendingFindOp,
            state.lastCommand,
            state.lastFind,
            dispatch,
            getCurrentCount,
            handleChangeMovement,
            handleDeleteMovement,
            handleOperatorMotion,
            buffer,
            executeCommand,
            updateMode,
            checkDoubleEscape,
            keyMatchers
        ]
    );

    return {
        mode: state.mode,
        vimModeEnabled: vimEnabled,
        handleInput // Expose the input handler for InputPrompt to use
    };
}
