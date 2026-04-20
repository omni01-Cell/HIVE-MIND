// services/memory/ActionMemory.js
// ============================================================================
// SERVICE DE MÉMOIRE D'ACTIONS DYNAMIQUE
// ============================================================================
// Permet au bot de se souvenir des actions en cours lorsque l'utilisateur
// change de sujet en pleine conversation.
//
// Exemple:
// User: "Trouve-moi un câble ethernet USB"
// Bot: [commence recherche...]
// User: "Au fait, c'est quoi ton nom ?"
// Bot: [Sans ActionMemory] Oublie la recherche et répond juste au nom
//      [Avec ActionMemory] Peut reprendre la recherche après avoir répondu

import { redis } from '../redisClient.js';
import { supabase } from '../supabase.js';

/**
 * Service de gestion des actions en cours
 */
export class ActionMemory {
    constructor() {
        this.redis = null; // Sera injecté via init()
        this.initialized = false;
        
        // 🛡️ Cleanup automatique des actions orphelines (toutes les heures)
        this.startOrphanCleanup();
    }

    /**
     * Démarre une nouvelle action
     * @param {string} chatId - ID du chat
     * @param {Object} action - { type, goal, context, priority }
     * @returns {Promise<string>} ID de l'action
     */
    async startAction(chatId, { type, goal, context = {}, priority = 5 }) {
        const actionId = `${chatId}:${Date.now()}`;
        const actionData = {
            id: actionId,
            chatId,
            type,
            goal,
            context: JSON.stringify(context),
            priority,
            status: 'active',
            steps: JSON.stringify([]),
            startedAt: Date.now(),
            expiresAt: Date.now() + (this.defaultTTL * 1000)
        };

        try {
            // Stocker dans Redis avec TTL
            const key = `${this.keyPrefix}${chatId}`;
            await redis.hSet(key, actionData);
            await redis.expire(key, this.defaultTTL);

            // Log dans Supabase pour historique
            await supabase.from('agent_actions').insert({
                chat_id: chatId,
                tool_name: type,
                params: JSON.stringify({ goal, context }),
                status: 'active'
            });

            console.log(`[ActionMemory] 🎬 Action démarrée: ${type} (${goal})`);
            return actionId;
        } catch (error) {
            console.error('[ActionMemory] Erreur startAction:', error.message);
            return null;
        }
    }

    /**
     * Récupère l'action active pour un chat
     * @param {string} chatId 
     * @returns {Promise<Object|null>}
     */
    async getActiveAction(chatId) {
        try {
            const key = `${this.keyPrefix}${chatId}`;
            const data = await redis.hGetAll(key);

            if (!data || Object.keys(data).length === 0) {
                return null;
            }

            // Reconstruire l'objet action depuis Redis hash
            return {
                id: data.id,
                chatId: data.chatId,
                type: data.type,
                goal: data.goal,
                steps: JSON.parse(data.steps || '[]'),
                status: data.status,
                startedAt: parseInt(data.startedAt),
                updatedAt: parseInt(data.updatedAt),
                context: JSON.parse(data.context || '{}')
            };
        } catch (error) {
            console.error(`[ActionMemory] Erreur getActiveAction ${chatId}:`, error.message);
            return null;
        }
    }

    /**
     * 🛡️ Cleanup automatique des actions orphelines (anciennes et inactives)
     * @private
     */
    startOrphanCleanup() {
        // Nettoyer toutes les 60 minutes
        setInterval(async () => {
            if (!this.initialized) return;
            
            try {
                console.log('[ActionMemory] 🧹 Début cleanup actions orphelines...');
                
                // 1. Cleanup dans Redis (actions > 24h sans mise à jour)
                await this._cleanupRedisOrphans();
                
                // 2. Cleanup dans Supabase (actions > 7 jours et toujours 'active')
                await this._cleanupSupabaseOrphans();
                
                console.log('[ActionMemory] ✅ Cleanup terminé');
                
            } catch (error) {
                console.error('[ActionMemory] ❌ Erreur cleanup:', error.message);
            }
        }, 60 * 60 * 1000); // Toutes les heures
    }

    /**
     * Cleanup des actions orphelines dans Redis
     * @private
     */
    async _cleanupRedisOrphans() {
        try {
            const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24h
            const pattern = 'action:*';
            const keys = await this.redis.keys(pattern);
            
            let cleaned = 0;
            
            for (const key of keys) {
                const actionData = await this.redis.get(key);
                if (!actionData) continue;
                
                try {
                    const action = JSON.parse(actionData);
                    
                    // Si action > 24h et toujours 'active', c'est un orphan
                    if (action.status === 'active' && action.updatedAt < cutoffTime) {
                        await this.redis.del(key);
                        cleaned++;
                        console.log(`[ActionMemory] 🗑️ Action orpheline supprimée: ${key}`);
                    }
                } catch (e) {
                    // Si données corrompues, supprimer
                    await this.redis.del(key);
                    cleaned++;
                    console.log(`[ActionMemory] 🗑️ Action corrompue supprimée: ${key}`);
                }
            }
            
            if (cleaned > 0) {
                console.log(`[ActionMemory] Nettoyé ${cleaned} actions orphelines Redis`);
            }
            
        } catch (error) {
            console.error('[ActionMemory] Erreur cleanup Redis:', error.message);
        }
    }

    /**
     * Cleanup des actions orphelines dans Supabase
     * @private
     */
    async _cleanupSupabaseOrphans() {
        if (!supabase) return;
        try {
            const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 jours
            
            // Compter avant de supprimer
            const { count } = await supabase
                .from('agent_actions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active')
                .lt('created_at', cutoffTime);
            
            if (count > 0) {
                console.log(`[ActionMemory] Suppression de ${count} actions orphelines Supabase...`);
                
                const { error } = await supabase
                    .from('agent_actions')
                    .delete()
                    .eq('status', 'active')
                    .lt('created_at', cutoffTime);
                
                if (error) {
                    console.error('[ActionMemory] Erreur cleanup Supabase:', error.message);
                } else {
                    console.log(`[ActionMemory] ✅ ${count} actions orphelines Supabase supprimées`);
                }
            }
            
        } catch (error) {
            console.error('[ActionMemory] Erreur cleanup Supabase:', error.message);
        }
    }

    /**
     * Ajoute une étape à l'action en cours
     * @param {string} chatId 
     * @param {string} step - Description de l'étape
     */
    async updateStep(chatId, step) {
        try {
            const action = await this.getActiveAction(chatId);
            if (!action) return false;

            action.steps.push({
                step,
                timestamp: Date.now()
            });

            const key = `${this.keyPrefix}${chatId}`;
            await redis.hSet(key, 'steps', JSON.stringify(action.steps));

            // [PHASE 3] Persistance Supabase pour reprise après crash
            // On met à jour le tableau steps dans la DB
            await supabase.from('agent_actions')
                .update({ steps: JSON.stringify(action.steps) })
                .eq('chat_id', chatId)
                .eq('status', 'active');

            return true;
        } catch (error) {
            console.error('[ActionMemory] Erreur updateStep:', error.message);
            return false;
        }
    }

    /**
     * Marque l'action comme complétée
     * @param {string} chatId 
     * @param {Object} result - Résultat de l'action
     */
    async completeAction(chatId, result) {
        try {
            const action = await this.getActiveAction(chatId);
            if (!action) return false;

            // Mettre à jour le statut
            const key = `${this.keyPrefix}${chatId}`;
            await redis.hSet(key, 'status', 'completed');
            await redis.hSet(key, 'result', JSON.stringify(result));

            // Log final dans Supabase
            await supabase.from('agent_actions')
                .update({
                    status: 'completed',
                    result: JSON.stringify(result)
                })
                .eq('chat_id', chatId)
                .eq('tool_name', action.type)
                .is('result', null)
                .order('created_at', { ascending: false })
                .limit(1);

            // Supprimer de Redis après 60s (garder trace temporaire)
            await redis.expire(key, 60);

            console.log(`[ActionMemory] ✅ Action complétée: ${action.type}`);
            return true;
        } catch (error) {
            console.error('[ActionMemory] Erreur completeAction:', error.message);
            return false;
        }
    }

    /**
     * Interrompt l'action en cours
     * @param {string} chatId 
     * @param {string} reason - Raison de l'interruption
     */
    async interruptAction(chatId, reason) {
        try {
            const action = await this.getActiveAction(chatId);
            if (!action) return false;

            const key = `${this.keyPrefix}${chatId}`;
            await redis.hSet(key, 'status', 'interrupted');
            await redis.hSet(key, 'interruptReason', reason);

            console.log(`[ActionMemory] ⏸️ Action interrompue: ${action.type} (${reason})`);

            // Réduire le TTL
            await redis.expire(key, 300); // 5 minutes

            return true;
        } catch (error) {
            console.error('[ActionMemory] Erreur interruptAction:', error.message);
            return false;
        }
    }

    /**
     * Vérifie si une action est en cours pour un chat
     * @param {string} chatId 
     * @returns {Promise<boolean>}
     */
    async hasActiveAction(chatId) {
        const action = await this.getActiveAction(chatId);
        return action !== null && action.status === 'active';
    }

    /**
     * Nettoie toutes les actions d'un chat spécifique (quand user quitte groupe)
     * @param {string} chatId 
     */
    async cleanupChatActions(chatId) {
        try {
            console.log(`[ActionMemory] 🧹 Cleanup actions pour chat: ${chatId}`);
            
            // Cleanup Redis
            const pattern = `action:*:${chatId}`;
            const keys = await this.redis.keys(pattern);
            
            if (keys.length > 0) {
                await this.redis.del(...keys);
                console.log(`[ActionMemory] Nettoyé ${keys.length} actions Redis pour ${chatId}`);
            }
            
            // Cleanup Supabase (marquer comme interrupted)
            if (supabase) {
                const { error } = await supabase
                    .from('agent_actions')
                    .update({ status: 'interrupted', completed_at: new Date().toISOString() })
                    .eq('chat_id', chatId)
                    .eq('status', 'active');
                
                if (error) {
                    console.error(`[ActionMemory] Erreur cleanup Supabase pour ${chatId}:`, error.message);
                } else {
                    console.log(`[ActionMemory] Actions Supabase marquées comme interrupted pour ${chatId}`);
                }
            }
            
        } catch (error) {
            console.error(`[ActionMemory] Erreur cleanup chat ${chatId}:`, error.message);
        }
    }

    /**
     * Formate l'action active pour l'IA
     * @param {string} chatId 
     * @returns {Promise<string>}
     */
    async formatForPrompt(chatId) {
        const action = await this.getActiveAction(chatId);
        if (!action) return '';

        const elapsed = Math.floor((Date.now() - action.startedAt) / 1000);
        const stepsText = action.steps.length > 0
            ? action.steps.map(s => `  - ${s.step}`).join('\n')
            : '  (Aucune étape complétée)';

        return `
### 🎯 ACTION EN COURS
- **Type**: ${action.type}
- **Objectif**: ${action.goal}
- **Démarrée**: Il y a ${elapsed}s
- **Étapes**:
${stepsText}

**IMPORTANT**: Une action est en cours. Tu peux:
1. Continuer cette action si le message de l'utilisateur est lié
2. Mettre en pause et y revenir plus tard si le sujet change
3. Abandonner si l'utilisateur demande explicitement d'arrêter
`;
    }

    /**
     * Récupère les actions 'active' depuis Supabase pour reprise après crash
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async getResumableActions(limit = 10) {
        if (!supabase) return [];
        try {
            // 🛡️ CORRECTION: Filtrer sur les dernières 24h pour éviter de déterrer des fantômes
            const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            
            const { data, error } = await supabase
                .from('agent_actions')
                .select('*')
                .eq('status', 'active')
                .gt('created_at', cutoffTime) // ✅ Filtrer actions > 24h
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return data.map(row => ({
                id: row.id,
                chatId: row.chat_id,
                type: row.tool_name,
                // params contient le goal et contexte
                params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
                steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []),
                createdAt: new Date(row.created_at).getTime()
            }));
        } catch (error) {
            console.error('[ActionMemory] Erreur getResumableActions:', error.message);
            return [];
        }
    }
    /**
     * Restaure une action depuis Supabase vers Redis (Réhydratation du contexte)
     * @param {string} chatId 
     * @param {string} actionId 
     */
    async rehydrateAction(chatId, actionId) {
        try {
            // 1. Récupérer depuis Supabase
            const { data, error } = await supabase
                .from('agent_actions')
                .select('*')
                .eq('id', actionId)
                .single();

            if (error || !data) throw new Error('Action introuvable dans Supabase');

            // 2. Reconstruire l'objet Redis
            const actionData = {
                id: data.id.toString(),
                chatId: data.chat_id,
                type: data.tool_name,
                goal: typeof data.params === 'string' ? JSON.parse(data.params).goal : data.params.goal,
                context: typeof data.params === 'string' ? JSON.parse(data.params).context : JSON.stringify(data.params.context || {}),
                priority: 5, // Default
                status: 'active', // On force le statut actif
                steps: typeof data.steps === 'string' ? data.steps : JSON.stringify(data.steps || []),
                startedAt: new Date(data.created_at).getTime(),
                expiresAt: Date.now() + (this.defaultTTL * 1000)
            };

            // 3. Écrire dans Redis
            const key = `${this.keyPrefix}${chatId}`;
            await redis.hSet(key, actionData);
            await redis.expire(key, this.defaultTTL);

            console.log(`[ActionMemory] 💧 Action réhydratée dans Redis: ${data.tool_name}`);
            return true;

        } catch (error) {
            console.error('[ActionMemory] Erreur rehydrateAction:', error.message);
            return false;
        }
    }
}


// Export singleton
export const actionMemory = new ActionMemory();
export default actionMemory;
