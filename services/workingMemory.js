// services/workingMemory.js
// Service de mémoire de travail (Working Memory) avec Redis Cloud
// Utilise le client Redis partagé pour éviter les connexions multiples

import { redis, ensureConnected, checkHealth as redisCheckHealth } from './redisClient.js';

export const workingMemory = {
    /**
     * Ajoute un message au contexte éphémère
     * @param {string} chatId 
     * @param {string} role 'user' | 'assistant'
     * @param {string} content 
     * @param {string} speakerHash - Optionnel, hash 3 chars pour identification (groupes)
     * @param {string} speakerName - Optionnel, nom de l'utilisateur (groupes)
     */
    async addMessage(chatId, role, content, speakerHash = null, speakerName = null) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            // [SPEAKER INJECTION] Formater le contenu pour identifier l'auteur dans les groupes
            let formattedContent = content;
            if (role === 'user' && speakerHash && speakerName) {
                formattedContent = `[${speakerName}] [${speakerHash}]: ${content}`;
            }

            const key = `chat:${chatId}:context`;
            const message = JSON.stringify({ role, content: formattedContent, timestamp: Date.now() });

            // On utilise une liste (RPUSH) pour garder l'ordre chronologique
            await redis.rPush(key, message);

            // On limite la liste aux 15 derniers messages pour ne pas saturer le prompt
            await redis.lTrim(key, -15, -1);

            // Expiration automatique après 15 minutes d'inactivité
            await redis.expire(key, 900);
        } catch (error) {
            console.error('[WorkingMemory] addMessage error:', error.message);
        }
    },

    /**
     * Récupère le contexte récent
     * @param {string} chatId 
     * @returns {Promise<Array>}
     */
    async getContext(chatId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const key = `chat:${chatId}:context`;
            const logs = await redis.lRange(key, 0, -1);

            return logs.map(log => JSON.parse(log));
        } catch (error) {
            console.error('[WorkingMemory] getContext error:', error.message);
            return [];
        }
    },

    /**
     * Nettoie le contexte
     * @param {string} chatId 
     */
    async clearContext(chatId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            await redis.del(`chat:${chatId}:context`);
        } catch (error) {
            console.error('[WorkingMemory] clearContext error:', error.message);
        }
    },

    /**
     * Vérifie l'état de santé de Redis
     * @returns {Promise<Object>} Status et métriques
     */
    async checkHealth() {
        try {
            await ensureConnected();
        } catch (e) { /* Ignore error here, checkHealth will report it */ }
        return await redisCheckHealth();
    },

    /**
     * Mute un utilisateur
     * @param {string} groupJid 
     * @param {string} userJid 
     * @param {number} durationMinutes 
     */
    async muteUser(groupJid, userJid, durationMinutes) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            const key = `mute:${groupJid}:${userJid}`;
            await redis.set(key, '1', { EX: durationMinutes * 60 });
        } catch (error) {
            console.error('[WorkingMemory] muteUser error:', error.message);
        }
    },

    /**
     * Vérifie si un utilisateur est mute
     * @param {string} groupJid 
     * @param {string} userJid 
     */
    async isMuted(groupJid, userJid) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return false;
            const key = `mute:${groupJid}:${userJid}`;
            return (await redis.exists(key)) === 1;
        } catch (error) {
            console.error('[WorkingMemory] isMuted error:', error.message);
            return false;
        }
    },

    /**
     * Définit les permissions audio pour un groupe
     * @param {string} groupJid 
     * @param {string} permission 'all' | 'admins_only' | 'none'
     */
    async setAudioPermission(groupJid, permission) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            const key = `audio_perm:${groupJid}`;
            await redis.set(key, permission);
            console.log(`[WorkingMemory] Audio permission set: ${groupJid} → ${permission}`);
        } catch (error) {
            console.error('[WorkingMemory] setAudioPermission error:', error.message);
        }
    },

    /**
     * Récupère les permissions audio pour un groupe
     * @param {string} groupJid 
     * @returns {Promise<string>} 'all' | 'admins_only' | 'none' (default: 'all')
     */
    async getAudioPermission(groupJid) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return 'all';
            const key = `audio_perm:${groupJid}`;
            const perm = await redis.get(key);
            return perm || 'all'; // Default: tout le monde peut envoyer des vocaux
        } catch (error) {
            console.error('[WorkingMemory] getAudioPermission error:', error.message);
            return 'all';
        }
    },

    // ========== ANTI-DELETE (Message Revocation Guard) ==========

    /**
     * Stocke un message pour l'anti-delete
     * @param {string} chatId 
     * @param {string} messageId 
     * @param {Object} messageData { sender, senderName, text, mediaType, timestamp }
     */
    async storeMessage(chatId, messageId, messageData) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const key = `msg:${chatId}:${messageId}`;
            const data = JSON.stringify({
                ...messageData,
                storedAt: Date.now()
            });

            // Stocker avec expiration de 24h
            await redis.set(key, data, { EX: 86400 });
        } catch (error) {
            console.error('[WorkingMemory] storeMessage error:', error.message);
        }
    },

    /**
     * Récupère un message stocké
     * @param {string} chatId 
     * @param {string} messageId 
     * @returns {Promise<Object|null>}
     */
    async getStoredMessage(chatId, messageId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return null;

            const key = `msg:${chatId}:${messageId}`;
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('[WorkingMemory] getStoredMessage error:', error.message);
            return null;
        }
    },

    /**
     * Marque un message comme supprimé et l'ajoute à la liste des suppressions
     * @param {string} chatId 
     * @param {string} messageId 
     * @param {Object} messageData 
     */
    async trackDeletedMessage(chatId, messageId, messageData) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const listKey = `deleted:${chatId}`;
            const entry = JSON.stringify({
                messageId,
                ...messageData,
                deletedAt: Date.now()
            });

            // Ajouter à la liste des messages supprimés
            await redis.lPush(listKey, entry);

            // Garder uniquement les 50 derniers
            await redis.lTrim(listKey, 0, 49);

            // Expiration de 7 jours
            await redis.expire(listKey, 604800);

            console.log(`[AntiDelete] Message ${messageId.substring(0, 10)}... tracked as deleted`);
        } catch (error) {
            console.error('[WorkingMemory] trackDeletedMessage error:', error.message);
        }
    },

    /**
     * Récupère les messages supprimés d'un groupe
     * @param {string} chatId 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async getDeletedMessages(chatId, limit = 10) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const listKey = `deleted:${chatId}`;
            const entries = await redis.lRange(listKey, 0, limit - 1);

            return entries.map(e => JSON.parse(e));
        } catch (error) {
            console.error('[WorkingMemory] getDeletedMessages error:', error.message);
            return [];
        }
    },

    /**
     * Active/désactive l'anti-delete pour un groupe
     * @param {string} chatId 
     * @param {boolean} enabled 
     */
    async setAntiDeleteEnabled(chatId, enabled) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            const key = `antidelete:${chatId}`;
            await redis.set(key, enabled ? '1' : '0');
        } catch (error) {
            console.error('[WorkingMemory] setAntiDeleteEnabled error:', error.message);
        }
    },

    /**
     * Vérifie si l'anti-delete est activé pour un groupe
     * @param {string} chatId 
     * @returns {Promise<boolean>}
     */
    async isAntiDeleteEnabled(chatId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return false;
            const key = `antidelete:${chatId}`;
            const val = await redis.get(key);
            return val === '1';
        } catch (error) {
            console.error('[WorkingMemory] isAntiDeleteEnabled error:', error.message);
            return false;
        }
    },

    // ========== VELOCITY TRACKING (Adaptive Reply System) ==========

    /**
     * Enregistre un message pour le calcul de vélocité
     * @param {string} chatId 
     * @param {string} senderId 
     */
    async trackMessage(chatId, senderId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const now = Date.now();
            const velocityKey = `velocity:${chatId}`;
            const sendersKey = `velocity:${chatId}:senders`;

            // Stocker le timestamp du message (ZADD avec score = timestamp)
            await redis.zAdd(velocityKey, { score: now, value: `${now}:${senderId}` });

            // Tracker les senders uniques (pour détecter le mode "solo")
            await redis.sAdd(sendersKey, senderId);

            // TTL de 2 minutes (on ne garde que les messages récents)
            await redis.expire(velocityKey, 120);
            await redis.expire(sendersKey, 120);

            // Nettoyer les messages > 60 secondes pour le calcul de vélocité
            const oneMinuteAgo = now - 60000;
            await redis.zRemRangeByScore(velocityKey, '-inf', oneMinuteAgo);
        } catch (error) {
            console.error('[WorkingMemory] trackMessage error:', error.message);
        }
    },

    /**
     * Calcule la vélocité du chat (messages par minute)
     * @param {string} chatId 
     * @returns {Promise<{velocity: number, mode: string, uniqueSenders: number}>}
     */
    async getChatVelocity(chatId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return { velocity: 0, mode: 'calm', uniqueSenders: 0 };

            const velocityKey = `velocity:${chatId}`;
            const sendersKey = `velocity:${chatId}:senders`;

            // Compter les messages de la dernière minute
            const messageCount = await redis.zCard(velocityKey);

            // Compter les senders uniques
            const uniqueSenders = await redis.sCard(sendersKey);

            // Déterminer le mode
            let mode = 'calm';
            if (uniqueSenders <= 1) {
                mode = 'solo'; // Conversation privée ou 1 seul utilisateur actif
            } else if (messageCount > 10) {
                mode = 'chaos';
            } else if (messageCount > 2) {
                mode = 'active';
            }

            return {
                velocity: messageCount,
                mode,
                uniqueSenders
            };
        } catch (error) {
            console.error('[WorkingMemory] getChatVelocity error:', error.message);
            return { velocity: 0, mode: 'calm', uniqueSenders: 0 };
        }
    },

    /**
     * Détermine la stratégie de réponse basée sur la vélocité
     * @param {string} chatId 
     * @param {Object} originalMessage - Le message original (pour quoted reply)
     * @returns {Promise<{useQuote: boolean, useMention: boolean, reason: string}>}
     */
    async getReplyStrategy(chatId, originalMessage = null) {
        const { velocity, mode, uniqueSenders } = await this.getChatVelocity(chatId);

        let strategy = {
            useQuote: false,
            useMention: false,
            reason: `Mode: ${mode} (${velocity} msg/min, ${uniqueSenders} utilisateurs)`
        };

        switch (mode) {
            case 'solo':
                // Conversation directe, pas besoin de citation
                strategy.useQuote = false;
                strategy.useMention = false;
                strategy.reason = `🧘 Solo: conversation directe`;
                break;

            case 'calm':
                // Groupe calme, texte simple
                strategy.useQuote = false;
                strategy.useMention = false;
                strategy.reason = `🧘 Calme: ${velocity} msg/min`;
                break;

            case 'active':
                // Groupe actif, citer le message pour clarté
                strategy.useQuote = true;
                strategy.useMention = false;
                strategy.reason = `💬 Actif: ${velocity} msg/min - Citation activée`;
                break;

            case 'chaos':
                // Groupe en chaos, citer + mentionner pour notification
                strategy.useQuote = true;
                strategy.useMention = true;
                strategy.reason = `🔥 Chaos: ${velocity} msg/min - Citation + Mention`;
                break;
        }

        console.log(`[Velocity] ${chatId.substring(0, 15)}... → ${strategy.reason}`);
        return strategy;
    },

    // ========== CONTEXTUAL CONVERSATION (Follow-up Mode) ==========

    /**
     * Enregistre la dernière interaction du bot dans un groupe
     * @param {string} chatId 
     * @param {string} userJid 
     */
    async setLastInteraction(chatId, userJid) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const key = `chat:${chatId}:last_interaction`;
            const data = JSON.stringify({
                user: userJid,
                timestamp: Date.now()
            });

            // Expire après 3 minutes (fenêtre de conversation)
            await redis.set(key, data, { EX: 180 });
        } catch (error) {
            console.error('[WorkingMemory] setLastInteraction error:', error.message);
        }
    },

    /**
     * Récupère la dernière interaction du bot
     * @param {string} chatId 
     * @returns {Promise<{user: string, timestamp: number}|null>}
     */
    async getLastInteraction(chatId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return null;

            const key = `chat:${chatId}:last_interaction`;
            const data = await redis.get(key);

            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('[WorkingMemory] getLastInteraction error:', error.message);
            return null;
        }
    },

    // ========== GOAL SEEKING (Activity Tracking) ==========

    /**
     * Enregistre l'activité d'un groupe (Sorted Set)
     * @param {string} chatId 
     */
    async trackGroupActivity(chatId) {
        if (!chatId.endsWith('@g.us')) return;
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            // ZADD: Score = Timestamp
            await redis.zAdd('groups:activity', [{
                score: Date.now(),
                value: chatId
            }]);
        } catch (e) {
            console.error('[WorkingMemory] Erreur trackGroupActivity:', e.message);
        }
    },

    /**
     * Récupère les groupes inactifs depuis plus de X minutes
     * @param {number} thresholdMinutes 
     * @returns {Promise<string[]>} Liste des JID
     */
    async getInactiveGroups(thresholdMinutes = 180) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const now = Date.now();
            const cutoff = now - (thresholdMinutes * 60 * 1000);

            // On cherche tous les groupes dont le timestamp (score) est <= cutoff
            // ZRANGEBYSCORE key -inf cutoff
            return await redis.zRangeByScore('groups:activity', '-inf', cutoff);
        } catch (e) {
            console.error('[WorkingMemory] Erreur getInactiveGroups:', e.message);
            return [];
        }
    },

    // ========== EMOTIONAL ENGINE (Project Sentience) ==========

    /**
     * Met à jour le niveau d'agacement envers un utilisateur
     * @param {string} chatId - ID du chat (groupe ou privé)
     * @param {string} userId - JID de l'utilisateur cible
     * @param {number} delta - Variation (+10, -5...)
     * @returns {Promise<number>} Nouveau niveau (0-100)
     */
    async updateAnnoyance(chatId, userId, delta) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return 0;

            const key = `emotion:${chatId}:${userId}:annoyance`;

            // Récupérer la valeur actuelle
            let current = parseInt((await redis.get(key)) || '0');

            // Appliquer le delta
            let newValue = current + delta;

            // Borner entre 0 et 100
            newValue = Math.max(0, Math.min(100, newValue));

            if (newValue === 0) {
                await redis.del(key); // Nettoyer si apaisé
            } else {
                await redis.set(key, newValue.toString(), { EX: 3600 }); // TTL 1h (Rancune à court terme)
            }

            // Log si changement significatif
            if (Math.abs(newValue - current) >= 10 || newValue > 80) {
                console.log(`[Emotion] Annoyance ${userId.split('@')[0]} in ${chatId.split('@')[0]}: ${current} -> ${newValue}`);
            }

            return newValue;
        } catch (error) {
            console.error('[WorkingMemory] updateAnnoyance error:', error.message);
            return 0;
        }
    },

    /**
     * Récupère le niveau d'agacement actuel
     * @param {string} chatId 
     * @param {string} userId 
     * @returns {Promise<number>} Score (0-100)
     */
    async getAnnoyance(chatId, userId) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return 0;

            const key = `emotion:${chatId}:${userId}:annoyance`;
            const val = await redis.get(key);

            return val ? parseInt(val) : 0;
        } catch (error) {
            console.error('[WorkingMemory] getAnnoyance error:', error.message);
            return 0;
        }
    },

    /**
     * Récupère les groupes actifs récemment
     * @param {number} withinMinutes - Actifs dans les X dernières minutes
     * @returns {Promise<string[]>} Liste des chatIds actifs
     */
    async getActiveGroups(withinMinutes = 30) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const cutoff = Date.now() - (withinMinutes * 60 * 1000);
            const keys = await redis.keys('group:*:lastActivity');
            const activeGroups = [];

            for (const key of keys) {
                const timestamp = await redis.get(key);
                if (timestamp && parseInt(timestamp) > cutoff) {
                    // Extraire le groupId de la clé
                    const groupId = key.replace('group:', '').replace(':lastActivity', '');
                    activeGroups.push(groupId);
                }
            }

            return activeGroups;
        } catch (error) {
            console.error('[WorkingMemory] getActiveGroups error:', error.message);
            return [];
        }
    }
};

export default workingMemory;
