/**
 * services/consciousnessService.ts
 * LE MODULE DE CONSCIENCE (Global Workspace)
 * Centralise l'identité, les émotions, la mission et l'état cognitif du bot.
 */

import { redis } from './redisClient.js';
import { extractNumericId } from '../utils/jidHelper.js';
import { userService } from './userService.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BotIdentity {
  name: string;
  jid: string | null;
  lid: string | null;
  phoneNumber: string | null;
}

export interface EmotionalState {
  annoyance: number;
  mood: string;
}

export interface GlobalState {
  identity: BotIdentity;
  emotionalState: EmotionalState;
  mission: any;
  activeMemory: string[];
  uptime: number;
}

// Chargement du persona depuis profile.json
let personaName = 'Erina Nakiri';
try {
  const profilePath = join(__dirname, '..', 'persona', 'profile.json');
  const persona = JSON.parse(readFileSync(profilePath, 'utf-8'));
  personaName = persona.name || personaName;
} catch (e) {
  console.warn('[Consciousness] Impossible de charger profile.json');
}

class ConsciousnessService {
  private identity: BotIdentity = {
    name: personaName,
    jid: null,
    lid: null,
    phoneNumber: null
  };
  private startTime: number = Date.now();

  /**
   * Initialise l'identité du bot
   */
  public async setIdentity(user: { id: string; lid: string }): Promise<void> {
    if (!user) return;

    this.identity.phoneNumber = extractNumericId(user.id);
    this.identity.jid = `${this.identity.phoneNumber}@s.whatsapp.net`;
    this.identity.lid = user.lid;
    this.identity.name = personaName;

    console.log(`[Consciousness] 🧠 JE SUIS : ${this.identity.name} (${this.identity.jid})`);

    try {
      const existing = await userService.getProfile(this.identity.jid);
      if (!(existing && existing.interaction_count > 0)) {
        await userService.recordInteraction(this.identity.jid, this.identity.name);
        console.log('[Consciousness] ✅ Identité enregistrée dans la DB User.');
      }
    } catch (e: any) {
      console.error('[Consciousness] ❌ Erreur enregistrement DB:', e.message);
    }
  }

  /**
   * Récupère l'état global de la conscience
   */
  public async getGlobalState(chatId: string, senderJid: string): Promise<GlobalState> {
    const annoyance = await this.getAnnoyance(chatId, senderJid);

    let mission: any = null;
    if (chatId.endsWith('@g.us')) {
      // Lazy import pour éviter les dépendances circulaires
      const { groupService } = await import('./groupService.js');
      mission = await groupService.getBotMission(chatId);
    }

    let recentMemories: any[] = [];
    try {
      const { semanticMemory } = await import('./memory.js');
      recentMemories = await semanticMemory.recall(chatId, "contexte actuel", 3);
    } catch (e) {}

    return {
      identity: this.identity,
      emotionalState: {
        annoyance: annoyance,
        mood: this._deriveMood(annoyance)
      },
      mission: mission,
      activeMemory: recentMemories.map(m => m.content),
      uptime: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  private _deriveMood(annoyance: number): string {
    if (annoyance > 80) return 'FURIEUX 🤬';
    if (annoyance > 50) return 'AGACÉ 😤';
    if (annoyance > 20) return 'DÉRANGÉ 😒';
    return 'CALME 😌';
  }

  /**
   * Met à jour le niveau d'agacement
   */
  public async updateAnnoyance(chatId: string, userId: string, delta: number): Promise<number> {
    try {
      if (!redis.isOpen) return 0;

      const key = `consciousness:${chatId}:${userId}:annoyance`;
      const oldKey = `emotion:${chatId}:${userId}:annoyance`;
      let current = 0;

      const oldVal = await redis.get(oldKey);
      if (oldVal) {
        current = parseInt(oldVal);
        await redis.del(oldKey);
      } else {
        const val = await redis.get(key);
        current = parseInt(val || '0');
      }

      let newValue = Math.max(0, Math.min(100, current + delta));

      if (newValue === 0) {
        await redis.del(key);
      } else {
        await redis.set(key, newValue.toString(), { EX: 3600 });
      }

      if (Math.abs(newValue - current) >= 10 || newValue > 50) {
        console.log(`[Consciousness] 🧠 Emotion Shift (${userId.split('@')[0]}): ${current} -> ${newValue} (${this._deriveMood(newValue)})`);
      }

      return newValue;
    } catch (error: any) {
      console.error('[Consciousness] updateAnnoyance error:', error.message);
      return 0;
    }
  }

  /**
   * Récupère le niveau d'agacement
   */
  public async getAnnoyance(chatId: string, userId: string): Promise<number> {
    try {
      if (!redis.isOpen) return 0;
      const key = `consciousness:${chatId}:${userId}:annoyance`;
      const val = await redis.get(key);

      if (!val) {
        const oldKey = `emotion:${chatId}:${userId}:annoyance`;
        const oldVal = await redis.get(oldKey);
        if (oldVal) return parseInt(oldVal);
      }

      return val ? parseInt(val) : 0;
    } catch (error) {
      return 0;
    }
  }
}

export const consciousness = new ConsciousnessService();
export default consciousness;
