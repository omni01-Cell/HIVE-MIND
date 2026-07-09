#!/usr/bin/env node
/**
 * HIVE-MIND TUI — Entry point
 *
 * Démarre le client TUI, gère l'état de connexion WebSocket
 * et l'affichage de l'écran d'attente résilient.
 */
import 'dotenv/config';
import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { AppContainer } from './ui/AppContainer.js';
import { createHiveConfig } from './config/hiveConfig.js';
import { hiveCoreConnection, ConnectionStatus } from './core/connection.js';
import { shortAsciiLogo } from './ui/components/AsciiArt.js';
import { loadSettings } from './config/settings.js';
import { SettingsContext } from './ui/contexts/SettingsContext.js';
import { OverflowProvider } from './ui/contexts/OverflowContext.js';
import { SessionStatsProvider } from './ui/contexts/SessionContext.js';
import { TerminalProvider } from './ui/contexts/TerminalContext.js';
import { VimModeProvider } from './ui/contexts/VimModeContext.js';
import { KeypressProvider } from './ui/contexts/KeypressContext.js';

const config = createHiveConfig();
const settings = loadSettings(process.cwd());

function LoadingScreen() {
    const [dots, setDots] = useState('.');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots((d) => (d.length >= 3 ? '.' : d + '.'));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <Box flexDirection="column" alignItems="center" justifyContent="center" padding={2} borderStyle="round" borderColor="magenta">
            <Box marginBottom={1}>
                <Text color="cyan">{shortAsciiLogo}</Text>
            </Box>
            <Box flexDirection="row" alignItems="center" marginTop={1}>
                <Text color="magenta">
                    <Spinner type="dots" />
                </Text>
                <Text color="white" bold>
                    {"  "}Connexion au Core HIVE-MIND en cours{dots}
                </Text>
            </Box>
            <Box marginTop={1}>
                <Text color="gray">ws://localhost:5001 (Tentatives de reconnexion automatique)</Text>
            </Box>
        </Box>
    );
}

function TuiAppWrapper() {
    const [status, setStatus] = useState<ConnectionStatus>('connecting');

    useEffect(() => {
        const unsubscribe = hiveCoreConnection.onStatusChange((newStatus) => {
            setStatus(newStatus);
        });
        return unsubscribe;
    }, []);

    if (status !== 'connected') {
        return <LoadingScreen />;
    }

    return (
        <AppContainer
            config={config as unknown as import('./config/hiveConfig.js').HiveConfig}
            startupWarnings={[]}
            version="0.0.1"
            initializationResult={{}}
            resumedSessionData={undefined}
        />
    );
}

async function main() {
    await hiveCoreConnection.connect();

    const { waitUntilExit } = render(
        <SettingsContext.Provider value={settings}>
            <OverflowProvider>
                <SessionStatsProvider sessionId="default-session">
                    <TerminalProvider>
                        <KeypressProvider config={config as any}>
                            <VimModeProvider>
                                <TuiAppWrapper />
                            </VimModeProvider>
                        </KeypressProvider>
                    </TerminalProvider>
                </SessionStatsProvider>
            </OverflowProvider>
        </SettingsContext.Provider>
    );
    await waitUntilExit();
}

main().catch((err) => {
    console.error('TUI Error:', err);
    process.exit(1);
});
