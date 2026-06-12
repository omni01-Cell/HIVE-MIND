/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { LoopDetectionConfirmation } from './LoopDetectionConfirmation.js';
import { ConsentPrompt } from './ConsentPrompt.js';
import { ThemeDialog } from './ThemeDialog.js';
import { SettingsDialog } from './SettingsDialog.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';
import { SessionBrowser } from './SessionBrowser.js';
import { ModelDialog } from './ModelDialog.js';
import { VoiceModelDialog } from './VoiceModelDialog.js';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { AgentConfigDialog } from './AgentConfigDialog.js';

interface DialogManagerProps {
  addItem: UseHistoryManagerReturn['addItem'];
  terminalWidth: number;
}

function renderConsentDialogs(
    uiState: ReturnType<typeof useUIState>,
    terminalWidth: number
): React.ReactNode | null {
    if (uiState.permissionConfirmationRequest) {
        const files = uiState.permissionConfirmationRequest.files;
        const filesList = files.map((f) => `- ${f}`).join('\n');
        return (
            <ConsentPrompt
                prompt={`The following files are outside your workspace:\n\n${filesList}\n\nDo you want to allow this read?`}
                onConfirm={(allowed) => {
                    uiState.permissionConfirmationRequest?.onComplete({ allowed });
                }}
                terminalWidth={terminalWidth}
            />
        );
    }
    if (uiState.commandConfirmationRequest) {
        return (
            <ConsentPrompt
                prompt={uiState.commandConfirmationRequest.prompt}
                onConfirm={uiState.commandConfirmationRequest.onConfirm}
                terminalWidth={terminalWidth}
            />
        );
    }
    if (uiState.authConsentRequest) {
        return (
            <ConsentPrompt
                prompt={uiState.authConsentRequest.prompt}
                onConfirm={uiState.authConsentRequest.onConfirm}
                terminalWidth={terminalWidth}
            />
        );
    }
    if (uiState.confirmUpdateExtensionRequests.length > 0) {
        const request = uiState.confirmUpdateExtensionRequests[0];
        return (
            <ConsentPrompt
                prompt={request.prompt}
                onConfirm={request.onConfirm}
                terminalWidth={terminalWidth}
            />
        );
    }
    return null;
}

function renderSettingsDialogs(
    uiState: ReturnType<typeof useUIState>,
    uiActions: ReturnType<typeof useUIActions>,
    settings: ReturnType<typeof useSettings>,
    config: ReturnType<typeof useConfig>,
    addItem: UseHistoryManagerReturn['addItem']
): React.ReactNode | null {
    const { constrainHeight, terminalHeight, staticExtraHeight, terminalWidth: uiTerminalWidth } = uiState;

    if (uiState.isThemeDialogOpen) {
        return (
            <Box flexDirection="column">
                {uiState.themeError && (
                    <Box marginBottom={1}>
                        <Text color={theme.status.error}>{uiState.themeError}</Text>
                    </Box>
                )}
                <ThemeDialog
                    onSelect={uiActions.handleThemeSelect}
                    onCancel={uiActions.closeThemeDialog}
                    onHighlight={uiActions.handleThemeHighlight}
                    settings={settings}
                    availableTerminalHeight={
                        constrainHeight ? terminalHeight - staticExtraHeight : undefined
                    }
                    terminalWidth={uiTerminalWidth}
                />
            </Box>
        );
    }
    if (uiState.isSettingsDialogOpen) {
        return (
            <Box flexDirection="column">
                <SettingsDialog
                    onSelect={() => uiActions.closeSettingsDialog()}
                    onRestartRequest={() => {}}
                    availableTerminalHeight={terminalHeight - staticExtraHeight}
                />
            </Box>
        );
    }
    if (uiState.isModelDialogOpen) {
        return <ModelDialog onClose={uiActions.closeModelDialog} />;
    }
    if (uiState.isVoiceModelDialogOpen) {
        return <VoiceModelDialog onClose={uiActions.closeVoiceModelDialog} />;
    }
    if (
        uiState.isAgentConfigDialogOpen &&
        uiState.selectedAgentName &&
        uiState.selectedAgentDisplayName &&
        uiState.selectedAgentDefinition
    ) {
        return (
            <Box flexDirection="column">
                <AgentConfigDialog
                    agentName={uiState.selectedAgentName}
                    displayName={uiState.selectedAgentDisplayName}
                    definition={uiState.selectedAgentDefinition}
                    settings={settings}
                    availableTerminalHeight={terminalHeight - staticExtraHeight}
                    onClose={uiActions.closeAgentConfigDialog}
                    onSave={async () => {
                        const agentRegistry = config?.getAgentRegistry();
                        if (agentRegistry) {
                            await agentRegistry.reload();
                        }
                    }}
                />
            </Box>
        );
    }
    if (uiState.isEditorDialogOpen) {
        return (
            <Box flexDirection="column">
                {uiState.editorError && (
                    <Box marginBottom={1}>
                        <Text color={theme.status.error}>{uiState.editorError}</Text>
                    </Box>
                )}
                <EditorSettingsDialog
                    onSelect={uiActions.handleEditorSelect}
                    settings={settings}
                    onExit={uiActions.exitEditorDialog}
                />
            </Box>
        );
    }
    if (uiState.isSessionBrowserOpen) {
        return (
            <SessionBrowser
                config={config}
                onResumeSession={uiActions.handleResumeSession}
                onDeleteSession={uiActions.handleDeleteSession}
                onExit={uiActions.closeSessionBrowser}
            />
        );
    }
    return null;
}

// Props for DialogManager
export const DialogManager = ({
    addItem,
    terminalWidth
}: DialogManagerProps) => {
    const config = useConfig();
    const settings = useSettings();

    const uiState = useUIState();
    const uiActions = useUIActions();

    if (uiState.loopDetectionConfirmationRequest) {
        return (
            <LoopDetectionConfirmation
                onComplete={uiState.loopDetectionConfirmationRequest.onComplete}
            />
        );
    }

    const consentDialog = renderConsentDialogs(uiState, terminalWidth);
    if (consentDialog) return consentDialog;

    const settingsDialog = renderSettingsDialogs(uiState, uiActions, settings, config, addItem);
    if (settingsDialog) return settingsDialog;

    return null;
};
