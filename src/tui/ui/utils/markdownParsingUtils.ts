/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from 'chalk';
import {
    resolveColor,
    INK_SUPPORTED_NAMES,
    INK_NAME_TO_HEX_MAP
} from '../themes/color-utils.js';
import { theme } from '../semantic-colors.js';
import { debugLogger } from '../../utils/errors.js';
import { convertLatexToUnicode } from './latexToUnicode.js';

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~")
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

/**
 * Helper to apply color to a string using ANSI escape codes,
 * consistent with how Ink's colorize works.
 */
const ansiColorize = (str: string, color: string | undefined): string => {
    if (!color) return str;
    const resolved = resolveColor(color);
    if (!resolved) return str;

    if (resolved.startsWith('#')) {
        return chalk.hex(resolved)(str);
    }

    const mappedHex = INK_NAME_TO_HEX_MAP[resolved];
    if (mappedHex) {
        return chalk.hex(mappedHex)(str);
    }

    if (INK_SUPPORTED_NAMES.has(resolved)) {
        switch (resolved) {
            case 'black':
                return chalk.black(str);
            case 'red':
                return chalk.red(str);
            case 'green':
                return chalk.green(str);
            case 'yellow':
                return chalk.yellow(str);
            case 'blue':
                return chalk.blue(str);
            case 'magenta':
                return chalk.magenta(str);
            case 'cyan':
                return chalk.cyan(str);
            case 'white':
                return chalk.white(str);
            case 'gray':
            case 'grey':
                return chalk.gray(str);
            default:
                return str;
        }
    }

    return str;
};

/**
 * Converts markdown text into a string with ANSI escape codes.
 * This mirrors the parsing logic in InlineMarkdownRenderer.tsx
 */
// Private-Use-Area codepoint used as a placeholder sentinel when masking
// inline code / URL spans from LaTeX conversion. Not touched by
// stripUnsafeCharacters and not matched by the markdown tokenizer.
const MASK_SENTINEL = '\uE000';
const MASK_PATTERN = /\uE000(\d+)\uE000/g;

/**
 * Runs LaTeX conversion on `text` while keeping inline code spans and bare
 * URLs verbatim. Without masking, the LaTeX pass would happily rewrite
 * ``$\to$`` inside a backtick code span — violating the "code is verbatim"
 * contract — and could rewrite URL query strings containing `$`.
 */
const convertLatexPreservingSpans = (text: string): string => {
    const preserved: string[] = [];
    // Match inline code spans (with matched backtick counts) and bare URLs.
    // Order matters: code spans first so they win over a URL inside a span.
    const masked = text.replace(/(`+)([^`\n]+?)\1|https?:\/\/\S+/g, (match) => {
        const index = preserved.push(match) - 1;
        return `${MASK_SENTINEL}${index}${MASK_SENTINEL}`;
    });
    const converted = convertLatexToUnicode(masked);
    return converted.replace(
        MASK_PATTERN,
        // Fallback to the literal match if the index is somehow out of range —
        // defensive against the unlikely case where the PUA sentinel appears in
        // user input. Without the fallback, replace would emit "undefined".
        (match, i: string) => preserved[Number(i)] ?? match
    );
};

function styleBoldItalicStrikethrough(
    fullMatch: string,
    baseColor: string
): string | undefined {
    if (
        fullMatch.endsWith('***') &&
        fullMatch.startsWith('***') &&
        fullMatch.length > (BOLD_MARKER_LENGTH + ITALIC_MARKER_LENGTH) * 2
    ) {
        return chalk.bold(
            chalk.italic(
                parseMarkdownToANSI(
                    fullMatch.slice(BOLD_MARKER_LENGTH + ITALIC_MARKER_LENGTH, -BOLD_MARKER_LENGTH - ITALIC_MARKER_LENGTH),
                    baseColor
                )
            )
        );
    }
    if (
        fullMatch.endsWith('**') &&
        fullMatch.startsWith('**') &&
        fullMatch.length > BOLD_MARKER_LENGTH * 2
    ) {
        return chalk.bold(
            parseMarkdownToANSI(fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH), baseColor)
        );
    }
    if (fullMatch.startsWith('~~') && fullMatch.endsWith('~~') && fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2) {
        return chalk.strikethrough(
            parseMarkdownToANSI(fullMatch.slice(STRIKETHROUGH_MARKER_LENGTH, -STRIKETHROUGH_MARKER_LENGTH), baseColor)
        );
    }
    return undefined;
}

function styleInlineMarkdown(
    fullMatch: string,
    baseColor: string,
    text: string,
    matchIndex: number,
    inlineRegexLastIndex: number
): string {
    try {
        const boldItalic = styleBoldItalicStrikethrough(fullMatch, baseColor);
        if (boldItalic !== undefined) return boldItalic;

        if (
            fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
            ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
                (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
            !/\w/.test(text.substring(matchIndex - 1, matchIndex)) &&
            !/\w/.test(text.substring(inlineRegexLastIndex, inlineRegexLastIndex + 1)) &&
            !/\S[./\\]/.test(text.substring(matchIndex - 2, matchIndex)) &&
            !/[./\\]\S/.test(text.substring(inlineRegexLastIndex, inlineRegexLastIndex + 2))
        ) {
            return chalk.italic(
                parseMarkdownToANSI(fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH), baseColor)
            );
        }
        if (
            fullMatch.startsWith('`') &&
            fullMatch.endsWith('`') &&
            fullMatch.length > INLINE_CODE_MARKER_LENGTH
        ) {
            const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
            if (codeMatch && codeMatch[2]) {
                return ansiColorize(codeMatch[2], theme.text.accent);
            }
        }
        if (fullMatch.startsWith('[') && fullMatch.includes('](') && fullMatch.endsWith(')')) {
            const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
            if (linkMatch) {
                return (
                    parseMarkdownToANSI(linkMatch[1], baseColor) +
                    ansiColorize(' (', baseColor) +
                    ansiColorize(linkMatch[2], theme.text.link) +
                    ansiColorize(')', baseColor)
                );
            }
        }
        if (
            fullMatch.startsWith('<u>') &&
            fullMatch.endsWith('</u>') &&
            fullMatch.length > UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1
        ) {
            return chalk.underline(
                parseMarkdownToANSI(fullMatch.slice(UNDERLINE_TAG_START_LENGTH, -UNDERLINE_TAG_END_LENGTH), baseColor)
            );
        }
        if (fullMatch.match(/^https?:\/\//)) {
            return ansiColorize(fullMatch, theme.text.link);
        }
    } catch (e) {
        debugLogger.warn('Error parsing inline markdown part:', fullMatch, e);
        return '';
    }
    return '';
}

export const parseMarkdownToANSI = (
    rawText: string,
    defaultColor?: string
): string => {
    const baseColor = defaultColor ?? theme.text.primary;
    const text = convertLatexPreservingSpans(rawText);
    if (!/[*_~`<[https?:]/.test(text)) {
        return ansiColorize(text, baseColor);
    }

    let result = '';
    const inlineRegex =
        /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
    let lastIndex = 0;
    let match;

    while ((match = inlineRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            result += ansiColorize(text.slice(lastIndex, match.index), baseColor);
        }

        const styledPart = styleInlineMarkdown(match[0], baseColor, text, match.index, inlineRegex.lastIndex);
        result += styledPart || ansiColorize(match[0], baseColor);
        lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        result += ansiColorize(text.slice(lastIndex), baseColor);
    }

    return result;
};
