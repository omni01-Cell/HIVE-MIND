// services/learning/LearningEngine.ts
import { providerRouter } from '../../providers/index.js';
import { factsMemory } from '../memory.js';
import { workingMemory } from '../workingMemory.js';

export const learningEngine = {
  async extractInsights(chatId: string): Promise<void> {
    console.log(`[MAPLE] 🧠 Extraction d'insights pour ${chatId}...`);
    
    // 1. Lire la mémoire de travail (les derniers messages)
    const context = await workingMemory.getContext(chatId, 20);
    if (context.length < 4) return; // Pas assez de matière
    
    const transcript = context.map((m: any) => `${m.role}: ${m.content}`).join('\n');
    
    // 2. Prompt MAPLE strict
    const prompt = `
You are the MAPLE Background Learner. Analyze this conversation and extract structured insights about the user.
Categories:
- [fact]: Static attributes (Role, tech stack, location)
- [pref]: Behavioral preferences (Tone, verbosity, likes/dislikes)
- [goal]: Implicit or explicit long-term goals

Conversation:
${transcript}

Return ONLY a valid JSON array:
[{"type": "fact|pref|goal", "key": "short_name", "value": "detailed insight"}]`;
    
    try {
      const response = await providerRouter.chat([
        { role: 'system', content: 'You are an objective data extractor.' },
        { role: 'user', content: prompt }
      ], { category: 'FAST_CHAT', temperature: 0.1 });
      
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;
      
      const insights = JSON.parse(jsonMatch[0]);
      
      // 3. Sauvegarder dans la DB avec la taxonomie MAPLE
      for (const insight of insights) {
        if (!insight.type || !insight.key || !insight.value) continue;
        const factKey = `${insight.type.toLowerCase()}:${insight.key.toLowerCase().replace(/\s+/g, '_')}`;
        await factsMemory.remember(chatId, factKey, insight.value);
        console.log(`[MAPLE] ✨ Appris : ${factKey} = ${insight.value}`);
      }
    } catch (e: any) {
      console.error('[MAPLE] Erreur extraction:', e.message);
    }
  }
};
