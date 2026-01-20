// services/groupService.js
// ============================================================================
// SERVICE GROUPE UNIFIÉ (Cache + Aggressive Identity Linking)
// ============================================================================
//
// RESPONSABILITÉS:
// 1. Cacher les métadonnées des groupes WhatsApp dans Redis (24h TTL)
// 2. Déclencher l'"Aggressive Linking" : à chaque scan de groupe, on lie
//    automatiquement les LID aux JID pour tous les membres
// 3. Fournir le contexte social pour le prompt système de l'IA
// 4. Gérer les missions bot par groupe (Supabase)
//
// INJECTION DE DÉPENDANCES:
// Ce service utilise setContainer() pour recevoir une référence au conteneur DI.
// Cela évite les imports circulaires avec userService.
//
// MÉTHODES PRINCIPALES:
// - updateGroup(): Appelé quand on reçoit les métadonnées WhatsApp
// - getContext(): Construit le bloc "CONTEXTE SOCIAL" pour le prompt
// - getGroupMembers(): Retourne la liste des membres (depuis cache Redis)
// - trackActivity(): Incrémente le leaderboard du groupe (Redis ZSET)
//
// ============================================================================

import { redis } from './redisClient.js';
import { StateManager } from './state/StateManager.js';
import { supabase } from './supabase.js';

/**
 * Service de gestion des groupes WhatsApp
 * Utilise l'injection de dépendances pour accéder à userService
 */
export const groupService = {
    /** @type {import('../core/ServiceContainer.js').ServiceContainer|null} */
    container: null,

    /**
     * Injecte le conteneur de services (appelé par ServiceContainer.register)
     * @param {import('../core/ServiceContainer.js').ServiceContainer} container 
     */
    setContainer(container) {
        this.container = container;
    },

    /**
     * Getter pour userService (résolution lazy via container)
     * @returns {import('./userService.js').userService}
     */
    get userService() {
        return this.container?.get('userService');
    },
    /**
     * Met à jour le cache groupe avec les métadonnées WhatsApp
     * @param {string} groupJid 
     * @param {Object} waMetadata - Métadonnées de l'API WhatsApp
     */
    async updateGroup(groupJid, waMetadata) {
        const cacheKey = `group:${groupJid}:meta`;

        try {
            const admins = waMetadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);

            // Phase Social Graph: Stocker TOUS les membres avec leurs noms (pour fuzzy matching)
            const members = waMetadata.participants.map(p => {
                // WOW: Le script de debug a prouvé que p.jid EXISTE et contient le VRAI JID !
                // p.id contient le LID dans les nouveaux groupes.
                const realJid = p.jid || p.id;
                const lid = p.lid || (p.id.endsWith('@lid') ? p.id : null);

                // Enregistrement immédiat du mapping
                if (realJid.endsWith('@s.whatsapp.net') && lid && this.userService) {
                    // On ne s'embête pas avec des await ici, on veut juste déclencher l'enregistrement
                    this.userService.registerLid(realJid, lid).catch(() => { });
                }

                return {
                    jid: realJid, // On stocke le VRAI JID
                    lid: lid,
                    name: p.name || p.notify || null, // Nom affiché (pushName)
                    isAdmin: p.admin === 'admin' || p.admin === 'superadmin'
                };
            });

            const groupData = {
                jid: groupJid,
                name: waMetadata.subject || '',
                description: waMetadata.desc ? waMetadata.desc.toString() : '',
                owner: waMetadata.owner || '',
                admins: JSON.stringify(admins),
                members: JSON.stringify(members),
                member_count: waMetadata.participants.length.toString(),
                last_updated: Date.now().toString()
            };

            // Stocker dans Redis
            await redis.hSet(cacheKey, groupData);
            await redis.expire(cacheKey, 86400); // TTL 24h

            // Phase 3: Sync du groupe lui-même dans 'groups' (CRITIQUE pour FKs)
            if (supabase) {
                // Tenter de résoudre le founder s'il est au format LID
                let founder = waMetadata.owner || waMetadata.subjectOwner;
                let validFounderJid = null;

                if (founder) {
                    // Si c'est déjà un JID valide
                    if (founder.includes('@s.whatsapp.net')) {
                        validFounderJid = founder;
                    }
                    // Si c'est un LID, on essaie de le résoudre
                    else if (founder.endsWith('@lid') && this.userService) {
                        const resolved = await this.userService.resolveLid(founder);
                        if (resolved) validFounderJid = resolved;
                    }
                }

                await supabase.from('groups').upsert({
                    jid: groupJid,
                    name: waMetadata.subject || '',
                    founder_jid: validFounderJid || null, // NULL si pas résolu, pour respecter la FK
                    created_at: waMetadata.creation ? new Date(waMetadata.creation * 1000).toISOString() : new Date().toISOString()
                }, { onConflict: 'jid' });
            }

            console.log(`[GroupService] Groupe mis à jour (Redis + DB): ${waMetadata.subject}`);

        } catch (error) {
            console.error('[GroupService] updateGroup error:', error.message);
        }
    },

    /**
     * Vérifie si les données du groupe nécessitent une mise à jour
     * @param {string} groupJid 
     * @returns {Promise<boolean>}
     */
    async needsUpdate(groupJid) {
        const cacheKey = `group:${groupJid}:meta`;

        try {
            const [lastUpdated, members] = await Promise.all([
                redis.hGet(cacheKey, 'last_updated'),
                redis.hGet(cacheKey, 'members')
            ]);

            // Pas de cache du tout
            if (!lastUpdated) return true;

            // Cache existant mais sans membres (migration nécessaire)
            if (!members || members === '[]') {
                console.log(`[GroupService] Cache obsolète (pas de membres): ${groupJid}`);
                return true;
            }

            // Cache trop vieux (>24h)
            const ONE_DAY = 24 * 60 * 60 * 1000;
            if ((Date.now() - parseInt(lastUpdated)) > ONE_DAY) {
                return true;
            }

            // CHECK 1: Vérifier si le cache contient des "mauvaises données" (LIDs au lieu de JIDs)
            // C'est ce qui arrive si le bot a tourné avant le fix.
            if (members.includes('@lid"')) { // Detection brutale mais efficace
                try {
                    const parsedMembers = JSON.parse(members);
                    const hasBadData = parsedMembers.some(m => m.jid && m.jid.endsWith('@lid'));
                    if (hasBadData) {
                        console.log(`[GroupService] Cache corrompu détecté (LID as JID): ${groupJid} -> Force Sync`);
                        return true;
                    }
                } catch (e) { }
            }

            // CHECK 2: Vérifier si le groupe existe VRAIMENT dans la DB
            if (this.supabase) {
                const { count, error } = await this.supabase
                    .from('groups')
                    .select('jid', { count: 'exact', head: true })
                    .eq('jid', groupJid);

                if (!error && count === 0) {
                    console.log(`[GroupService] Groupe absent de la DB: ${groupJid} -> Force Sync`);
                    return true;
                }
            }

            return false;

        } catch (error) {
            return true; // En cas d'erreur, forcer la mise à jour
        }
    },

    /**
     * Invalide le cache d'un groupe (appelé sur events promote/demote/remove)
     * @param {string} groupJid 
     */
    async invalidateCache(groupJid) {
        const cacheKey = `group:${groupJid}:meta`;

        try {
            await redis.del(cacheKey);
            console.log(`[GroupService] Cache invalidé pour: ${groupJid}`);
        } catch (error) {
            console.error('[GroupService] invalidateCache error:', error.message);
        }
    },

    /**
     * Récupère le contexte complet pour le prompt système
     * @param {string} chatJid - JID du chat (groupe ou privé)
     * @param {string} senderJid - JID de l'expéditeur
     * @param {Object} userProfile - Profil utilisateur (de userService)
     * @returns {Promise<Object>}
     */
    async getContext(chatJid, senderJid, userProfile) {
        const isGroup = chatJid.endsWith('@g.us');

        let context = {
            type: isGroup ? 'GROUP' : 'PRIVATE',
            sender: userProfile,
            group: null,
            senderIsAdmin: false,
            // Passer le LID s'il est connu pour l'expéditeur (aide à la résolution downstream)
            senderLid: null
        };

        if (!isGroup) return context;

        const cacheKey = `group:${chatJid}:meta`;

        try {
            // 1. Essayer le cache Redis
            const cached = await redis.hGetAll(cacheKey);

            if (cached && Object.keys(cached).length > 0) {
                const admins = JSON.parse(cached.admins || '[]');

                context.group = {
                    jid: cached.jid,
                    name: cached.name,
                    description: cached.description || 'Aucune description',
                    owner: cached.owner,
                    admins: admins,
                    member_count: parseInt(cached.member_count) || 0,
                    tasks: [] // Les tâches viennent de Supabase group_configs
                };

                context.senderIsAdmin = admins.includes(senderJid);

                // 2. Enrichir avec bot_mission depuis Supabase
                if (supabase) {
                    const { data: config } = await supabase
                        .from('groups')
                        .select('bot_mission')
                        .eq('jid', chatJid)
                        .single();

                    if (config?.bot_mission) {
                        context.group.bot_mission = config.bot_mission;
                    }
                }
            }

        } catch (error) {
            console.error('[GroupService] getContext error:', error.message);
        }

        return context;
    },

    /**
     * Récupère la liste des membres d'un groupe (depuis le cache Redis)
     * @param {string} groupJid 
     * @returns {Promise<Array<{jid: string, isAdmin: boolean}>>}
     */
    async getGroupMembers(groupJid) {
        const cacheKey = `group:${groupJid}:meta`;

        try {
            const membersJson = await redis.hGet(cacheKey, 'members');

            if (membersJson) {
                const members = JSON.parse(membersJson);

                // [FIX] Enrichir les membres avec les noms Supabase si name est null
                if (this.userService) {
                    const enrichedMembers = await Promise.all(
                        members.map(async (member) => {
                            // Si le nom est déjà présent, pas besoin d'enrichir
                            if (member.name && member.name !== 'Inconnu') {
                                return member;
                            }

                            // Sinon, chercher dans Supabase via userService
                            try {
                                const profile = await this.userService.getProfile(member.jid);
                                if (profile?.names?.[0] && profile.names[0] !== 'Inconnu') {
                                    return { ...member, name: profile.names[0] };
                                }
                            } catch (e) {
                                // Ignore errors, garder le membre tel quel
                            }

                            return member;
                        })
                    );

                    return enrichedMembers;
                }

                return members;
            }

            return [];
        } catch (error) {
            console.error('[GroupService] getGroupMembers error:', error.message);
            return [];
        }
    },

    /**
     * Récupère la mission bot d'un groupe (depuis Supabase)
     * Utilisé par: gm_mission (group_manager plugin)
     * @param {string} groupJid 
     * @returns {Promise<{title: string, description: string, author: string}|null>}
     */
    async getBotMission(groupJid) {
        if (!supabase) return null;

        try {
            const { data, error } = await supabase
                .from('groups')
                .select('name, bot_mission') // 'admins' retiré car absent du schéma
                .eq('jid', groupJid)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('[GroupService] getBotMission error:', error);
            }

            if (!data) return null;

            return {
                title: data.name,
                description: data.bot_mission,
                author: null // L'auteur n'est pas stocké dans la version actuelle du schéma
            };
        } catch (error) {
            console.error('[GroupService] getBotMission error:', error.message);
            return null;
        }
    },

    /**
     * Définit la mission bot d'un groupe
     * Utilisé par: gm_setmission (group_manager plugin)
     * @param {string} groupJid 
     * @param {string} title - Titre de la mission (stocké dans name)
     * @param {string} description - Description de la mission (stocké dans bot_mission)
     * @param {string} author - JID de l'auteur (stocké dans admins)
     */
    async setBotMission(groupJid, title, description, author) {
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('groups')
                .upsert({
                    jid: groupJid,
                    name: title,                // <-- Titre de la Mission
                    bot_mission: description    // <-- Description de la Mission
                    // admins: [author]         // <-- Retiré car colonne absente
                    // Note: updated_at géré automatiquement par trigger PostgreSQL
                }, { onConflict: 'jid' });

            if (error) {
                console.error('[GroupService] setBotMission error:', error);
            }
        } catch (error) {
            console.error('[GroupService] setBotMission error:', error.message);
        }
    },

    // ======== GROUP_ADMINS TABLE (Phase 2) ========

    /**
     * Synchronise les admins WhatsApp vers la table group_admins
     * Appelé après updateGroup() pour persistance
     * @param {string} groupJid 
     * @param {Array<string>} adminJids - Liste des JIDs des admins
     * @param {string} promotedBy - JID de celui qui a fait l'action (optionnel)
     */
    async syncAdminsToSupabase(groupJid, adminJids, promotedBy = null) {
        if (!supabase) return;
        console.warn('[GroupService] SyncAdmins désactivé (Table group_admins manquante)');
        return;
        /*
        try {
            // 1. Récupérer les admins actuels dans Supabase
            const { data: existingAdmins } = await supabase
                .from('group_admins')
                .select('user_jid')
                .eq('group_jid', groupJid);
        */

        const existingSet = new Set((existingAdmins || []).map(a => a.user_jid));
        const newSet = new Set(adminJids);

        // 2. Ajouter les nouveaux admins
        const toAdd = adminJids.filter(jid => !existingSet.has(jid));
        if (toAdd.length > 0) {
            const insertData = toAdd.map(jid => ({
                group_jid: groupJid,
                user_jid: jid,
                role: 'admin',
                promoted_at: new Date().toISOString(),
                promoted_by: promotedBy
            }));

            await supabase.from('group_admins').insert(insertData);
            console.log(`[GroupService] ${toAdd.length} admin(s) ajouté(s) à group_admins`);
        }

        // 3. Supprimer les admins retirés (demote)
        const toRemove = [...existingSet].filter(jid => !newSet.has(jid));
        if (toRemove.length > 0) {
            await supabase
                .from('group_admins')
                .delete()
                .eq('group_jid', groupJid)
                .in('user_jid', toRemove);

            console.log(`[GroupService] ${toRemove.length} admin(s) retiré(s) de group_admins`);
        }

        /*
        try {
            // ... (code supprimé/commenté)
        } catch(error) {
            console.error('[GroupService] syncAdminsToSupabase error:', error.message);
        }
        */
    },

    /**
     * Vérifie si un utilisateur est admin dans un groupe (via Supabase)
     * Utile pour les vérifications cross-data de permissions
     * @param {string} groupJid 
     * @param {string} userJid 
     * @returns {Promise<boolean>}
     */
    async isGroupAdmin(groupJid, userJid) {
        if (!supabase) return false;
        // Fallback Redis car table manquante
        return false;
        /*
        try {
            const { data } = await supabase
                .from('group_admins')
                .select('user_jid')
                .eq('group_jid', groupJid)
                .eq('user_jid', userJid)
                .single();

            return !!data;
        } catch (error) {
            return false;
        }
        */
    },

    /**
     * Liste tous les groupes où un utilisateur est admin
     * Utilisé par: gm_mygroups (group_manager plugin)
     * @param {string} userJid 
     * @returns {Promise<Array<string>>}
     */
    async getAdminGroups(userJid) {
        if (!supabase) return [];

        try {
            const { data } = await supabase
                .from('group_admins')
                .select('group_jid')
                .eq('user_jid', userJid);

            return (data || []).map(d => d.group_jid);
        } catch (error) {
            console.error('[GroupService] getAdminGroups error:', error.message);
            return [];
        }
    },

    /**
     * Compte le nombre d'admins par groupe
     * Utilisé par: gm_groupstats (group_manager plugin)
     * @param {string} groupJid 
     * @returns {Promise<number>}
     */
    async countAdmins(groupJid) {
        if (!supabase) return 0;

        try {
            const { count } = await supabase
                .from('group_admins')
                .select('*', { count: 'exact', head: true })
                .eq('group_jid', groupJid);

            return count || 0;
        } catch (error) {
            return 0;
        }
    },


    /**
     * Enregistre une activité (Appelé par BotCore à chaque message de groupe)
     */
    async trackActivity(groupJid, userJid) {
        await StateManager.recordGroupActivity(groupJid, userJid);
    },

    /**
     * Génère le rapport de stats pour la commande .stats ou gm_stats
     */
    async getStatsReport(groupJid) {
        const leaderboard = await StateManager.getGroupLeaderboard(groupJid, 10);

        if (!leaderboard || leaderboard.length === 0) {
            return "📊 Pas encore de statistiques pour ce groupe.";
        }

        let report = `📊 **TOP 10 MEMBRES ACTIFS**\n`;

        // On résout les noms (Nécessite UserService pour convertir JID -> Nom)
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const jid = entry.value;
            const score = entry.score;

            // Récupération optimisée du nom (déjà en cache Redis)
            let name = jid.split('@')[0];
            if (this.userService) {
                const profile = await this.userService.getProfile(jid);
                if (profile && profile.names && profile.names[0]) {
                    name = profile.names[0];
                }
            }

            // Médaille pour le top 3
            const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `${i + 1}.`));

            report += `\n${medal} ${name} : ${score} msgs`;
        }

        return report;
    }
};

export default groupService;

