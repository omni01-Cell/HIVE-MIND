// plugins/dev_tools/index.ts
// ============================================================================
// Aggregateur unifié des Dev Tools (BashTool + FileEditTool + SearchTools)
// Ce fichier est le seul point d'entrée chargé par PluginLoader (index.js).
// Il aggège les définitions et délègue l'exécution aux sous-modules.
// ============================================================================

import BashTool from './BashTool.js';
import FileEditTool from './FileEditTool.js';
import SearchTools from './SearchTools.js';
import ASTTools from './ASTTools.js';
import SystemScratchpadTool from './SystemScratchpadTool.js';
import SpawnSubAgentTool from './SpawnSubAgentTool.js';
import BrowserTools from './BrowserTools.js';

// ──────────────────────────────────────────────────────────────────────────────
// MATCHERS TEXTUELS — Commandes admin rapides (sans LLM)
// ──────────────────────────────────────────────────────────────────────────────
const TEXT_MATCHERS = [
    {
        pattern: /^\.shutdown$/i,
        handler: 'shutdown_bot',
        description: 'Arrête le processus du bot',
        extractArgs: () => ({})
    },
    {
        pattern: /^\.devcontact$/i,
        handler: 'send_dev_contact',
        description: 'Envoie la fiche contact du développeur',
        extractArgs: () => ({})
    }
];

// ──────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS — Agrégées depuis les sous-modules
// Exposées ici pour que PluginLoader les enregistre et les rende visibles au LLM
// ──────────────────────────────────────────────────────────────────────────────
const AGGREGATED_TOOL_DEFINITIONS = [
    ...BashTool.toolDefinitions,
    ...FileEditTool.toolDefinitions,
    ...SearchTools.toolDefinitions,
    ...ASTTools.toolDefinitions,
    ...SystemScratchpadTool.toolDefinitions,
    ...SpawnSubAgentTool.toolDefinitions,
    ...BrowserTools.toolDefinitions,
];

// ──────────────────────────────────────────────────────────────────────────────
// MAP outil → sous-module (routing O(1))
// ──────────────────────────────────────────────────────────────────────────────
const TOOL_ROUTER: Record<string, any> = {};

const tools = [
    BashTool, 
    FileEditTool, 
    SearchTools, 
    ASTTools, 
    SystemScratchpadTool, 
    SpawnSubAgentTool,
    BrowserTools
];

for (const toolModule of tools) {
    for (const toolDef of toolModule.toolDefinitions) {
        const toolName = toolDef.function?.name;
        if (toolName) TOOL_ROUTER[toolName] = toolModule;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPORT — Format Plugin standard attendu par PluginLoader
// ──────────────────────────────────────────────────────────────────────────────
export default {
    name: 'dev_tools',
    description: 'Outils de développement agent : exécution bash sécurisée (sandbox YOLO), édition de fichiers par remplacement exact, lecture/recherche (LS, Grep, ReadFile), et commandes système admin.',
    version: '2.0.0',
    enabled: true,

    // Matchers textuels pour commandes admin rapides
    textMatchers: TEXT_MATCHERS,

    // Définitions d'outils agrégées (visibles par le LLM)
    toolDefinitions: AGGREGATED_TOOL_DEFINITIONS,

    /**
     * Point d'entrée unique pour toutes les exécutions.
     * Délègue vers le bon sous-module selon toolName.
     *
     * @param args       - Arguments parsés du LLM
     * @param context    - Contexte (transport, chatId, sender, sourceChannel…)
     * @param toolName   - Nom de l'outil à exécuter
     */
    async execute(args: any, context: any, toolName: string) {
        // ── Commandes admin textuelles ──────────────────────────────────────
        if (toolName === 'shutdown_bot') {
            console.log('🛑 Arrêt demandé via commande .shutdown');
            const { transport, chatId } = context;
            if (transport) {
                await transport.sendText(chatId, '🛑 Arrêt du système en cours...');
                // setPresence est la méthode standard du TransportManager
                await transport.setPresence(chatId, 'unavailable').catch(() => {});
            }
            setTimeout(() => process.exit(0), 1000);
            return { success: true, message: 'Bot éteint' };
        }

        if (toolName === 'send_dev_contact') {
            const { transport, chatId } = context;
            if (transport) {
                await transport.sendContact(chatId, 'Christ-Léandre', '2250150618253');
                return { success: true, message: 'Contact envoyé' };
            }
            return { success: false, message: 'Transport indisponible' };
        }

        // ── Routing vers sous-module agent ──────────────────────────────────
        const subModule = TOOL_ROUTER[toolName];
        if (!subModule) {
            return {
                success: false,
                message: `[dev_tools] Outil inconnu : "${toolName}". Outils disponibles : ${Object.keys(TOOL_ROUTER).join(', ')}`
            };
        }

        return subModule.execute(args, context, toolName);
    }
};
