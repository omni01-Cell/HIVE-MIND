import * as fs from 'fs';
import * as path from 'path';
import { permissionManager } from '../../../core/security/PermissionManager.js';
import { fileState } from './FileState.js';

export default {
    name: 'dev_tools_file_edit',
    description: 'Outil d\'édition de fichiers par remplacement exact.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'edit_file',
                description: 'Modifie un fichier en remplaçant une chaîne exacte (old_string) par une nouvelle (new_string). CRITIQUE : old_string DOIT être unique dans le fichier. Incluez 3 à 5 lignes de contexte avant et après pour garantir l\'unicité. N\'édite qu\'une seule occurrence à la fois.',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: {
                            type: 'string',
                            description: 'Chemin absolu ou relatif du fichier à éditer.'
                        },
                        old_string: {
                            type: 'string',
                            description: 'Le texte EXACT à remplacer, incluant les espaces, l\'indentation et les sauts de ligne. Doit être unique.'
                        },
                        new_string: {
                            type: 'string',
                            description: 'Le nouveau texte qui remplacera old_string.'
                        }
                    },
                    required: ['file_path', 'old_string', 'new_string']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'edit_file') return null;

        const { file_path, old_string, new_string } = args;
        const { chatId, sourceChannel } = context;
        
        // 1. Déterminer le chemin absolu
        const absolutePath = path.isAbsolute(file_path) ? file_path : path.resolve(permissionManager.sandboxDir, file_path);

        // 2. Validation de sécurité (Sandbox)
        const validation = permissionManager.validateFileWrite(absolutePath);

        if (validation.requiresPermission) {
            const permResult = await permissionManager.askPermission(
                chatId, 
                `Éditer un fichier (Hors Sandbox) : ${absolutePath}`, 
                sourceChannel,
                context.message?.sender || 'system'
            );

            if (!permResult.granted) {
                if (permResult.feedback) {
                    return {
                        success: false,
                        message: `[ACTION REJECTED] L'utilisateur a REFUSÉ cette action et a fourni cette instruction corrective : "${permResult.feedback}". Modifie tes paramètres et réessaie.`
                    };
                }
                return {
                    success: false,
                    message: '[ACTION REJECTED] Permission refusée d\'écrire hors de la sandbox.'
                };
            }
        }

        // 3. Lecture et remplacement
        try {
            if (!fs.existsSync(absolutePath)) {
                return { success: false, message: `Erreur: Le fichier ${absolutePath} n'existe pas.` };
            }

            // [CLAUDE CODE PATTERN] Vérifier si le fichier a été modifié depuis la lecture
            const { changed, current, lastRead } = fileState.hasChanged(absolutePath);
            if (changed) {
                return { 
                    success: false, 
                    message: `ERREUR_SECURITE : Le fichier ${file_path} a été modifié sur le disque depuis que tu l'as lu (Dernière lecture: ${new Date(lastRead!).toLocaleTimeString()}, Actuel: ${new Date(current!).toLocaleTimeString()}). Relis le fichier avec read_file avant d'appliquer tes changements pour éviter d'écraser le travail de l'utilisateur.`
                };
            }

            const content = fs.readFileSync(absolutePath, 'utf8');

            // Vérifier l'unicité
            const occurrences = content.split(old_string).length - 1;

            if (occurrences === 0) {
                return { 
                    success: false, 
                    message: `Erreur: 'old_string' n'a pas été trouvée exactement dans le fichier. Vérifiez les espaces et l'indentation.` 
                };
            }

            if (occurrences > 1) {
                return { 
                    success: false, 
                    message: `Erreur: Trouvé ${occurrences} correspondances pour 'old_string'. Modifiez votre 'old_string' pour inclure plus de lignes de contexte afin qu'elle soit unique.` 
                };
            }

            // Remplacement
            const newContent = content.replace(old_string, new_string);
            fs.writeFileSync(absolutePath, newContent, 'utf8');
            
            // [CLAUDE CODE PATTERN] Mettre à jour le timestamp après écriture réussie
            fileState.recordRead(absolutePath);

            // Extraire un snippet pour montrer le changement (pour la mémoire du LLM)
            // On prend 3 lignes avant et 3 lignes après le changement environ
            const lines = newContent.split('\n');
            const newStringLinesCount = new_string.split('\n').length;
            // Retrouver la ligne approximative (basique)
            const index = newContent.indexOf(new_string);
            const lineNum = newContent.substring(0, index).split('\n').length;
            
            const startLine = Math.max(0, lineNum - 3);
            const endLine = Math.min(lines.length, lineNum + newStringLinesCount + 2);
            
            let snippet = '';
            for (let i = startLine; i < endLine; i++) {
                snippet += `${i + 1}: ${lines[i]}\n`;
            }

            // Format dynamique du nom de fichier pour l'UI
            const shortFileName = file_path.split('/').pop();

            return {
                success: true,
                // Pour l'IA : Le snippet exact avec les numéros de ligne pour vérification
                llmOutput: `SUCCESS: File updated. Context around changes:\n${snippet}`,
                // Pour l'Humain : Un visuel propre du patch
                userOutput: `📝 *Fichier modifié* : \`${shortFileName}\`\n~ Remplacement effectué avec succès ~`
            };

        } catch (error: any) {
            return {
                success: false,
                message: `Erreur lors de l'édition du fichier : ${error.message}`
            };
        }
    }
};
