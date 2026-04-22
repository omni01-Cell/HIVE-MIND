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

  /**
   * Stores a memory (Vectorizes + Saves).
   * @param chatId Unique identifier for the chat.
   * @param content The text content to remember.
   * @param role The role of the speaker (user, assistant, etc.).
   */
  async store(chatId: string, content: string, role: string): Promise<void> {
    if (!content || !this.supabase) return;

    try {
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
          chat_id: chatId,
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

  /**
   * Recalls similar memories based on a query.
   * @param chatId Unique identifier for the chat.
   * @param query The search query.
   * @param limit Maximum number of results to return.
   */
  async recall(chatId: string, query: string, limit: number = 5): Promise<MemoryRecord[]> {
    if (!this.supabase || !query) return [];

    try {
      // 1. Vectorize the current query
      const queryVector = await this.embeddings.embed(query);
      if (!queryVector) return [];

      // 2. RPC call to SQL search function
      const { data, error } = await this.supabase.rpc('match_memories', {
        query_embedding: queryVector,
        match_threshold: 0.7,
        match_count: limit,
        match_chat_id: chatId
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

  /**
   * Prunes old memories to prevent DB clutter.
   * @param chatId Unique identifier for the chat.
   * @param keepLast Number of recent memories to keep.
   */
  async prune(chatId: string, keepLast: number = 50): Promise<void> {
    if (!this.supabase) return;

    // Get IDs to keep
    const { data: keepIds } = await this.supabase
      .from('memories')
      .select('id')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(keepLast);

    if (!keepIds || keepIds.length === 0) return;

    const ids = keepIds.map((k: any) => k.id);

    // Delete everything else
    await this.supabase
      .from('memories')
      .delete()
      .eq('chat_id', chatId)
      .not('id', 'in', `(${ids.join(',')})`);
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
