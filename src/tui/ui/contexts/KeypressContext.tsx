/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../utils/errors.js';
import { HiveConfig } from '../../config/hiveConfig.js';
import { useStdin } from 'ink';
import { MultiMap } from 'mnemonist';

import { ESC } from '../utils/input.js';
import { parseMouseEvent } from '../utils/mouse.js';
import { FOCUS_IN, FOCUS_OUT } from '../hooks/useFocus.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import { useSettingsStore } from './SettingsContext.js';

export const BACKSLASH_ENTER_TIMEOUT = 5;
export const ESC_TIMEOUT = 50;
export const PASTE_TIMEOUT = 30_000;
export const FAST_RETURN_TIMEOUT = 30;

export enum KeypressPriority {
  Low = -100,
  Normal = 0,
  High = 100,
  Critical = 200,
}

// Parse the key itself
const KEY_INFO_MAP: Record<
  string,
  { name: string; shift?: boolean; ctrl?: boolean }
> = {
    OM: { name: 'enter' },
    '[200~': { name: 'paste-start' },
    '[201~': { name: 'paste-end' },
    '[[A': { name: 'f1' },
    '[[B': { name: 'f2' },
    '[[C': { name: 'f3' },
    '[[D': { name: 'f4' },
    '[[E': { name: 'f5' },
    '[1~': { name: 'home' },
    '[2~': { name: 'insert' },
    '[3~': { name: 'delete' },
    '[4~': { name: 'end' },
    '[5~': { name: 'pageup' },
    '[6~': { name: 'pagedown' },
    '[7~': { name: 'home' },
    '[8~': { name: 'end' },
    '[11~': { name: 'f1' },
    '[12~': { name: 'f2' },
    '[13~': { name: 'f3' },
    '[14~': { name: 'f4' },
    '[15~': { name: 'f5' },
    '[17~': { name: 'f6' },
    '[18~': { name: 'f7' },
    '[19~': { name: 'f8' },
    '[20~': { name: 'f9' },
    '[21~': { name: 'f10' },
    '[23~': { name: 'f11' },
    '[24~': { name: 'f12' },
    '[25~': { name: 'f13' },
    '[26~': { name: 'f14' },
    '[28~': { name: 'f15' },
    '[29~': { name: 'f16' },
    '[31~': { name: 'f17' },
    '[32~': { name: 'f18' },
    '[33~': { name: 'f19' },
    '[34~': { name: 'f20' },
    '[A': { name: 'up' },
    '[B': { name: 'down' },
    '[C': { name: 'right' },
    '[D': { name: 'left' },
    '[E': { name: 'clear' },
    '[F': { name: 'end' },
    '[H': { name: 'home' },
    '[P': { name: 'f1' },
    '[Q': { name: 'f2' },
    '[R': { name: 'f3' },
    '[S': { name: 'f4' },
    OA: { name: 'up' },
    OB: { name: 'down' },
    OC: { name: 'right' },
    OD: { name: 'left' },
    OE: { name: 'clear' },
    OF: { name: 'end' },
    OH: { name: 'home' },
    OP: { name: 'f1' },
    OQ: { name: 'f2' },
    OR: { name: 'f3' },
    OS: { name: 'f4' },
    OZ: { name: 'tab', shift: true }, // SS3 Shift+Tab variant for Windows terminals
    '[[5~': { name: 'pageup' },
    '[[6~': { name: 'pagedown' },
    '[a': { name: 'up', shift: true },
    '[b': { name: 'down', shift: true },
    '[c': { name: 'right', shift: true },
    '[d': { name: 'left', shift: true },
    '[e': { name: 'clear', shift: true },
    '[2$': { name: 'insert', shift: true },
    '[3$': { name: 'delete', shift: true },
    '[5$': { name: 'pageup', shift: true },
    '[6$': { name: 'pagedown', shift: true },
    '[7$': { name: 'home', shift: true },
    '[8$': { name: 'end', shift: true },
    '[Z': { name: 'tab', shift: true },
    Oa: { name: 'up', ctrl: true },
    Ob: { name: 'down', ctrl: true },
    Oc: { name: 'right', ctrl: true },
    Od: { name: 'left', ctrl: true },
    Oe: { name: 'clear', ctrl: true },
    '[2^': { name: 'insert', ctrl: true },
    '[3^': { name: 'delete', ctrl: true },
    '[5^': { name: 'pageup', ctrl: true },
    '[6^': { name: 'pagedown', ctrl: true },
    '[7^': { name: 'home', ctrl: true },
    '[8^': { name: 'end', ctrl: true }
};

// Kitty Keyboard Protocol (CSI u) code mappings
const KITTY_CODE_MAP: Record<number, { name: string; sequence?: string }> = {
    2: { name: 'insert' },
    3: { name: 'delete' },
    5: { name: 'pageup' },
    6: { name: 'pagedown' },
    9: { name: 'tab' },
    13: { name: 'enter' },
    14: { name: 'up' },
    15: { name: 'down' },
    16: { name: 'right' },
    17: { name: 'left' },
    27: { name: 'escape' },
    32: { name: 'space', sequence: ' ' },
    127: { name: 'backspace' },
    57358: { name: 'capslock' },
    57359: { name: 'scrolllock' },
    57360: { name: 'numlock' },
    57361: { name: 'printscreen' },
    57362: { name: 'pausebreak' },
    57409: { name: 'numpad_decimal', sequence: '.' },
    57410: { name: 'numpad_divide', sequence: '/' },
    57411: { name: 'numpad_multiply', sequence: '*' },
    57412: { name: 'numpad_subtract', sequence: '-' },
    57413: { name: 'numpad_add', sequence: '+' },
    57414: { name: 'enter' },
    57416: { name: 'numpad_separator', sequence: ',' },
    // Function keys F13-F35, not standard, but supported by Kitty
    ...Object.fromEntries(
        Array.from({ length: 23 }, (_, i) => [302 + i, { name: `f${13 + i}` }])
    ),
    // Numpad keys in Numeric Keypad Mode (CSI u codes 57399-57408)
    ...Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
            57399 + i,
            { name: `numpad${i}`, sequence: String(i) }
        ])
    )
};

// Numpad keys in Application Keypad Mode (SS3 sequences)
const NUMPAD_MAP: Record<string, string> = {
    Oj: '*',
    Ok: '+',
    Om: '-',
    Oo: '/',
    Op: '0',
    Oq: '1',
    Or: '2',
    Os: '3',
    Ot: '4',
    Ou: '5',
    Ov: '6',
    Ow: '7',
    Ox: '8',
    Oy: '9',
    On: '.'
};

const kUTF16SurrogateThreshold = 0x10000; // 2 ** 16
function charLengthAt(str: string, i: number): number {
    if (str.length <= i) {
    // Pretend to move to the right. This is necessary to autocomplete while
    // moving to the right.
        return 1;
    }
    const code = str.codePointAt(i);
    return code !== undefined && code >= kUTF16SurrogateThreshold ? 2 : 1;
}

// Note: we do not convert alt+z, alt+shift+z, or alt+v here
// because mac users have alternative hotkeys.
const MAC_ALT_KEY_CHARACTER_MAP: Record<string, string> = {
    '\u222B': 'b', // "∫" back one word
    '\u0192': 'f', // "ƒ" forward one word
    '\u00B5': 'm', // "µ" toggle markup view
    '\u03A9': 'z', // "Ω" Option+z
    '\u00B8': 'Z', // "¸" Option+Shift+z
    '\u2202': 'd' // "∂" delete word forward
};

function nonKeyboardEventFilter(
    keypressHandler: KeypressHandler
): KeypressHandler {
    return (key: Key) => {
        if (
            !parseMouseEvent(key.sequence) &&
      key.sequence !== FOCUS_IN &&
      key.sequence !== FOCUS_OUT
        ) {
            keypressHandler(key);
        }
    };
}

/**
 * Converts return keys pressed quickly after insertable keys into a shift+return
 *
 * This is to accommodate older terminals that paste text without bracketing.
 */
function bufferFastReturn(keypressHandler: KeypressHandler): KeypressHandler {
    let lastKeyTime = 0;
    return (key: Key) => {
        const now = Date.now();
        if (key.name === 'enter' && now - lastKeyTime <= FAST_RETURN_TIMEOUT) {
            keypressHandler({
                ...key,
                name: 'enter',
                shift: true, // to make it a newline, not a submission
                alt: false,
                ctrl: false,
                cmd: false,
                sequence: '\r',
                insertable: true
            });
        } else {
            keypressHandler(key);
        }
        lastKeyTime = key.insertable ? now : 0;
    };
}

/**
 * Buffers "/" keys to see if they are followed return.
 * Will flush the buffer if no data is received for DRAG_COMPLETION_TIMEOUT_MS
 * or when a null key is received.
 */
function bufferBackslashEnter(
    keypressHandler: KeypressHandler
): KeypressHandler {
    const bufferer = (function* (): Generator<void, void, Key | null> {
        while (true) {
            const key = yield;

            if (key == null) {
                continue;
            } else if (key.sequence !== '\\') {
                keypressHandler(key);
                continue;
            }

            const timeoutId = setTimeout(
                () => bufferer.next(null),
                BACKSLASH_ENTER_TIMEOUT
            );
            const nextKey = yield;
            clearTimeout(timeoutId);

            if (nextKey === null) {
                keypressHandler(key);
            } else if (nextKey.name === 'enter') {
                keypressHandler({
                    ...nextKey,
                    shift: true,
                    sequence: '\r' // Corrected escaping for newline
                });
            } else {
                keypressHandler(key);
                keypressHandler(nextKey);
            }
        }
    })();

    bufferer.next(); // prime the generator so it starts listening.

    return (key: Key) => {
        bufferer.next(key);
    };
}

/**
 * Buffers paste events between paste-start and paste-end sequences.
 * Will flush the buffer if no data is received for PASTE_TIMEOUT ms or
 * when a null key is received.
 */
function bufferPaste(keypressHandler: KeypressHandler): KeypressHandler {
    const bufferer = (function* (): Generator<void, void, Key | null> {
        while (true) {
            let key = yield;

            if (key === null) {
                continue;
            } else if (key.name !== 'paste-start') {
                keypressHandler(key);
                continue;
            }

            let buffer = '';
            while (true) {
                const timeoutId = setTimeout(() => bufferer.next(null), PASTE_TIMEOUT);
                key = yield;
                clearTimeout(timeoutId);

                if (key === null) {
                    appEvents.emit(AppEvent.PasteTimeout);
                    break;
                }

                if (key.name === 'paste-end') {
                    break;
                }
                buffer += key.sequence;
            }

            if (buffer.length > 0) {
                keypressHandler({
                    name: 'paste',
                    shift: false,
                    alt: false,
                    ctrl: false,
                    cmd: false,
                    insertable: true,
                    sequence: buffer
                });
            }
        }
    })();
    bufferer.next(); // prime the generator so it starts listening.

    return (key: Key) => {
        bufferer.next(key);
    };
}

/**
 * Turns raw data strings into keypress events sent to the provided handler.
 * Buffers escape sequences until a full sequence is received or
 * until a timeout occurs.
 */
function createDataListener(keypressHandler: KeypressHandler) {
    const parser = emitKeys(keypressHandler);
    parser.next(); // prime the generator so it starts listening.

    let timeoutId: NodeJS.Timeout;
    return (data: string) => {
        clearTimeout(timeoutId);
        for (const char of data) {
            parser.next(char);
        }
        if (data.length !== 0) {
            timeoutId = setTimeout(() => parser.next(''), ESC_TIMEOUT);
        }
    };
}

interface KeyEventFields {
    name: string | undefined;
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    cmd: boolean;
    insertable: boolean;
    sequence: string;
}

function parseCsiCommandString(cmdStr: string): { codeSuffix: string; modifier: number } {
    let match;
    if ((match = /^(\d+)(?:;(\d+))?(?:;(\d+))?([~^$u])$/.exec(cmdStr))) {
        if (match[1] === '27' && match[3] && match[4] === '~') {
            return { codeSuffix: match[3] + 'u', modifier: parseInt(match[2] ?? '1', 10) - 1 };
        }
        return { codeSuffix: match[1] + match[4], modifier: parseInt(match[2] ?? '1', 10) - 1 };
    }
    if ((match = /^(\d+)?(?:;(\d+))?([A-Za-z])$/.exec(cmdStr))) {
        return { codeSuffix: match[3], modifier: parseInt(match[2] ?? match[1] ?? '1', 10) - 1 };
    }
    return { codeSuffix: cmdStr, modifier: 0 };
}

interface AnsiParseResult {
    handled: boolean;
    key?: KeyEventFields;
    doubleEscape?: boolean;
}

function* parseAnsiSequence(
    initialCh: string,
    keypressHandler: KeypressHandler
): Generator<void, AnsiParseResult, string> {
    let ch = initialCh;
    let sequence = ch;
    const code: string | undefined = ch;
    let modifier = 0;

    if (ch === ']') {
        let buffer = '';
        while (true) {
            const next = yield;
            if (next === '' || next === '\u0007') break;
            if (next !== ESC) { buffer += next; continue; }
            const afterEsc = yield;
            if (afterEsc === '' || afterEsc === '\\') break;
            buffer += next + afterEsc;
        }
        const match = /^52;[cp];(.*)$/.exec(buffer);
        if (match) {
            try {
                keypressHandler({ name: 'paste', shift: false, alt: false, ctrl: false, cmd: false, insertable: true, sequence: Buffer.from(match[1], 'base64').toString('utf-8') });
            } catch { debugLogger.log('Failed to decode OSC 52 clipboard data'); }
        }
        return { handled: true };
    }

    if (ch === 'O') {
        ch = yield; sequence += ch;
        if (ch >= '0' && ch <= '9') { modifier = parseInt(ch, 10) - 1; ch = yield; sequence += ch; }
        return { handled: false, key: resolveAnsiKeyInfo(code + ch, modifier, sequence) };
    }

    // CSI sequence
    ch = yield; sequence += ch;
    if (ch === '[') { sequence += ch; ch = yield; sequence += ch; }
    const cmdStart = sequence.length - 1;
    while (ch >= '0' && ch <= '9') { ch = yield; sequence += ch; }
    if (ch === ';') {
        while (ch === ';' || (ch >= '0' && ch <= '9')) { ch = yield; sequence += ch; }
    } else if (ch === '<') {
        ch = yield; sequence += ch;
        while (ch === '' || ch === ';' || (ch >= '0' && ch <= '9')) { ch = yield; sequence += ch; }
    } else if (ch === 'M') {
        for (let i = 0; i < 3; i++) { ch = yield; sequence += ch; }
    }
    const parsed = parseCsiCommandString(sequence.slice(cmdStart));
    return { handled: false, key: resolveAnsiKeyInfo(code + parsed.codeSuffix, modifier, sequence) };
}

function resolveAnsiKeyInfo(code: string, modifier: number, sequence: string): KeyEventFields {
    let shift = !!(modifier & 1);
    const alt = !!(modifier & 2);
    const ctrl = !!(modifier & 4);
    const cmd = !!(modifier & 8);
    let insertable = false;
    let name: string | undefined;
    let outSequence = sequence;

    const keyInfo = KEY_INFO_MAP[code];
    if (keyInfo) {
        name = keyInfo.name;
        if (keyInfo.shift) shift = true;
        if (name === 'space' && !ctrl && !cmd && !alt) { outSequence = ' '; insertable = true; }
    } else {
        const numpadChar = NUMPAD_MAP[code];
        if (numpadChar) {
            name = numpadChar;
            if (!ctrl && !cmd && !alt) { outSequence = numpadChar; insertable = true; }
        } else {
            name = 'undefined';
            if (code.endsWith('u') || code.endsWith('~')) {
                const codeNumber = parseInt(code.slice(1, -1), 10);
                const mapped = KITTY_CODE_MAP[codeNumber];
                if (mapped) {
                    name = mapped.name;
                    if (mapped.sequence && !ctrl && !cmd && !alt) { outSequence = mapped.sequence; insertable = true; }
                } else if (codeNumber >= 33 && codeNumber <= 0x10ffff && (codeNumber < 0xd800 || codeNumber > 0xdfff)) {
                    const char = String.fromCodePoint(codeNumber);
                    name = char.toLowerCase();
                    if (char !== name) shift = true;
                    if (!ctrl && !cmd && !alt) { outSequence = char; insertable = true; }
                }
            }
        }
    }
    return { name, shift, alt, ctrl, cmd, insertable, sequence: outSequence };
}

function classifySimpleCharacter(ch: string, escaped: boolean, isGreek: boolean): KeyEventFields {
    let name: string | undefined;
    let shift = false;
    let alt = escaped;
    let ctrl = false;
    const cmd = false;
    let insertable = false;
    const sequence = ch;
    let doubleEscape = false;

    if (ch === '\r') {
        name = 'enter';
    } else if (escaped && ch === '\n') {
        name = 'enter';
    } else if (ch === '\t') {
        name = 'tab';
    } else if (ch === '\b' || ch === '\x7f') {
        name = 'backspace';
    } else if (ch === ESC) {
        name = 'escape';
    } else if (ch === ' ') {
        name = 'space';
        insertable = true;
    } else if (!escaped && ch <= '\x1a') {
        name = String.fromCharCode(ch.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
        ctrl = true;
    } else if (/^[0-9A-Za-z]$/.exec(ch) !== null) {
        name = ch.toLowerCase();
        shift = /^[A-Z]$/.exec(ch) !== null;
        insertable = true;
    } else if (MAC_ALT_KEY_CHARACTER_MAP[ch]) {
        if (isGreek && ch === '\u03A9') {
            insertable = true;
        } else {
            const mapped = MAC_ALT_KEY_CHARACTER_MAP[ch];
            name = mapped.toLowerCase();
            shift = mapped !== name;
            alt = true;
        }
    } else if (sequence === `${ESC}${ESC}`) {
        name = 'escape';
        alt = false;
        doubleEscape = true;
    } else if (escaped) {
        name = ch.length ? undefined : 'escape';
        alt = ch.length > 0;
    } else {
        name = ch.toLowerCase();
        if (ch !== name) shift = true;
        insertable = true;
    }

    return { name, shift, alt, ctrl, cmd, insertable, sequence, doubleEscape };
}

/**
 * Translates raw keypress characters into key events.
 * Buffers escape sequences until a full sequence is received or
 * until an empty string is sent to indicate a timeout.
 */
function* emitKeys(
    keypressHandler: KeypressHandler
): Generator<void, void, string> {
    const lang = process.env['LANG'] || '';
    const lcAll = process.env['LC_ALL'] || '';
    const isGreek = lang.startsWith('el') || lcAll.startsWith('el');

    while (true) {
        let ch = yield;
        let sequence = ch;
        let escaped = false;

        let name = undefined;
        let shift = false;
        let alt = false;
        let ctrl = false;
        let cmd = false;
        let insertable = false;

        if (ch === ESC) {
            escaped = true;
            ch = yield;
            sequence += ch;

            if (ch === ESC) {
                ch = yield;
                sequence += ch;
            }
        }

        if (escaped && (ch === 'O' || ch === '[' || ch === ']')) {
            const result = yield* parseAnsiSequence(ch, keypressHandler);
            if (result.handled) continue;
            if (result.key) {
                name = result.key.name;
                shift = result.key.shift;
                alt = result.key.alt;
                ctrl = result.key.ctrl;
                cmd = result.key.cmd;
                insertable = result.key.insertable;
                sequence = result.key.sequence;
            }
        } else {
            const classified = classifySimpleCharacter(ch, escaped, isGreek);
            name = classified.name;
            shift = classified.shift;
            alt = classified.alt;
            ctrl = classified.ctrl;
            cmd = classified.cmd;
            insertable = classified.insertable;
            sequence = classified.sequence;

            if (classified.doubleEscape) {
                keypressHandler({ name: 'escape', shift, alt, ctrl, cmd, insertable: false, sequence: ESC });
            }
        }

        if (
            (sequence.length !== 0 && (name !== undefined || escaped)) ||
      charLengthAt(sequence, 0) === sequence.length
        ) {
            keypressHandler({
                name: name || '',
                shift,
                alt,
                ctrl,
                cmd,
                insertable,
                sequence
            });
        }
    // Unrecognized or broken escape sequence, don't emit anything
    }
}

export interface Key {
  name: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  cmd: boolean; // Command/Windows/Super key
  insertable: boolean;
  sequence: string;
}

export type KeypressHandler = (key: Key) => boolean | void;

interface KeypressContextValue {
  subscribe: (
    handler: KeypressHandler,
    priority?: KeypressPriority | boolean,
  ) => void;
  unsubscribe: (handler: KeypressHandler) => void;
}

const KeypressContext = createContext<KeypressContextValue | undefined>(
    undefined
);

export function useKeypressContext() {
    const context = useContext(KeypressContext);
    if (!context) {
        throw new Error(
            'useKeypressContext must be used within a KeypressProvider'
        );
    }
    return context;
}

export function KeypressProvider({
    children,
    config
}: {
  children: React.ReactNode;
  config?: HiveConfig;
}) {
    const { settings } = useSettingsStore();
    const debugKeystrokeLogging = settings.merged.general.debugKeystrokeLogging;

    const { stdin, setRawMode } = useStdin();

    const subscribersToPriority = useRef<Map<KeypressHandler, number>>(
        new Map()
    ).current;
    const subscribers = useRef(
        new MultiMap<number, KeypressHandler>(Set)
    ).current;
    const sortedPriorities = useRef<number[]>([]);

    const subscribe = useCallback(
        (
            handler: KeypressHandler,
            priority: KeypressPriority | boolean = KeypressPriority.Normal
        ) => {
            const p =
        typeof priority === 'boolean'
            ? priority
                ? KeypressPriority.High
                : KeypressPriority.Normal
            : priority;

            subscribersToPriority.set(handler, p);
            const hadPriority = subscribers.has(p);
            subscribers.set(p, handler);

            if (!hadPriority) {
                // Cache sorted priorities only when a new priority level is added
                sortedPriorities.current = Array.from(subscribers.keys()).sort(
                    (a, b) => b - a
                );
            }
        },
        [subscribers, subscribersToPriority]
    );

    const unsubscribe = useCallback(
        (handler: KeypressHandler) => {
            const p = subscribersToPriority.get(handler);
            if (p !== undefined) {
                subscribers.remove(p, handler);
                subscribersToPriority.delete(handler);

                if (!subscribers.has(p)) {
                    // Cache sorted priorities only when a priority level is completely removed
                    sortedPriorities.current = Array.from(subscribers.keys()).sort(
                        (a, b) => b - a
                    );
                }
            }
        },
        [subscribers, subscribersToPriority]
    );

    const broadcast = useCallback(
        (key: Key) => {
            if (debugKeystrokeLogging) {
                debugLogger.log('[DEBUG] Keystroke:', JSON.stringify(key));
            }
            // Use cached sorted priorities to avoid sorting on every keypress
            for (const p of sortedPriorities.current) {
                const set = subscribers.get(p);
                if (!set) continue;

                // Within a priority level, use stack behavior (last subscribed is first to handle)
                const handlers = Array.from(set).reverse();
                for (const handler of handlers) {
                    if (handler(key) === true) {
                        return;
                    }
                }
            }
        },
        [subscribers, debugKeystrokeLogging]
    );

    useEffect(() => {
        terminalCapabilityManager.enableSupportedModes();

        const wasRaw = stdin.isRaw;
        if (wasRaw === false) {
            setRawMode(true);
        }

        process.stdin.setEncoding('utf8'); // Make data events emit strings

        let processor = nonKeyboardEventFilter(broadcast);
        if (!terminalCapabilityManager.isKittyProtocolEnabled()) {
            processor = bufferFastReturn(processor);
        }
        processor = bufferBackslashEnter(processor);
        processor = bufferPaste(processor);
        let dataListener = createDataListener(processor);

        if (debugKeystrokeLogging) {
            const old = dataListener;
            dataListener = (data: string) => {
                if (data.length > 0) {
                    debugLogger.log(`[DEBUG] Raw StdIn: ${JSON.stringify(data)}`);
                }
                old(data);
            };
        }

        stdin.on('data', dataListener);
        return () => {
            stdin.removeListener('data', dataListener);
            if (wasRaw === false) {
                setRawMode(false);
            }
        };
    }, [stdin, setRawMode, config, debugKeystrokeLogging, broadcast]);

    const contextValue = useMemo(
        () => ({ subscribe, unsubscribe }),
        [subscribe, unsubscribe]
    );

    return (
        <KeypressContext.Provider value={contextValue}>
            {children}
        </KeypressContext.Provider>
    );
}
