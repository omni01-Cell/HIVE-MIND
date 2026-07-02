import React from 'react';
import { Box, Text } from 'ink';

export interface IdeIntegrationNudgeResult {
    accepted: boolean;
    editorCommand?: string;
}

export function IdeIntegrationNudge() {
    return React.createElement(Box, null,
        React.createElement(Text, null, 'IDE integration not available in TUI mode.')
    );
}
