
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Service de Classification "Smart Router" (Niveau 3)
 * Utilise Gemini 3 Flash pour choisir le meilleur expert.
 */
class ClassifierService {
    constructor() {
        this.client = null;
        this.model = null;
        this.config = null;
        this._loadConfig();
    }

    _loadConfig() {
        try {
            // Charger les clés API
            const credsPath = join(__dirname, '..', '..', 'config', 'credentials.json');
            const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
            const apiKey = creds.familles_ia?.gemini;

            if (apiKey) {
                const genAI = new GoogleGenerativeAI(apiKey);
                // Utilisation spécifique de Gemini 3 Flash (Preview)
                this.model = genAI.getGenerativeModel({
                    model: 'gemini-3-flash-preview',
                    generationConfig: { temperature: 1.0 }
                });
            }

            // Charger les descriptions des modèles
            const configPath = join(__dirname, '..', '..', 'config', 'models_config.json');
            this.config = JSON.parse(readFileSync(configPath, 'utf-8'));

        } catch (e) {
            console.warn('[Classifier] Erreur init:', e.message);
        }
    }

    /**
     * Classe la requête pour choisir le meilleur modèle parmi les disponibles
     * @param {string} query - La demande de l'utilisateur
     * @param {string[]} availableFamilies - Liste des familles disponibles (ex: ['gemini', 'openai'])
     * @returns {Promise<string|null>} - L'ID de la famille choisie (ex: 'gemini')
     */
    async classify(query, availableFamilies) {
        if (!this.model) {
            console.warn('[Classifier] Modèle non initialisé, skip.');
            return null;
        }

        // Si une seule famille dispo, pas de choix à faire
        if (availableFamilies.length === 1) return availableFamilies[0];
        if (availableFamilies.length === 0) return null;

        // Construire la liste des candidats avec leurs descriptions
        let candidatesInfo = "";
        for (const familyId of availableFamilies) {
            const familyConf = this.config.familles[familyId];
            if (familyConf) {
                // On prend la description du premier modèle ou de la famille
                const desc = familyConf.modeles?.[0]?.description || "Modèle IA standard";
                candidatesInfo += `- ID: ${familyId} (${familyConf.nom_affiche}) : ${desc}\n`;
            }
        }

        const prompt = `
Role: Ordonnanceur IA Expert.
Tâche: Choisir la MEILLEURE famille de modèles pour répondre à la requête utilisateur, parmi les candidats disponibles.

[CANDIDATS DISPONIBLES]
${candidatesInfo}

[REQUÊTE UTILISATEUR]
"${query}"

[CRITÈRES DE DÉCISION]
1. Code complexe -> Privilégier Mistral/Codestral ou Claude Sonnet.
2. Raisonnement logique / Math -> Privilégier OpenAI o1/GPT-4 ou Claude Opus.
3. Créativité / Rdaction -> Claude Opus ou Gemini.
4. Rapidité / Chat simple -> Gemini Flash ou GPT-mini.
5. Vision (Images) -> Gemini ou Claude ou GPT-4o.
6. Si la requête est floue ou simple "Bonjour", choisir le moins cher/plus rapide.

Réponds UNIQUEMENT par l'ID exact de la famille choisie (ex: "gemini"). Rien d'autre.
Meilleur ID:`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text().trim().toLowerCase().replace(/['"`]/g, ''); // Nettoyage

            // Vérifier si la réponse est un ID valide
            if (availableFamilies.includes(text)) {
                console.log(`[Classifier] 🧠 Choix intelligent: ${text} pour "${query.substring(0, 30)}..."`);
                return text;
            } else {
                console.warn(`[Classifier] Réponse invalide: "${text}". Fallback sur ${availableFamilies[0]}`);
                return availableFamilies[0];
            }

        } catch (error) {
            console.error('[Classifier] Erreur génération:', error.message);
            return null; // Le router gérera le fallback
        }
    }
}

export const classifier = new ClassifierService();
