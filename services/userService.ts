/**
 * services/userService.ts
 * SERVICE UTILISATEUR UNIFIÉ (Façade)
 * Interface principale pour la gestion des profils utilisateur
 */

import { StateManager, UserData } from './state/StateManager.js';
import { IdentityMap } from './state/IdentityMap.js';
import { supabase } from './supabase.js';
import { redis } from './redisClient.js';
import { createHash } from 'crypto';

export interface UserProfile {
  jid: string;
  names: string[];
  interaction_count: number;
  last_seen?: number | string;
}

export interface UserCandidate {
  jid: string;
  name: string;
  confidence: number;
}

/**
 * Service utilisateur - Point d'entrée principal pour la gestion des profils
 */
export const userService = {
  /**
   * Enregistre une interaction utilisateur via StateManager (Buffer Redis)
   */
  async recordInteraction(identifier: string, pushName: string | null, groupJid: string | null = null): Promise<void> {
    try {
      const resolvedJid = await IdentityMap.resolve(identifier) || identifier;
      await StateManager.updateUserInteraction(resolvedJid, pushName);
    } catch (e: any) {
      console.error('[UserService] Error recording interaction:', e.message);
    }
  },

  /**
   * Récupère le profil via StateManager (Cache-First)
   */
  async getProfile(identifier: string): Promise<UserProfile> {
    try {
      const user = await StateManager.getUser(identifier);
      return {
        jid: user.jid,
        names: [user.last_pushname || user.username].filter((n): n is string => !!n),
        interaction_count: user.interaction_count || 0,
        last_seen: user.last_seen
      };
    } catch (e: any) {
      console.error('[UserService] Error fetching profile:', e.message);
      const fallbackId = identifier ? identifier.split(':')[0] : 'unknown';
      return { jid: fallbackId, names: ['Inconnu'], interaction_count: 0 };
    }
  },

  /**
   * Enregistre un mapping LID <-> JID
   */
  async registerLid(jid: string, lid: string): Promise<void> {
    await IdentityMap.register(jid, lid);
  },

  /**
   * Résout un LID en JID
   */
  async resolveLid(identifier: string): Promise<string | null> {
    return await IdentityMap.resolve(identifier);
  },

  /**
   * Récupère ou génère le hash unique d'un utilisateur (pour Speaker Injection)
   */
  async getSpeakerHash(jid: string): Promise<string> {
    if (!jid) return 'UNK';

    const resolvedJid = await this.resolveLid(jid) || jid;

    try {
      const cacheKey = `user:${resolvedJid}:data`;
      const cachedHash = await redis?.hGet(cacheKey, 'hash');
      if (cachedHash) return cachedHash;

      if (supabase) {
        const { data } = await supabase
          .from('users')
          .select('hash')
          .eq('jid', resolvedJid)
          .single();

        if (data?.hash) {
          await redis?.hSet(cacheKey, 'hash', data.hash);
          return data.hash;
        }
      }

      const hash = createHash('md5')
        .update(resolvedJid)
        .digest('hex')
        .substring(0, 3)
        .toUpperCase();

      await redis?.hSet(cacheKey, 'hash', hash);

      if (supabase) {
        await supabase
          .from('users')
          .upsert({ jid: resolvedJid, hash }, { onConflict: 'jid' })
          .select();
      }

      return hash;
    } catch (e: any) {
      console.error('[UserService] getSpeakerHash error:', e.message);
      return createHash('md5')
        .update(resolvedJid)
        .digest('hex')
        .substring(0, 3)
        .toUpperCase();
    }
  },

  /**
   * Force la synchronisation de la queue
   */
  async flushAll(): Promise<void> {
    return await StateManager.processSyncQueue(1000);
  },

  /**
   * Résout un nom en JID (avec filtrage groupe optionnel)
   */
  async resolveByName(name: string, groupJid: string | null = null): Promise<UserCandidate[]> {
    if (!name || name.length < 2) return [];
    const searchName = name.toLowerCase().trim();
    const candidates: UserCandidate[] = [];

    try {
      if (supabase) {
        const { data: exactMatches } = await supabase
          .from('users')
          .select('jid, username, interaction_count')
          .or(`username.ilike.${searchName}`)
          .limit(10);

        if (exactMatches) {
          for (const user of exactMatches) {
            const matchedName = user.username || 'Inconnu';
            candidates.push({
              jid: user.jid,
              name: matchedName,
              confidence: matchedName.toLowerCase() === searchName ? 1.0 : 0.9
            });
          }
        }
      }

      if (groupJid && candidates.length > 0) {
        const groupKey = `group:${groupJid}:meta`;
        const membersJson = await redis?.hGet(groupKey, 'members');
        if (membersJson) {
          const members = JSON.parse(membersJson) as { jid: string }[];
          const memberJids = new Set(members.map(m => m.jid));
          return candidates
            .filter(c => memberJids.has(c.jid))
            .sort((a, b) => b.confidence - a.confidence);
        }
      }
      return candidates.sort((a, b) => b.confidence - a.confidence);

    } catch (error: any) {
      console.error('[UserService] resolveByName error:', error.message);
      return [];
    }
  },

  /**
   * Résout un nom en JID (retourne le meilleur match)
   */
  async resolveToJid(name: string, groupJid: string | null = null): Promise<string | null> {
    const candidates = await this.resolveByName(name, groupJid);
    if (candidates.length > 0 && candidates[0].confidence > 0.7) return candidates[0].jid;
    return null;
  }
};

export default userService;
