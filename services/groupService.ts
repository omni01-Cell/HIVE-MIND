/**
 * services/groupService.ts
 * SERVICE GROUPE UNIFIÉ (Cache + Aggressive Identity Linking)
 * Gère les métadonnées des groupes, le contexte social et les missions bot.
 */

import { redis } from './redisClient.js';
import { StateManager, LeaderboardEntry } from './state/StateManager.js';
import { supabase } from './supabase.js';

export interface GroupMember {
  jid: string;
  lid: string | null;
  phoneNumber: string | null;
  name: string | null;
  isAdmin: boolean;
}

export interface GroupData {
  jid: string;
  name: string;
  description: string;
  owner: string;
  admins: string; // JSON string in Redis
  members: string; // JSON string in Redis
  member_count: string;
  last_updated: string;
}

export interface GroupContext {
  type: 'GROUP' | 'PRIVATE';
  sender: any;
  group: {
    jid: string;
    name: string;
    description: string;
    owner: string;
    admins: string[];
    member_count: number;
    tasks: any[];
    bot_mission?: string;
  } | null;
  senderIsAdmin: boolean;
  senderLid: string | null;
}

export interface BotMission {
  title: string;
  description: string;
  author: string | null;
}

/**
 * Service de gestion des groupes WhatsApp
 */
export const groupService = {
  container: null as any,

  /**
   * Injecte le conteneur de services
   */
  setContainer(container: any): void {
    this.container = container;
  },

  /**
   * Getter pour userService (résolution lazy via container)
   */
  get userService() {
    return this.container?.get('userService');
  },

  /**
   * Met à jour le cache groupe avec les métadonnées WhatsApp
   */
  async updateGroup(groupJid: string, waMetadata: any): Promise<void> {
    const cacheKey = `group:${groupJid}:meta`;

    try {
      const adminIds = waMetadata.participants
        .filter((p: any) => p.admin === 'admin' || p.admin === 'superadmin')
        .map((p: any) => p.id);

      const members: GroupMember[] = waMetadata.participants.map((p: any) => {
        const realJid = p.jid || p.id;
        const lid = p.lid || (p.id.endsWith('@lid') ? p.id : null);

        if (realJid.endsWith('@s.whatsapp.net') && lid && this.userService) {
          this.userService.registerLid(realJid, lid).catch(() => {});
        }

        let phoneJid = null;
        if (realJid.endsWith('@s.whatsapp.net')) {
          phoneJid = realJid;
        }

        return {
          jid: realJid,
          lid: lid,
          phoneNumber: phoneJid,
          name: p.name || p.notify || null,
          isAdmin: p.admin === 'admin' || p.admin === 'superadmin'
        };
      });

      // Enrichissement des numéros de téléphone pour les LIDs
      if (this.userService) {
        await Promise.all(members.map(async (m) => {
          if (!m.phoneNumber && m.jid.endsWith('@lid')) {
            const resolved = await this.userService.resolveLid(m.jid);
            if (resolved && resolved.endsWith('@s.whatsapp.net')) {
              m.phoneNumber = resolved;
            }
          }
        }));
      }

      const groupData: GroupData = {
        jid: groupJid,
        name: waMetadata.subject || '',
        description: waMetadata.desc ? waMetadata.desc.toString() : '',
        owner: waMetadata.owner || '',
        admins: JSON.stringify(adminIds),
        members: JSON.stringify(members),
        member_count: waMetadata.participants.length.toString(),
        last_updated: Date.now().toString()
      };

      await redis.hSet(cacheKey, groupData as any);
      await redis.expire(cacheKey, 86400); // 24h

      if (supabase) {
        let founder = waMetadata.owner || waMetadata.subjectOwner;
        let validFounderJid: string | null = null;

        if (founder) {
          if (founder.includes('@s.whatsapp.net')) {
            validFounderJid = founder;
          } else if (founder.endsWith('@lid') && this.userService) {
            const resolved = await this.userService.resolveLid(founder);
            if (resolved) validFounderJid = resolved;
          }
        }

        if (validFounderJid && this.userService) {
          await this.userService.getProfile(validFounderJid);
        }

        await supabase.from('groups').upsert({
          jid: groupJid,
          name: waMetadata.subject || '',
          founder_jid: validFounderJid || null,
          created_at: waMetadata.creation ? new Date(waMetadata.creation * 1000).toISOString() : new Date().toISOString()
        }, { onConflict: 'jid' });

        await this.syncAdminsToSupabase(groupJid, adminIds);
      }

      console.log(`[GroupService] Groupe mis à jour: ${waMetadata.subject}`);
    } catch (error: any) {
      console.error('[GroupService] updateGroup error:', error.message);
    }
  },

  /**
   * Vérifie si les données du groupe nécessitent une mise à jour
   */
  async needsUpdate(groupJid: string): Promise<boolean> {
    const cacheKey = `group:${groupJid}:meta`;

    try {
      const [lastUpdated, members] = await Promise.all([
        redis.hGet(cacheKey, 'last_updated'),
        redis.hGet(cacheKey, 'members')
      ]);

      if (!lastUpdated) return true;
      if (!members || members === '[]') return true;

      const ONE_DAY = 24 * 60 * 60 * 1000;
      if ((Date.now() - parseInt(lastUpdated)) > ONE_DAY) return true;

      if (members.includes('@lid"')) {
        try {
          const parsedMembers = JSON.parse(members);
          const hasBadData = parsedMembers.some((m: any) => m.jid && m.jid.endsWith('@lid'));
          if (hasBadData) return true;
        } catch (e) {}
      }

      if (supabase) {
        const { count, error } = await supabase
          .from('groups')
          .select('jid', { count: 'exact', head: true })
          .eq('jid', groupJid);

        if (!error && count === 0) return true;
      }

      return false;
    } catch (error) {
      return true;
    }
  },

  /**
   * Invalide le cache d'un groupe
   */
  async invalidateCache(groupJid: string): Promise<void> {
    const cacheKey = `group:${groupJid}:meta`;
    try {
      await redis.del(cacheKey);
    } catch (error: any) {
      console.error('[GroupService] invalidateCache error:', error.message);
    }
  },

  /**
   * Récupère le contexte complet pour le prompt système
   */
  async getContext(chatJid: string, senderJid: string, userProfile: any): Promise<GroupContext> {
    const isGroup = chatJid.endsWith('@g.us');

    const context: GroupContext = {
      type: isGroup ? 'GROUP' : 'PRIVATE',
      sender: userProfile,
      group: null,
      senderIsAdmin: false,
      senderLid: null
    };

    if (!isGroup) return context;

    const cacheKey = `group:${chatJid}:meta`;

    try {
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
          tasks: []
        };

        context.senderIsAdmin = admins.includes(senderJid);

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
    } catch (error: any) {
      console.error('[GroupService] getContext error:', error.message);
    }

    return context;
  },

  /**
   * Récupère la liste des membres d'un groupe
   */
  async getGroupMembers(groupJid: string): Promise<GroupMember[]> {
    const cacheKey = `group:${groupJid}:meta`;

    try {
      const membersJson = await redis.hGet(cacheKey, 'members');
      if (membersJson) {
        const members = JSON.parse(membersJson) as GroupMember[];

        if (this.userService) {
          return await Promise.all(
            members.map(async (member) => {
              if (member.name && member.name !== 'Inconnu') return member;
              try {
                const profile = await this.userService.getProfile(member.jid);
                if (profile?.names?.[0] && profile.names[0] !== 'Inconnu') {
                  return { ...member, name: profile.names[0] };
                }
              } catch (e) {}
              return member;
            })
          );
        }
        return members;
      }
      return [];
    } catch (error: any) {
      console.error('[GroupService] getGroupMembers error:', error.message);
      return [];
    }
  },

  /**
   * Récupère la mission bot d'un groupe
   */
  async getBotMission(groupJid: string): Promise<BotMission | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('groups')
        .select('name, bot_mission')
        .eq('jid', groupJid)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[GroupService] getBotMission error:', error);
      }

      if (!data) return null;

      return {
        title: data.name,
        description: data.bot_mission,
        author: null
      };
    } catch (error: any) {
      console.error('[GroupService] getBotMission error:', error.message);
      return null;
    }
  },

  /**
   * Définit la mission bot d'un groupe
   */
  async setBotMission(groupJid: string, title: string, description: string, author: string): Promise<void> {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('groups')
        .upsert({
          jid: groupJid,
          name: title,
          bot_mission: description
        }, { onConflict: 'jid' });

      if (error) {
        console.error('[GroupService] setBotMission error:', error);
      }
    } catch (error: any) {
      console.error('[GroupService] setBotMission error:', error.message);
    }
  },

  /**
   * Synchronise les admins WhatsApp vers la table group_admins
   */
  async syncAdminsToSupabase(groupJid: string, adminJids: string[], promotedBy: string | null = null): Promise<void> {
    if (!supabase) return;

    try {
      const { data: existingAdmins, error: fetchError } = await supabase
        .from('group_admins')
        .select('user_jid')
        .eq('group_jid', groupJid);

      if (fetchError) {
        if (fetchError.message.includes('does not exist')) return;
        throw fetchError;
      }

      const existingSet = new Set((existingAdmins || []).map((a: any) => a.user_jid));
      const newSet = new Set(adminJids);

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
      }

      const toRemove = [...existingSet].filter(jid => !newSet.has(jid));
      if (toRemove.length > 0) {
        await supabase
          .from('group_admins')
          .delete()
          .eq('group_jid', groupJid)
          .in('user_jid', toRemove);
      }
    } catch (error: any) {
      console.error('[GroupService] syncAdminsToSupabase error:', error.message);
    }
  },

  /**
   * Vérifie si un utilisateur est admin dans un groupe
   */
  async isGroupAdmin(groupJid: string, userJid: string): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { data, error } = await supabase
        .from('group_admins')
        .select('user_jid')
        .eq('group_jid', groupJid)
        .eq('user_jid', userJid)
        .maybeSingle();

      if (error) {
        const cacheKey = `group:${groupJid}:meta`;
        const adminsJson = await redis.hGet(cacheKey, 'admins');
        if (adminsJson) {
          const admins = JSON.parse(adminsJson);
          return admins.includes(userJid);
        }
        return false;
      }

      return !!data;
    } catch (error) {
      return false;
    }
  },

  /**
   * Liste tous les groupes où un utilisateur est admin
   */
  async getAdminGroups(userJid: string): Promise<string[]> {
    if (!supabase) return [];

    try {
      const { data } = await supabase
        .from('group_admins')
        .select('group_jid')
        .eq('user_jid', userJid);

      return (data || []).map((d: any) => d.group_jid);
    } catch (error: any) {
      console.error('[GroupService] getAdminGroups error:', error.message);
      return [];
    }
  },

  /**
   * Compte le nombre d'admins par groupe
   */
  async countAdmins(groupJid: string): Promise<number> {
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
   * Enregistre une activité
   */
  async trackActivity(groupJid: string, userJid: string): Promise<void> {
    await StateManager.recordGroupActivity(groupJid, userJid);
  },

  /**
   * Génère le rapport de stats pour la commande .stats
   */
  async getStatsReport(groupJid: string): Promise<string> {
    const leaderboard: LeaderboardEntry[] = await StateManager.getGroupLeaderboard(groupJid, 10);

    if (!leaderboard || leaderboard.length === 0) {
      return "📊 Pas encore de statistiques pour ce groupe.";
    }

    let report = `📊 **TOP 10 MEMBRES ACTIFS**\n`;

    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const jid = entry.value;
      const score = entry.score;

      let name = jid.split('@')[0];
      if (this.userService) {
        const profile = await this.userService.getProfile(jid);
        if (profile && profile.names && profile.names[0]) {
          name = profile.names[0];
        }
      }

      const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `${i + 1}.`));
      report += `\n${medal} ${name} : ${score} msgs`;
    }

    return report;
  }
};

export default groupService;
