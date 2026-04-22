/**
 * services/graphMemory.ts
 * Service d'interface pour le Knowledge Graph (Entités et Relations)
 */

import { supabase } from './supabase.js';
import { EmbeddingsService } from './ai/EmbeddingsService.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveApiKey } from '../config/keyResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface GraphEntity {
  id?: string;
  chat_id: string;
  name: string;
  type: string;
  description: string | null;
  metadata?: any;
  embedding?: number[];
  updated_at?: string;
}

export interface GraphRelationship {
  id?: string;
  chat_id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  strength: number;
}

// Initialisation embeddings
let embeddings: EmbeddingsService | null = null;
try {
  const credentialsPath = join(__dirname, '..', 'config', 'credentials.json');
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));

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
   */
  async upsertEntity(chatId: string, entity: Partial<GraphEntity>): Promise<GraphEntity | null> {
    if (!supabase || !entity.name || !embeddings) return null;

    try {
      const textToEmbed = `${entity.name}: ${entity.description || ''}`;
      const vector = await embeddings.embed(textToEmbed, 'RETRIEVAL_DOCUMENT');

      const { data, error } = await supabase
        .from('entities')
        .upsert({
          chat_id: chatId,
          name: entity.name,
          type: entity.type || 'Concept',
          description: entity.description || null,
          metadata: entity.metadata || {},
          embedding: vector,
          updated_at: new Date().toISOString()
        }, { onConflict: 'chat_id,name' })
        .select()
        .single();

      if (error) throw error;
      return data as GraphEntity;
    } catch (error: any) {
      console.error('[GraphMemory] Erreur upsertEntity:', error.message);
      return null;
    }
  },

  /**
   * Crée une relation entre deux entités
   */
  async addRelationship(chatId: string, sourceName: string, targetName: string, relationType: string, strength = 1.0): Promise<GraphRelationship | null> {
    if (!supabase) return null;

    try {
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
        console.warn(`[GraphMemory] Relation impossible: Entités non trouvées (${sourceName} -> ${targetName})`);
        return null;
      }

      const { data, error } = await supabase
        .from('relationships')
        .upsert({
          chat_id: chatId,
          source_id: (source as any).id,
          target_id: (target as any).id,
          relation_type: relationType,
          strength: strength
        }, { onConflict: 'source_id,target_id,relation_type' })
        .select()
        .single();

      if (error) throw error;
      return data as GraphRelationship;
    } catch (error: any) {
      console.error('[GraphMemory] Erreur addRelationship:', error.message);
      return null;
    }
  },

  /**
   * Recherche des entités par similarité sémantique
   */
  async searchEntities(chatId: string, query: string, limit = 5): Promise<GraphEntity[]> {
    if (!supabase || !embeddings) return [];

    try {
      const vector = await embeddings.embed(query, 'RETRIEVAL_QUERY');
      if (!vector) return [];

      const { data, error } = await supabase.rpc('match_entities', {
        query_embedding: vector,
        match_chat_id: chatId,
        match_threshold: 0.7,
        match_count: limit
      });

      if (error) throw error;
      return (data || []) as GraphEntity[];
    } catch (error: any) {
      console.error('[GraphMemory] Erreur searchEntities:', error.message);
      return [];
    }
  },

  /**
   * Récupère le voisinage d'une entité
   */
  async getNeighbors(entityId: string): Promise<any[]> {
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
