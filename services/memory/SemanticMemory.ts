/**
 * services/memory/SemanticMemory.ts
 * Long-term semantic memory (RAG) using vector search.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IEmbeddingsService } from '../ai/EmbeddingsService.js';

export interface IMemoryLogger {
  warn(msg: string): void;
  debug(tag: string, msg: string): void;
  error(msg: string): void;
}

export interface SemanticMemoryDependencies {
  supabase: SupabaseClient;
  embeddings: IEmbeddingsService;
  logger?: IMemoryLogger;
}

export interface MemoryRecord {
  content: string;
  role: string;
  similarity: number;
}

export class SemanticMemory {
  private readonly supabase: SupabaseClient;
  private readonly embeddings: IEmbeddingsService;
  private readonly logger?: IMemoryLogger;

  constructor(dependencies: SemanticMemoryDependencies) {
    this.supabase = dependencies.supabase;
    this.embeddings = dependencies.embeddings;
    this.logger = dependencies.logger;
  }

  async store(chatId: string, content: string, role: string): Promise<void> {
    if (!content || !this.supabase) return;

    try {
      // 0. Resolve Omni-Channel UUID
      const { default: db } = await import('../supabase.js');
      const resolved = await db.resolveContextFromLegacyId(chatId);
      if (!resolved) {
        this.logger?.warn(`[Memory] Could not resolve context ID for ${chatId}`);
        return;
      }

      // 1. Vectorization
      const vector = await this.embeddings.embed(content);
      if (!vector) {
        this.logger?.warn('[Memory] Vectorization failed, memory not stored.');
        return;
      }

      // 2. Database Storage
      const { error } = await this.supabase
        .from('memories')
        .insert({
          context_id: resolved.context_id,
          content: content,
          role: role,
          embedding: vector
        });

      if (error) throw error;
      this.logger?.debug('memory', `Memory stored for ${chatId} (Role: ${role})`);

    } catch (error: any) {
      this.logger?.error(`[Memory] Store Error: ${error.message}`);
    }
  }

  async recall(chatId: string, query: string, limit: number = 5): Promise<MemoryRecord[]> {
    if (!this.supabase || !query) return [];

    try {
      // 0. Resolve Omni-Channel UUID
      const { default: db } = await import('../supabase.js');
      const resolved = await db.resolveContextFromLegacyId(chatId);
      if (!resolved) return [];

      // 1. Vectorize the current query
      const queryVector = await this.embeddings.embed(query);
      if (!queryVector) return [];

      // 2. RPC call to SQL search function
      const { data, error } = await this.supabase.rpc('match_memories', {
        query_embedding: queryVector,
        match_threshold: 0.7,
        match_count: limit,
        match_context_id: resolved.context_id
      });

      if (error) throw error;

      return (data as any[]).map((m: any) => ({
        content: m.content,
        role: m.role,
        similarity: m.similarity
      }));

    } catch (error: any) {
      this.logger?.error(`[Memory] Recall Error: ${error.message}`);
      return [];
    }
  }

  async prune(chatId: string, keepLast: number = 50): Promise<void> {
    if (!this.supabase) return;

    try {
      const { default: db } = await import('../supabase.js');
      const resolved = await db.resolveContextFromLegacyId(chatId);
      if (!resolved) return;

      // Get IDs to keep
      const { data: keepIds } = await this.supabase
        .from('memories')
        .select('id')
        .eq('context_id', resolved.context_id)
        .order('created_at', { ascending: false })
        .limit(keepLast);

      if (!keepIds || keepIds.length === 0) return;

      const ids = keepIds.map((k: any) => k.id);

      // Delete everything else
      await this.supabase
        .from('memories')
        .delete()
        .eq('context_id', resolved.context_id)
        .not('id', 'in', `(${ids.join(',')})`);
    } catch (error: any) {
      this.logger?.error(`[Memory] Prune Error: ${error.message}`);
    }
  }

  /**
   * Compatibility alias for prune.
   */
  async cleanup(chatId: string, keepLast: number = 50): Promise<void> {
    return this.prune(chatId, keepLast);
  }

  /**
   * Placeholder for future LLM summarization.
   */
  async summarize(chatId: string, limit: number = 50): Promise<null> {
    this.logger?.warn('[Memory] Summarization not implemented in V2 RAG. Skipping.');
    return null;
  }
}
