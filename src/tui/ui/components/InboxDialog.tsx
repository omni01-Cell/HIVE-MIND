/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { DialogFooter } from './shared/DialogFooter.js';
import {
    DiffRenderer,
    parseDiffWithLineNumbers,
    renderDiffLines,
    type DiffLine
} from './messages/DiffRenderer.js';
import { ScrollableList } from './shared/ScrollableList.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import {
    type Config,
    type InboxSkill,
    type InboxPatch,
    type InboxMemoryPatch,
    type InboxSkillDestination,
    getErrorMessage,
    listInboxSkills,
    listInboxPatches,
    listInboxMemoryPatches,
    moveInboxSkill,
    dismissInboxSkill,
    applyInboxPatch,
    dismissInboxPatch,
    applyInboxMemoryPatch,
    dismissInboxMemoryPatch,
    isProjectSkillPatchTarget
} from '@google/gemini-cli-core';

type Phase =
  | 'list'
  | 'skill-preview'
  | 'skill-action'
  | 'patch-preview'
  | 'memory-preview';

type InboxItem =
  | { type: 'skill'; skill: InboxSkill }
  | { type: 'patch'; patch: InboxPatch; targetsProjectSkills: boolean }
  | { type: 'memory-patch'; memoryPatch: InboxMemoryPatch }
  | { type: 'header'; label: string };

interface DestinationChoice {
  destination: InboxSkillDestination;
  label: string;
  description: string;
}

interface PatchAction {
  action: 'apply' | 'dismiss';
  label: string;
  description: string;
}

interface MemoryPatchAction {
  action: 'apply' | 'dismiss';
  label: string;
  description: string;
}

const SKILL_DESTINATION_CHOICES: DestinationChoice[] = [
    {
        destination: 'global',
        label: 'Global',
        description: '~/.gemini/skills — available in all projects'
    },
    {
        destination: 'project',
        label: 'Project',
        description: '.gemini/skills — available in this workspace'
    }
];

interface SkillPreviewAction {
  action: 'move' | 'dismiss';
  label: string;
  description: string;
}

const SKILL_PREVIEW_CHOICES: SkillPreviewAction[] = [
    {
        action: 'move',
        label: 'Move',
        description: 'Choose where to install this skill'
    },
    {
        action: 'dismiss',
        label: 'Dismiss',
        description: 'Delete from inbox'
    }
];

const PATCH_ACTION_CHOICES: PatchAction[] = [
    {
        action: 'apply',
        label: 'Apply',
        description: 'Apply patch and delete from inbox'
    },
    {
        action: 'dismiss',
        label: 'Dismiss',
        description: 'Delete from inbox without applying'
    }
];

// Dismiss-first: memory patches modify durable on-disk state outside the
// project (private MEMORY.md and sibling files, plus ~/.gemini/GEMINI.md),
// so a stray Enter on a freshly-opened memory-patch preview must NOT apply.
// The lower-stakes skill-patch list (PATCH_ACTION_CHOICES) keeps Apply as
// the default.
const MEMORY_PATCH_ACTION_CHOICES: MemoryPatchAction[] = [
    {
        action: 'dismiss',
        label: 'Dismiss',
        description: 'Delete from inbox without applying'
    },
    {
        action: 'apply',
        label: 'Apply',
        description: 'Apply patch and delete from inbox'
    }
];

function normalizePathForUi(filePath: string): string {
    return path.posix.normalize(filePath.replaceAll('\\', '/'));
}

function getPathBasename(filePath: string): string {
    const normalizedPath = normalizePathForUi(filePath);
    const basename = path.posix.basename(normalizedPath);
    return basename === '.' ? filePath : basename;
}

function formatMemoryPatchSummary(patch: InboxMemoryPatch): string {
    const hunkCount = patch.entries.length;
    const sourceCount = patch.sourceFiles.length;
    const hunkLabel = hunkCount === 1 ? 'hunk' : 'hunks';
    const sourceLabel = sourceCount === 1 ? 'patch' : 'patches';
    return `${hunkCount} ${hunkLabel} from ${sourceCount} source ${sourceLabel}`;
}

async function patchTargetsProjectSkills(
    patch: InboxPatch,
    config: Config
): Promise<boolean> {
    const entryTargetsProjectSkills = await Promise.all(
        patch.entries.map((entry) =>
            isProjectSkillPatchTarget(entry.targetPath, config)
        )
    );
    return entryTargetsProjectSkills.some(Boolean);
}

/**
 * Derives a bracketed origin tag from a skill file path,
 * matching the existing [Built-in] convention in SkillsList.
 */
function getSkillOriginTag(filePath: string): string {
    const normalizedPath = normalizePathForUi(filePath);

    if (normalizedPath.includes('/bundle/')) {
        return 'Built-in';
    }
    if (normalizedPath.includes('/extensions/')) {
        return 'Extension';
    }
    if (normalizedPath.includes('/.gemini/skills/')) {
        const homeDirs = [process.env['HOME'], process.env['USERPROFILE']]
            .filter((homeDir): homeDir is string => Boolean(homeDir))
            .map(normalizePathForUi);
        if (
            homeDirs.some((homeDir) =>
                normalizedPath.startsWith(`${homeDir}/.gemini/skills/`)
            )
        ) {
            return 'Global';
        }
        return 'Workspace';
    }
    return '';
}

/**
 * Creates a unified diff string representing a new file.
 */
function newFileDiff(filename: string, content: string): string {
    const lines = content.split('\n');
    const hunkLines = lines.map((l) => `+${l}`).join('\n');
    return [
        '--- /dev/null',
        `+++ ${filename}`,
        `@@ -0,0 +1,${lines.length} @@`,
        hunkLines
    ].join('\n');
}

function formatDate(isoString: string): string {
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return isoString;
    }
}

interface DiffSection {
  /** Stable identifier for the section (e.g. patch entry path + index). */
  key: string;
  /** Header rendered above the diff body, e.g. file path or "SKILL.md". */
  header: string;
  /** Raw unified-diff string. Parsed via parseDiffWithLineNumbers. */
  diffContent: string;
}

interface DiffViewportItem {
  key: string;
  /** Pre-rendered React node for this row. */
  element: React.ReactElement;
}

/**
 * A fixed-height, scrollable diff viewer used by the skill, patch, and
 * memory-patch preview phases. It flattens one or more DiffSections into
 * individual line items so ScrollableList can virtualize and so
 * PgUp/PgDn/Shift+arrows move the viewport over arbitrarily long diffs
 * without overflowing the alternate buffer.
 *
 * The visual styling matches DiffRenderer's renderDiffLines path; we share
 * that helper instead of nesting DiffRenderer (whose own MaxSizedBox
 * wrapping would interfere with virtualization).
 */
const ScrollableDiffViewport: React.FC<{
  sections: DiffSection[];
  width: number;
  height: number;
  hasFocus: boolean;
}> = ({ sections, width, height, hasFocus }) => {
    const items = useMemo<DiffViewportItem[]>(() => {
        const result: DiffViewportItem[] = [];
        sections.forEach((section, sectionIndex) => {
            // Header (with a blank spacer row above for separation between
            // sections — skipped above the first section).
            if (sectionIndex > 0) {
                result.push({
                    key: `${section.key}:spacer`,
                    element: <Text> </Text>
                });
            }
            result.push({
                key: `${section.key}:header`,
                element: (
                    <Text color={theme.text.secondary} bold>
                        {section.header}
                    </Text>
                )
            });

            const parsed: DiffLine[] = parseDiffWithLineNumbers(section.diffContent);
            const rendered = renderDiffLines({
                parsedLines: parsed,
                filename: section.header,
                terminalWidth: width
            });
            rendered.forEach((node, index) => {
                result.push({
                    key: `${section.key}:line:${index}`,
                    // renderDiffLines emits ReactNodes with their own keys; wrap each
                    // in a Fragment so ScrollableList sees a single ReactElement per
                    // row regardless of node shape.
                    element: <Fragment>{node}</Fragment>
                });
            });
        });
        return result;
    }, [sections, width]);

    const renderItem = useCallback(
        ({ item }: { item: DiffViewportItem }) => item.element,
        []
    );
    const keyExtractor = useCallback((item: DiffViewportItem) => item.key, []);
    // Most diff rows are exactly one line tall; long lines wrap so this is a
    // lower bound. ScrollableList re-measures via ResizeObserver, so the
    // estimate only matters for initial sizing.
    const estimatedItemHeight = useCallback(() => 1, []);

    return (
        <Box height={height} width={width} flexShrink={0} flexDirection="column">
            <ScrollableList<DiffViewportItem>
                data={items}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                estimatedItemHeight={estimatedItemHeight}
                hasFocus={hasFocus}
                initialScrollIndex={0}
                scrollbar={true}
            />
        </Box>
    );
};

interface InboxDialogProps {
  config: Config;
  onClose: () => void;
  onReloadSkills: () => Promise<void>;
  onReloadMemory?: () => Promise<void>;
}

function useInboxData(config: Config) {
    const [items, setItems] = useState<InboxItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const [skills, patches, memoryPatches] = await Promise.all([
                    listInboxSkills(config),
                    listInboxPatches(config),
                    listInboxMemoryPatches(config)
                ]);
                const patchItems = await Promise.all(
                    patches.map(async (patch): Promise<InboxItem> => {
                        let targetsProjectSkills = false;
                        try { targetsProjectSkills = await patchTargetsProjectSkills(patch, config); } catch { targetsProjectSkills = false; }
                        return { type: 'patch', patch, targetsProjectSkills };
                    })
                );
                if (!cancelled) {
                    setItems([
                        ...skills.map((skill): InboxItem => ({ type: 'skill', skill })),
                        ...patchItems,
                        ...memoryPatches.map((memoryPatch): InboxItem => ({ type: 'memory-patch', memoryPatch }))
                    ]);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) { setItems([]); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [config]);

    return { items, setItems, loading };
}

function computePreviewData(selectedItem: InboxItem | null) {
    if (!selectedItem) {
        return { skillSections: undefined, patchSections: undefined, memoryGroups: undefined, memorySections: undefined };
    }
    if (selectedItem.type === 'skill') {
        if (!selectedItem.skill.content) return { skillSections: undefined, patchSections: undefined, memoryGroups: undefined, memorySections: undefined };
        return {
            skillSections: [{ key: `skill:${selectedItem.skill.dirName}`, header: 'SKILL.md', diffContent: newFileDiff('SKILL.md', selectedItem.skill.content) }],
            patchSections: undefined, memoryGroups: undefined, memorySections: undefined
        };
    }
    if (selectedItem.type === 'patch') {
        return {
            skillSections: undefined,
            patchSections: selectedItem.patch.entries.map((entry, index) => ({
                key: `${selectedItem.patch.fileName}:${entry.targetPath}:${index}`,
                header: entry.targetPath,
                diffContent: entry.diffContent
            })),
            memoryGroups: undefined, memorySections: undefined
        };
    }
    if (selectedItem.type === 'memory-patch') {
        const groups = new Map<string, { isNewFile: boolean; diffs: string[] }>();
        for (const entry of selectedItem.memoryPatch.entries) {
            const existing = groups.get(entry.targetPath);
            if (existing) { existing.diffs.push(entry.diffContent); if (entry.isNewFile) existing.isNewFile = true; }
            else groups.set(entry.targetPath, { isNewFile: entry.isNewFile, diffs: [entry.diffContent] });
        }
        const memoryGroups = Array.from(groups.entries());
        const memorySections: DiffSection[] = [];
        memoryGroups.forEach(([targetPath, { isNewFile, diffs }], groupIndex) => {
            const headerAnnotation = `${isNewFile ? ' (new file)' : ''}${diffs.length > 1 ? ` · ${diffs.length} changes from different patches` : ''}`;
            diffs.forEach((diff, hunkIndex) => {
                memorySections.push({ key: `${targetPath}:${groupIndex}:${hunkIndex}`, header: hunkIndex === 0 ? `${targetPath}${headerAnnotation}` : targetPath, diffContent: diff });
            });
        });
        return { skillSections: undefined, patchSections: undefined, memoryGroups, memorySections };
    }
    return { skillSections: undefined, patchSections: undefined, memoryGroups: undefined, memorySections: undefined };
}

function createListItems(
    items: InboxItem[],
    getItemKey: (item: InboxItem) => string
): Array<SelectionListItem<InboxItem>> {
    const skills = items.filter((i) => i.type === 'skill');
    const patches = items.filter((i) => i.type === 'patch');
    const memoryPatches = items.filter((i) => i.type === 'memory-patch');
    const result: Array<SelectionListItem<InboxItem>> = [];
    const groups: Array<{ label: string; items: InboxItem[] }> = [
        { label: 'New Skills', items: skills },
        { label: 'Skill Updates', items: patches },
        { label: 'Memory Updates', items: memoryPatches }
    ].filter((group) => group.items.length > 0);
    const showHeaders = groups.length > 1;
    for (const group of groups) {
        if (showHeaders) {
            const header: InboxItem = { type: 'header', label: group.label };
            result.push({ key: `header:${group.label}`, value: header, disabled: true, hideNumber: true });
        }
        for (const item of group.items) {
            result.push({ key: getItemKey(item), value: item });
        }
    }
    return result;
}

function createDestinationItems(isTrustedFolder: boolean): Array<SelectionListItem<DestinationChoice>> {
    return SKILL_DESTINATION_CHOICES.map((choice) => {
        if (choice.destination === 'project' && !isTrustedFolder) {
            return { key: choice.destination, value: { ...choice, description: '.gemini/skills — unavailable until this workspace is trusted' }, disabled: true };
        }
        return { key: choice.destination, value: choice };
    });
}

function createPatchActionItems(isTrustedFolder: boolean, selectedPatchTargetsProjectSkills: boolean): Array<SelectionListItem<PatchAction>> {
    return PATCH_ACTION_CHOICES.map((choice) => {
        if (choice.action === 'apply' && selectedPatchTargetsProjectSkills && !isTrustedFolder) {
            return { key: choice.action, value: { ...choice, description: '.gemini/skills — unavailable until this workspace is trusted' }, disabled: true };
        }
        return { key: choice.action, value: choice };
    });
}

function createSkillPreviewItems(): Array<SelectionListItem<SkillPreviewAction>> {
    return SKILL_PREVIEW_CHOICES.map((choice) => ({ key: choice.action, value: choice }));
}

function createMemoryPatchActionItems(): Array<SelectionListItem<MemoryPatchAction>> {
    return MEMORY_PATCH_ACTION_CHOICES.map((choice) => ({ key: choice.action, value: choice }));
}

async function handleSkillDismiss(
    config: Config,
    selectedItem: InboxItem,
    removeItem: (item: InboxItem) => void,
    setSelectedItem: (item: InboxItem | null) => void,
    setPhase: (phase: Phase) => void,
    setFeedback: (feedback: { text: string; isError: boolean } | null) => void
) {
    if (selectedItem.type !== 'skill') return;
    const skill = selectedItem.skill;
    try {
        const result = await dismissInboxSkill(config, skill.dirName);
        setFeedback({ text: result.message, isError: !result.success });
        if (result.success) {
            removeItem(selectedItem);
            setSelectedItem(null);
            setPhase('list');
        }
    } catch (error) {
        setFeedback({ text: `Failed to dismiss skill: ${getErrorMessage(error)}`, isError: true });
    }
}

async function handleSkillMove(
    config: Config,
    selectedItem: InboxItem,
    choice: DestinationChoice,
    removeItem: (item: InboxItem) => void,
    setSelectedItem: (item: InboxItem | null) => void,
    setPhase: (phase: Phase) => void,
    setFeedback: (feedback: { text: string; isError: boolean } | null) => void,
    onReloadSkills: () => Promise<void>
) {
    if (selectedItem.type !== 'skill') return;
    const skill = selectedItem.skill;
    if (choice.destination === 'project' && !config.isTrustedFolder()) {
        setFeedback({ text: 'Project skills are unavailable until this workspace is trusted.', isError: true });
        return;
    }
    setFeedback(null);
    try {
        const result = await moveInboxSkill(config, skill.dirName, choice.destination);
        setFeedback({ text: result.message, isError: !result.success });
        if (!result.success) return;
        removeItem(selectedItem);
        setSelectedItem(null);
        setPhase('list');
        try {
            await onReloadSkills();
        } catch (error) {
            setFeedback({ text: `${result.message} Failed to reload skills: ${getErrorMessage(error)}`, isError: true });
        }
    } catch (error) {
        setFeedback({ text: `Failed to install skill: ${getErrorMessage(error)}`, isError: true });
    }
}

async function handlePatchApply(
    config: Config,
    selectedItem: InboxItem,
    choice: PatchAction,
    removeItem: (item: InboxItem) => void,
    setSelectedItem: (item: InboxItem | null) => void,
    setPhase: (phase: Phase) => void,
    setFeedback: (feedback: { text: string; isError: boolean } | null) => void,
    onReloadSkills: () => Promise<void>
) {
    if (selectedItem.type !== 'patch') return;
    const patch = selectedItem.patch;
    if (choice.action === 'apply' && !config.isTrustedFolder() && selectedItem.targetsProjectSkills) {
        setFeedback({ text: 'Project skill patches are unavailable until this workspace is trusted.', isError: true });
        return;
    }
    setFeedback(null);
    try {
        let result: { success: boolean; message: string };
        if (choice.action === 'apply') {
            result = await applyInboxPatch(config, patch.fileName);
        } else {
            result = await dismissInboxPatch(config, patch.fileName);
        }
        setFeedback({ text: result.message, isError: !result.success });
        if (!result.success) return;
        removeItem(selectedItem);
        setSelectedItem(null);
        setPhase('list');
        if (choice.action === 'apply') {
            try {
                await onReloadSkills();
            } catch (error) {
                setFeedback({ text: `${result.message} Failed to reload skills: ${getErrorMessage(error)}`, isError: true });
            }
        }
    } catch (error) {
        const operation = choice.action === 'apply' ? 'apply patch' : 'dismiss patch';
        setFeedback({ text: `Failed to ${operation}: ${getErrorMessage(error)}`, isError: true });
    }
}

async function handleMemoryPatchApply(
    config: Config,
    selectedItem: InboxItem,
    choice: MemoryPatchAction,
    removeItem: (item: InboxItem) => void,
    setSelectedItem: (item: InboxItem | null) => void,
    setPhase: (phase: Phase) => void,
    setFeedback: (feedback: { text: string; isError: boolean } | null) => void,
    onReloadMemory: (() => Promise<void>) | undefined
) {
    if (selectedItem.type !== 'memory-patch') return;
    const memoryPatch = selectedItem.memoryPatch;
    setFeedback(null);
    try {
        let result: { success: boolean; message: string };
        if (choice.action === 'apply') {
            result = await applyInboxMemoryPatch(config, memoryPatch.kind, memoryPatch.relativePath);
        } else {
            result = await dismissInboxMemoryPatch(config, memoryPatch.kind, memoryPatch.relativePath);
        }
        setFeedback({ text: result.message, isError: !result.success });
        if (!result.success) return;
        removeItem(selectedItem);
        setSelectedItem(null);
        setPhase('list');
        if (choice.action === 'apply' && onReloadMemory) {
            try {
                await onReloadMemory();
            } catch (error) {
                setFeedback({ text: `${result.message} Failed to reload memory: ${getErrorMessage(error)}`, isError: true });
            }
        }
    } catch (error) {
        const operation = choice.action === 'apply' ? 'apply memory patch' : 'dismiss memory patch';
        setFeedback({ text: `Failed to ${operation}: ${getErrorMessage(error)}`, isError: true });
    }
}

export const InboxDialog: React.FC<InboxDialogProps> = ({
    config,
    onClose,
    onReloadSkills,
    onReloadMemory
}) => {
    const keyMatchers = useKeyMatchers();
    const { terminalWidth, terminalHeight, constrainHeight } = useUIState();
    const isAlternateBuffer = useAlternateBuffer();
    const isTrustedFolder = config.isTrustedFolder();
    const [phase, setPhase] = useState<Phase>('list');
    const { items, setItems, loading } = useInboxData(config);
    const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
    const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
    const [lastListIndex, setLastListIndex] = useState(0);

    const getItemKey = useCallback(
        (item: InboxItem): string =>
            item.type === 'skill'
                ? `skill:${item.skill.dirName}`
                : item.type === 'patch'
                    ? `patch:${item.patch.fileName}`
                    : item.type === 'memory-patch'
                        ? `memory:${item.memoryPatch.kind}:${item.memoryPatch.relativePath}`
                        : `header:${item.label}`,
        []
    );

    const listItems: Array<SelectionListItem<InboxItem>> = useMemo(() => createListItems(items, getItemKey), [items, getItemKey]);

    const destinationItems: Array<SelectionListItem<DestinationChoice>> = useMemo(() => createDestinationItems(isTrustedFolder), [isTrustedFolder]);

    const selectedPatchTargetsProjectSkills = useMemo(() => selectedItem?.type === 'patch' ? selectedItem.targetsProjectSkills : false, [selectedItem]);

    const patchActionItems: Array<SelectionListItem<PatchAction>> = useMemo(() => createPatchActionItems(isTrustedFolder, selectedPatchTargetsProjectSkills), [isTrustedFolder, selectedPatchTargetsProjectSkills]);

    const skillPreviewItems: Array<SelectionListItem<SkillPreviewAction>> = useMemo(() => createSkillPreviewItems(), []);

    const memoryPatchActionItems: Array<SelectionListItem<MemoryPatchAction>> = useMemo(() => createMemoryPatchActionItems(), []);

    const removeItem = useCallback(
        (item: InboxItem) => { setItems((prev) => prev.filter((i) => getItemKey(i) !== getItemKey(item))); },
        [getItemKey, setItems]
    );

    const handleSelectItem = useCallback(
        (item: InboxItem) => {
            setSelectedItem(item);
            setFeedback(null);
            const idx = listItems.findIndex((i) => i.value === item);
            if (idx >= 0) setLastListIndex(idx);
            setPhase(item.type === 'skill' ? 'skill-preview' : item.type === 'patch' ? 'patch-preview' : 'memory-preview');
        },
        [listItems]
    );

    const handleSkillPreviewAction = useCallback(
        (choice: SkillPreviewAction) => {
            if (!selectedItem || selectedItem.type !== 'skill') return;
            if (choice.action === 'move') { setFeedback(null); setPhase('skill-action'); return; }
            setFeedback(null);
            void handleSkillDismiss(config, selectedItem, removeItem, setSelectedItem, setPhase, setFeedback);
        },
        [config, selectedItem, removeItem]
    );

    const handleSelectDestination = useCallback(
        (choice: DestinationChoice) => {
            if (!selectedItem || selectedItem.type !== 'skill') return;
            void handleSkillMove(config, selectedItem, choice, removeItem, setSelectedItem, setPhase, setFeedback, onReloadSkills);
        },
        [config, selectedItem, onReloadSkills, removeItem]
    );

    const handleSelectPatchAction = useCallback(
        (choice: PatchAction) => {
            if (!selectedItem || selectedItem.type !== 'patch') return;
            void handlePatchApply(config, selectedItem, choice, removeItem, setSelectedItem, setPhase, setFeedback, onReloadSkills);
        },
        [config, selectedItem, onReloadSkills, removeItem]
    );

    const handleSelectMemoryPatchAction = useCallback(
        (choice: MemoryPatchAction) => {
            if (!selectedItem || selectedItem.type !== 'memory-patch') return;
            void handleMemoryPatchApply(config, selectedItem, choice, removeItem, setSelectedItem, setPhase, setFeedback, onReloadMemory);
        },
        [config, selectedItem, onReloadMemory, removeItem]
    );

    useKeypress(
        (key) => {
            if (keyMatchers[Command.ESCAPE](key)) {
                if (phase === 'skill-action') { setPhase('skill-preview'); setFeedback(null); }
                else if (phase !== 'list') { setPhase('list'); setSelectedItem(null); setFeedback(null); }
                else { onClose(); }
                return true;
            }
            return false;
        },
        { isActive: true, priority: true }
    );

    const previewData = useMemo(() => computePreviewData(selectedItem), [selectedItem]);

    if (loading) {
        return (
            <Box flexDirection="column" borderStyle="round" borderColor={theme.border.default} paddingX={2} paddingY={1}>
                <Text>Loading inbox…</Text>
            </Box>
        );
    }

    if (items.length === 0 && !feedback) {
        return (
            <Box flexDirection="column" borderStyle="round" borderColor={theme.border.default} paddingX={2} paddingY={1}>
                <Text bold>Memory Inbox</Text>
                <Box marginTop={1}><Text color={theme.text.secondary}>No items in inbox.</Text></Box>
                <DialogFooter primaryAction="Esc to close" cancelAction="" />
            </Box>
        );
    }

    const contentWidth = terminalWidth - 6;
    const DIALOG_CHROME_HEIGHT = 16;
    const feedbackHeight = feedback ? 2 : 0;
    const diffViewportHeight = Math.max(3, terminalHeight - DIALOG_CHROME_HEIGHT - feedbackHeight);
    const availableContentHeight = constrainHeight ? diffViewportHeight : undefined;
    const PATCH_ENTRY_OVERHEAD = 2;
    const patchEntryCount = selectedItem?.type === 'patch' ? selectedItem.patch.entries.length : selectedItem?.type === 'memory-patch' ? selectedItem.memoryPatch.entries.length : 1;
    const availablePatchEntryHeight = availableContentHeight === undefined ? undefined : Math.max(3, Math.floor((availableContentHeight - patchEntryCount * PATCH_ENTRY_OVERHEAD) / Math.max(1, patchEntryCount)));
    const LIST_PHASE_CHROME_HEIGHT = 12;
    const LIST_ROW_HEIGHT = 2;
    const listMaxItemsToShow = Math.max(1, Math.min(8, Math.floor((terminalHeight - LIST_PHASE_CHROME_HEIGHT - feedbackHeight) / LIST_ROW_HEIGHT)));

    return (
        <OverflowProvider>
            <Box flexDirection="column" borderStyle="round" borderColor={theme.border.default} paddingX={2} paddingY={1} width="100%">
                <InboxDialogPhaseView
                    phase={phase} selectedItem={selectedItem} previewData={previewData} feedback={feedback}
                    contentWidth={contentWidth} diffViewportHeight={diffViewportHeight}
                    availablePatchEntryHeight={availablePatchEntryHeight} availableContentHeight={availableContentHeight}
                    isAlternateBuffer={isAlternateBuffer} constrainHeight={constrainHeight}
                    listItems={listItems} lastListIndex={lastListIndex} listMaxItemsToShow={listMaxItemsToShow}
                    items={items} destinationItems={destinationItems} patchActionItems={patchActionItems}
                    skillPreviewItems={skillPreviewItems} memoryPatchActionItems={memoryPatchActionItems}
                    handleSelectItem={handleSelectItem} handleSkillPreviewAction={handleSkillPreviewAction}
                    handleSelectDestination={handleSelectDestination} handleSelectPatchAction={handleSelectPatchAction}
                    handleSelectMemoryPatchAction={handleSelectMemoryPatchAction}
                />
            </Box>
        </OverflowProvider>
    );
};

interface InboxDialogPhaseProps {
    phase: Phase;
    selectedItem: InboxItem | null;
    previewData: ReturnType<typeof computePreviewData>;
    feedback: { text: string; isError: boolean } | null;
    contentWidth: number;
    diffViewportHeight: number;
    availablePatchEntryHeight: number | undefined;
    availableContentHeight: number | undefined;
    isAlternateBuffer: boolean;
    constrainHeight: boolean;
    listItems: Array<SelectionListItem<InboxItem>>;
    lastListIndex: number;
    listMaxItemsToShow: number;
    items: InboxItem[];
    destinationItems: Array<SelectionListItem<DestinationChoice>>;
    patchActionItems: Array<SelectionListItem<PatchAction>>;
    skillPreviewItems: Array<SelectionListItem<SkillPreviewAction>>;
    memoryPatchActionItems: Array<SelectionListItem<MemoryPatchAction>>;
    handleSelectItem: (item: InboxItem) => void;
    handleSkillPreviewAction: (choice: SkillPreviewAction) => void;
    handleSelectDestination: (choice: DestinationChoice) => void;
    handleSelectPatchAction: (choice: PatchAction) => void;
    handleSelectMemoryPatchAction: (choice: MemoryPatchAction) => void;
}

function InboxDialogPhaseView({
    phase,
    selectedItem,
    previewData,
    feedback,
    contentWidth,
    diffViewportHeight,
    availablePatchEntryHeight,
    availableContentHeight,
    isAlternateBuffer,
    constrainHeight,
    listItems,
    lastListIndex,
    listMaxItemsToShow,
    items,
    destinationItems,
    patchActionItems,
    skillPreviewItems,
    memoryPatchActionItems,
    handleSelectItem,
    handleSkillPreviewAction,
    handleSelectDestination,
    handleSelectPatchAction,
    handleSelectMemoryPatchAction
}: InboxDialogPhaseProps) {
    const previewNavigationHint = isAlternateBuffer ? 'PgUp/PgDn to scroll' : undefined;
    const renderFeedback = () => {
        if (!feedback) return null;
        return (
            <Box marginTop={1}>
                <Text color={feedback.isError ? theme.status.error : theme.status.success}>
                    {feedback.isError ? '✗ ' : '✓ '}{feedback.text}
                </Text>
            </Box>
        );
    };

    const renderListItem = (item: SelectionListItem<InboxItem>, { titleColor }: { titleColor?: string }) => {
        if (item.value.type === 'header') {
            return <Box marginTop={1}><Text color={theme.text.secondary} bold>{item.value.label}</Text></Box>;
        }
        if (item.value.type === 'skill') {
            const skill = item.value.skill;
            const subtitle = skill.extractedAt ? `${skill.description} · ${formatDate(skill.extractedAt)}` : skill.description;
            return <Box flexDirection="column" height={2}><Text color={titleColor} bold wrap="truncate-end">{skill.name}</Text><Text color={theme.text.secondary} wrap="truncate-end">{subtitle}</Text></Box>;
        }
        if (item.value.type === 'memory-patch') {
            const mp = item.value.memoryPatch;
            const summary = formatMemoryPatchSummary(mp);
            const subtitle = mp.extractedAt ? `${summary} · ${formatDate(mp.extractedAt)}` : summary;
            return <Box flexDirection="column" height={2}><Text color={titleColor} bold wrap="truncate-end">{mp.name}</Text><Text color={theme.text.secondary} wrap="truncate-end">{subtitle}</Text></Box>;
        }
        const patch = item.value.patch;
        const fileNames = patch.entries.map((e) => getPathBasename(e.targetPath));
        const origin = getSkillOriginTag(patch.entries[0]?.targetPath ?? '');
        const titleLine = origin ? `${patch.name} [${origin}]` : patch.name;
        const subtitle = patch.extractedAt ? `${fileNames.join(', ')} · ${formatDate(patch.extractedAt)}` : fileNames.join(', ');
        return <Box flexDirection="column" height={2}><Text color={titleColor} bold wrap="truncate-end">{titleLine}</Text><Text color={theme.text.secondary} wrap="truncate-end">{subtitle}</Text></Box>;
    };

    const renderSkillPreview = () => {
        if (phase !== 'skill-preview' || selectedItem?.type !== 'skill') return null;
        return (
            <>
                <Text bold>{selectedItem.skill.name}</Text>
                <Text color={theme.text.secondary}>Review new skill before installing.</Text>
                {selectedItem.skill.content && (
                    isAlternateBuffer ? (
                        <Box flexDirection="column" marginTop={1}>
                            <ScrollableDiffViewport sections={previewData.skillSections ?? []} width={contentWidth} height={diffViewportHeight} hasFocus={true} />
                        </Box>
                    ) : (
                        <Box flexDirection="column" marginTop={1}>
                            <Text color={theme.text.secondary} bold>SKILL.md</Text>
                            <DiffRenderer diffContent={newFileDiff('SKILL.md', selectedItem.skill.content)} filename="SKILL.md" terminalWidth={contentWidth} availableTerminalHeight={availableContentHeight} />
                        </Box>
                    )
                )}
                <Box flexDirection="column" marginTop={1}>
                    <BaseSelectionList<SkillPreviewAction> items={skillPreviewItems} onSelect={handleSkillPreviewAction} isFocused={true} showNumbers={true} renderItem={(item, { titleColor }) => (
                        <Box flexDirection="column" minHeight={2}>
                            <Text color={titleColor} bold>{item.value.label}</Text>
                            <Text color={theme.text.secondary}>{item.value.description}</Text>
                        </Box>
                    )} />
                </Box>
                {renderFeedback()}
                {!isAlternateBuffer && <ShowMoreLines constrainHeight={constrainHeight} />}
                <DialogFooter primaryAction="Enter to confirm" navigationActions={previewNavigationHint} cancelAction="Esc to go back" />
            </>
        );
    };

    return (
        <>
            {phase === 'list' && (
                <>
                    <Text bold>Memory Inbox ({items.length} item{items.length !== 1 ? 's' : ''})</Text>
                    <Text color={theme.text.secondary}>Extracted from past sessions. Select one to review.</Text>
                    <Box flexDirection="column" marginTop={1}>
                        <BaseSelectionList<InboxItem> items={listItems} initialIndex={Math.max(0, Math.min(lastListIndex, listItems.length - 1))} onSelect={handleSelectItem} isFocused={true} showNumbers={false} showScrollArrows={true} maxItemsToShow={listMaxItemsToShow} renderItem={renderListItem} />
                    </Box>
                    {renderFeedback()}
                    <DialogFooter primaryAction="Enter to select" cancelAction="Esc to close" />
                </>
            )}
            {renderSkillPreview()}
            {phase === 'skill-action' && selectedItem?.type === 'skill' && (
                <>
                    <Text bold>Move &quot;{selectedItem.skill.name}&quot;</Text>
                    <Text color={theme.text.secondary}>Choose where to install this skill.</Text>
                    <Box flexDirection="column" marginTop={1}>
                        <BaseSelectionList<DestinationChoice> items={destinationItems} onSelect={handleSelectDestination} isFocused={true} showNumbers={true} renderItem={(item, { titleColor }) => (
                            <Box flexDirection="column" minHeight={2}>
                                <Text color={titleColor} bold>{item.value.label}</Text>
                                <Text color={theme.text.secondary}>{item.value.description}</Text>
                            </Box>
                        )} />
                    </Box>
                    {renderFeedback()}
                    <DialogFooter primaryAction="Enter to confirm" cancelAction="Esc to go back" />
                </>
            )}
            {phase === 'patch-preview' && selectedItem?.type === 'patch' && (
                <>
                    <Text bold>{selectedItem.patch.name}</Text>
                    <Box flexDirection="row">
                        <Text color={theme.text.secondary}>Review changes before applying.</Text>
                        {getSkillOriginTag(selectedItem.patch.entries[0]?.targetPath ?? '') && <Text color={theme.text.secondary}>{` [${getSkillOriginTag(selectedItem.patch.entries[0]?.targetPath ?? '')}]`}</Text>}
                    </Box>
                    <Box flexDirection="column" marginTop={1}>
                        {isAlternateBuffer ? (
                            <ScrollableDiffViewport sections={previewData.patchSections ?? []} width={contentWidth} height={diffViewportHeight} hasFocus={true} />
                        ) : (
                            selectedItem.patch.entries.map((entry, index) => (
                                <Box key={`${selectedItem.patch.fileName}:${entry.targetPath}:${index}`} flexDirection="column" marginBottom={1}>
                                    <Text color={theme.text.secondary} bold>{entry.targetPath}</Text>
                                    <DiffRenderer diffContent={entry.diffContent} filename={entry.targetPath} terminalWidth={contentWidth} availableTerminalHeight={availablePatchEntryHeight} />
                                </Box>
                            ))
                        )}
                    </Box>
                    <Box flexDirection="column" marginTop={1}>
                        <BaseSelectionList<PatchAction> items={patchActionItems} onSelect={handleSelectPatchAction} isFocused={true} showNumbers={true} renderItem={(item, { titleColor }) => (
                            <Box flexDirection="column" minHeight={2}>
                                <Text color={titleColor} bold>{item.value.label}</Text>
                                <Text color={theme.text.secondary}>{item.value.description}</Text>
                            </Box>
                        )} />
                    </Box>
                    {renderFeedback()}
                    {!isAlternateBuffer && <ShowMoreLines constrainHeight={constrainHeight} />}
                    <DialogFooter primaryAction="Enter to confirm" navigationActions={previewNavigationHint} cancelAction="Esc to go back" />
                </>
            )}
            {phase === 'memory-preview' && selectedItem?.type === 'memory-patch' && (
                <>
                    <Text bold>{selectedItem.memoryPatch.name}</Text>
                    <Text color={theme.text.secondary}>
                        Review {formatMemoryPatchSummary(selectedItem.memoryPatch)} before applying. Apply runs each source patch atomically; Dismiss removes them all.
                    </Text>
                    {isAlternateBuffer ? (
                        <Box flexDirection="column" marginTop={1}>
                            <ScrollableDiffViewport sections={previewData.memorySections ?? []} width={contentWidth} height={diffViewportHeight} hasFocus={true} />
                        </Box>
                    ) : (
                        (previewData.memoryGroups ?? []).map(([targetPath, { isNewFile, diffs }]) => (
                            <Box key={targetPath} flexDirection="column" marginTop={1}>
                                <Text color={theme.text.secondary} bold>
                                    {targetPath}{isNewFile ? ' (new file)' : ''}{diffs.length > 1 ? ` · ${diffs.length} changes from different patches` : ''}
                                </Text>
                                {diffs.map((diff, hunkIndex) => (
                                    <DiffRenderer key={`${targetPath}:${hunkIndex}`} diffContent={diff} filename={targetPath} terminalWidth={contentWidth} availableTerminalHeight={availablePatchEntryHeight} />
                                ))}
                            </Box>
                        ))
                    )}
                    <Box flexDirection="column" marginTop={1}>
                        <BaseSelectionList<MemoryPatchAction> items={memoryPatchActionItems} onSelect={handleSelectMemoryPatchAction} isFocused={true} showNumbers={true} renderItem={(item, { titleColor }) => (
                            <Box flexDirection="column" minHeight={2}>
                                <Text color={titleColor} bold>{item.value.label}</Text>
                                <Text color={theme.text.secondary}>{item.value.description}</Text>
                            </Box>
                        )} />
                    </Box>
                    {renderFeedback()}
                    {!isAlternateBuffer && <ShowMoreLines constrainHeight={constrainHeight} />}
                    <DialogFooter primaryAction="Enter to confirm" navigationActions={previewNavigationHint} cancelAction="Esc to go back" />
                </>
            )}
        </>
    );
}
