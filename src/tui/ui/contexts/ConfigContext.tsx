/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext } from 'react';
import { HiveConfig } from '../../config/hiveConfig.js';

export const ConfigContext = React.createContext<HiveConfig | undefined>(undefined);

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (context === undefined) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
};
