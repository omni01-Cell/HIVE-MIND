export default {
    name: 'deep_research',
    description: 'Autonomous deep research module (Kimi Style) with PDF report generation.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'start_deep_search',
                description: 'Launches a deep investigation on a complex topic. Use WHEN the user asks for a "report", "full analysis", or "search in depth". Estimated duration: 2-3 minutes.',
                parameters: {
                    type: 'object',
                    properties: {
                        topic: {
                            type: 'string',
                            description: 'The precise subject of the research. Must be as explicit as possible.'
                        }
                    },
                    required: ['topic']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: any) {
        const { chatId, sender, transport } = context || {};

        if (!transport || !chatId) {
            return { success: false, message: 'Transport or chatId missing from context' };
        }

        if (toolName === 'start_deep_search') {
            const { topic } = args;

            // 1. Initial notification
            await transport.sendText(chatId, `🕵️‍♂️ **Mission accepted:** Deep research on "${topic}".\n\nBuckle up, I'm deploying the Kimi agent... (Duration: ~2min)`);
            await transport.setPresence(chatId, 'composing');

            try {
                // 2. Launch Autonomous Agent via dynamic import
                const { DeepResearchAgent } = await import('./research_agent.js');
                const agent = new DeepResearchAgent(sender, chatId);
                const reportMarkdown = await agent.start(topic);

                 // 3. Génération du PDF via visual_reporter
                 // On récupère le plugin visual_reporter dynamiquement
                 const { pluginLoader } = await import('../../loader.js');
                 const visualReporter = pluginLoader.get('visual_reporter');

                if (visualReporter) {
                    await transport.sendText(chatId, `📝 **Analysis finished.** Generating PDF report...`);

                    // Call the visual_reporter plugin
                    const pdfResult = await visualReporter.execute('generate_pdf_report', {
                        title: `Report: ${topic}`,
                        content: reportMarkdown
                    }, context);

                    if (pdfResult.success) {
                        return { success: true, message: `[DeepSearch] PDF report generated and sent successfully.` };
                    } else {
                        // Fallback: send raw text if PDF fails
                        return { success: true, message: reportMarkdown };
                    }
                } else {
                    // Fallback texte brut si visual_reporter absent
                    return { success: true, message: reportMarkdown };
                }

            } catch (error: any) {
                console.error('[DeepResearch] Fatal Error:', error);
                return { success: false, message: "Deep research failed. Check logs." };
            }
        }

        return { success: false, message: "Unknown tool" };
    }
};

