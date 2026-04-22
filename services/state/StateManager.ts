/**
 * services/state/StateManager.ts
 * GESTIONNAIRE D'ÉTAT DISTRIBUÉ (Redis + Supabase)
 * Implémente le pattern "Write-Behind Cache"
 */

import { redis } from '../redisClient.js';
import { supabase } from '../supabase.js';
import { LockManager } from './LockManager.js';
import { IdentityMap } from './IdentityMap.js';

const userLock = new LockManager('user');
const SYNC_QUEUE_KEY = 'queue:sync:users';

export interface UserData {
  jid: string;
  username?: string;
  last_pushname?: string;
  interaction_count: number;
  last_seen?: number;
  [key: string]: any;
}

export interface LeaderboardEntry {
  value: string;
  score: number;
}

/**
 * Gestionnaire d'état centralisé pour les données utilisateur
 */
export const StateManager = {
  /**
   * Récupère un profil utilisateur complet
   */
  async getUser(identifier: string): Promise<UserData> {
    const jid = await IdentityMap.resolve(identifier) || identifier;
    const cacheKey = `user:${jid}:data`;

    // 1. Lecture Cache
    let userData = await redis?.hGetAll(cacheKey);

    // 2. Cache Miss: Lecture DB + Hydratation
    if (!userData || Object.keys(userData).length === 0) {
      const lockId = await userLock.acquireWait(jid);
      if (!lockId) {
        return { jid, username: 'Inconnu', interaction_count: 0 };
      }

      try {
        userData = await redis?.hGetAll(cacheKey);
        if (!userData || Object.keys(userData).length === 0) {
          if (supabase) {
            const { data } = await supabase.from('users').select('*').eq('jid', jid).single();
            if (data) {
              userData = this._flattenForRedis(data);
              await redis?.hSet(cacheKey, userData);
              await redis?.expire(cacheKey, 86400); // 24h
            }
          }
        }
      } finally {
        await userLock.release(jid, lockId);
      }
    }

    if (!userData || Object.keys(userData).length === 0) {
      return { jid, username: 'Inconnu', interaction_count: 0 };
    }

    return { jid, ...this._unflattenFromRedis(userData) };
  },

  /**
   * Met à jour l'utilisateur (Atomique & Persistent dans Redis)
   */
  async updateUserInteraction(identifier: string, pushName: string | null): Promise<void> {
    const jid = await IdentityMap.resolve(identifier) || identifier;
    const cacheKey = `user:${jid}:data`;

    if (!redis?.isOpen) return;

    const pipeline = redis.multi();

    // 1. Mise à jour atomique du compteur
    pipeline.hIncrBy(cacheKey, 'interaction_count', 1);
    pipeline.hSet(cacheKey, 'last_seen', Date.now().toString());

    // 2. Mise à jour conditionnelle du nom
    if (pushName) {
      pipeline.hSet(cacheKey, 'last_pushname', pushName);
    }

    // 3. Reset TTL
    pipeline.expire(cacheKey, 86400);

    // 4. Ajouter à la "Dirty Queue"
    pipeline.sAdd(SYNC_QUEUE_KEY, jid);

    await pipeline.exec();
  },

  /**
   * Worker de synchronisation
   * Vide la queue Redis vers Supabase
   */
  async processSyncQueue(batchSize = 50): Promise<void> {
    if (!redis?.isOpen) return;

    const jids = await redis.sPop(SYNC_QUEUE_KEY, batchSize);
    if (!jids || jids.length === 0) return;

    console.log(`[StateManager] Syncing ${jids.length} users to DB...`);

    const updates: any[] = [];
    const pipeline = redis.multi();
    jids.forEach(jid => pipeline.hGetAll(`user:${jid}:data`));
    
    // Type d'exécution Redis Multi: tableau de résultats
    const results = await pipeline.exec();

    for (let i = 0; i < jids.length; i++) {
      const data = results[i] as Record<string, string>;

      if (data && Object.keys(data).length > 0) {
        updates.push({
          jid: jids[i],
          username: data.last_pushname || 'Inconnu',
          interaction_count: parseInt(data.interaction_count || '0'),
          updated_at: new Date().toISOString()
        });
      }
    }

    if (updates.length > 0 && supabase) {
      const { error } = await supabase.from('users').upsert(updates, { onConflict: 'jid' });
      if (error) {
        console.error('[StateManager] Sync Error:', error);
        // ROLLBACK
        await redis.sAdd(SYNC_QUEUE_KEY, jids as string[]);
      }
    }
  },

  /**
   * Helpers privés pour gérer les types Redis
   */
  _flattenForRedis(obj: any): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined) flat[k] = String(v);
    }
    return flat;
  },

  _unflattenFromRedis(obj: Record<string, string>): Partial<UserData> {
    if (!obj) return {};
    const result: any = {
      ...obj,
      interaction_count: parseInt(obj.interaction_count || '0'),
    };
    
    if (obj.last_seen && !isNaN(obj.last_seen as any)) {
      result.last_seen = parseInt(obj.last_seen);
    }
    return result;
  },

  /**
   * Incrémente l'activité d'un utilisateur DANS un groupe
   */
  async recordGroupActivity(groupJid: string, userJid: string): Promise<void> {
    if (!redis?.isOpen) return;
    const key = `group:${groupJid}:leaderboard`;
    await redis.zIncrBy(key, 1, userJid);
    await redis.expire(key, 86400 * 30);
  },

  /**
   * Récupère le classement (Top Talkers)
   */
  async getGroupLeaderboard(groupJid: string, limit = 10): Promise<LeaderboardEntry[]> {
    if (!redis?.isOpen) return [];
    const key = `group:${groupJid}:leaderboard`;
    const result = await redis.zRangeWithScores(key, 0, limit - 1, {
      REV: true
    });
    return result;
  },

  /**
   * Récupère le score spécifique d'un utilisateur dans un groupe
   */
  async getUserGroupScore(groupJid: string, userJid: string): Promise<number> {
    if (!redis?.isOpen) return 0;
    const key = `group:${groupJid}:leaderboard`;
    const score = await redis.zScore(key, userJid);
    return parseInt(score || '0');
  }
};
