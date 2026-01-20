// services/ai/EmbeddingsService.js
export class EmbeddingsService {
    constructor(config) {
        // On injecte la config (credentials + models_config)
        this.config = config;
        this.model = config.model || 'gemini-embedding-1.0';
        this.dimensions = config.dimensions || 768;
    }

    /**
     * Génère un vecteur pour le texte donné
     * @param {string} text 
     * @returns {Promise<number[]|null>}
     */
    async embed(text) {
        if (!text || !text.trim()) return null;

        // Nettoyage : remplacer les sauts de ligne par des espaces (recommandé pour RAG)
        const cleanText = text.replace(/\n/g, ' ');

        try {
            // Stratégie : Essayer Gemini d'abord (Moins cher / Meilleur contexte)
            const vector = await this._embedWithGemini(cleanText);
            if (vector) return vector;

            // Fallback (Optionnel si tu as configuré OpenAI)
            console.warn('[Embeddings] Gemini a échoué, tentative Fallback...');
            // return await this._embedWithOpenAI(cleanText);
            return null;
        } catch (error) {
            console.error('[Embeddings] Erreur fatale:', error.message);
            return null;
        }
    }

    async _embedWithGemini(text) {
        const apiKey = this.config.geminiKey; // Injecté depuis le conteneur
        if (!apiKey) throw new Error("Clé Gemini manquante");

        // Debug Key (Safe)
        const keyObfuscated = apiKey.startsWith('AIza') ? 'AIza...' + apiKey.slice(-4) : apiKey.substring(0, 5) + '...';
        console.log(`[Embeddings] Using Model: ${this.model}, Key: ${keyObfuscated}, Dims: ${this.dimensions}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${this.model}`,
                content: { parts: [{ text }] },
                outputDimensionality: this.dimensions // Important pour matcher la DB (1024)
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Erreur API Gemini');
        }

        const data = await response.json();
        return data.embedding?.values || null;
    }
}
