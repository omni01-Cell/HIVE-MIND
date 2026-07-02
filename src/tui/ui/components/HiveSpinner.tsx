/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { CliSpinner } from './CliSpinner.js';
import type { SpinnerName } from 'cli-spinners';
import { Colors } from '../colors.js';
import tinygradient from 'tinygradient';

const COLOR_CYCLE_DURATION_MS = 4000;

interface HiveSpinnerProps {
  spinnerType?: SpinnerName;
  altText?: string;
}

export const HiveSpinner: React.FC<HiveSpinnerProps> = ({
    spinnerType = 'dots',
    altText
}) => {
    const isScreenReaderEnabled = useIsScreenReaderEnabled();
    const [time, setTime] = useState(0);

    const hiveGradient = useMemo(() => {
        const brandColors = [
            Colors.AccentPurple,
            Colors.AccentBlue,
            Colors.AccentCyan,
            Colors.AccentGreen,
            Colors.AccentYellow,
            Colors.AccentRed
        ];
        return tinygradient([...brandColors, brandColors[0]]);
    }, []);

    useEffect(() => {
        if (isScreenReaderEnabled) {
            return;
        }

        const interval = setInterval(() => {
            setTime((prevTime) => prevTime + 30);
        }, 30); // ~33fps for smooth color transitions

        return () => clearInterval(interval);
    }, [isScreenReaderEnabled]);

    const progress = (time % COLOR_CYCLE_DURATION_MS) / COLOR_CYCLE_DURATION_MS;
    const currentColor = hiveGradient.rgbAt(progress).toHexString();

    return isScreenReaderEnabled ? (
        <Text>{altText}</Text>
    ) : (
        <Text color={currentColor}>
            {/* Cast as any due to type version mismatch between ink-spinner and cli-spinners */}
            <CliSpinner type={spinnerType as any} />
        </Text>
    );
};
