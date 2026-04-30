import * as fs from 'fs';
import * as path from 'path';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { fileState } from './FileState.js';
import { AnchorStateManager, extractId, ANCHOR_DELIMITER, hashLines } from '../../../services/anchor/index.js';

export default {
    name: 'dev_tools_file_edit',
    description: 'Outil d\'édition de fichiers par remplacement exact ou par ancres hash-stables.',
    version: '2.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'edit_file',
                description: `Modifie un ou plusieurs fichiers via des ancres hash-stables (recommandé) ou par remplacement exact (fallback).

MODE PRINCIPAL (Ancres Hash) — Utilise les ancres retournées par read_file :
- edit_type: "replace" (remplace de anchor à end_anchor inclus), "insert_after", "insert_before"
- anchor: La ligne complète avec son ancre (ex: "AppleBanana§    def process(data):")
- end_anchor: Requis pour "replace" uniquement
- text: Le nouveau contenu (sans ancres, avec indentation)

MODE LEGACY (Remplacement exact) — Fallback si les ancres ne sont pas disponibles :
- old_string + new_string (l'ancien comportement)

BATCHING: Tu PEUX grouper plusieurs fichiers et éditions dans un seul appel via le paramètre "files".`,
                parameters: {
                    type: 'object',
                    properties: {
                        // ── Legacy mode (single file) ──
                        file_path: {
                            type: 'string',
                            description: 'Chemin du fichier (mode legacy uniquement).'
                        },
                        old_string: {
                            type: 'string',
                            description: 'Le texte EXACT à remplacer (mode legacy).'
                        },
                        new_string: {
                            type: 'string',
                            description: 'Le nouveau texte (mode legacy).'
                        },
                        // ── Anchor mode (multi-file batched) ──
                        files: {
                            type: 'array',
                            description: 'Tableau de fichiers avec éditions par ancres (mode principal).',
                            items: {
                                type: 'object',
                                properties: {
                                    path: {
                                        type: 'string',
                                        description: 'Chemin relatif ou absolu du fichier.'
                                    },
                                    edits: {
                                        type: 'array',
                                        description: 'Tableau d\'éditions à appliquer.',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                edit_type: {
                                                    type: 'string',
                                                    enum: ['replace', 'insert_after', 'insert_before'],
                                                    description: 'Type d\'édition.'
                                                },
                                                anchor: {
                                                    type: 'string',
                                                    description: 'Ancre de début (ligne complète avec préfixe).'
                                                },
                                                end_anchor: {
                                                    type: 'string',
                                                    description: 'Ancre de fin (requis pour replace).'
                                                },
                                                text: {
                                                    type: 'string',
                                                    description: 'Nouveau contenu. Utiliser \\n pour les sauts de ligne.'
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
                `Éditer (ancres) : ${absolutePath}`,
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
                        : '[REJECTED] Permission refusée.'
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
                message: `Fichier inexistant: ${absolutePath}`
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
                message: `ERREUR_SECURITE: Fichier modifié depuis la dernière lecture. Relire avec read_file.`
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
                message: `Erreur: ${error.message}`
            });
        }
    }

    // Aggregate results
    const allSuccess = results.every(r => r.success);
    const totalEdits = results.reduce((sum, r) => sum + r.editsApplied, 0);

    const summary = results.map(r => 
        `${r.success ? '✅' : '❌'} ${r.file}: ${r.editsApplied} édits — ${r.message}`
    ).join('\n');

    return {
        success: allSuccess,
        llmOutput: `${allSuccess ? 'SUCCESS' : 'PARTIAL'}: ${totalEdits} edits across ${results.length} file(s).\n${summary}`,
        userOutput: `📝 *Édition multi-fichiers* : ${totalEdits} changements dans ${results.length} fichier(s)`
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
                message: `Ancre introuvable: "${anchorId}". Le fichier a peut-être changé — relire avec read_file.`
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
                    message: `Ancre de fin introuvable: "${endAnchorId}".`
                };
            }
            if (resolved < startIdx) {
                return {
                    success: false,
                    editsApplied: 0,
                    message: `end_anchor ("${endAnchorId}") doit être APRÈS anchor ("${anchorId}").`
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
                message: `Éditions en chevauchement détectées aux lignes ${next.startIdx + 1}-${next.endIdx + 1} et ${current.startIdx + 1}-${current.endIdx + 1}.`
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
                    message: `Type d'édition inconnu: "${edit.type}". Valeurs acceptées: replace, insert_after, insert_before.`
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
        message: `${editsApplied} édition(s) appliquée(s).`
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
            message: 'Paramètres manquants. Mode ancre: fournir "files". Mode legacy: fournir "file_path", "old_string", "new_string".'
        };
    }

    const absolutePath = path.isAbsolute(file_path) ? file_path : path.resolve(permissionManager.sandboxDir, file_path);

    // Security validation
    const validation = permissionManager.validateFileWrite(absolutePath);
    if (validation.requiresPermission) {
        const permResult = await permissionManager.askPermission(
            chatId,
            `Éditer un fichier (Hors Sandbox) : ${absolutePath}`,
            sourceChannel,
            context.message?.sender || 'system'
        );

        if (!permResult.granted) {
            if (permResult.feedback) {
                return {
                    success: false,
                    message: `[ACTION REJECTED] L'utilisateur a REFUSÉ cette action et a fourni cette instruction corrective : "${permResult.feedback}". Modifie tes paramètres et réessaie.`
                };
            }
            return {
                success: false,
                message: '[ACTION REJECTED] Permission refusée d\'écrire hors de la sandbox.'
            };
        }
    }

    try {
        if (!fs.existsSync(absolutePath)) {
            return { success: false, message: `Erreur: Le fichier ${absolutePath} n'existe pas.` };
        }

        // Staleness check
        const { changed, current, lastRead } = fileState.hasChanged(absolutePath);
        if (changed) {
            return {
                success: false,
                message: `ERREUR_SECURITE : Le fichier ${file_path} a été modifié sur le disque depuis que tu l'as lu (Dernière lecture: ${new Date(lastRead!).toLocaleTimeString()}, Actuel: ${new Date(current!).toLocaleTimeString()}). Relis le fichier avec read_file avant d'appliquer tes changements pour éviter d'écraser le travail de l'utilisateur.`
            };
        }

        const content = fs.readFileSync(absolutePath, 'utf8');

        // Uniqueness check
        const occurrences = content.split(old_string).length - 1;

        if (occurrences === 0) {
            return {
                success: false,
                message: `Erreur: 'old_string' n'a pas été trouvée exactement dans le fichier. Vérifiez les espaces et l'indentation.`
            };
        }

        if (occurrences > 1) {
            return {
                success: false,
                message: `Erreur: Trouvé ${occurrences} correspondances pour 'old_string'. Modifiez votre 'old_string' pour inclure plus de lignes de contexte afin qu'elle soit unique.`
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
            userOutput: `📝 *Fichier modifié* : \`${shortFileName}\`\n~ Remplacement effectué avec succès ~`
        };

    } catch (error: any) {
        return {
            success: false,
            message: `Erreur lors de l'édition du fichier : ${error.message}`
        };
    }
}
