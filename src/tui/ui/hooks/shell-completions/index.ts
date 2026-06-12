/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShellCompletionProvider, CompletionResult } from '../../contexts/UIStateContext.js';
import { gitProvider } from './gitProvider.js';
import { npmProvider } from './npmProvider.js';

const providers: ShellCompletionProvider[] = [gitProvider, npmProvider];

export async function getArgumentCompletions(
    commandToken: string,
    tokens: string[],
    cursorIndex: number,
    cwd: string,
    signal?: AbortSignal
): Promise<CompletionResult | null> {
    const provider = providers.find((p) => p.command === commandToken);
    if (!provider) {
        return null;
    }
    return provider.getCompletions(tokens, cursorIndex, cwd, signal);
}
