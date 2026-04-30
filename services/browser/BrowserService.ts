import { execFile } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BrowserResult, SnapshotResult, ScreenshotResult, BrowserExecOptions } from './types.js';

const execFileAsync = promisify(execFile);

export class BrowserService {
    private static instance: BrowserService;
    private readonly binaryName = 'agent-browser';
    private readonly defaultTimeout = 25000; // 25s
    private screenshotDir: string;
    private allowedDomains: string[] | undefined;

    private constructor() {
        // Initialize screenshot directory
        const storageDir = process.env.STORAGE_DIR || join(process.cwd(), 'storage_hm');
        this.screenshotDir = process.env.AGENT_BROWSER_SCREENSHOT_DIR || join(storageDir, 'screenshots');
        
        if (!existsSync(this.screenshotDir)) {
            mkdirSync(this.screenshotDir, { recursive: true });
        }

        // Initialize allowed domains
        const domains = process.env.AGENT_BROWSER_ALLOWED_DOMAINS;
        if (domains) {
            this.allowedDomains = domains.split(',').map(d => d.trim());
        }
    }

    public static getInstance(): BrowserService {
        if (!BrowserService.instance) {
            BrowserService.instance = new BrowserService();
        }
        return BrowserService.instance;
    }

    /**
     * Core execution wrapper for agent-browser CLI
     */
    private async exec(args: string[], options: BrowserExecOptions = {}): Promise<BrowserResult> {
        const cmdArgs = [...args, '--json'];
        
        if (options.session) {
            cmdArgs.push('--session', options.session);
        }

        const timeout = options.timeout || this.defaultTimeout;

        const env: NodeJS.ProcessEnv = { ...process.env, AGENT_BROWSER_IDLE_TIMEOUT_MS: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || '300000' };
        
        // Ensure we find agent-browser if installed globally via NVM/npm
        const nodeBinDir = dirname(process.execPath);
        if (env.PATH && !env.PATH.includes(nodeBinDir)) {
            env.PATH = `${nodeBinDir}:${env.PATH}`;
        }

        try {
            // the binaryName is just 'agent-browser', we assume it's in PATH now since `npm start` usually inherits it
            // --json is a global flag, agent-browser parses it anywhere, so pushing it at the end is fine.
            const { stdout, stderr } = await execFileAsync(this.binaryName, cmdArgs, {
                timeout,
                env
            });

            if (stderr && !stdout) {
                return { success: false, error: stderr.trim() };
            }

            try {
                const parsed = JSON.parse(stdout);
                // agent-browser returns { success: boolean, data: any, error: any }
                if (parsed.success === false) {
                    return { success: false, error: parsed.error || 'Unknown CLI error', data: parsed.data };
                }
                return { success: true, data: parsed.data };
            } catch (e) {
                // If it's not JSON, return as raw string if success
                return { success: true, data: stdout.trim() };
            }
        } catch (error: any) {
            let errorMessage = error.message;
            if (error.stdout) {
                try {
                    const parsed = JSON.parse(error.stdout);
                    return { success: false, error: parsed.error || error.message, data: parsed.data };
                } catch (e) {
                    errorMessage = error.stdout.trim();
                }
            }
            return { success: false, error: errorMessage };
        }
    }

    public async open(url: string, session?: string): Promise<BrowserResult> {
        // Domain check
        if (this.allowedDomains && this.allowedDomains.length > 0) {
            const domain = new URL(url).hostname;
            if (!this.allowedDomains.some(allowed => domain.endsWith(allowed))) {
                return { success: false, error: `Domain ${domain} is not allowed.` };
            }
        }

        return this.exec(['open', url], { session });
    }

    public async snapshot(session?: string, interactiveOnly = true): Promise<SnapshotResult> {
        const args = ['snapshot'];
        if (interactiveOnly) {
            args.push('--interactive');
        }
        
        const result = await this.exec(args, { session });
        if (!result.success) return result as SnapshotResult;

        return {
            success: true,
            snapshot: result.data?.snapshot || '',
            refs: result.data?.refs || {}
        };
    }

    public async click(selector: string, session?: string): Promise<BrowserResult> {
        return this.exec(['click', selector], { session });
    }

    public async fill(selector: string, value: string, session?: string): Promise<BrowserResult> {
        return this.exec(['fill', selector, value], { session });
    }

    public async type(selector: string, text: string, session?: string): Promise<BrowserResult> {
        return this.exec(['type', selector, text], { session });
    }

    public async screenshot(session?: string, name?: string): Promise<ScreenshotResult> {
        const fileName = name || `screenshot-${Date.now()}.png`;
        const filePath = join(this.screenshotDir, fileName);
        
        const result = await this.exec(['screenshot', filePath], { session });
        if (!result.success) return result as ScreenshotResult;

        return {
            success: true,
            filePath,
            annotatedRefs: result.data.annotatedRefs
        };
    }

    public async getText(selector: string, session?: string): Promise<BrowserResult> {
        return this.exec(['get', 'text', selector], { session });
    }

    public async evaluate(js: string, session?: string): Promise<BrowserResult> {
        return this.exec(['eval', js], { session });
    }

    public async scroll(direction: 'up' | 'down' | 'left' | 'right', pixels?: number, session?: string): Promise<BrowserResult> {
        const args = ['scroll', direction];
        if (pixels) args.push(pixels.toString());
        return this.exec(args, { session });
    }

    public async wait(options: { selector?: string, text?: string, url?: string, timeout?: number }, session?: string): Promise<BrowserResult> {
        const args = ['wait'];
        if (options.selector) {
            args.push(options.selector);
        } else if (options.text) {
            args.push('--text', options.text);
        } else if (options.url) {
            args.push('--url', options.url);
        } else if (options.timeout) {
            args.push(options.timeout.toString());
        }
        
        return this.exec(args, { session });
    }

    public async press(key: string, session?: string): Promise<BrowserResult> {
        return this.exec(['press', key], { session });
    }

    public async back(session?: string): Promise<BrowserResult> {
        return this.exec(['back'], { session });
    }

    public async close(session?: string): Promise<BrowserResult> {
        return this.exec(['close'], { session });
    }

    public async batch(commands: string[][], session?: string): Promise<BrowserResult> {
        // agent-browser batch "open https://..." "click @e1"
        const flattened = commands.map(cmd => cmd.join(' '));
        return this.exec(['batch', ...flattened], { session, timeout: 120000 }); // 2min for batch
    }

    public async isAvailable(): Promise<boolean> {
        try {
            const { stdout } = await execFileAsync(this.binaryName, ['doctor', '--quick', '--offline', '--json']);
            const data = JSON.parse(stdout);
            return data.success === true;
        } catch (e) {
            return false;
        }
    }

    public getSessionName(chatId: string): string {
        // Sanitize chatId for session name
        return `hm-${chatId.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20)}`;
    }
}

export const browserService = BrowserService.getInstance();
export default browserService;
