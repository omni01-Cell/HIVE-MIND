import { DeepResearchAgent } from './research_agent.js';
import { container } from '../../core/container.js';

export default {
    name: 'deep_research',
    description: 'Module de recherche approfondie autonome (Kimi Style) avec génération de rapport PDF.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'start_deep_search',
                description: 'Lance une investigation approfondie sur un sujet complexe. À utiliser QUAND l\'utilisateur demande un "rapport", une "analyse complète", ou "cherche en profondeur". Durée estimée : 2-3 minutes.',
                parameters: {
                    type: 'object',
                    properties: {
                        topic: {
                            type: 'string',
                            description: 'Le sujet précis de la recherche. Doit être le plus explicite possible.'
                        }
                    },
                    required: ['topic']
                }
            }
        }
    ],

    async execute(args, context, toolName) {
        const { chatId, sender, transport } = context;

        if (toolName === 'start_deep_search') {
            const { topic } = args;

            // 1. Notification initiale
            await transport.sendText(chatId, `🕵️‍♂️ **Mission acceptée :** Recherche approfondie sur "${topic}".\n\nAttache ta ceinture, je déploie l'agent Kimi... (Durée : ~2min)`);
            await transport.setPresence(chatId, 'composing');

            try {
                // 2. Lancement de l'Agent Autonome
                const agent = new DeepResearchAgent(sender, chatId);
                const reportMarkdown = await agent.start(topic);

                 // 3. Génération du PDF via visual_reporter
                 // On récupère le plugin visual_reporter dynamiquement
                 const { pluginLoader } = await import('../loader.js');
                 const visualReporter = pluginLoader.get('visual_reporter');

                if (visualReporter) {
                    await transport.sendText(chatId, `📝 **Analyse terminée.** Génération du PDF en cours...`);

                    // On appelle directement la méthode interne du plugin ou via execute
                    // Pour simplifier, on simule un appel outil generate_pdf_report
                    const pdfResult = await visualReporter.execute('generate_pdf_report', {
                        title: `Rapport : ${topic}`,
                        content: reportMarkdown
                    }, context);

                    if (pdfResult.success) {
                        return { success: true, message: `[DeepSearch] Rapport PDF généré et envoyé avec succès.` };
                    } else {
                        // Fallback : envoi du texte brut si PDF échoue
                        return { success: true, message: reportMarkdown };
                    }
                } else {
                    // Fallback texte brut si visual_reporter absent
                    return { success: true, message: reportMarkdown };
                }

            } catch (error) {
                console.error('[DeepResearch] Fatal Error:', error);
                return { success: false, message: "Échec de la recherche approfondie. Voir logs." };
            }
        }

        return { success: false, message: "Outil inconnu" };
    }
};
