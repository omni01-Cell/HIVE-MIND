// services/learning/LearningEngine.ts
import { providerRouter } from '../../providers/index.js';
import { factsMemory } from '../memory.js';
import { workingMemory } from '../workingMemory.js';
import { tryParseJson } from '../../utils/ResponseFormatEnforcer.js';

interface ExtractedInsight {
    readonly type: string;
    readonly key: string;
    readonly value: string;
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}

export const learningEngine = {
    async extractInsights(chatId: string): Promise<void> {
        console.log(`[MAPLE] 🧠 Extraction d'insights pour ${chatId}...`);

        // 1. Lire la mémoire de travail (les derniers messages)
        const context = await workingMemory.getContext(chatId, 20);
        if (context.length < 4) return; // Pas assez de matière

        const transcript = context.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n');

        // 2. Prompt MAPLE strict
        const prompt = `
You are the MAPLE Background Learner. Analyze this conversation and extract structured insights about the user.
Categories:
- [fact]: Static attributes (Role, tech stack, location)
- [pref]: Behavioral preferences (Tone, verbosity, likes/dislikes)
- [goal]: Implicit or explicit long-term goals

Conversation:
${transcript}

<output_format>
Return ONLY a valid JSON array matching this schema:
[{"type": "fact|pref|goal", "key": "short_name", "value": "detailed insight"}]

Few-shot examples:
[
  {"type": "fact", "key": "preferred_language", "value": "TypeScript"},
  {"type": "pref", "key": "tone_preference", "value": "Prefers detailed technical explanations with code snippets"},
  {"type": "goal", "key": "current_project", "value": "Deploying HIVE-MIND on Railway infrastructure"}
]
</output_format>`;

        try {
            const response = await providerRouter.chat([
                { role: 'system', content: 'You are an objective data extractor. Output JSON only.' },
                { role: 'user', content: prompt }
            ], { category: 'FAST_CHAT', temperature: 0.1 });

            if (!response?.content) return;

            let insights: ExtractedInsight[] = [];
            try {
                insights = tryParseJson<ExtractedInsight[]>(response.content);
            } catch {
                // Fallback avec expression régulière en cas de bruit autour
                const jsonMatch = response.content.match(/\[[\s\S]*\]/);
                if (!jsonMatch) return;
                insights = tryParseJson<ExtractedInsight[]>(jsonMatch[0]);
            }

            // 3. Sauvegarder dans la DB avec la taxonomie MAPLE
            for (const insight of insights) {
                if (!insight.type || !insight.key || !insight.value) continue;
                const factKey = `${insight.type.toLowerCase()}:${insight.key.toLowerCase().replace(/\s+/g, '_')}`;
                await factsMemory.remember(chatId, factKey, insight.value);
                console.log(`[MAPLE] ✨ Appris : ${factKey} = ${insight.value}`);
            }
        } catch (error: unknown) {
            console.error('[MAPLE] Erreur extraction:', extractErrorMessage(error));
        }
    }
};
