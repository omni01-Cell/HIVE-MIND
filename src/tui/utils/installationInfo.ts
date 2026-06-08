/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, isGitRepository } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import process from 'node:process';

export const isDevelopment = process.env['NODE_ENV'] === 'development';

export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
  PNPX = 'pnpx',
  BUN = 'bun',
  BUNX = 'bunx',
  HOMEBREW = 'homebrew',
  NPX = 'npx',
  BINARY = 'binary',
  VOLTA = 'volta',
  UNKNOWN = 'unknown',
}

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

function detectFromRealPath(
    realPath: string,
    normalizedProjectRoot: string | undefined,
    projectRoot: string,
    isAutoUpdateEnabled: boolean
): InstallationInfo | undefined {
    if (
        isGitRepository(process.cwd()) &&
        normalizedProjectRoot &&
        realPath.startsWith(normalizedProjectRoot) &&
        !realPath.includes('/node_modules/')
    ) {
        return {
            packageManager: PackageManager.UNKNOWN,
            isGlobal: false,
            updateMessage: 'Running from a local git clone. Please update with "git pull".'
        };
    }

    if (realPath.includes('/.npm/_npx') || realPath.includes('/npm/_npx')) {
        return { packageManager: PackageManager.NPX, isGlobal: false, updateMessage: 'Running via npx, update not applicable.' };
    }
    if (realPath.includes('/.pnpm/_pnpx') || realPath.includes('/.cache/pnpm/dlx')) {
        return { packageManager: PackageManager.PNPX, isGlobal: false, updateMessage: 'Running via pnpx, update not applicable.' };
    }

    const brewResult = detectHomebrew(realPath);
    if (brewResult) return brewResult;

    if (realPath.includes('/.volta/') || realPath.includes('/Volta/')) {
        const updateCommand = 'volta install @google/gemini-cli@latest';
        return {
            packageManager: PackageManager.VOLTA, isGlobal: true, updateCommand,
            updateMessage: isAutoUpdateEnabled
                ? 'Installed with Volta. Attempting to automatically update now...'
                : `Please run ${updateCommand} to update`
        };
    }

    if (
        realPath.includes('/.pnpm/global') || realPath.includes('/.local/share/pnpm') ||
        realPath.includes('/Library/pnpm/global/') || realPath.includes('/AppData/Local/pnpm/global/')
    ) {
        const updateCommand = 'pnpm add -g @google/gemini-cli@latest';
        return {
            packageManager: PackageManager.PNPM, isGlobal: true, updateCommand,
            updateMessage: isAutoUpdateEnabled
                ? 'Installed with pnpm. Attempting to automatically update now...'
                : `Please run ${updateCommand} to update`
        };
    }

    if (realPath.includes('/.yarn/global')) {
        const updateCommand = 'yarn global add @google/gemini-cli@latest';
        return {
            packageManager: PackageManager.YARN, isGlobal: true, updateCommand,
            updateMessage: isAutoUpdateEnabled
                ? 'Installed with yarn. Attempting to automatically update now...'
                : `Please run ${updateCommand} to update`
        };
    }

    if (realPath.includes('/.bun/install/cache')) {
        return { packageManager: PackageManager.BUNX, isGlobal: false, updateMessage: 'Running via bunx, update not applicable.' };
    }
    if (realPath.includes('/.bun/install/global')) {
        const updateCommand = 'bun add -g @google/gemini-cli@latest';
        return {
            packageManager: PackageManager.BUN, isGlobal: true, updateCommand,
            updateMessage: isAutoUpdateEnabled
                ? 'Installed with bun. Attempting to automatically update now...'
                : `Please run ${updateCommand} to update`
        };
    }

    if (normalizedProjectRoot && realPath.startsWith(`${normalizedProjectRoot}/node_modules`)) {
        let pm = PackageManager.NPM;
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
            pm = PackageManager.YARN;
        } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
            pm = PackageManager.PNPM;
        } else if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
            pm = PackageManager.BUN;
        }
        return {
            packageManager: pm, isGlobal: false,
            updateMessage: "Locally installed. Please update via your project's package.json."
        };
    }

    return undefined;
}

function detectHomebrew(realPath: string): InstallationInfo | undefined {
    if (process.platform !== 'darwin') return undefined;
    try {
        const brewPrefix = childProcess
            .execSync('brew --prefix gemini-cli', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
            .trim();
        const brewRealPath = fs.realpathSync(brewPrefix);
        if (realPath.startsWith(brewRealPath)) {
            return {
                packageManager: PackageManager.HOMEBREW, isGlobal: true,
                updateMessage: 'Installed via Homebrew. Please update with "brew upgrade gemini-cli".'
            };
        }
    } catch {
        // Brew is not installed or gemini-cli is not installed via brew.
    }
    return undefined;
}

export function getInstallationInfo(
    projectRoot: string,
    isAutoUpdateEnabled: boolean
): InstallationInfo {
    const cliPath = process.argv[1];
    if (!cliPath) {
        return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
    }

    try {
        if (process.env['IS_BINARY'] === 'true') {
            return {
                packageManager: PackageManager.BINARY, isGlobal: true,
                updateMessage: 'Running as a standalone binary. Please update by downloading the latest version from GitHub.'
            };
        }

        const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');
        const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');

        const detected = detectFromRealPath(realPath, normalizedProjectRoot, projectRoot, isAutoUpdateEnabled);
        if (detected) return detected;

        const updateCommand = 'npm install -g @google/gemini-cli@latest';
        return {
            packageManager: PackageManager.NPM, isGlobal: true, updateCommand,
            updateMessage: isAutoUpdateEnabled
                ? 'Installed with npm. Attempting to automatically update now...'
                : `Please run ${updateCommand} to update`
        };
    } catch (error) {
        debugLogger.log(error);
        return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
    }
}
