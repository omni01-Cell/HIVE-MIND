// services/memory/SemanticMemory.js
export class SemanticMemory {
    constructor(dependencies) {
        this.supabase = dependencies.supabase;
        this.embeddings = dependencies.embeddings; // Instance de EmbeddingsService
        this.logger = dependencies.logger;
    }

    /**
     * Stocke un souvenir (Vectorise + Sauvegarde)
     */
    async store(chatId, content, role) {
        if (!content || !this.supabase) return;

        try {
            // 1. Vectorisation
            const vector = await this.embeddings.embed(content);
            if (!vector) {
                this.logger?.warn('[Memory] Échec vectorisation, souvenir non stocké.');
                return;
            }

            // 2. Stockage DB
            const { error } = await this.supabase
                .from('memories')
                .insert({
                    chat_id: chatId,
                    content: content,
                    role: role,
                    embedding: vector
                    // created_at est auto
                });

            if (error) throw error;
            this.logger?.debug('memory', `Souvenir stocké pour ${chatId} (Role: ${role})`);

        } catch (error) {
            this.logger?.error(`[Memory] Erreur Store: ${error.message}`);
        }
    }

    /**
     * Rappel (Recall) : Recherche les souvenirs similaires
     */
    async recall(chatId, query, limit = 5) {
        if (!this.supabase || !query) return [];

        try {
            // 1. Vectoriser la requête actuelle
            const queryVector = await this.embeddings.embed(query);
            if (!queryVector) return [];

            // 2. Appel RPC (Remote Procedure Call) vers la fonction SQL qu'on a créée
            const { data, error } = await this.supabase.rpc('match_memories', {
                query_embedding: queryVector,
                match_threshold: 0.7, // Seuil de similarité (0.0 à 1.0)
                match_count: limit,
                match_chat_id: chatId
            });

            if (error) throw error;

            return data.map(m => ({
                content: m.content,
                role: m.role,
                similarity: m.similarity
            }));

        } catch (error) {
            this.logger?.error(`[Memory] Erreur Recall: ${error.message}`);
            return [];
        }
    }

    /**
     * Nettoyage (Garbage Collection)
     * Garde seulement les X derniers souvenirs pour éviter de saturer la DB
     */
    async prune(chatId, keepLast = 50) {
        if (!this.supabase) return;

        // Récupérer les IDs à garder (les plus récents)
        const { data: keepIds } = await this.supabase
            .from('memories')
            .select('id')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(keepLast);

        if (!keepIds || keepIds.length === 0) return;

        const ids = keepIds.map(k => k.id);

        // Supprimer tout ce qui n'est PAS dans cette liste
        await this.supabase
            .from('memories')
            .delete()
            .eq('chat_id', chatId)
            .not('id', 'in', `(${ids.join(',')})`);
    }

    /**
     * Alias de compatibilité pour le code existant
     */
    async cleanup(chatId, keepLast = 50) {
        return this.prune(chatId, keepLast);
    }

    /**
     * Résumé (Placeholder pour l'instant)
     * TODO: Implémenter la summarization via LLM
     */
    async summarize(chatId, limit = 50) {
        this.logger?.warn('[Memory] Summarize non implémenté dans V2 RAG. Skipping.');
        return null;
    }
}
