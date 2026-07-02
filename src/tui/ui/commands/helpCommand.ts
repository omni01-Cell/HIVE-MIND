/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from '../contexts/UIStateContext.js';
import { MessageType } from '../contexts/UIStateContext.js';
import { HistoryItemHelp } from '../contexts/UIStateContext.js';

export const helpCommand: SlashCommand = {
    name: 'help',
    kind: CommandKind.BUILT_IN,
    description: 'For help on gemini-cli',
    autoExecute: true,
    action: async (context) => {
        const helpItem: Omit<HistoryItemHelp, 'id'> = {
            type: MessageType.HELP,
            timestamp: new Date()
        };

        context.ui.addItem(helpItem);
    }
};
