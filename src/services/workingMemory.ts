// services/workingMemory.js
// Service de mémoire de travail (Working Memory) avec Redis Cloud
// Utilise le client Redis partagé pour éviter les connexions multiples

import { redis, ensureConnected, checkHealth as redisCheckHealth } from './redisClient.js';

export const workingMemory = {
    /**
     * Ajoute un message au contexte éphémère.
     *
     * ⚠️ CONTRAT ARCHITECTURAL (Biais #2 Audit Expert) :
     * Cette méthode ne DOIT JAMAIS être appelée manuellement par un plugin
     * (ex: send_message, memory_store, etc). Le cycle de vie de la boucle ReAct
     * ajoute automatiquement la réponse finale de l'assistant à la fin de `_handleMessage`.
     * Un appel forcé par un plugin créerait des doublons fantômes dans l'historique Redis,
     * brisant le pattern strict 'Alternating User/Assistant' requis par la majorité des LLMs.
     *
     * @param {string} chatId
     * @param {string} role 'user' | 'assistant'
     * @param {string} content
     * @param {string} speakerHash - Optionnel, hash 3 chars pour identification (groupes)
     * @param {string} speakerName - Optionnel, nom de l'utilisateur (groupes)
     */
    async addMessage(chatId: any, role: any, content: any, speakerHash: any = null, speakerName: any = null) {
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
        } catch (error: any) {
            console.error('[WorkingMemory] addMessage error:', error.message);
        }
    },

    /**
     * Récupère le contexte récent
     * @param {string} chatId
     * @returns {Promise<Array>}
     */
    async getContext(chatId: any, limit: number = 15) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const key = `chat:${chatId}:context`;
            const start = limit ? -limit : 0;
            const logs = await redis.lRange(key, start, -1);

            return logs.map((log: any) => JSON.parse(log));
        } catch (error: any) {
            console.error('[WorkingMemory] getContext error:', error.message);
            return [];
        }
    },

    /**
     * Nettoie le contexte
     * @param {string} chatId
     */
    async clearContext(chatId: any) {
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
     * @returns {Promise<Object>} Status et métriques
     */
    async checkHealth() {
        try {
            await ensureConnected();
        } catch (e: any) { /* Ignore error here, checkHealth will report it */ }
        return await redisCheckHealth();
    },

    /**
     * Mute un utilisateur
     * @param {string} groupJid
     * @param {string} userJid
     * @param {number} durationMinutes
     */
    async muteUser(groupJid: any, userJid: any, durationMinutes: any) {
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
     * @param {string} groupJid
     * @param {string} userJid
     */
    async isMuted(groupJid: any, userJid: any) {
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
     * @param {string} groupJid
     * @param {string} permission 'all' | 'admins_only' | 'none'
     */
    async setAudioPermission(groupJid: any, permission: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            const key = `audio_perm:${groupJid}`;
            await redis.set(key, permission);
            console.log(`[WorkingMemory] Audio permission set: ${groupJid} → ${permission}`);
        } catch (error: any) {
            console.error('[WorkingMemory] setAudioPermission error:', error.message);
        }
    },

    /**
     * Récupère les permissions audio pour un groupe
     * @param {string} groupJid
     * @returns {Promise<string>} 'all' | 'admins_only' | 'none' (default: 'all')
     */
    async getAudioPermission(groupJid: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return 'all';
            const key = `audio_perm:${groupJid}`;
            const perm = await redis.get(key);
            return perm || 'all'; // Default: tout le monde peut envoyer des vocaux
        } catch (error: any) {
            console.error('[WorkingMemory] getAudioPermission error:', error.message);
            return 'all';
        }
    },

    // ========== PV AUDIO (Global Admin Control) ==========

    /**
     * Vérifie si les vocaux en PV sont désactivés globalement
     * @returns {Promise<boolean>}
     */
    async isPvAudioDisabled() {
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
     * Active/désactive les vocaux en PV globalement (Global Admin only)
     * @param {boolean} disabled
     */
    async setPvAudioDisabled(disabled: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            const key = 'global:pv_audio_disabled';
            if (disabled) {
                await redis.set(key, '1');
            } else {
                await redis.del(key);
            }
            console.log(`[WorkingMemory] PV Audio: ${disabled ? 'DISABLED' : 'ENABLED'} globally`);
        } catch (error: any) {
            console.error('[WorkingMemory] setPvAudioDisabled error:', error.message);
        }
    },

    // ========== ANTI-DELETE (Message Revocation Guard) ==========

    /**
     * Stocke un message pour l'anti-delete
     * @param {string} chatId
     * @param {string} messageId
     * @param {Object} messageData { sender, senderName, text, mediaType, timestamp }
     */
    async storeMessage(chatId: any, messageId: any, messageData: any) {
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
        } catch (error: any) {
            console.error('[WorkingMemory] storeMessage error:', error.message);
        }
    },

    /**
     * Récupère un message stocké
     * @param {string} chatId
     * @param {string} messageId
     * @returns {Promise<Object|null>}
     */
    async getStoredMessage(chatId: any, messageId: any) {
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
     * Marque un message comme supprimé et l'ajoute à la liste des suppressions
     * @param {string} chatId
     * @param {string} messageId
     * @param {Object} messageData
     */
    async trackDeletedMessage(chatId: any, messageId: any, messageData: any) {
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
        } catch (error: any) {
            console.error('[WorkingMemory] trackDeletedMessage error:', error.message);
        }
    },

    /**
     * Récupère les messages supprimés d'un groupe
     * @param {string} chatId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getDeletedMessages(chatId: any, limit: any = 10) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const listKey = `deleted:${chatId}`;
            const entries = await redis.lRange(listKey, 0, limit - 1);

            return entries.map((e: any) => JSON.parse(e));
        } catch (error: any) {
            console.error('[WorkingMemory] getDeletedMessages error:', error.message);
            return [];
        }
    },

    /**
     * Active/désactive l'anti-delete pour un groupe
     * @param {string} chatId
     * @param {boolean} enabled
     */
    async setAntiDeleteEnabled(chatId: any, enabled: any) {
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
     * @param {string} chatId
     * @returns {Promise<boolean>}
     */
    async isAntiDeleteEnabled(chatId: any) {
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

    // ========== VELOCITY TRACKING (Adaptive Reply System) ==========

    /**
     * Enregistre un message pour le calcul de vélocité
     * @param {string} chatId
     * @param {string} senderId
     */
    async trackMessage(chatId: any, senderId: any) {
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
        } catch (error: any) {
            console.error('[WorkingMemory] trackMessage error:', error.message);
        }
    },

    /**
     * Calcule la vélocité du chat (messages par minute)
     * @param {string} chatId
     * @returns {Promise<{velocity: number, mode: string, uniqueSenders: number}>}
     */
    async getChatVelocity(chatId: any) {
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
        } catch (error: any) {
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
    async getReplyStrategy(chatId: any, originalMessage: any = null) {
        const { velocity, mode, uniqueSenders } = await this.getChatVelocity(chatId);

        const strategy = {
            useQuote: false,
            useMention: false,
            reason: `Mode: ${mode} (${velocity} msg/min, ${uniqueSenders} utilisateurs)`
        };

        switch (mode) {
            case 'solo':
                // Conversation directe, pas besoin de citation
                strategy.useQuote = false;
                strategy.useMention = false;
                strategy.reason = '🧘 Solo: conversation directe';
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
    async setLastInteraction(chatId: any, userJid: any) {
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
        } catch (error: any) {
            console.error('[WorkingMemory] setLastInteraction error:', error.message);
        }
    },

    /**
     * Récupère la dernière interaction du bot
     * @param {string} chatId
     * @returns {Promise<{user: string, timestamp: number}|null>}
     */
    async getLastInteraction(chatId: any) {
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

    // ========== GOAL SEEKING (Activity Tracking) ==========

    /**
     * Enregistre l'activité d'un groupe (Sorted Set)
     * @param {string} chatId
     */
    async trackGroupActivity(chatId: any) {
        if (!chatId.endsWith('@g.us')) return;
        try {
            await ensureConnected();
            if (!redis.isOpen) return;
            // ZADD: Score = Timestamp
            await redis.zAdd('groups:activity', [{
                score: Date.now(),
                value: chatId
            }]);
        } catch (e: any) {
            console.error('[WorkingMemory] Erreur trackGroupActivity:', e.message);
        }
    },

    /**
     * Récupère les groupes inactifs depuis plus de X minutes
     * @param {number} thresholdMinutes
     * @returns {Promise<string[]>} Liste des JID
     */
    async getInactiveGroups(thresholdMinutes: any = 180) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const now = Date.now();
            const cutoff = now - (thresholdMinutes * 60 * 1000);

            // On cherche tous les groupes dont le timestamp (score) est <= cutoff
            // ZRANGEBYSCORE key -inf cutoff
            return await redis.zRangeByScore('groups:activity', '-inf', cutoff);
        } catch (e: any) {
            console.error('[WorkingMemory] Erreur getInactiveGroups:', e.message);
            return [];
        }
    },

    // ========== EMOTIONAL ENGINE — DEPRECATED ==========
    // WHY (Audit H2): Duplicate of consciousnessService.updateAnnoyance().
    // These methods wrote to `emotion:${chatId}:${userId}:annoyance` while
    // consciousnessService writes to `consciousness:${chatId}:${userId}:annoyance`,
    // causing split emotional state. ConsciousnessService is the canonical owner.
    // Stubs throw to catch any undetected callers at runtime.

    async updateAnnoyance(_chatId: any, _userId: any, _delta: any): Promise<number> {
        throw new Error('[WorkingMemory] updateAnnoyance is DEPRECATED — use consciousnessService.updateAnnoyance() instead');
    },

    async getAnnoyance(_chatId: any, _userId: any): Promise<number> {
        throw new Error('[WorkingMemory] getAnnoyance is DEPRECATED — use consciousnessService.getAnnoyance() instead');
    },

    /**
     * Récupère les groupes actifs récemment.
     * WHY (Audit L3): Previous implementation used redis.keys('group:*:lastActivity')
     * which is O(N) and blocks the Redis event loop. This version uses the
     * existing 'groups:activity' sorted set (populated by trackGroupActivity()).
     * @param {number} withinMinutes - Actifs dans les X dernières minutes
     * @returns {Promise<string[]>} Liste des chatIds actifs
     */
    async getActiveGroups(withinMinutes: any = 30) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const cutoff = Date.now() - (withinMinutes * 60 * 1000);
            // WHY: ZRANGEBYSCORE is O(log(N)+M) vs O(N) for KEYS — no event loop blocking.
            return await redis.zRangeByScore('groups:activity', cutoff, '+inf');
        } catch (error: any) {
            console.error('[WorkingMemory] getActiveGroups error:', error.message);
            return [];
        }
    },

    // ========== USER PASSPORT (L1 Hot Cache — Phase 2) ==========
    // WHY: Mini identity card loaded into the prompt at EVERY message.
    // Resolves the "goldfish amnesia" where FastPath had no user identity.

    /**
     * Retrieves the user passport from Redis L1.
     * If miss, returns null (caller should build + set).
     * @param {string} sender - User JID
     * @returns {Promise<{name: string, lang: string, tz: string, topFacts: string[]} | null>}
     */
    async getPassport(sender: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return null;

            const key = `passport:${sender}`;
            const raw = await redis.get(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error: any) {
            console.error('[WorkingMemory] getPassport error:', error.message);
            return null;
        }
    },

    /**
     * Stores the user passport in Redis L1.
     * @param {string} sender - User JID
     * @param {Object} passport - { name, lang, tz, topFacts }
     */
    async setPassport(sender: any, passport: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const key = `passport:${sender}`;
            await redis.set(key, JSON.stringify(passport), { EX: 3600 }); // 1h TTL, refreshed per interaction
        } catch (error: any) {
            console.error('[WorkingMemory] setPassport error:', error.message);
        }
    },

    /**
     * Formats a passport object into the compact string injected into <user_passport>.
     * @param {Object} passport
     * @returns {string} e.g. "Name: Jean | Language: FR | TZ: Europe/Paris | Likes Python, football"
     */
    formatPassport(passport: any): string {
        if (!passport) return '(Unknown user)';

        const parts = [];
        if (passport.name) parts.push(`Name: ${passport.name}`);
        if (passport.lang) parts.push(`Language: ${passport.lang}`);
        if (passport.tz) parts.push(`TZ: ${passport.tz}`);
        if (passport.topFacts && passport.topFacts.length > 0) {
            parts.push(passport.topFacts.join(', '));
        }

        return parts.join(' | ') || '(No data)';
    },

    // ========== SCRATCHPAD / GCC (L1 Hot Cache — Phase 3) ==========
    // WHY: Volatile working memory visible in the prompt at every turn.
    // The agent can write here to preserve state across turns without
    // polluting the Workspace (L2) which is for long-term documents.

    /**
     * Gets the scratchpad content for a chat.
     * @param {string} chatId
     * @returns {Promise<string>}
     */
    async getScratchpad(chatId: any): Promise<string> {
        try {
            await ensureConnected();
            if (!redis.isOpen) return '';

            const key = `scratchpad:${chatId}`;
            return (await redis.get(key)) || '';
        } catch (error: any) {
            console.error('[WorkingMemory] getScratchpad error:', error.message);
            return '';
        }
    },

    /**
     * Sets the scratchpad content for a chat. Max 500 chars enforced.
     * @param {string} chatId
     * @param {string} text
     */
    async setScratchpad(chatId: any, text: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const key = `scratchpad:${chatId}`;
            const truncated = typeof text === 'string' ? text.substring(0, 500) : '';
            await redis.set(key, truncated, { EX: 86400 }); // 24h TTL
        } catch (error: any) {
            console.error('[WorkingMemory] setScratchpad error:', error.message);
        }
    },

    // ========== ACTION HISTORY (L1 Hot Cache — Phase 4) ==========
    // WHY: Compressed trace of tool executions from the last 3 turns.
    // Resolves "technical amnesia" where the agent forgot which tools
    // it already used and re-executed them needlessly.

    /**
     * Adds a compressed action trace for the current turn.
     * Format: { turn, user_query, tools_used: [{name, args_summary, result_summary}], response_preview }
     * @param {string} chatId
     * @param {Object} trace
     */
    async addActionTrace(chatId: any, trace: any) {
        try {
            await ensureConnected();
            if (!redis.isOpen) return;

            const key = `action_history:${chatId}`;
            const entry = JSON.stringify({
                ...trace,
                timestamp: Date.now()
            });

            await redis.rPush(key, entry);
            // Keep only last 6 entries (3 turns × ~2 tool calls avg)
            await redis.lTrim(key, -6, -1);
            await redis.expire(key, 900); // 15min TTL (same as chat context)
        } catch (error: any) {
            console.error('[WorkingMemory] addActionTrace error:', error.message);
        }
    },

    /**
     * Gets the compressed action history for a chat.
     * @param {string} chatId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getActionHistory(chatId: any, limit: number = 6): Promise<any[]> {
        try {
            await ensureConnected();
            if (!redis.isOpen) return [];

            const key = `action_history:${chatId}`;
            const entries = await redis.lRange(key, -limit, -1);
            return entries.map((e: any) => JSON.parse(e));
        } catch (error: any) {
            console.error('[WorkingMemory] getActionHistory error:', error.message);
            return [];
        }
    },

    /**
     * Formats action history into the compact string injected into <action_history>.
     * @param {Array} history
     * @returns {string}
     */
    formatActionHistory(history: any[]): string {
        if (!history || history.length === 0) return '(No recent actions)';

        return history.map((h: any) => {
            const toolsList = (h.tools_used || [])
                .map((t: any) => `${t.name}(${t.args_summary || ''}) → ${t.result_summary || 'OK'}`)
                .join('; ');

            return `[Turn] User: "${h.user_query || '?'}" → ${toolsList || 'No tools'} → Agent: "${h.response_preview || '...'}"`;
        }).join('\n');
    }
};

export default workingMemory;
