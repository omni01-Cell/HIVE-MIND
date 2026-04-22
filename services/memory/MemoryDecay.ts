/**
 * services/memory/MemoryDecay.ts
 * Intellectual forgetting management system.
 * Implements a memory aging system based on recency, frequency, and importance.
 */

import { supabase } from '../supabase.js';

export interface MemoryRecord {
  id: string;
  chat_id: string;
  content: string;
  created_at: string;
  role: string;
  recall_count?: number;
  decay_score?: number;
  archived_at?: string | null;
}

export interface DecayResult {
  processed: number;
  archived: number;
  kept: number;
  error?: string;
}

export interface DecayStats {
  total: number;
  active: number;
  archived: number;
  avgScore: string;
  retention: string;
}

export class MemoryDecaySystem {
  // Decay parameters
  private readonly tau = 24; // Time constant (hours) for exponential decay
  private readonly scoreThreshold = 0.3; // Threshold below which we archive
  private readonly importanceKeywords = [
    'promis', 'engagement', 'rdv', 'rendez-vous', 'deadline',
    'important', 'critique', 'urgent', 'préfère', 'déteste',
    'aime', 'jamais', 'toujours', 'rappelle-moi', 'note'
  ];

  /**
   * Scores a memory based on recency, frequency, and importance.
   * @param memory The memory object.
   */
  async scoreMemory(memory: MemoryRecord): Promise<{ score: number; components: any; keep: boolean; ageHours: number }> {
    const now = Date.now();
    const createdAt = new Date(memory.created_at).getTime();
    const ageHours = (now - createdAt) / (1000 * 60 * 60);

    // 1. Recency: Exponential decay
    const recency = Math.exp(-ageHours / this.tau);

    // 2. Frequency: Number of times recalled
    const recallCount = memory.recall_count || 0;
    const frequency = Math.min(recallCount / 10, 1); // Normalize to [0,1]

    // 3. Importance: Detection of critical keywords
    const importance = await this._detectImportance(memory.content);

    // 4. Composite score
    const score = (recency * 0.4) + (frequency * 0.3) + (importance * 0.3);

    return {
      score,
      components: { recency, frequency, importance },
      keep: score > this.scoreThreshold,
      ageHours: Math.round(ageHours)
    };
  }

  /**
   * Detects semantic importance based on keywords.
   */
  private async _detectImportance(content: string): Promise<number> {
    const lowerContent = content.toLowerCase();
    let keywordScore = 0;

    for (const keyword of this.importanceKeywords) {
      if (lowerContent.includes(keyword)) {
        keywordScore += 0.2;
      }
    }

    // Cap at 1.0
    return Math.min(keywordScore, 1.0);
  }

  /**
   * Runs the decay cycle for a specific chat.
   * @param chatId Unique identifier for the chat.
   */
  async decay(chatId: string): Promise<DecayResult> {
    console.log(`[MemoryDecay] 🧹 Starting decay cycle for ${chatId}...`);

    try {
      if (!supabase) throw new Error("Supabase client not initialized");

      // 1. Get all memories for the chat
      const { data: memories, error } = await supabase
        .from('memories')
        .select('*')
        .eq('chat_id', chatId)
        .eq('role', 'assistant') // Decay bot responses to manage brain weight
        .is('archived_at', null);

      if (error) throw error;
      if (!memories || memories.length === 0) {
        console.log(`[MemoryDecay] No memories to process for ${chatId}`);
        return { processed: 0, archived: 0, kept: 0 };
      }

      let archivedCount = 0;
      let keptCount = 0;

      // 2. Score and archive if necessary
      for (const memory of memories as MemoryRecord[]) {
        const { score, keep, ageHours } = await this.scoreMemory(memory);

        if (!keep) {
          // Soft delete: set archived_at
          await supabase
            .from('memories')
            .update({
              archived_at: new Date().toISOString(),
              decay_score: score
            })
            .eq('id', memory.id);

          archivedCount++;
          console.log(`[MemoryDecay] ⚰️ Archived: ID ${memory.id} (age=${ageHours}h, score=${score.toFixed(2)})`);
        } else {
          // Just update the score
          await supabase
            .from('memories')
            .update({ decay_score: score })
            .eq('id', memory.id);

          keptCount++;
        }
      }

      console.log(`[MemoryDecay] ✅ ${chatId}: ${archivedCount} archived, ${keptCount} kept (${memories.length} total)`);

      return {
        processed: memories.length,
        archived: archivedCount,
        kept: keptCount
      };

    } catch (error: any) {
      console.error('[MemoryDecay] Error:', error.message);
      return { processed: 0, archived: 0, kept: 0, error: error.message };
    }
  }

  /**
   * Runs the global decay cycle for all active chats.
   */
  async decayAll(): Promise<{ chats: number; archived: number; kept: number; error?: string }> {
    console.log('[MemoryDecay] 🌍 Starting global decay cycle...');

    try {
      if (!supabase) throw new Error("Supabase client not initialized");

      // Get chats with recent activity (< 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: activeChats, error } = await supabase
        .from('memories')
        .select('chat_id')
        .gte('created_at', sevenDaysAgo)
        .is('archived_at', null);

      if (error) throw error;

      // Deduplicate chat IDs
      const uniqueChats = [...new Set(activeChats.map(m => m.chat_id))];

      console.log(`[MemoryDecay] ${uniqueChats.length} active chats detected`);

      let totalArchived = 0;
      let totalKept = 0;

      for (const chatId of uniqueChats) {
        const result = await this.decay(chatId);
        totalArchived += result.archived;
        totalKept += result.kept;
      }

      console.log(`[MemoryDecay] ✅ Global cycle completed: ${totalArchived} archived, ${totalKept} kept`);

      return {
        chats: uniqueChats.length,
        archived: totalArchived,
        kept: totalKept
      };

    } catch (error: any) {
      console.error('[MemoryDecay] Global cycle error:', error.message);
      return { chats: 0, archived: 0, kept: 0, error: error.message };
    }
  }

  /**
   * Retrieves decay statistics.
   * @param chatId Optional chat filter.
   */
  async getStats(chatId: string | null = null): Promise<DecayStats | null> {
    try {
      if (!supabase) return null;

      let query = supabase
        .from('memories')
        .select('decay_score, archived_at, created_at');

      if (chatId) {
        query = query.eq('chat_id', chatId);
      }

      const { data: memories } = await query;

      if (!memories) return null;

      const active = (memories as any[]).filter(m => !m.archived_at);
      const archived = (memories as any[]).filter(m => m.archived_at);

      const avgScoreActive = active.length > 0
        ? active.reduce((sum, m) => sum + (m.decay_score || 0), 0) / active.length
        : 0;

      return {
        total: memories.length,
        active: active.length,
        archived: archived.length,
        avgScore: avgScoreActive.toFixed(3),
        retention: (active.length / memories.length * 100).toFixed(1) + '%'
      };

    } catch (error: any) {
      console.error('[MemoryDecay] Stats error:', error.message);
      return null;
    }
  }
}

export const memoryDecay = new MemoryDecaySystem();
export default memoryDecay;
