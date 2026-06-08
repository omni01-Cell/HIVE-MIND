/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { IdeIntegrationNudge } from '../IdeIntegrationNudge.js';
import { LoopDetectionConfirmation } from './LoopDetectionConfirmation.js';
import { FolderTrustDialog } from './FolderTrustDialog.js';
import { ConsentPrompt } from './ConsentPrompt.js';
import { ThemeDialog } from './ThemeDialog.js';
import { SettingsDialog } from './SettingsDialog.js';
import { AuthInProgress } from '../auth/AuthInProgress.js';
import { AuthDialog } from '../auth/AuthDialog.js';
import { BannedAccountDialog } from '../auth/BannedAccountDialog.js';
import { ApiAuthDialog } from '../auth/ApiAuthDialog.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';
import { PrivacyNotice } from '../privacy/PrivacyNotice.js';
import { ProQuotaDialog } from './ProQuotaDialog.js';
import { ValidationDialog } from './ValidationDialog.js';
import { OverageMenuDialog } from './OverageMenuDialog.js';
import { EmptyWalletDialog } from './EmptyWalletDialog.js';
import { relaunchApp } from '../../utils/processUtils.js';
import { SessionBrowser } from './SessionBrowser.js';
import { PermissionsModifyTrustDialog } from './PermissionsModifyTrustDialog.js';
import { ModelDialog } from './ModelDialog.js';
import { VoiceModelDialog } from './VoiceModelDialog.js';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useQuotaState } from '../contexts/QuotaContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import process from 'node:process';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { AdminSettingsChangedDialog } from './AdminSettingsChangedDialog.js';
import { IdeTrustChangeDialog } from './IdeTrustChangeDialog.js';
import { NewAgentsNotification } from './NewAgentsNotification.js';
import { AgentConfigDialog } from './AgentConfigDialog.js';
import { PolicyUpdateDialog } from './PolicyUpdateDialog.js';
import { LoginRestartDialog } from '../auth/LoginRestartDialog.js';

interface DialogManagerProps {
  addItem: UseHistoryManagerReturn['addItem'];
  terminalWidth: number;
}

function renderQuotaDialogs(
    quotaState: ReturnType<typeof useQuotaState>,
    uiActions: ReturnType<typeof useUIActions>,
    config: ReturnType<typeof useConfig>
): React.ReactNode | null {
    if (quotaState.proQuotaRequest) {
        return (
            <ProQuotaDialog
                failedModel={quotaState.proQuotaRequest.failedModel}
                fallbackModel={quotaState.proQuotaRequest.fallbackModel}
                message={quotaState.proQuotaRequest.message}
                isTerminalQuotaError={quotaState.proQuotaRequest.isTerminalQuotaError}
                isModelNotFoundError={!!quotaState.proQuotaRequest.isModelNotFoundError}
                authType={quotaState.proQuotaRequest.authType}
                tierName={config?.getUserTierName()}
                onChoice={uiActions.handleProQuotaChoice}
            />
        );
    }
    if (quotaState.validationRequest) {
        return (
            <ValidationDialog
                validationLink={quotaState.validationRequest.validationLink}
                validationDescription={quotaState.validationRequest.validationDescription}
                learnMoreUrl={quotaState.validationRequest.learnMoreUrl}
                onChoice={uiActions.handleValidationChoice}
            />
        );
    }
    if (quotaState.overageMenuRequest) {
        return (
            <OverageMenuDialog
                failedModel={quotaState.overageMenuRequest.failedModel}
                fallbackModel={quotaState.overageMenuRequest.fallbackModel}
                resetTime={quotaState.overageMenuRequest.resetTime}
                creditBalance={quotaState.overageMenuRequest.creditBalance}
                onChoice={uiActions.handleOverageMenuChoice}
            />
        );
    }
    if (quotaState.emptyWalletRequest) {
        return (
            <EmptyWalletDialog
                failedModel={quotaState.emptyWalletRequest.failedModel}
                fallbackModel={quotaState.emptyWalletRequest.fallbackModel}
                resetTime={quotaState.emptyWalletRequest.resetTime}
                onGetCredits={quotaState.emptyWalletRequest.onGetCredits}
                onChoice={uiActions.handleEmptyWalletChoice}
            />
        );
    }
    return null;
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
                    onRestartRequest={relaunchApp}
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
    if (uiState.isPermissionsDialogOpen) {
        return (
            <PermissionsModifyTrustDialog
                onExit={uiActions.closePermissionsDialog}
                addItem={addItem}
                targetDirectory={uiState.permissionsDialogProps?.targetDirectory}
            />
        );
    }
    return null;
}

function renderAuthDialogs(
    uiState: ReturnType<typeof useUIState>,
    uiActions: ReturnType<typeof useUIActions>,
    config: ReturnType<typeof useConfig>,
    settings: ReturnType<typeof useSettings>
): React.ReactNode | null {
    if (uiState.accountSuspensionInfo) {
        return (
            <Box flexDirection="column">
                <BannedAccountDialog
                    accountSuspensionInfo={uiState.accountSuspensionInfo}
                    onExit={() => { process.exit(1); }}
                    onChangeAuth={() => { uiActions.clearAccountSuspension(); }}
                />
            </Box>
        );
    }
    if (uiState.isAuthenticating) {
        return (
            <AuthInProgress
                onTimeout={() => { uiActions.onAuthError('Authentication cancelled.'); }}
            />
        );
    }
    if (uiState.isAwaitingApiKeyInput) {
        return (
            <Box flexDirection="column">
                <ApiAuthDialog
                    key={uiState.apiKeyDefaultValue}
                    onSubmit={uiActions.handleApiKeySubmit}
                    onCancel={uiActions.handleApiKeyCancel}
                    error={uiState.authError}
                    defaultValue={uiState.apiKeyDefaultValue}
                />
            </Box>
        );
    }
    if (uiState.isAwaitingLoginRestart) {
        return (
            <Box flexDirection="column">
                <LoginRestartDialog
                    onDismiss={uiActions.dismissLoginRestart}
                    config={config}
                    message={uiState.loginRestartMessage}
                />
            </Box>
        );
    }
    if (uiState.isAuthDialogOpen) {
        return (
            <Box flexDirection="column">
                <AuthDialog
                    config={config}
                    settings={settings}
                    setAuthState={uiActions.setAuthState}
                    authError={uiState.authError}
                    onAuthError={uiActions.onAuthError}
                    setAuthContext={uiActions.setAuthContext}
                />
            </Box>
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
    const quotaState = useQuotaState();
    const uiActions = useUIActions();

    if (uiState.adminSettingsChanged) {
        return <AdminSettingsChangedDialog />;
    }
    if (uiState.showIdeRestartPrompt) {
        return <IdeTrustChangeDialog reason={uiState.ideTrustRestartReason} />;
    }
    if (uiState.newAgents) {
        return (
            <NewAgentsNotification
                agents={uiState.newAgents}
                onSelect={uiActions.handleNewAgentsSelect}
            />
        );
    }

    const quotaDialog = renderQuotaDialogs(quotaState, uiActions, config);
    if (quotaDialog) return quotaDialog;

    if (uiState.shouldShowIdePrompt) {
        return (
            <IdeIntegrationNudge
                ide={uiState.currentIDE!}
                onComplete={uiActions.handleIdePromptComplete}
            />
        );
    }
    if (uiState.isFolderTrustDialogOpen) {
        return (
            <FolderTrustDialog
                onSelect={uiActions.handleFolderTrustSelect}
                isRestarting={uiState.isRestarting}
                discoveryResults={uiState.folderDiscoveryResults}
            />
        );
    }
    if (uiState.isPolicyUpdateDialogOpen) {
        return (
            <PolicyUpdateDialog
                config={config}
                request={uiState.policyUpdateConfirmationRequest!}
                onClose={() => uiActions.setIsPolicyUpdateDialogOpen(false)}
            />
        );
    }
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

    if (uiState.showPrivacyNotice) {
        return (
            <PrivacyNotice
                onExit={() => uiActions.exitPrivacyNotice()}
                config={config}
            />
        );
    }

    const authDialog = renderAuthDialogs(uiState, uiActions, config, settings);
    if (authDialog) return authDialog;

    return null;
};
