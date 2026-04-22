/**
 * services/memory.ts
 * Service de mémoire sémantique (RAG) avec pgvector et Faits persistants
 */

import { supabase } from './supabase.js';

export interface MemoryEntry {
  id: string;
  chat_id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  formattedContent?: string;
  metadata?: any;
}

export interface FactEntry {
  chat_id: string;
  key: string;
  value: string;
}

let embeddingsService: any = null;
let serviceContainer: any = null;

/**
 * Charge l'EmbeddingsService depuis le conteneur DI
 */
async function getEmbeddingsService(): Promise<any> {
  if (embeddingsService) return embeddingsService;

  try {
    if (!serviceContainer) {
      const { container } = await import('../core/ServiceContainer.js');
      serviceContainer = container;
    }

    if (serviceContainer.has('embeddings')) {
      embeddingsService = serviceContainer.get('embeddings');
    }
  } catch (e: any) {
    console.error('[Memory] Erreur chargement EmbeddingsService:', e.message);
  }

  return embeddingsService;
}

/**
 * Service de mémoire sémantique
 */
export const semanticMemory = {
  /**
   * Stocke un message avec son embedding
   */
  async store(chatId: string, content: string, role: 'user' | 'assistant', options: { msgId?: string } = {}): Promise<void> {
    if (!supabase || !content?.trim()) return;

    const embeddings = await getEmbeddingsService();
    if (!embeddings) {
      console.warn('[Memory] EmbeddingsService non disponible');
      return;
    }

    const vector = await embeddings.embed(content, 'RETRIEVAL_DOCUMENT');
    if (!vector) return;

    let tags: string[] = [];
    try {
      const { tagService } = await import('./tagService.js');
      tags = await tagService.generateTags(content);
    } catch (e) {}

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
   * Recherche les souvenirs similaires (RAG)
   */
  async recall(chatId: string, query: string, limit = 5): Promise<MemoryEntry[]> {
    if (!supabase) return [];

    const embeddings = await getEmbeddingsService();
    if (!embeddings) {
      const { data } = await supabase
        .from('memories')
        .select('id, content, role, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return this._formatWithAge((data || []) as any[]);
    }

    const vector = await embeddings.embed(query, 'RETRIEVAL_QUERY');
    if (!vector) {
      const { data } = await supabase
        .from('memories')
        .select('id, content, role, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return this._formatWithAge((data || []) as any[]);
    }

    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: vector,
      match_chat_id: chatId,
      match_threshold: 0.7,
      match_count: limit
    });

    if (error) {
      console.error('[Memory] Erreur recall:', error);
      return [];
    }

    let globalData: any[] = [];
    try {
      const { data: gData, error: gError } = await supabase.rpc('match_memories', {
        query_embedding: vector,
        match_chat_id: 'global',
        match_threshold: 0.65,
        match_count: limit
      });
      if (!gError && gData) globalData = gData;
    } catch (e) {}

    const combined = [...(data || []), ...globalData];
    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());

    return this._formatWithAge(unique.slice(0, limit + 2) as any[]);
  },

  _formatWithAge(memories: any[]): MemoryEntry[] {
    return memories.map(m => {
      const age = this._formatAge(m.created_at);
      return {
        ...m,
        formattedContent: `[${age}] ${m.content}`
      };
    });
  },

  _formatAge(createdAt: string): string {
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
   * Résume les anciennes conversations
   */
  async summarize(chatId: string, keepLast = 50): Promise<{ success: boolean; reason?: string; summarized?: number; summary?: string }> {
    if (!supabase) return { success: false, reason: 'Supabase non disponible' };

    try {
      const { count } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId);

      if (!count || count <= keepLast) {
        return { success: true, reason: 'Pas assez de messages à résumer' };
      }

      const toSkip = count - keepLast;
      const { data: oldMessages } = await supabase
        .from('memories')
        .select('id, content, role, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .limit(Math.min(toSkip, 100));

      if (!oldMessages || oldMessages.length < 10) {
        return { success: true, reason: 'Pas assez de messages pour un résumé' };
      }

      const conversationText = oldMessages.map(m => `[${m.role}]: ${m.content}`).join('\n');
      const { providerRouter } = await import('../providers/index.js');

      const response = await providerRouter.chat([
        {
          role: 'system',
          content: 'Résume cette conversation en 3-5 points clés factuels.'
        },
        {
          role: 'user',
          content: conversationText
        }
      ], { temperature: 0.3, family: 'gemini' });

      if (!response?.content) return { success: false, reason: 'Échec génération résumé' };

      const timestamp = new Date().toISOString().split('T')[0];
      await factsMemory.remember(chatId, `résumé_${timestamp}`, response.content);

      const idsToDelete = oldMessages.map(m => m.id);
      await supabase.from('memories').delete().in('id', idsToDelete);

      return {
        success: true,
        summarized: idsToDelete.length,
        summary: response.content.substring(0, 200) + '...'
      };
    } catch (error: any) {
      console.error('[Memory] Erreur summarize:', error.message);
      return { success: false, reason: error.message };
    }
  }
};

/**
 * Service de faits mémorisés
 */
export const factsMemory = {
  async remember(chatId: string, key: string, value: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('facts').upsert({ chat_id: chatId, key, value }, { onConflict: 'chat_id,key' });
    if (error) console.error('[Facts] Erreur remember:', error);
  },

  async getAll(chatId: string): Promise<Record<string, string>> {
    if (!supabase) return {};
    const { data } = await supabase.from('facts').select('key, value').eq('chat_id', chatId);
    return (data || []).reduce((acc: any, fact: any) => {
      acc[fact.key] = fact.value;
      return acc;
    }, {});
  },

  async get(chatId: string, key: string): Promise<string | null> {
    if (!supabase) return null;
    const { data } = await supabase.from('facts').select('value').eq('chat_id', chatId).eq('key', key).single();
    return data?.value || null;
  },

  async forget(chatId: string, key: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('facts').delete().eq('chat_id', chatId).eq('key', key);
  },

  async format(chatId: string): Promise<string> {
    const facts = await this.getAll(chatId);
    if (Object.keys(facts).length === 0) return '';
    return Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  }
};

export default { semanticMemory, factsMemory };
