import React from 'react';
import { Box, Text } from 'ink';

export type FolderTrustChoice = 'trust' | 'deny' | 'skip';

export function FolderTrustDialog(_props: { onTrust: () => void; onDeny: () => void }) {
    return React.createElement(Box, null,
        React.createElement(Text, null, 'Folder trust dialog not available in TUI mode.')
    );
}
