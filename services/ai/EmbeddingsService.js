// services/ai/EmbeddingsService.js
export class EmbeddingsService {
    constructor(config) {
        // On injecte la config (credentials + models_config)
        this.config = config;
        this.model = config.model || 'gemini-embedding-001';
        this.dimensions = config.dimensions || 1024;
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
            console.warn('[Embeddings] Gemini a échoué, tentative Fallback OpenAI...');
            return await this._embedWithOpenAI(cleanText);
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

    async _embedWithOpenAI(text) {
        const apiKey = this.config.openaiKey;
        if (!apiKey) {
            console.warn('[Embeddings] Clé OpenAI manquante, skip fallback');
            return null;
        }

        const keyObfuscated = apiKey.substring(0, 7) + '...' + apiKey.slice(-4);
        console.log(`[Embeddings] Fallback OpenAI: text-embedding-3-small, Key: ${keyObfuscated}, Dims: ${this.dimensions}`);

        const url = 'https://api.openai.com/v1/embeddings';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: text,
                dimensions: this.dimensions, // CRUCIAL: Force 1024 au lieu de 1536 par défaut
                encoding_format: 'float'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Erreur API OpenAI');
        }

        const data = await response.json();
        return data.data[0]?.embedding || null;
    }
}
