/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HiveConfig } from '../../config/hiveConfig.js';
import { isAlternateBufferEnabled } from '../hooks/useAlternateBuffer.js';

export const calculateMainAreaWidth = (
    terminalWidth: number,
    config: HiveConfig
): number => {
    if (isAlternateBufferEnabled(config)) {
        return terminalWidth - 1;
    }
    return terminalWidth;
};
