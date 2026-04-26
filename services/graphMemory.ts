// @ts-nocheck
// services/graphMemory.js
// Service d'interface pour le Knowledge Graph (Entités et Relations)

import { supabase } from './supabase.js';
import { EmbeddingsService } from './ai/EmbeddingsService.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveApiKey } from '../config/keyResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialisation embeddings
let embeddings: any = null;
try {
    const credentials = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'credentials.json'), 'utf-8'));

    // Résoudre les variables d'environnement
    const geminiKey = resolveApiKey(credentials.familles_ia?.gemini);
    const openaiKey = resolveApiKey(credentials.familles_ia?.openai);

    embeddings = new EmbeddingsService({
        geminiKey,
        openaiKey
    });
} catch (e: any) {

    console.error('[GraphMemory] Erreur init embeddings:', e.message);
}

export const graphMemory = {
    /**
     * Enregistre ou met à jour une entité
     * @param {string} chatId 
     * @param {Object} entity - { name, type, description, metadata }
     */
    async upsertEntity(chatId: any, entity: any) {
        if (!supabase || !entity.name) return null;

        try {
            // Générer un embedding pour le nom + description pour la recherche sémantique d'entités
            const textToEmbed = `${entity.name}: ${entity.description || ''}`;
            const vector = await embeddings.embed(textToEmbed, 'RETRIEVAL_DOCUMENT');

            const { data, error } = await supabase
                .from('entities')
                .upsert({
                    chat_id: chatId,
                    name: entity.name,
                    type: entity.type || 'Concept',
                    description: entity.description,
                    metadata: entity.metadata || {},
                    embedding: vector,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'chat_id,name' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error: any) {
            console.error('[GraphMemory] Erreur upsertEntity:', error.message);
            return null;
        }
    },

    /**
     * Crée une relation entre deux entités
     * @param {string} chatId 
     * @param {string} sourceName 
     * @param {string} targetName 
     * @param {string} relationType 
     * @param {number} strength 
     */
    async addRelationship(chatId: any, sourceName: any, targetName: any, relationType: any, strength: any = 1.0) {
        if (!supabase) return null;

        try {
            // 1. Récupérer les IDs des entités
            const { data: source } = await supabase
                .from('entities')
                .select('id')
                .eq('chat_id', chatId)
                .eq('name', sourceName)
                .single();

            const { data: target } = await supabase
                .from('entities')
                .select('id')
                .eq('chat_id', chatId)
                .eq('name', targetName)
                .single();

            if (!source || !target) {
                console.warn(`[GraphMemory] Relation impossible: Entité(s) non trouvée(s) (${sourceName} -> ${targetName})`);
                return null;
            }

            // 2. Créer la relation
            const { data, error } = await supabase
                .from('relationships')
                .upsert({
                    chat_id: chatId,
                    source_id: source.id,
                    target_id: target.id,
                    relation_type: relationType,
                    strength: strength
                }, { onConflict: 'source_id,target_id,relation_type' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error: any) {
            console.error('[GraphMemory] Erreur addRelationship:', error.message);
            return null;
        }
    },

    /**
     * Recherche des entités par similarité sémantique
     * @param {string} chatId 
     * @param {string} query 
     * @param {number} limit 
     */
    async searchEntities(chatId: any, query: any, limit: any = 5) {
        if (!supabase) return [];

        try {
            const vector = await embeddings.embed(query, 'RETRIEVAL_QUERY');
            if (!vector) return [];

            const { data, error } = await supabase.rpc('match_entities', {
                query_embedding: vector,
                match_context_id: chatId,
                match_threshold: 0.7,
                match_count: limit
            });

            if (error) throw error;
            return data || [];
        } catch (error: any) {
            console.error('[GraphMemory] Erreur searchEntities:', error.message);
            return [];
        }
    },

    /**
     * Récupère le voisinage d'une entité (ses relations directes)
     * @param {string} entityId 
     */
    async getNeighbors(entityId: any) {
        if (!supabase) return [];

        try {
            const { data, error } = await supabase
                .from('relationships')
                .select(`
                    relation_type,
                    strength,
                    target:entities!target_id(id, name, type, description)
                `)
                .eq('source_id', entityId);

            if (error) throw error;
            return data || [];
        } catch (error: any) {
            console.error('[GraphMemory] Erreur getNeighbors:', error.message);
            return [];
        }
    }
};

export default graphMemory;
