import { permissionManager } from '../../../core/security/PermissionManager.js';
import { persistentShell } from './PersistentShell.js';
import * as path from 'path';

const MAX_OUTPUT_LENGTH = 30000;

export default {
    name: 'dev_tools_bash',
    description: 'Execution of persistent bash commands (CWD and Env preserved).',
    version: '2.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'execute_bash_command',
                description: 'Executes a bash command on the local machine in a persistent shell.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: 'The bash command to execute.'
                        }
                    },
                    required: ['command']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'execute_bash_command') return null;

        const { command } = args;
        const { chatId, sourceChannel } = context;

        // 1. Security Validation (Sandbox)
        // Note: PersistentShell tracks its own CWD, but we verify the command integrity.
        const validation = permissionManager.validateBashCommand(command, persistentShell.getCwd());

        if (!validation.result && !validation.requiresPermission) {
            return {
                success: false,
                message: `[SECURITY BLOCK] Forbidden command: ${validation.reason}`
            };
        }

        if (validation.requiresPermission) {
            const permResult = await permissionManager.askPermission(
                chatId, 
                `Execute Bash (Non-Sandboxed): ${command}`, 
                sourceChannel,
                context.message?.sender || 'system'
            );

            if (!permResult.granted) {
                // Active HITL: if the user provided corrective feedback
                if (permResult.feedback) {
                    return {
                        success: false,
                        message: `[ACTION REJECTED] The user REJECTED this action and provided this corrective instruction: "${permResult.feedback}". Modify your parameters and try again.`
                    };
                }
                return {
                    success: false,
                    message: '[ACTION REJECTED] The user refused the execution of this command.'
                };
            }
        }

        // 2. Exécution dans le shell persistant
        try {
            console.log(`[BashTool] 🐚 Executing: ${command}`);

            // [ASYNC RENDERING] Notify execution start
            if (context.onProgress) context.onProgress(`Executing: ${command}`);

            const { stdout, exitCode } = await persistentShell.execute(command);

            // [ASYNC RENDERING] Notify execution end
            if (context.onProgress) context.onProgress(`Finished (Code: ${exitCode})`);

            // [CLAUDE CODE PATTERN] Head & Tail truncation
            let finalOutput = stdout;
            if (stdout.length > MAX_OUTPUT_LENGTH) {
                const head = stdout.substring(0, MAX_OUTPUT_LENGTH / 2);
                const tail = stdout.substring(stdout.length - MAX_OUTPUT_LENGTH / 2);
                finalOutput = `${head}\n\n... [${stdout.length - MAX_OUTPUT_LENGTH} characters truncated] ...\n\n${tail}`;
            }

            const isSuccess = exitCode === 0;

            return {
                success: isSuccess,
                // What the LLM will read (complete but truncated logs)
                llmOutput: {
                    stdout: finalOutput || (isSuccess ? 'No output (success)' : 'No output (error)'),
                    exitCode: exitCode
                },
                // What the WhatsApp / CLI user will see instantly
                userOutput: `🐚 *Bash Execution*:\n\`\`\`bash\n${command}\n\`\`\`\nStatus: ${isSuccess ? '✅ Success' : '❌ Failed (Code '+exitCode+')'}`
            };

        } catch (error: any) {
            return {
                success: false,
                llmOutput: `Fatal execution error: ${error.message}`,
                userOutput: `❌ *Bash Error* during execution of \`${command}\`\n_${error.message}_`
            };
        }
    }
};
