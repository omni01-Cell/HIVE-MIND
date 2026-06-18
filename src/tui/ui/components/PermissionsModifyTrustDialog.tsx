import React from 'react';
import { Box, Text } from 'ink';

export interface PermissionsDialogProps {
    onClose: () => void;
    permissions?: unknown[];
}

export function PermissionsModifyTrustDialog(_props: PermissionsDialogProps) {
    return React.createElement(Box, null,
        React.createElement(Text, null, 'Permissions modify trust dialog not available in TUI mode.')
    );
}
