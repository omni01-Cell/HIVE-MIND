// services/userService.js
// ============================================================================
// SERVICE UTILISATEUR UNIFIÉ (Façade)
// ============================================================================
//
// RÔLE: Interface principale pour la gestion des utilisateurs.
// Délègue aux services spécialisés:
// - StateManager: Gestion d'état (cache Redis, sync Supabase)
// - IdentityMap: Résolution LID <-> JID
//
// ============================================================================

import { StateManager } from './state/StateManager.js';
import { IdentityMap } from './state/IdentityMap.js';
import { supabase } from './supabase.js';
import { redis } from './redisClient.js';

// ============================================================================
// JSDoc Type Definitions
// ============================================================================

/**
 * @typedef {Object} UserProfile
 * @property {string} jid - WhatsApp JID (ex: "1234567890@s.whatsapp.net")
 * @property {string[]} names - Liste des noms connus (pushnames)
 * @property {number} interaction_count - Nombre total d'interactions
 * @property {string} [last_seen] - Dernière activité (ISO timestamp)
 */

/**
 * @typedef {Object} UserCandidate
 * @property {string} jid - WhatsApp JID
 * @property {string} name - Nom correspondant
 * @property {number} confidence - Score de confiance (0-1)
 */

/**
 * @typedef {Object} UserState
 * @property {string} jid - WhatsApp JID
 * @property {string} [username] - Nom d'utilisateur
 * @property {string} [last_pushname] - Dernier pushname WhatsApp
 * @property {number} [interaction_count] - Compteur d'interactions
 * @property {string} [last_seen] - Dernière activité
 * @property {string} [hash] - Hash unique (3 caractères)
 */

// ============================================================================
// User Service Implementation
// ============================================================================

/**
 * Service utilisateur - Point d'entrée principal pour la gestion des profils
 * @namespace userService
 */
export const userService = {
    /**
     * Enregistre une interaction utilisateur via StateManager (Buffer Redis)
     * @param {string} identifier 
     * @param {string} pushName 
     * @param {string} groupJid - Optionnel
     */
    async recordInteraction(identifier, pushName, groupJid = null) {
        try {
            // 1. Résolution d'identité (Tenter de trouver le vrai JID si c'est un LID)
            // Cela évite de créditer un "Ghost User" si on connait déjà le vrai compte
            const resolvedJid = await this.resolveLid(identifier) || identifier;

            await StateManager.updateUserInteraction(resolvedJid, pushName);
        } catch (e) {
            console.error('[UserService] Error recording interaction:', e.message);
        }
    },

    /**
     * Récupère le profil via StateManager (Cache-First)
     * @param {string} identifier 
     * @returns {Promise<Object>}
     */
    async getProfile(identifier) {
        try {
            const user = await StateManager.getUser(identifier);
            return {
                jid: user.jid,
                names: [user.last_pushname || user.username].filter(Boolean),
                interaction_count: user.interaction_count || 0,
                last_seen: user.last_seen
            };
        } catch (e) {
            console.error('[UserService] Error fetching profile:', e.message);
            // Fallback safe
            const fallbackId = identifier ? identifier.split(':')[0] : 'unknown';
            return { jid: fallbackId, names: ['Inconnu'], interaction_count: 0 };
        }
    },

    async registerLid(jid, lid) {
        await IdentityMap.register(jid, lid);
    },

    async resolveLid(identifier) {
        return await IdentityMap.resolve(identifier);
    },

    /**
     * Récupère ou génère le hash unique d'un utilisateur (pour Speaker Injection)
     * @param {string} jid - JID de l'utilisateur
     * @returns {Promise<string>} - Hash de 3 caractères (ex: "A7X")
     */
    async getSpeakerHash(jid) {
        if (!jid) return 'UNK';

        const resolvedJid = await this.resolveLid(jid) || jid;

        try {
            // 1. Check cache Redis
            const cacheKey = `user:${resolvedJid}:data`;
            const cachedHash = await redis?.hGet(cacheKey, 'hash');
            if (cachedHash) return cachedHash;

            // 2. Check Supabase
            if (supabase) {
                const { data } = await supabase
                    .from('users')
                    .select('hash')
                    .eq('jid', resolvedJid)
                    .single();

                if (data?.hash) {
                    // Cache it
                    await redis?.hSet(cacheKey, 'hash', data.hash);
                    return data.hash;
                }
            }

            // 3. Generate and store
            const crypto = await import('crypto');
            const hash = crypto.createHash('md5')
                .update(resolvedJid)
                .digest('hex')
                .substring(0, 3)
                .toUpperCase();

            // Store in cache
            await redis?.hSet(cacheKey, 'hash', hash);

            // Store in Supabase (upsert)
            if (supabase) {
                await supabase
                    .from('users')
                    .upsert({ jid: resolvedJid, hash }, { onConflict: 'jid' })
                    .select();
            }

            return hash;
        } catch (e) {
            console.error('[UserService] getSpeakerHash error:', e.message);
            // Fallback: generate hash without storing
            const crypto = await import('crypto');
            return crypto.createHash('md5')
                .update(resolvedJid)
                .digest('hex')
                .substring(0, 3)
                .toUpperCase();
        }
    },

    /**
     * Force la synchronisation (Wrapper vers StateManager)
     */
    async flushAll() {
        return await StateManager.processSyncQueue(1000);
    },

    // ======== FONCTIONS LEGACY / NON-MIGRÉES ========
    // Ces fonctions accèdent encore directement à Supabase/Redis pour des cas spécifiques

    /**
     * Vérifie si un utilisateur a été soft-deleted
     */
    async isDeleted(userJid) {
        // Soft delete non supporté dans le schéma V2 actuel
        return false;
    },

    /**
     * Soft delete un utilisateur
     */
    async softDelete(userJid) {
        // Soft delete non supporté
        console.warn('[UserService] Soft delete not supported in V2 schema');
        return false;
    },

    async listDeleted(limit = 20) {
        // Non supporté
        return [];
    },

    // ======== RESOLUTION NOM -> JID (Gardé tel quel car lecture seule complexe) ========
    async resolveByName(name, groupJid = null) {
        if (!name || name.length < 2) return [];
        const searchName = name.toLowerCase().trim();
        const candidates = [];

        try {
            if (supabase) {
                const { data: exactMatches } = await supabase
                    .from('users')
                    .select('jid, username, interaction_count') // last_pushname n'existe pas dans le schema user ? Attends, flattenForRedis utilise last_pushname mais DB user a interaction_count et username.
                    // Verification schema: users table a username. Pas last_pushname. 
                    // Mais StateManager sync username = last_pushname. Donc c'est bon.
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

            // Filtrage groupe (Redis)
            if (groupJid && candidates.length > 0) {
                const groupKey = `group:${groupJid}:meta`;
                const membersJson = await redis?.hGet(groupKey, 'members');
                if (membersJson) {
                    const members = JSON.parse(membersJson);
                    const memberJids = new Set(members.map(m => m.jid));
                    return candidates.filter(c => memberJids.has(c.jid)).sort((a, b) => b.confidence - a.confidence);
                }
            }
            return candidates.sort((a, b) => b.confidence - a.confidence);

        } catch (error) {
            console.error('[UserService] resolveByName error:', error.message);
            return [];
        }
    },

    async resolveToJid(name, groupJid = null) {
        const candidates = await this.resolveByName(name, groupJid);
        if (candidates.length > 0 && candidates[0].confidence > 0.7) return candidates[0].jid;
        return null;
    }
};

export default userService;
