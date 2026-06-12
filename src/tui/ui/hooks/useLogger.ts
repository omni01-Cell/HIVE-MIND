/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { HiveConfig } from '../../config/hiveConfig.js';
import { Logger } from '../contexts/UIStateContext.js';

/**
 * Hook to manage the logger instance.
 */
export const useLogger = (config: HiveConfig): Logger | null => {
    const [logger, setLogger] = useState<Logger | null>(null);

    useEffect(() => {
        const newLogger = new Logger(config.getSessionId(), config.storage);

        /**
     * Start async initialization, no need to await. Using await slows down the
     * time from launch to see the gemini-cli prompt and it's better to not save
     * messages than for the cli to hanging waiting for the logger to loading.
     */
        newLogger
            .initialize()
            .then(() => setLogger(newLogger))
            .catch(() => {});
    }, [config]);

    return logger;
};
