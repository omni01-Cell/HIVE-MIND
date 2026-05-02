import * as fs from 'fs';
import * as path from 'path';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { fileState } from './FileState.js';
import { AnchorStateManager, extractId, ANCHOR_DELIMITER, hashLines } from '../../../services/anchor/index.js';

export default {
    name: 'dev_tools_file_edit',
    description: 'File editing tool via exact replacement or hash-stable anchors.',
    version: '2.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'edit_file',
                description: `Modifies one or more files via hash-stable anchors (recommended) or by exact replacement (fallback).

PRIMARY MODE (Hash Anchors) — Use anchors returned by read_file:
- edit_type: "replace" (replaces from anchor to end_anchor inclusive), "insert_after", "insert_before"
- anchor: The full line with its anchor (e.g., "AppleBanana§    def process(data):")
- end_anchor: Required for "replace" only
- text: The new content (without anchors, with indentation)

LEGACY MODE (Exact Replacement) — Fallback if anchors are not available:
- old_string + new_string (the old behavior)

BATCHING: You CAN group multiple files and edits in a single call via the "files" parameter.`,
                parameters: {
                    type: 'object',
                    properties: {
                        // ── Legacy mode (single file) ──
                        file_path: {
                            type: 'string',
                            description: 'File path (legacy mode only).'
                        },
                        old_string: {
                            type: 'string',
                            description: 'The EXACT text to replace (legacy mode).'
                        },
                        new_string: {
                            type: 'string',
                            description: 'The new text (legacy mode).'
                        },
                        // ── Anchor mode (multi-file batched) ──
                        files: {
                            type: 'array',
                            description: 'Array of files with anchored edits (primary mode).',
                            items: {
                                type: 'object',
                                properties: {
                                    path: {
                                        type: 'string',
                                        description: 'Relative or absolute file path.'
                                    },
                                    edits: {
                                        type: 'array',
                                        description: 'Array of edits to apply.',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                edit_type: {
                                                    type: 'string',
                                                    enum: ['replace', 'insert_after', 'insert_before'],
                                                    description: 'Edit type.'
                                                },
                                                anchor: {
                                                    type: 'string',
                                                    description: 'Start anchor (full line with prefix).'
                                                },
                                                end_anchor: {
                                                    type: 'string',
                                                    description: 'End anchor (required for replace).'
                                                },
                                                text: {
                                                    type: 'string',
                                                    description: 'New content. Use \\n for new lines.'
                                                }
                                            },
                                            required: ['edit_type', 'anchor', 'text']
                                        }
                                    }
                                },
                                required: ['path', 'edits']
                            }
                        }
                    }
                    // No required at top level: either files[] or file_path+old_string+new_string
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'edit_file') return null;

        const { chatId, sourceChannel } = context;

        // ── Route: Anchor mode (multi-file) vs Legacy mode ──────────────
        if (args.files && Array.isArray(args.files)) {
            return executeAnchorMode(args.files, chatId, sourceChannel, context);
        }
        
        // Legacy fallback
        return executeLegacyMode(args, chatId, sourceChannel, context);
    }
};

// ============================================================================
// ANCHOR MODE — Dirac-style hash-anchored edits (multi-file batched)
// ============================================================================

async function executeAnchorMode(
    files: Array<{ path: string; edits: Array<{ edit_type: string; anchor: string; end_anchor?: string; text: string }> }>,
    chatId: string,
    sourceChannel: string,
    context: any
): Promise<any> {
    const results: Array<{ file: string; success: boolean; editsApplied: number; message: string }> = [];

    for (const fileEntry of files) {
        const absolutePath = path.isAbsolute(fileEntry.path) 
            ? fileEntry.path 
            : path.resolve(permissionManager.sandboxDir, fileEntry.path);

        // Security check
        const validation = permissionManager.validateFileWrite(absolutePath);
        if (validation.requiresPermission) {
            const permResult = await permissionManager.askPermission(
                chatId,
                `Edit (anchors): ${absolutePath}`,
                sourceChannel,
                context.message?.sender || 'system'
            );
            if (!permResult.granted) {
                results.push({
                    file: fileEntry.path,
                    success: false,
                    editsApplied: 0,
                    message: permResult.feedback 
                        ? `[REJECTED] ${permResult.feedback}` 
                        : '[REJECTED] Permission denied.'
                });
                continue;
            }
        }

        // File existence check
        if (!fs.existsSync(absolutePath)) {
            results.push({
                file: fileEntry.path,
                success: false,
                editsApplied: 0,
                message: `File does not exist: ${absolutePath}`
            });
            continue;
        }

        // Staleness check
        const { changed } = fileState.hasChanged(absolutePath);
        if (changed) {
            results.push({
                file: fileEntry.path,
                success: false,
                editsApplied: 0,
                message: `SECURITY_ERROR: File modified since last read. Re-read with read_file.`
            });
            continue;
        }

        // Apply edits to this file
        try {
            const result = applyAnchoredEdits(absolutePath, fileEntry.edits);
            fileState.recordRead(absolutePath);
            results.push({
                file: fileEntry.path,
                success: result.success,
                editsApplied: result.editsApplied,
                message: result.message
            });
        } catch (error: any) {
            results.push({
                file: fileEntry.path,
                success: false,
                editsApplied: 0,
                message: `Error: ${error.message}`
            });
        }
    }

    // Aggregate results
    const allSuccess = results.every(r => r.success);
    const totalEdits = results.reduce((sum, r) => sum + r.editsApplied, 0);

    const summary = results.map(r => 
        `${r.success ? '✅' : '❌'} ${r.file}: ${r.editsApplied} edits — ${r.message}`
    ).join('\n');

    return {
        success: allSuccess,
        llmOutput: `${allSuccess ? 'SUCCESS' : 'PARTIAL'}: ${totalEdits} edits across ${results.length} file(s).\n${summary}`,
        userOutput: `📝 *Multi-file edit*: ${totalEdits} changes in ${results.length} file(s)`
    };
}

/**
 * Applies anchor-based edits to a single file.
 *
 * Invariant: After this function returns successfully, the file content
 * is consistent and the anchor state is updated.
 */
function applyAnchoredEdits(
    absolutePath: string,
    edits: Array<{ edit_type: string; anchor: string; end_anchor?: string; text: string }>
): { success: boolean; editsApplied: number; message: string } {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split('\n');

    // Get current anchors (must have been read before)
    let anchors = AnchorStateManager.getAnchors(absolutePath);
    if (!anchors) {
        // File wasn't read via read_file first — reconcile now
        anchors = AnchorStateManager.reconcile(absolutePath, lines);
    }

    // Build anchor→lineIndex map for O(1) lookup
    const anchorToLineIndex = new Map<string, number>();
    for (let i = 0; i < anchors.length; i++) {
        anchorToLineIndex.set(anchors[i], i);
    }

    // Validate all edits before applying any (atomic)
    interface ResolvedEdit {
        type: string;
        startIdx: number;
        endIdx: number;
        text: string;
    }

    const resolvedEdits: ResolvedEdit[] = [];

    for (const edit of edits) {
        const anchorId = extractId(edit.anchor);
        const startIdx = anchorToLineIndex.get(anchorId);

        if (startIdx === undefined) {
            return {
                success: false,
                editsApplied: 0,
                message: `Anchor not found: "${anchorId}". The file might have changed — re-read with read_file.`
            };
        }

        let endIdx = startIdx;

        if (edit.edit_type === 'replace' && edit.end_anchor) {
            const endAnchorId = extractId(edit.end_anchor);
            const resolved = anchorToLineIndex.get(endAnchorId);
            if (resolved === undefined) {
                return {
                    success: false,
                    editsApplied: 0,
                    message: `End anchor not found: "${endAnchorId}".`
                };
            }
            if (resolved < startIdx) {
                return {
                    success: false,
                    editsApplied: 0,
                    message: `end_anchor ("${endAnchorId}") must be AFTER anchor ("${anchorId}").`
                };
            }
            endIdx = resolved;
        }

        resolvedEdits.push({
            type: edit.edit_type || 'replace',
            startIdx,
            endIdx,
            text: edit.text
        });
    }

    // Sort edits by startIdx DESCENDING so we apply bottom-up (preserves indices)
    resolvedEdits.sort((a, b) => b.startIdx - a.startIdx);

    // Check for overlaps
    for (let i = 0; i < resolvedEdits.length - 1; i++) {
        const current = resolvedEdits[i];
        const next = resolvedEdits[i + 1];
        // current is BELOW next (descending order)
        if (next.endIdx >= current.startIdx && next.startIdx <= current.endIdx) {
            return {
                success: false,
                editsApplied: 0,
                message: `Overlapping edits detected at lines ${next.startIdx + 1}-${next.endIdx + 1} and ${current.startIdx + 1}-${current.endIdx + 1}.`
            };
        }
    }

    // Apply edits bottom-up
    const mutableLines = [...lines];
    let editsApplied = 0;

    for (const edit of resolvedEdits) {
        const newLines = edit.text === '' ? [] : edit.text.split('\n');

        switch (edit.type) {
            case 'replace':
                // Replace inclusive range [startIdx, endIdx] with new lines
                mutableLines.splice(edit.startIdx, edit.endIdx - edit.startIdx + 1, ...newLines);
                editsApplied++;
                break;

            case 'insert_after':
                mutableLines.splice(edit.startIdx + 1, 0, ...newLines);
                editsApplied++;
                break;

            case 'insert_before':
                mutableLines.splice(edit.startIdx, 0, ...newLines);
                editsApplied++;
                break;

            default:
                return {
                    success: false,
                    editsApplied,
                    message: `Unknown edit type: "${edit.type}". Accepted values: replace, insert_after, insert_before.`
                };
        }
    }

    // Write the result
    const newContent = mutableLines.join('\n');
    fs.writeFileSync(absolutePath, newContent, 'utf8');

    // Update anchor state for subsequent edits
    AnchorStateManager.reconcile(absolutePath, mutableLines);

    return {
        success: true,
        editsApplied,
        message: `${editsApplied} edition(s) applied.`
    };
}

// ============================================================================
// LEGACY MODE — Original old_string/new_string replacement
// ============================================================================

async function executeLegacyMode(args: any, chatId: string, sourceChannel: string, context: any): Promise<any> {
    const { file_path, old_string, new_string } = args;

    if (!file_path || old_string === undefined || new_string === undefined) {
        return {
            success: false,
            message: 'Missing parameters. Anchor mode: provide "files". Legacy mode: provide "file_path", "old_string", "new_string".'
        };
    }

    const absolutePath = path.isAbsolute(file_path) ? file_path : path.resolve(permissionManager.sandboxDir, file_path);

    // Security validation
    const validation = permissionManager.validateFileWrite(absolutePath);
    if (validation.requiresPermission) {
        const permResult = await permissionManager.askPermission(
            chatId,
            `Edit a file (Non-Sandboxed): ${absolutePath}`,
            sourceChannel,
            context.message?.sender || 'system'
        );

        if (!permResult.granted) {
            if (permResult.feedback) {
                return {
                    success: false,
                    message: `[ACTION REJECTED] The user REJECTED this action and provided this corrective instruction: "${permResult.feedback}". Modify your parameters and try again.`
                };
            }
            return {
                success: false,
                message: '[ACTION REJECTED] Permission denied to write outside the sandbox.'
            };
        }
    }

    try {
        if (!fs.existsSync(absolutePath)) {
            return { success: false, message: `Error: File ${absolutePath} does not exist.` };
        }

        // Staleness check
        const { changed, current, lastRead } = fileState.hasChanged(absolutePath);
        if (changed) {
            return {
                success: false,
                message: `SECURITY_ERROR: File ${file_path} has been modified on disk since you last read it (Last read: ${new Date(lastRead!).toLocaleTimeString('en-US')}, Current: ${new Date(current!).toLocaleTimeString('en-US')}). Re-read with read_file before applying changes to avoid overwriting user work.`
            };
        }

        const content = fs.readFileSync(absolutePath, 'utf8');

        // Uniqueness check
        const occurrences = content.split(old_string).length - 1;

        if (occurrences === 0) {
            return {
                success: false,
                message: `Error: 'old_string' was not found exactly in the file. Check spaces and indentation.`
            };
        }

        if (occurrences > 1) {
            return {
                success: false,
                message: `Error: Found ${occurrences} matches for 'old_string'. Modify your 'old_string' to include more context lines to make it unique.`
            };
        }

        // Replace
        const newContent = content.replace(old_string, new_string);
        fs.writeFileSync(absolutePath, newContent, 'utf8');

        // Update timestamps and anchor state
        fileState.recordRead(absolutePath);
        // Also update anchor state so subsequent anchor-based edits work
        AnchorStateManager.reconcile(absolutePath, newContent.split('\n'));

        // Snippet for LLM feedback
        const lines = newContent.split('\n');
        const newStringLinesCount = new_string.split('\n').length;
        const index = newContent.indexOf(new_string);
        const lineNum = newContent.substring(0, index).split('\n').length;

        const startLine = Math.max(0, lineNum - 3);
        const endLine = Math.min(lines.length, lineNum + newStringLinesCount + 2);

        // Return anchored snippet for the LLM (so it can chain edits)
        const hashedContent = hashLines(absolutePath, newContent);
        const hashedLines = hashedContent.split('\n');

        let snippet = '';
        for (let i = startLine; i < endLine; i++) {
            snippet += `${hashedLines[i]}\n`;
        }

        const shortFileName = file_path.split('/').pop();

        return {
            success: true,
            llmOutput: `SUCCESS: File updated. Context around changes (with anchors):\n${snippet}`,
            userOutput: `📝 *File modified*: \`${shortFileName}\`\n~ Replacement successfully performed ~`
        };

    } catch (error: any) {
        return {
            success: false,
            message: `Error during file editing: ${error.message}`
        };
    }
}
