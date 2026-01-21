// services/ai/classifier.js
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Service de Classification "Smart Router" (Niveau 3)
 * Aide le routeur à choisir la meilleure famille d'experts.
 */
class ClassifierService {
    constructor() {
        this.config = null;
        this._loadConfig();
    }

    /**
     * Charge la configuration des modèles pour avoir les descriptions
     */
    _loadConfig() {
        try {
            const configPath = join(__dirname, '..', '..', 'config', 'models_config.json');
            this.config = JSON.parse(readFileSync(configPath, 'utf-8'));
        } catch (e) {
            console.warn('[Classifier] Erreur chargement config:', e.message);
        }
    }

    /**
     * Détecte la catégorie Level 3 pour classification chat
     * @param {string} query - La requête utilisateur
     * @param {object} router - Instance du ProviderRouter
     * @returns {Promise<string>} - Catégorie détectée
     */
    async detectCategory(query, router) {
        const categories = this.config?.reglages_generaux?.chat_agents?.categories;

        if (!categories) {
            console.warn('[Classifier] Aucune catégorie chat configurée, fallback FAST_CHAT');
            return 'FAST_CHAT';
        }

        const categoriesInfo = Object.entries(categories)
            .map(([id, cat]) => `- ${id}: ${cat.description}`)
            .join('\\n');

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
            const response = await router.callServiceAgent('CLASSIFIER', [
                { role: 'user', content: prompt }
            ]);

            const category = response.content?.trim().toUpperCase().replace(/['\"`]/g, '');

            if (categories[category]) {
                console.log(`[Classifier] 📂 Catégorie détectée: ${category}`);
                return category;
            } else {
                console.warn(`[Classifier] Catégorie invalide: "${category}", fallback FAST_CHAT`);
                return 'FAST_CHAT';
            }
        } catch (error) {
            console.error('[Classifier] Erreur détection catégorie:', error.message);
            return 'FAST_CHAT';
        }
    }

    /**
     * Classe la requête pour choisir le meilleur modèle parmi les disponibles
     * @param {string} query - La demande de l'utilisateur
     * @param {string[]} availableFamilies - Liste des familles disponibles
     * @param {object} router - Instance du ProviderRouter pour l'exécution
     * @returns {Promise<string|null>} - L'ID de la famille choisie (ex: 'gemini')
     */
    async classify(query, availableFamilies, router) {
        if (!availableFamilies || availableFamilies.length === 0) return null;
        if (availableFamilies.length === 1) return availableFamilies[0];

        let candidatesInfo = "";
        for (const familyId of availableFamilies) {
            const familyConf = this.config?.familles[familyId];
            if (familyConf) {
                const desc = familyConf.modeles?.[0]?.description || "Modèle IA standard";
                candidatesInfo += `- ID: ${familyId} (${familyConf.nom_affiche}) : ${desc}\\n`;
            } else {
                candidatesInfo += `- ID: ${familyId} : Modèle externe disponible\\n`;
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
            const response = await router.callServiceAgent('CLASSIFIER', [
                { role: 'user', content: prompt }
            ]);

            const text = response.content?.trim().toLowerCase().replace(/['\"`]/g, '');

            if (availableFamilies.includes(text)) {
                console.log(`[Classifier] 🧠 Choix expert: ${text} pour "${query.substring(0, 30)}..."`);
                return text;
            } else {
                console.warn(`[Classifier] Réponse invalide: "${text}". Fallback sur ${availableFamilies[0]}`);
                return availableFamilies[0];
            }
        } catch (error) {
            console.error('[Classifier] Erreur classification:', error.message);
            return null;
        }
    }
}

export const classifier = new ClassifierService();
export default classifier;
