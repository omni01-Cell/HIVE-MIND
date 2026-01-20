// services/consciousnessService.js
// LE MODULE DE CONSCIENCE (Global Workspace) - 2026 Architecture
// Centralise : Identité, Émotions (Annoyance), Mission, et État cognitif.

import { redis } from './redisClient.js';
import { workingMemory } from './workingMemory.js';
import { extractNumericId } from '../utils/jidHelper.js';
import { userService } from './userService.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Chargement du persona depuis profile.json
let personaName = 'Erina Nakiri'; // Fallback par défaut
try {
    const persona = JSON.parse(readFileSync(join(__dirname, '..', 'persona', 'profile.json'), 'utf-8'));
    personaName = persona.name || personaName;
} catch (e) {
    console.warn('[Consciousness] Impossible de charger profile.json, utilisation du nom par défaut.');
}

class ConsciousnessService {
    constructor() {
        this.identity = {
            name: 'Erina',
            jid: null, // "xxx@s.whatsapp.net"
            lid: null, // "xxx@lid"
            phoneNumber: null
        };
        this.startTime = Date.now();
    }

    /**
     * Initialise l'identité du bot (Appelé par le transport au démarrage)
     */
    async setIdentity(user) {
        if (!user) return;

        // Extraction du numéro de téléphone (sans le device ID et suffixe)
        this.identity.phoneNumber = extractNumericId(user.id);

        // Construction du JID canonique (format: phoneNumber@s.whatsapp.net)
        // user.id peut être "22569456432:0@s.whatsapp.net", on veut juste "22569456432@s.whatsapp.net"
        this.identity.jid = `${this.identity.phoneNumber}@s.whatsapp.net`;
        this.identity.lid = user.lid;

        // Nom d'identité: TOUJOURS depuis profile.json (persona configuré)
        // Le JID est dynamique (Baileys), mais le NOM est l'identité persona fixe
        this.identity.name = personaName;

        console.log(`[Consciousness] 🧠 JE SUIS : ${this.identity.name} (${this.identity.jid})`);

        // [USER DB] S'assurer que le bot existe dans la table users
        try {
            // Vérifier si déjà enregistré (évite les doublons)
            const existing = await userService.getProfile(this.identity.jid);
            if (existing && existing.interaction_count > 0) {
                console.log('[Consciousness] ✅ Identité déjà présente en DB.');
            } else {
                await userService.recordInteraction(this.identity.jid, this.identity.name);
                console.log('[Consciousness] ✅ Identité enregistrée dans la DB User.');
            }
        } catch (e) {
            console.error('[Consciousness] ❌ Erreur enregistrement DB:', e.message);
        }
    }

    /**
     * Récupère l'état global de la conscience pour un chat donné
     * C'est le "snapshot" de l'esprit du bot à l'instant T
     */
    async getGlobalState(chatId, senderJid) {
        // 1. Récupérer l'émotion (Agacement)
        const annoyance = await this.getAnnoyance(chatId, senderJid);

        // 2. Récupérer la mission (si groupe)
        let mission = null;
        if (chatId.endsWith('@g.us')) {
            const { groupService } = await import('./groupService.js'); // Lazy import pour éviter cycles
            mission = await groupService.getBotMission(chatId);
        }

        // [ACTIVE MEMORY] 3. Récupérer les souvenirs récents pertinents (RAG)
        // On récupère les 3 dernières "pensées" ou faits marquants pour avoir un fil conducteur
        let recentMemories = [];
        try {
            const { semanticMemory } = await import('./memory.js');
            // On cherche ce qui est relié au contexte immédiat ou "self"
            recentMemories = await semanticMemory.recall(chatId, "contexte actuel", 3);
        } catch (e) { /* Ignore */ }

        // 4. Synthèse
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

    /**
     * Déduit l'humeur du score d'agacement
     */
    _deriveMood(annoyance) {
        if (annoyance > 80) return 'FURIEUX 🤬';
        if (annoyance > 50) return 'AGACÉ 😤';
        if (annoyance > 20) return 'DÉRANGÉ 😒';
        return 'CALME 😌';
    }

    // =================================================================
    // MIGRATION EMOTIONAL ENGINE (Depuis workingMemory)
    // =================================================================

    /**
     * Met à jour le niveau d'agacement
     */
    async updateAnnoyance(chatId, userId, delta) {
        try {
            if (!redis.isReady) return 0;

            const key = `consciousness:${chatId}:${userId}:annoyance`; // New Key Namespace

            // Migration "lazy" : Si ancienne clé existe, on la récupère
            const oldKey = `emotion:${chatId}:${userId}:annoyance`;
            let current = 0;

            const oldVal = await redis.get(oldKey);
            if (oldVal) {
                current = parseInt(oldVal);
                await redis.del(oldKey); // On nettoie l'ancien
            } else {
                current = parseInt((await redis.get(key)) || '0');
            }

            // Calcul
            let newValue = current + delta;
            newValue = Math.max(0, Math.min(100, newValue));

            if (newValue === 0) {
                await redis.del(key);
            } else {
                await redis.set(key, newValue.toString(), { EX: 3600 }); // TTL 1h
            }

            if (Math.abs(newValue - current) >= 10 || newValue > 50) {
                console.log(`[Consciousness] 🧠 Emotion Shift (${userId.split('@')[0]}): ${current} -> ${newValue} (${this._deriveMood(newValue)})`);
            }

            return newValue;
        } catch (error) {
            console.error('[Consciousness] updateAnnoyance error:', error.message);
            return 0;
        }
    }

    /**
     * Récupère le niveau d'agacement
     */
    async getAnnoyance(chatId, userId) {
        try {
            if (!redis.isReady) return 0;
            const key = `consciousness:${chatId}:${userId}:annoyance`;
            const val = await redis.get(key);

            // Fallback compatibilité ancienne clé (au cas où)
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
