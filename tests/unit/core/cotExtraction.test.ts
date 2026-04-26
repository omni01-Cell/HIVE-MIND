// tests/unit/core/cotExtraction.test.ts
// MOD 6 — Chain of Thought Extraction & Cleaning
import { describe, it, expect } from '@jest/globals';

/**
 * Standalone test for the CoT regex logic extracted from core/index.ts.
 * Tests the thought tag extraction and cleaning pipeline.
 */
const extractAndClean = (input: string) => {
    const thoughtRegex = /<(think|thought|thinking)>[\s\S]*?<\/\1>/gi;
    const extractRegex = /<(think|thought|thinking)>([\s\S]*?)<\/\1>/gi;
    const thoughts: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = extractRegex.exec(input)) !== null) {
        thoughts.push(match[2].trim());
    }
    const cleaned = input.replace(thoughtRegex, '').trim();
    return { thoughts, cleaned };
};

describe('CoT Extraction (MOD 6)', () => {
    it('extracts <thought> tags', () => {
        const input = '<thought>I need to check the files</thought>Here is the answer.';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts).toHaveLength(1);
        expect(thoughts[0]).toBe('I need to check the files');
        expect(cleaned).toBe('Here is the answer.');
    });

    it('extracts <think> tags (DeepSeek format)', () => {
        const input = '<think>Reasoning step 1</think>Final answer';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts[0]).toBe('Reasoning step 1');
        expect(cleaned).toBe('Final answer');
    });

    it('extracts <thinking> tags (Gemini format)', () => {
        const input = '<thinking>Processing request</thinking>Result here.';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts[0]).toBe('Processing request');
        expect(cleaned).toBe('Result here.');
    });

    it('extracts multiple thought blocks', () => {
        const input = '<thought>Step 1</thought>Middle text<thought>Step 2</thought>End.';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts).toHaveLength(2);
        expect(cleaned).toBe('Middle textEnd.');
    });

    it('handles mixed tag types', () => {
        const input = '<think>A</think><thought>B</thought><thinking>C</thinking>Answer';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts).toHaveLength(3);
        expect(cleaned).toBe('Answer');
    });

    it('returns empty thoughts for text without tags', () => {
        const input = 'Just a normal response with no thinking.';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts).toHaveLength(0);
        expect(cleaned).toBe(input);
    });

    it('detects thought-only response (empty after cleaning)', () => {
        const input = '<thought>I am thinking very hard about this</thought>';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts).toHaveLength(1);
        expect(cleaned).toBe('');
    });

    it('is case-insensitive', () => {
        const input = '<THOUGHT>Upper case</THOUGHT>text';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts).toHaveLength(1);
        expect(cleaned).toBe('text');
    });

    it('handles multiline thought content', () => {
        const input = '<thought>\nLine 1\nLine 2\nLine 3\n</thought>Response';
        const { thoughts, cleaned } = extractAndClean(input);
        expect(thoughts[0]).toContain('Line 1');
        expect(thoughts[0]).toContain('Line 3');
        expect(cleaned).toBe('Response');
    });
});
