import { journalGenerator } from './journal_generator.js';

export default {
    name: 'daily_pulse',
    description: 'Génère un journal audio (Daily Pulse) résumant l\'activité du groupe.',
    version: '1.1.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'generate_daily_pulse',
                description: 'Génère un résumé audio narratif (Podcast/Journal) de l\'activité récente du groupe. À utiliser quand l\'utilisateur demande : "Quoi de neuf ?", "Résumé de la journée ?", "Lance le Daily Pulse", ou "Fais le journal".',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        }
    ],

    async execute(args, context, toolName) {
        const { chatId, transport } = context;

        if (toolName === 'generate_daily_pulse') {
            await transport.sendText(chatId, `🎙️ **The Daily Pulse**\nAnalyse des logs en cours... Réglage des micros...`);

            try {
                // 1. Générer le script
                const script = await journalGenerator.generateDailyScript(chatId);

                if (!script) {
                    return { success: false, message: "Pas assez d'activité pour un Daily Pulse aujourd'hui. 😴" };
                }

                // 2. Production Audio via Gemini Live
                console.log('[DailyPulse] 🎙️ Production audio en cours...');
                const audioPath = await journalGenerator.produceAudio(script);

                if (audioPath) {
                    // 3. Envoyer comme note vocale PTT
                    await transport.sendVoiceNote(chatId, audioPath, {
                        caption: '📻 The Daily Pulse'
                    });

                    console.log('[DailyPulse] ✅ Audio envoyé avec succès');
                    return { success: true, message: "Daily Pulse audio envoyé ! 🎙️" };
                } else {
                    // Fallback: envoyer le script en texte si audio échoue
                    console.warn('[DailyPulse] ⚠️ Audio failed, fallback to text');
                    await transport.sendText(chatId, `📻 **Script Radio du Jour :**\n\n${script}\n\n*(Audio non disponible cette fois)*`);
                    return { success: true, message: "Daily Pulse généré (Mode Texte - Audio indisponible)" };
                }

            } catch (error) {
                console.error('[DailyPulse] Error:', error);
                return { success: false, message: "Erreur lors de la production du Daily Pulse." };
            }
        }
        return { success: false, message: "Outil inconnu" };
    }
};
