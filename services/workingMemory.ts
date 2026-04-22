/**
 * services/workingMemory.ts
 * Service de mémoire de travail (Working Memory) avec Redis Cloud
 * Gère le contexte éphémère, les permissions, l'anti-delete et la vélocité.
 */

import { redis, ensureConnected, checkHealth as redisCheckHealth } from './redisClient.js';
import { RedisHealth } from './redisClient.js';

export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface VelocityInfo {
  velocity: number;
  mode: 'solo' | 'calm' | 'active' | 'chaos';
  uniqueSenders: number;
}

export interface ReplyStrategy {
  useQuote: boolean;
  useMention: boolean;
  reason: string;
}

export interface InteractionInfo {
  user: string;
  timestamp: number;
}

export const workingMemory = {
  /**
   * Ajoute un message au contexte éphémère
   */
  async addMessage(
    chatId: string, 
    role: 'user' | 'assistant', 
    content: string, 
    speakerHash: string | null = null, 
    speakerName: string | null = null
  ): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;

      let formattedContent = content;
      if (role === 'user' && speakerHash && speakerName) {
        formattedContent = `[${speakerName}] [${speakerHash}]: ${content}`;
      }

      const key = `chat:${chatId}:context`;
      const message = JSON.stringify({ role, content: formattedContent, timestamp: Date.now() });

      await redis.rPush(key, message);
      await redis.lTrim(key, -15, -1);
      await redis.expire(key, 900); // 15 minutes
    } catch (error: any) {
      console.error('[WorkingMemory] addMessage error:', error.message);
    }
  },

  /**
   * Récupère le contexte récent
   */
  async getContext(chatId: string): Promise<MemoryMessage[]> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return [];

      const key = `chat:${chatId}:context`;
      const logs = await redis.lRange(key, 0, -1);

      return logs.map(log => JSON.parse(log) as MemoryMessage);
    } catch (error: any) {
      console.error('[WorkingMemory] getContext error:', error.message);
      return [];
    }
  },

  /**
   * Nettoie le contexte
   */
  async clearContext(chatId: string): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;
      await redis.del(`chat:${chatId}:context`);
    } catch (error: any) {
      console.error('[WorkingMemory] clearContext error:', error.message);
    }
  },

  /**
   * Vérifie l'état de santé de Redis
   */
  async checkHealth(): Promise<RedisHealth> {
    try {
      await ensureConnected();
    } catch (e) {}
    return await redisCheckHealth();
  },

  /**
   * Mute un utilisateur temporairement
   */
  async muteUser(groupJid: string, userJid: string, durationMinutes: number): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;
      const key = `mute:${groupJid}:${userJid}`;
      await redis.set(key, '1', { EX: durationMinutes * 60 });
    } catch (error: any) {
      console.error('[WorkingMemory] muteUser error:', error.message);
    }
  },

  /**
   * Vérifie si un utilisateur est mute
   */
  async isMuted(groupJid: string, userJid: string): Promise<boolean> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return false;
      const key = `mute:${groupJid}:${userJid}`;
      return (await redis.exists(key)) === 1;
    } catch (error: any) {
      console.error('[WorkingMemory] isMuted error:', error.message);
      return false;
    }
  },

  /**
   * Définit les permissions audio pour un groupe
   */
  async setAudioPermission(groupJid: string, permission: 'all' | 'admins_only' | 'none'): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;
      const key = `audio_perm:${groupJid}`;
      await redis.set(key, permission);
    } catch (error: any) {
      console.error('[WorkingMemory] setAudioPermission error:', error.message);
    }
  },

  /**
   * Récupère les permissions audio pour un groupe
   */
  async getAudioPermission(groupJid: string): Promise<string> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return 'all';
      const key = `audio_perm:${groupJid}`;
      const perm = await redis.get(key);
      return perm || 'all';
    } catch (error: any) {
      console.error('[WorkingMemory] getAudioPermission error:', error.message);
      return 'all';
    }
  },

  /**
   * Vérifie si les vocaux en PV sont désactivés globalement
   */
  async isPvAudioDisabled(): Promise<boolean> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return false;
      const key = 'global:pv_audio_disabled';
      const val = await redis.get(key);
      return val === '1';
    } catch (error: any) {
      console.error('[WorkingMemory] isPvAudioDisabled error:', error.message);
      return false;
    }
  },

  /**
   * Active/désactive les vocaux en PV globalement
   */
  async setPvAudioDisabled(disabled: boolean): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;
      const key = 'global:pv_audio_disabled';
      if (disabled) {
        await redis.set(key, '1');
      } else {
        await redis.del(key);
      }
    } catch (error: any) {
      console.error('[WorkingMemory] setPvAudioDisabled error:', error.message);
    }
  },

  /**
   * Stocke un message pour l'anti-delete
   */
  async storeMessage(chatId: string, messageId: string, messageData: any): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;

      const key = `msg:${chatId}:${messageId}`;
      const data = JSON.stringify({
        ...messageData,
        storedAt: Date.now()
      });

      await redis.set(key, data, { EX: 86400 }); // 24h
    } catch (error: any) {
      console.error('[WorkingMemory] storeMessage error:', error.message);
    }
  },

  /**
   * Récupère un message stocké
   */
  async getStoredMessage(chatId: string, messageId: string): Promise<any | null> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return null;

      const key = `msg:${chatId}:${messageId}`;
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      console.error('[WorkingMemory] getStoredMessage error:', error.message);
      return null;
    }
  },

  /**
   * Marque un message comme supprimé
   */
  async trackDeletedMessage(chatId: string, messageId: string, messageData: any): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;

      const listKey = `deleted:${chatId}`;
      const entry = JSON.stringify({
        messageId,
        ...messageData,
        deletedAt: Date.now()
      });

      await redis.lPush(listKey, entry);
      await redis.lTrim(listKey, 0, 49);
      await redis.expire(listKey, 604800); // 7 jours
    } catch (error: any) {
      console.error('[WorkingMemory] trackDeletedMessage error:', error.message);
    }
  },

  /**
   * Récupère les messages supprimés d'un groupe
   */
  async getDeletedMessages(chatId: string, limit = 10): Promise<any[]> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return [];

      const listKey = `deleted:${chatId}`;
      const entries = await redis.lRange(listKey, 0, limit - 1);

      return entries.map(e => JSON.parse(e));
    } catch (error: any) {
      console.error('[WorkingMemory] getDeletedMessages error:', error.message);
      return [];
    }
  },

  /**
   * Active/désactive l'anti-delete pour un groupe
   */
  async setAntiDeleteEnabled(chatId: string, enabled: boolean): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;
      const key = `antidelete:${chatId}`;
      await redis.set(key, enabled ? '1' : '0');
    } catch (error: any) {
      console.error('[WorkingMemory] setAntiDeleteEnabled error:', error.message);
    }
  },

  /**
   * Vérifie si l'anti-delete est activé pour un groupe
   */
  async isAntiDeleteEnabled(chatId: string): Promise<boolean> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return false;
      const key = `antidelete:${chatId}`;
      const val = await redis.get(key);
      return val === '1';
    } catch (error: any) {
      console.error('[WorkingMemory] isAntiDeleteEnabled error:', error.message);
      return false;
    }
  },

  /**
   * Enregistre un message pour le calcul de vélocité
   */
  async trackMessage(chatId: string, senderId: string): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;

      const now = Date.now();
      const velocityKey = `velocity:${chatId}`;
      const sendersKey = `velocity:${chatId}:senders`;

      await redis.zAdd(velocityKey, { score: now, value: `${now}:${senderId}` });
      await redis.sAdd(sendersKey, senderId);

      await redis.expire(velocityKey, 120);
      await redis.expire(sendersKey, 120);

      const oneMinuteAgo = now - 60000;
      await redis.zRemRangeByScore(velocityKey, '-inf', oneMinuteAgo);
    } catch (error: any) {
      console.error('[WorkingMemory] trackMessage error:', error.message);
    }
  },

  /**
   * Calcule la vélocité du chat
   */
  async getChatVelocity(chatId: string): Promise<VelocityInfo> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return { velocity: 0, mode: 'calm', uniqueSenders: 0 };

      const velocityKey = `velocity:${chatId}`;
      const sendersKey = `velocity:${chatId}:senders`;

      const messageCount = await redis.zCard(velocityKey);
      const uniqueSenders = await redis.sCard(sendersKey);

      let mode: 'solo' | 'calm' | 'active' | 'chaos' = 'calm';
      if (uniqueSenders <= 1) {
        mode = 'solo';
      } else if (messageCount > 10) {
        mode = 'chaos';
      } else if (messageCount > 2) {
        mode = 'active';
      }

      return { velocity: messageCount, mode, uniqueSenders };
    } catch (error: any) {
      console.error('[WorkingMemory] getChatVelocity error:', error.message);
      return { velocity: 0, mode: 'calm', uniqueSenders: 0 };
    }
  },

  /**
   * Détermine la stratégie de réponse basée sur la vélocité
   */
  async getReplyStrategy(chatId: string, originalMessage: any = null): Promise<ReplyStrategy> {
    const { velocity, mode, uniqueSenders } = await this.getChatVelocity(chatId);

    const strategy: ReplyStrategy = {
      useQuote: false,
      useMention: false,
      reason: `Mode: ${mode} (${velocity} msg/min, ${uniqueSenders} utilisateurs)`
    };

    switch (mode) {
      case 'solo':
        strategy.reason = `🧘 Solo: conversation directe`;
        break;
      case 'calm':
        strategy.reason = `🧘 Calme: ${velocity} msg/min`;
        break;
      case 'active':
        strategy.useQuote = true;
        strategy.reason = `💬 Actif: ${velocity} msg/min - Citation activée`;
        break;
      case 'chaos':
        strategy.useQuote = true;
        strategy.useMention = true;
        strategy.reason = `🔥 Chaos: ${velocity} msg/min - Citation + Mention`;
        break;
    }

    return strategy;
  },

  /**
   * Enregistre la dernière interaction du bot
   */
  async setLastInteraction(chatId: string, userJid: string): Promise<void> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return;

      const key = `chat:${chatId}:last_interaction`;
      const data = JSON.stringify({
        user: userJid,
        timestamp: Date.now()
      });

      await redis.set(key, data, { EX: 180 }); // 3 minutes
    } catch (error: any) {
      console.error('[WorkingMemory] setLastInteraction error:', error.message);
    }
  },

  /**
   * Récupère la dernière interaction du bot
   */
  async getLastInteraction(chatId: string): Promise<InteractionInfo | null> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return null;

      const key = `chat:${chatId}:last_interaction`;
      const data = await redis.get(key);

      return data ? JSON.parse(data) : null;
    } catch (error: any) {
      console.error('[WorkingMemory] getLastInteraction error:', error.message);
      return null;
    }
  },

  /**
   * Enregistre l'activité d'un groupe
   */
  async trackGroupActivity(chatId: string): Promise<void> {
    if (!chatId.endsWith('@g.us')) return;
    try {
      await ensureConnected();
      if (!redis.isOpen) return;
      await redis.zAdd('groups:activity', [{
        score: Date.now(),
        value: chatId
      }]);
    } catch (e: any) {
      console.error('[WorkingMemory] Erreur trackGroupActivity:', e.message);
    }
  },

  /**
   * Récupère les groupes inactifs
   */
  async getInactiveGroups(thresholdMinutes = 180): Promise<string[]> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return [];

      const cutoff = Date.now() - (thresholdMinutes * 60 * 1000);
      return await redis.zRangeByScore('groups:activity', '-inf', cutoff);
    } catch (e: any) {
      console.error('[WorkingMemory] Erreur getInactiveGroups:', e.message);
      return [];
    }
  },

  /**
   * Met à jour le niveau d'agacement
   */
  async updateAnnoyance(chatId: string, userId: string, delta: number): Promise<number> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return 0;

      const key = `emotion:${chatId}:${userId}:annoyance`;
      let current = parseInt((await redis.get(key)) || '0');
      let newValue = Math.max(0, Math.min(100, current + delta));

      if (newValue === 0) {
        await redis.del(key);
      } else {
        await redis.set(key, newValue.toString(), { EX: 3600 });
      }

      return newValue;
    } catch (error: any) {
      console.error('[WorkingMemory] updateAnnoyance error:', error.message);
      return 0;
    }
  },

  /**
   * Récupère le niveau d'agacement
   */
  async getAnnoyance(chatId: string, userId: string): Promise<number> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return 0;

      const key = `emotion:${chatId}:${userId}:annoyance`;
      const val = await redis.get(key);
      return val ? parseInt(val) : 0;
    } catch (error: any) {
      console.error('[WorkingMemory] getAnnoyance error:', error.message);
      return 0;
    }
  },

  /**
   * Récupère les groupes actifs récemment
   */
  async getActiveGroups(withinMinutes = 30): Promise<string[]> {
    try {
      await ensureConnected();
      if (!redis.isOpen) return [];

      const cutoff = Date.now() - (withinMinutes * 60 * 1000);
      const keys = await redis.keys('group:*:lastActivity');
      const activeGroups = [];

      for (const key of keys) {
        const timestamp = await redis.get(key);
        if (timestamp && parseInt(timestamp) > cutoff) {
          const groupId = key.replace('group:', '').replace(':lastActivity', '');
          activeGroups.push(groupId);
        }
      }

      return activeGroups;
    } catch (error: any) {
      console.error('[WorkingMemory] getActiveGroups error:', error.message);
      return [];
    }
  }
};

export default workingMemory;
