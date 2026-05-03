/**
 * services/ai/classifier.ts
 * Smart Router Classification Service (Level 3)
 * Helps the router select the best expert model family.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ModelsConfig } from '../../config/config.schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface IClassifierRouter {
  callServiceRecipe(recipeName: string, messages: { role: string; content: string }[]): Promise<{ content: string }>;
}

export class ClassifierService {
  private config: ModelsConfig | null = null;

  constructor() {
    this._loadConfig();
  }

  /**
   * Loads the model configuration to access descriptions and categories.
   */
  private _loadConfig(): void {
    try {
      const configPath = join(__dirname, '..', '..', 'config', 'models_config.json');
      this.config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (e: any) {
      console.warn('[Classifier] Error loading config:', e.message);
    }
  }

  /**
   * Detects the Level 3 category for chat classification.
   * @param query The user's request.
   * @param router Instance of a compatible router.
   * @returns Detected category ID.
   */
  async detectCategory(query: string, router: IClassifierRouter): Promise<string> {
    const categories = this.config?.reglages_generaux?.chat_recipes?.categories;

    if (!categories) {
      console.warn('[Classifier] No chat categories configured, falling back to FAST_CHAT');
      return 'FAST_CHAT';
    }

    const categoriesInfo = Object.entries(categories)
      .map(([id, cat]: [string, any]) => `- ${id}: ${cat.description}`)
      .join('\n');

    const prompt = `<task>
You are the Classification Expert for HIVE-MIND, an AI bot routing system.
Your classification is CRITICAL: it determines which specialized model handles the request, directly impacting response quality and speed.
</task>

<context>
HIVE-MIND uses a multi-model architecture where different AI models specialize in different tasks (coding, reasoning, vision, etc.).
Your job: route each user query to the optimal category so the right expert model is selected.
</context>

<available_categories>
${categoriesInfo}
</available_categories>

<user_query>
"${query}"
</user_query>

<decision_criteria>
Classify based on primary intent:
- Code, algorithms, debugging → CODING
- Math, logic, deep reasoning → REASONING
- Greetings, simple questions → FAST_CHAT
- Image/photo analysis → VISION
- Audio, voice, transcription → MULTIMODAL
- Multi-step planning tasks → AGENTIC
- Creative writing, stories → CREATIVITY

If uncertain, default to FAST_CHAT for simple queries or REASONING for complex ones.
</decision_criteria>

<output_format>
Respond with the category ID in UPPERCASE only.
Maximum length: 1 word.
Format: CATEGORY_NAME
Example: CODING
</output_format>

Category:`;

    try {
      const response = await router.callServiceRecipe('CLASSIFIER', [
        { role: 'user', content: prompt }
      ]);

      let text = response.content || '';
      
      // Nettoyage des balises <think> ou <THINK> si présentes (modèles type DeepSeek-R1)
      text = text.replace(/<(think|THINK)>[\s\S]*?<\/(think|THINK)>/g, '').trim();
      
      // Si le texte contient encore du blabla, on essaie de prendre le dernier mot en majuscule
      // qui correspondrait à une catégorie valide
      const words = text.split(/\s+/);
      let category = '';
      
      // On cherche dans les mots du message si l'un correspond à une catégorie
      for (let i = words.length - 1; i >= 0; i--) {
        const candidate = words[i].toUpperCase().replace(/[^A-Z_]/g, '');
        if (categories[candidate]) {
          category = candidate;
          break;
        }
      }

      if (category && categories[category]) {
        console.log(`[Classifier] 📂 Category detected: ${category}`);
        return category;
      } else {
        console.warn(`[Classifier] Invalid category detected in: "${text.substring(0, 50)}...", falling back to FAST_CHAT`);
        return 'FAST_CHAT';
      }
    } catch (error: any) {
      console.error('[Classifier] Error detecting category:', error.message);
      return 'FAST_CHAT';
    }
  }

  /**
   * Classifies the query to choose the best available model family.
   * @param query The user's request.
   * @param availableFamilies List of available family IDs.
   * @param router Instance of a compatible router.
   * @returns Chosen family ID or null.
   */
  async classify(query: string, availableFamilies: string[], router: IClassifierRouter): Promise<string | null> {
    if (!availableFamilies || availableFamilies.length === 0) return null;
    if (availableFamilies.length === 1) return availableFamilies[0];

    let candidatesInfo = "";
    for (const familyId of availableFamilies) {
      const familyConf = this.config?.familles[familyId];
      if (familyConf) {
        const desc = familyConf.modeles?.[0]?.description || "Standard AI Model";
        candidatesInfo += `- ID: ${familyId} (${familyConf.nom_affiche}) : ${desc}\n`;
      } else {
        candidatesInfo += `- ID: ${familyId} : External model available\n`;
      }
    }

    const prompt = `<task>
You are the Expert Model Router for HIVE-MIND.
Your selection determines which AI family processes this request. Choose wisely: the right match maximizes quality, the wrong one wastes resources.
</task>

<context>
HIVE-MIND has access to multiple AI model families with different strengths.
Your job: match the user's query to the BEST available family based on their capabilities.
</context>

<available_models>
${candidatesInfo}
</available_models>

<user_query>
"${query}"
</user_query>

<selection_criteria>
Match query type to model strength:
- Kimi: Complex code, long context tasks
- Groq models: Fast reasoning, general chat
- Mistral: Code quality, technical tasks
- Gemini: Vision, multimodal, fast responses
- Anthropic: Deep reasoning, analysis

Choose the specialist that best fits the query's primary need.
</selection_criteria>

<output_format>
Respond with ONLY the family ID (lowercase). No explanation.
Example: gemini
</output_format>

Best family ID:`;

    try {
      const response = await router.callServiceRecipe('CLASSIFIER', [
        { role: 'user', content: prompt }
      ]);

      let text = response.content || '';

      // Nettoyage des balises <think> ou <THINK> si présentes
      text = text.replace(/<(think|THINK)>[\s\S]*?<\/(think|THINK)>/g, '').trim();

      // On cherche dans les mots si l'un correspond à une famille disponible
      const words = text.split(/\s+/);
      let family = null;

      for (let i = words.length - 1; i >= 0; i--) {
        const candidate = words[i].toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (availableFamilies.includes(candidate)) {
          family = candidate;
          break;
        }
      }

      if (family) {
        console.log(`[Classifier] 🧠 Expert choice: ${family} for "${query.substring(0, 30)}..."`);
        return family;
      } else {
        console.warn(`[Classifier] Invalid response: "${text.substring(0, 50)}...". Falling back to ${availableFamilies[0]}`);
        return availableFamilies[0];
      }
    } catch (error: any) {
      console.error('[Classifier] Error during classification:', error.message);
      return null;
    }
  }
}

export const classifier = new ClassifierService();
export default classifier;
