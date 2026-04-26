import { permissionManager } from '../../../core/security/PermissionManager.js';
import { persistentShell } from './PersistentShell.js';
import * as path from 'path';

const MAX_OUTPUT_LENGTH = 30000;

export default {
    name: 'dev_tools_bash',
    description: 'Exécution de commandes bash persistantes (CWD et Env conservés).',
    version: '2.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'execute_bash_command',
                description: 'Exécute une commande bash sur la machine locale dans un shell persistant.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: 'La commande bash à exécuter.'
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

        // 1. Validation de sécurité (Sandbox)
        // Note: Le PersistentShell suit son propre CWD, mais on vérifie la commande
        const validation = permissionManager.validateBashCommand(command);

        if (!validation.result && !validation.requiresPermission) {
            return {
                success: false,
                message: `[SECURITY BLOCK] Commande interdite : ${validation.reason}`
            };
        }

        if (validation.requiresPermission) {
            const permResult = await permissionManager.askPermission(
                chatId, 
                `Exécuter Bash (Hors Sandbox) : ${command}`, 
                sourceChannel,
                context.message?.sender || 'system'
            );

            if (!permResult.granted) {
                // HITL Actif : si l'utilisateur a fourni un feedback correctif
                if (permResult.feedback) {
                    return {
                        success: false,
                        message: `[ACTION REJECTED] L'utilisateur a REFUSÉ cette action et a fourni cette instruction corrective : "${permResult.feedback}". Modifie tes paramètres et réessaie.`
                    };
                }
                return {
                    success: false,
                    message: '[ACTION REJECTED] L\'utilisateur a refusé l\'exécution de cette commande.'
                };
            }
        }

        // 2. Exécution dans le shell persistant
        try {
            console.log(`[BashTool] 🐚 Exécution : ${command}`);

            // [ASYNC RENDERING] Notifier le début d'exécution
            if (context.onProgress) context.onProgress(`Exécution de : ${command}`);

            const { stdout, exitCode } = await persistentShell.execute(command);

            // [ASYNC RENDERING] Notifier la fin d'exécution
            if (context.onProgress) context.onProgress(`Terminé (Code: ${exitCode})`);

            // [CLAUDE CODE PATTERN] Troncature Head & Tail
            let finalOutput = stdout;
            if (stdout.length > MAX_OUTPUT_LENGTH) {
                const head = stdout.substring(0, MAX_OUTPUT_LENGTH / 2);
                const tail = stdout.substring(stdout.length - MAX_OUTPUT_LENGTH / 2);
                finalOutput = `${head}\n\n... [${stdout.length - MAX_OUTPUT_LENGTH} caractères tronqués] ...\n\n${tail}`;
            }

            const isSuccess = exitCode === 0;

            return {
                success: isSuccess,
                // Ce que le LLM va lire (logs complets mais tronqués)
                llmOutput: {
                    stdout: finalOutput || (isSuccess ? 'Aucune sortie (success)' : 'Aucune sortie (erreur)'),
                    exitCode: exitCode
                },
                // Ce que l'utilisateur WhatsApp / CLI va voir instantanément
                userOutput: `🐚 *Exécution Bash* :\n\`\`\`bash\n${command}\n\`\`\`\nStatut: ${isSuccess ? '✅ Succès' : '❌ Échec (Code '+exitCode+')'}`
            };

        } catch (error: any) {
            return {
                success: false,
                llmOutput: `Erreur d'exécution fatale : ${error.message}`,
                userOutput: `❌ *Erreur Bash* lors de l'exécution de \`${command}\`\n_${error.message}_`
            };
        }
    }
};
