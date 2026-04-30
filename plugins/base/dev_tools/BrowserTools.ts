import { browserService } from '../../../services/browser/BrowserService.js';

const MAX_SNAPSHOT_LENGTH = 50000;

export default {
    name: 'dev_tools_browser',
    description: 'Outils de navigation web SOTA (agent-browser). Permet de naviguer, cliquer, remplir des formulaires et extraire du contenu.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'browser_open',
                description: 'Ouvre une URL dans le navigateur.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'L\'URL à ouvrir.' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_snapshot',
                description: 'Capture l\'arbre d\'accessibilité de la page actuelle avec des références (@e1, @e2...).',
                parameters: {
                    type: 'object',
                    properties: {
                        interactive_only: { type: 'boolean', description: 'Si vrai, ne retourne que les éléments interactifs.', default: true }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_click',
                description: 'Clique sur un élément via sa référence (@eN) ou un sélecteur CSS.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'La référence (@e1) ou le sélecteur CSS.' }
                    },
                    required: ['selector']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_fill',
                description: 'Remplit un champ de formulaire après l\'avoir vidé.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'La référence (@e1) ou le sélecteur CSS.' },
                        value: { type: 'string', description: 'La valeur à saisir.' }
                    },
                    required: ['selector', 'value']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_type',
                description: 'Saisit du texte caractère par caractère (utile pour l\'autocomplétion).',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'La référence (@e1) ou le sélecteur CSS.' },
                        text: { type: 'string', description: 'Le texte à saisir.' }
                    },
                    required: ['selector', 'text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_screenshot',
                description: 'Capture une capture d\'écran de la page actuelle.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Nom optionnel du fichier.' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_get_text',
                description: 'Extrait le texte d\'un élément.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'La référence (@e1) ou le sélecteur CSS.' }
                    },
                    required: ['selector']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_eval',
                description: 'Exécute du JavaScript dans le contexte de la page.',
                parameters: {
                    type: 'object',
                    properties: {
                        javascript: { type: 'string', description: 'Le code JS à exécuter.' }
                    },
                    required: ['javascript']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_scroll',
                description: 'Fait défiler la page.',
                parameters: {
                    type: 'object',
                    properties: {
                        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction du défilement.' },
                        pixels: { type: 'number', description: 'Nombre de pixels à défiler.' }
                    },
                    required: ['direction']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_wait',
                description: 'Attend qu\'un élément, du texte ou un pattern d\'URL apparaisse.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'Sélecteur à attendre.' },
                        text: { type: 'string', description: 'Texte à attendre.' },
                        url: { type: 'string', description: 'URL à attendre.' },
                        timeout: { type: 'number', description: 'Timeout en ms.' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_press',
                description: 'Appuie sur une touche du clavier.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'La touche (Enter, Tab, Escape...).' }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_back',
                description: 'Revient à la page précédente.',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_close',
                description: 'Ferme la session de navigation actuelle.',
                parameters: { type: 'object', properties: {} }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        const { chatId } = context;
        const session = browserService.getSessionName(chatId);

        try {
            if (context.onProgress) context.onProgress(`Browser: ${toolName}...`);

            let result: any;

            switch (toolName) {
                case 'browser_open':
                    result = await browserService.open(args.url, session);
                    break;
                case 'browser_snapshot':
                    result = await browserService.snapshot(session, args.interactive_only ?? true);
                    break;
                case 'browser_click':
                    result = await browserService.click(args.selector, session);
                    break;
                case 'browser_fill':
                    result = await browserService.fill(args.selector, args.value, session);
                    break;
                case 'browser_type':
                    result = await browserService.type(args.selector, args.text, session);
                    break;
                case 'browser_screenshot':
                    result = await browserService.screenshot(session, args.name);
                    break;
                case 'browser_get_text':
                    result = await browserService.getText(args.selector, session);
                    break;
                case 'browser_eval':
                    result = await browserService.evaluate(args.javascript, session);
                    break;
                case 'browser_scroll':
                    result = await browserService.scroll(args.direction, args.pixels, session);
                    break;
                case 'browser_wait':
                    result = await browserService.wait(args, session);
                    break;
                case 'browser_press':
                    result = await browserService.press(args.key, session);
                    break;
                case 'browser_back':
                    result = await browserService.back(session);
                    break;
                case 'browser_close':
                    result = await browserService.close(session);
                    break;
                default:
                    return { success: false, message: `Outil browser inconnu: ${toolName}` };
            }

            if (!result.success) {
                return {
                    success: false,
                    llmOutput: `Erreur Browser (${toolName}): ${result.error}`,
                    userOutput: `❌ *Browser Error* (${toolName}): ${result.error}`
                };
            }

            // Troncature pour Snapshot
            if (toolName === 'browser_snapshot' && result.snapshot && result.snapshot.length > MAX_SNAPSHOT_LENGTH) {
                result.snapshot = result.snapshot.substring(0, MAX_SNAPSHOT_LENGTH) + '\n... [TRUNCATED]';
            }

            // Pour screenshot, on envoie le fichier à l'utilisateur
            if (toolName === 'browser_screenshot' && result.filePath && context.transport) {
                await context.transport.sendMedia(chatId, result.filePath, { caption: 'Capture d\'écran' }, context.sourceChannel);
            }

            return {
                success: true,
                llmOutput: result,
                userOutput: `🌐 *Browser* (${toolName}): ✅ Succès`
            };

        } catch (error: any) {
            return {
                success: false,
                llmOutput: `Erreur Browser fatale (${toolName}): ${error.message}`,
                userOutput: `❌ *Browser Fatal Error* (${toolName}): ${error.message}`
            };
        }
    }
};
