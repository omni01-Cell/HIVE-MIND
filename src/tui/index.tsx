#!/usr/bin/env node
/**
 * HIVE-MIND TUI — Entry point
 *
 * Comme WhatsApp/Telegram, le TUI est un simple transport.
 * Pas d'OAuth, pas d'extensions, pas de MCP — juste le pont vers le core.
 */
import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { AppContainer } from './ui/AppContainer.js';
import { createHiveConfig } from './config/hiveConfig.js';

const config = createHiveConfig();

async function main() {
    const { waitUntilExit } = render(
        <AppContainer
            config={config as unknown as import('@google/gemini-cli-core').Config}
            startupWarnings={[]}
            version="0.0.1"
            initializationResult={{}}
            resumedSessionData={undefined}
        />
    );
    await waitUntilExit();
}

main().catch((err) => {
    console.error('TUI Error:', err);
    process.exit(1);
});
