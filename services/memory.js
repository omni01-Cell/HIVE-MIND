// services/memory.js
// Service de mémoire sémantique (RAG) avec pgvector

import { supabase, db } from './supabase.js';

// Initialisation embeddings via container singleton
let embeddings = null;
let container = null;

// Fonction pour obtenir l'instance singleton
async function getEmbeddingsService() {
    if (embeddings) return embeddings;
    
    try {
        if (!container) {
            const { container: serviceContainer } = await import('../core/ServiceContainer.js');
            container = serviceContainer;
        }
        
        if (container.has('embeddings')) {
            embeddings = container.get('embeddings');
            console.log('[Memory] ✅ EmbeddingsService chargé depuis container (singleton)');
        } else {
            console.warn('[Memory] EmbeddingsService non disponible dans container');
        }
    } catch (e) {
        console.error('[Memory] Erreur chargement EmbeddingsService depuis container:', e.message);
    }
    
    return embeddings;
}

/**
 * Service de mémoire sémantique
 * Utilise les embeddings pour une recherche par similarité
 */
export const semanticMemory = {
    /**
     * Stocke un message avec son embedding et auto-tagging
     * @param {string} chatId 
     * @param {string} content 
     * @param {'user'|'assistant'} role 
     * @param {Object} options - { msgId }
     */
    async store(chatId, content, role, options = {}) {
        if (!supabase || !content?.trim()) return;

        // Obtenir l'instance singleton depuis le container
        const embeddings = await getEmbeddingsService();
        if (!embeddings) {
            console.warn('[Memory] EmbeddingsService non disponible, message non vectorisé');
            return;
        }

        // 1. Génération de l'embedding
        const vector = await embeddings.embed(content, 'RETRIEVAL_DOCUMENT');

        if (!vector) {
            console.warn('[Memory] Échec génération embedding, message non vectorisé.');
            return;
        }

        // 2. [LEVEL 5] Auto-Tagging
        let tags = [];
        try {
            const { tagService } = await import('./tagService.js');
            tags = await tagService.generateTags(content);
        } catch (e) {
            console.warn('[Memory] Erreur tagging:', e.message);
        }

        // 3. Préparer les metadata pour le feedback loop
        const metadata = {
            msgId: options.msgId,
            tags: tags,
            storedAt: new Date().toISOString()
        };

        const { error } = await supabase
            .from('memories')
            .insert({
                chat_id: chatId,
                content: content.substring(0, 2000),
                role,
                embedding: vector,
                metadata: metadata
            });

        if (error) console.error('[Memory] Erreur store:', error);
    },

    /**
     * Recherche les souvenirs similaires (RAG) avec contexte temporel
     * Utilise la recherche vectorielle pour trouver des messages pertinents
     * @param {string} chatId 
     * @param {string} query 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async recall(chatId, query, limit = 5) {
        if (!supabase) return [];

        // Obtenir l'instance singleton depuis le container
        const embeddings = await getEmbeddingsService();
        if (!embeddings) {
            console.warn('[Memory] EmbeddingsService non disponible, fallback temporel');
            // Fallback: recherche simple par date
            const { data } = await supabase
                .from('memories')
                .select('content, role, created_at')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);

            return this._formatWithAge(data || []);
        }

        // Utilise taskType 'RETRIEVAL_QUERY' pour optimiser la recherche
        const vector = await embeddings.embed(query, 'RETRIEVAL_QUERY');

        if (!vector) {
            // Fallback: recherche simple par date
            console.warn('[Memory] Échec embedding requête, fallback temporel');
            const { data } = await supabase
                .from('memories')
                .select('content, role, created_at')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);

            return this._formatWithAge(data || []);
        }

        // Recherche par similarité vectorielle
        const { data, error } = await supabase
            .rpc('match_memories', {
                query_embedding: vector,
                match_chat_id: chatId,
                match_threshold: 0.7,
                match_count: limit
            });

        if (error) {
            console.error('[Memory] Erreur recall:', error);
            return [];
        }

        // --- GLOBAL KNOWLEDGE RECALL (RAG Documentaire) ---
        // Recherche aussi dans la base de connaissances globale
        let globalData = [];
        try {
            const { data: gData, error: gError } = await supabase
                .rpc('match_memories', {
                    query_embedding: vector,
                    match_chat_id: 'global', // ID Spécial
                    match_threshold: 0.65,   // Seuil légèrement plus bas/haut selon besoin
                    match_count: limit
                });

            if (!gError && gData) {
                globalData = gData;
            }
        } catch (e) {
            console.warn('[Memory] Erreur global recall:', e.message);
        }

        // Fusionner et trier par similarité (si score dispo) ou entrelacer
        // Ici on concatène simplement, l'IA fera le tri contextuel
        const combined = [...(data || []), ...globalData];

        // Déduplication basique par ID
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());

        // [RAG TEMPOREL] Ajouter le contexte temporel aux souvenirs
        return this._formatWithAge(unique.slice(0, limit + 2));
    },

    /**
     * Formate les souvenirs avec leur âge relatif
     * @param {Array} memories - Tableau de souvenirs avec created_at
     * @returns {Array} - Souvenirs formatés avec [date relative]
     */
    _formatWithAge(memories) {
        return memories.map(m => {
            const age = this._formatAge(m.created_at);
            return {
                ...m,
                formattedContent: `[${age}] ${m.content}`
            };
        });
    },

    /**
     * Calcule l'âge relatif d'un souvenir
     * @param {string} createdAt - Date ISO
     * @returns {string} - Ex: "Aujourd'hui", "Hier", "Il y a 3 jours"
     */
    _formatAge(createdAt) {
        if (!createdAt) return 'Date inconnue';

        const now = Date.now();
        const then = new Date(createdAt).getTime();
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Aujourd'hui";
        if (diffDays === 1) return "Hier";
        if (diffDays < 7) return `Il y a ${diffDays} jours`;
        if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
        if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
        return `Il y a ${Math.floor(diffDays / 365)} ans`;
    },

    /**
     * Récupère le contexte récent d'une conversation (Supabase)
     * FALLBACK: Utilisé si Redis (workingMemory) n'est pas disponible
     * @param {string} chatId 
     * @param {number} limit 
     */
    async getRecentContext(chatId, limit = 10) {
        if (!supabase) return '';

        const { data } = await supabase
            .from('memories')
            .select('content, role')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (!data?.length) return '';

        return data
            .reverse()
            .map(m => `[${m.role}]: ${m.content}`)
            .join('\n');
    },

    /**
     * Résume les anciennes conversations via IA
     * Compresse les vieux messages en faits pour économiser l'espace
     * @param {string} chatId 
     * @param {number} keepLast - Nombre de messages récents à garder intacts
     */
    async summarize(chatId, keepLast = 50) {
        if (!supabase) return { success: false, reason: 'Supabase non disponible' };

        try {
            // 1. Compter le nombre total de souvenirs pour ce chat
            const { count } = await supabase
                .from('memories')
                .select('*', { count: 'exact', head: true })
                .eq('chat_id', chatId);

            if (!count || count <= keepLast) {
                return { success: true, reason: 'Pas assez de messages à résumer' };
            }

            // 2. Récupérer les vieux messages (les plus anciens)
            const toSkip = count - keepLast;
            const { data: oldMessages } = await supabase
                .from('memories')
                .select('id, content, role, created_at')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: true })
                .limit(Math.min(toSkip, 100)); // Max 100 pour éviter surcharge

            if (!oldMessages || oldMessages.length < 10) {
                return { success: true, reason: 'Pas assez de messages pour un résumé significatif' };
            }

            // 3. Préparer le texte à résumer
            const conversationText = oldMessages
                .map(m => `[${m.role}]: ${m.content}`)
                .join('\n');

            // 4. Import dynamique pour éviter la dépendance circulaire
            const { providerRouter } = await import('../providers/index.js');

            // 5. Appeler l'IA pour résumer (utiliser Gemini car rapide et économique)
            console.log(`[Memory] Résumé de ${oldMessages.length} messages pour ${chatId}...`);

            const response = await providerRouter.chat([
                {
                    role: 'system',
                    content: `Tu es un assistant de mémorisation. Résume cette conversation en 3-5 points clés.
Format: Liste à puces des faits importants (noms, préférences, événements mentionnés).
Ne garde que les informations factuelles et utiles pour des conversations futures.`
                },
                {
                    role: 'user',
                    content: conversationText
                }
            ], { temperature: 0.3, family: 'gemini' });

            if (!response?.content) {
                return { success: false, reason: 'Échec génération résumé IA' };
            }

            // 6. Stocker le résumé comme "fait" persistant
            const { factsMemory } = await import('./memory.js');
            const timestamp = new Date().toISOString().split('T')[0];
            await factsMemory.remember(chatId, `résumé_${timestamp}`, response.content);

            // 7. Supprimer les vieux messages traités
            const idsToDelete = oldMessages.map(m => m.id);
            await supabase
                .from('memories')
                .delete()
                .in('id', idsToDelete);

            console.log(`[Memory] ✅ Résumé créé, ${idsToDelete.length} anciens messages supprimés`);

            return {
                success: true,
                summarized: idsToDelete.length,
                summary: response.content.substring(0, 200) + '...'
            };

        } catch (error) {
            console.error('[Memory] Erreur summarize:', error.message);
            return { success: false, reason: error.message };
        }
    },

    /**
     * Nettoie les vieux souvenirs (garbage collection)
     * Appelé via le job scheduler quotidien 'memoryCleanup'
     * @param {string} chatId 
     * @param {number} keepLast 
     */
    async cleanup(chatId, keepLast = 50) {
        if (!supabase) return;

        // Récupère les IDs à garder
        const { data: toKeep } = await supabase
            .from('memories')
            .select('id')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(keepLast);

        if (!toKeep?.length) return;

        const keepIds = toKeep.map(m => m.id);

        // Supprime les autres
        await supabase
            .from('memories')
            .delete()
            .eq('chat_id', chatId)
            .not('id', 'in', `(${keepIds.join(',')})`);
    }
};

/**
 * Service de faits mémorisés (informations persistantes)
 */
export const factsMemory = {
    /**
     * Mémorise un fait sur l'utilisateur
     */
    async remember(chatId, key, value) {
        if (!supabase) return;

        const { error } = await supabase
            .from('facts')
            .upsert({
                chat_id: chatId,
                key,
                value
            }, { onConflict: 'chat_id,key' });

        if (error) console.error('[Facts] Erreur remember:', error);
    },

    /**
     * Récupère tous les faits connus sur un utilisateur
     */
    async getAll(chatId) {
        if (!supabase) return {};

        const { data } = await supabase
            .from('facts')
            .select('key, value')
            .eq('chat_id', chatId);

        if (!data) return {};

        return data.reduce((acc, fact) => {
            acc[fact.key] = fact.value;
            return acc;
        }, {});
    },

    /**
     * Récupère un fait spécifique
     */
    async get(chatId, key) {
        if (!supabase) return null;

        const { data } = await supabase
            .from('facts')
            .select('value')
            .eq('chat_id', chatId)
            .eq('key', key)
            .single();

        return data?.value || null;
    },

    /**
     * Supprime un fait
     */
    async forget(chatId, key) {
        if (!supabase) return;

        await supabase
            .from('facts')
            .delete()
            .eq('chat_id', chatId)
            .eq('key', key);
    },

    /**
     * Formate les faits pour inclusion dans le prompt
     */
    async format(chatId) {
        const facts = await this.getAll(chatId);
        if (Object.keys(facts).length === 0) return '';

        return Object.entries(facts)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');
    }
};

export default { semanticMemory, factsMemory };
