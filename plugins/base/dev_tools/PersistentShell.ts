// plugins/dev_tools/PersistentShell.ts
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Gère un processus Shell persistant (bash) pour conserver l'état (CWD, Env vars).
 * Inspiré du pattern Claude Code (PersistentShell.ts).
 */
class PersistentShell extends EventEmitter {
    private shell: ChildProcessWithoutNullStreams | null = null;
    private outputBuffer: string = '';
    private currentCwd: string = process.cwd();
    private sentinel: string = '__HIVE_MIND_SHELL_DONE__';
    private isExecuting: boolean = false;
    private executionPromise: { resolve: (val: any) => void, reject: (err: any) => void } | null = null;

    constructor() {
        super();
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
            
            // Extraire le code de sortie (format: __SENTINEL__127)
            const exitCodeMatch = remainder.match(/^(\d+)/);
            const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : 0;
            
            // Nettoyer le buffer pour la suite
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
     * Exécute une commande dans le shell persistant
     */
    async execute(command: string, timeoutMs: number = 30000): Promise<{ stdout: string, exitCode: number }> {
        if (this.isExecuting) {
            throw new Error('Le shell est déjà en train d\'exécuter une commande.');
        }

        this.isExecuting = true;
        this.outputBuffer = '';

        return new Promise((resolve, reject) => {
            this.executionPromise = { resolve, reject };

            // Timeout de sécurité
            const timeout = setTimeout(() => {
                if (this.isExecuting) {
                    this.isExecuting = false;
                    this.executionPromise = null;
                    reject(new Error(`Commande expirée après ${timeoutMs}ms : ${command}`));
                }
            }, timeoutMs);

            // Injecter la commande + echo du sentinel avec le code de sortie
            // On utilise ';' pour s'assurer que l'echo tourne même si la commande échoue
            const fullCommand = `${command}\necho "${this.sentinel}$?"\n`;
            this.shell?.stdin.write(fullCommand);
        });
    }

    /**
     * Termine le shell
     */
    shutdown() {
        this.shell?.kill();
        this.shell = null;
    }
}

export const persistentShell = new PersistentShell();
export default persistentShell;
