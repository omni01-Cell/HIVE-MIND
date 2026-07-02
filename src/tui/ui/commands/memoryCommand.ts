/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HiveConfig } from '../../config/hiveConfig.js';
import { listMemoryFiles, refreshMemory, showMemory } from '../contexts/UIStateContext.js';
import { MessageType } from '../contexts/UIStateContext.js';
import { CommandKind, OpenCustomDialogActionReturn, SlashCommand, SlashCommandActionReturn } from '../contexts/UIStateContext.js';


const showSubCommand: SlashCommand = {
    name: 'show',
    description: 'Show the current memory contents',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context) => {
        const config = context.services.agentContext?.config;
        if (!config) return;
        const result = showMemory(config);

        context.ui.addItem(
            {
                type: MessageType.INFO,
                text: result.content
            },
            Date.now()
        );
    }
};

const reloadSubCommand: SlashCommand = {
    name: 'reload',
    altNames: ['refresh'],
    description: 'Reload the memory from the source',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context) => {
        context.ui.addItem(
            {
                type: MessageType.INFO,
                text: 'Reloading memory from source files...'
            },
            Date.now()
        );

        try {
            const config = context.services.agentContext?.config;
            if (config) {
                const result = await refreshMemory(config);

                context.ui.addItem(
                    {
                        type: MessageType.INFO,
                        text: result.content
                    },
                    Date.now()
                );
            }
        } catch (error) {
            context.ui.addItem(
                {
                    type: MessageType.ERROR,

                    text: `Error reloading memory: ${(error as Error).message}`
                },
                Date.now()
            );
        }
    }
};

const listSubCommand: SlashCommand = {
    name: 'list',
    description: 'Lists the paths of the GEMINI.md files in use',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context) => {
        const config = context.services.agentContext?.config;
        if (!config) return;
        const result = listMemoryFiles(config);

        context.ui.addItem(
            {
                type: MessageType.INFO,
                text: result.content
            },
            Date.now()
        );
    }
};

export const memoryCommand = (_config: HiveConfig | null): SlashCommand => {
    const subCommands: SlashCommand[] = [
        showSubCommand,
        reloadSubCommand,
        listSubCommand
    ];

    return {
        name: 'memory',
        description: 'Commands for interacting with memory',
        kind: CommandKind.BUILT_IN,
        autoExecute: false,
        subCommands
    };
};
