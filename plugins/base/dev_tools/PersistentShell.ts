// plugins/dev_tools/PersistentShell.ts
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages a persistent Shell process (bash) to maintain state (CWD, Env vars).
 * Inspired by the Claude Code pattern (PersistentShell.ts).
 */
class PersistentShell extends EventEmitter {
    private shell: ChildProcessWithoutNullStreams | null = null;
    private outputBuffer: string = '';
    private currentCwd: string = process.env.SANDBOX_DIR 
        ? path.resolve(process.env.SANDBOX_DIR) 
        : path.resolve(process.cwd(), 'Sandbox1');
    private sentinel: string = '__HIVE_MIND_SHELL_DONE__';
    private isExecuting: boolean = false;
    private executionPromise: { resolve: (val: any) => void, reject: (err: any) => void } | null = null;

    constructor() {
        super();
        if (!fs.existsSync(this.currentCwd)) {
            fs.mkdirSync(this.currentCwd, { recursive: true });
        }
        this._initShell();
    }

    private _initShell() {
        this.shell = spawn('/bin/bash', ['-i'], {
            env: { ...process.env, PS1: '' },
            cwd: this.currentCwd,
            shell: false
        });

        this.shell.stdout.on('data', (data) => {
            const chunk = data.toString();
            this.outputBuffer += chunk;
            this._checkSentinel();
        });

        this.shell.stderr.on('data', (data) => {
            const chunk = data.toString();
            this.outputBuffer += chunk;
            this._checkSentinel();
        });

        this.shell.on('exit', (code) => {
            console.log(`[PersistentShell] Shell exited with code ${code}. Restarting...`);
            this._initShell();
        });
    }

    private _checkSentinel() {
        if (!this.isExecuting || !this.executionPromise) return;

        if (this.outputBuffer.includes(this.sentinel)) {
            const parts = this.outputBuffer.split(this.sentinel);
            const output = parts[0].trim();
            const remainder = parts[1] || '';
            
            // Extract exit code and pwd (format: __SENTINEL__127|/path/to/cwd)
            const exitCodeMatch = remainder.match(/^(\d+)\|(.+)/);
            const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : 0;
            const newCwd = exitCodeMatch ? exitCodeMatch[2].trim() : this.currentCwd;
            this.currentCwd = newCwd;
            
            // Clean buffer for next execution
            this.outputBuffer = '';
            this.isExecuting = false;
            
            this.executionPromise.resolve({
                stdout: output,
                exitCode: exitCode
            });
            
            this.executionPromise = null;
        }
    }

    /**
     * Returns the current working directory of the shell
     */
    getCwd(): string {
        return this.currentCwd;
    }

    /**
     * Executes a command in the persistent shell
     */
    async execute(command: string, timeoutMs: number = 30000): Promise<{ stdout: string, exitCode: number }> {
        if (this.isExecuting) {
            throw new Error('The shell is already executing a command.');
        }

        this.isExecuting = true;
        this.outputBuffer = '';

        return new Promise((resolve, reject) => {
            this.executionPromise = { resolve, reject };

            // Security timeout
            const timeout = setTimeout(() => {
                if (this.isExecuting) {
                    this.isExecuting = false;
                    this.executionPromise = null;
                    reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
                }
            }, timeoutMs);

            // Inject command + sentinel echo with exit code and pwd
            // We use ';' to ensure echo runs even if the command fails
            const fullCommand = `${command}\necho "${this.sentinel}$?|$(pwd)"\n`;
            this.shell?.stdin.write(fullCommand);
        });
    }

    /**
     * Terminates the shell
     */
    shutdown() {
        this.shell?.kill();
        this.shell = null;
    }
}

export const persistentShell = new PersistentShell();
export default persistentShell;
