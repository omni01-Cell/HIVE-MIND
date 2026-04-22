/**
 * services/state/IdentityMap.ts
 * SERVICE DE RÉSOLUTION D'IDENTITÉ (LID <-> JID)
 * Gère la correspondance entre LID (device) et JID (téléphone)
 */

import { redis } from '../redisClient.js';
import { supabase } from '../supabase.js';
import { extractNumericId } from '../../utils/jidHelper.js';

/**
 * Service de mapping d'identité WhatsApp
 */
export const IdentityMap = {
  /**
   * Résout un identifiant vers le JID canonique (clé primaire DB)
   * @param identifier JID, LID, ou identifiant brut
   * @returns Le JID canonique ou l'identifiant original si non résolu
   */
  async resolve(identifier: string | null | undefined): Promise<string | null> {
    if (!identifier) return null;

    // Groupes: pas de résolution nécessaire
    if (identifier.endsWith('@g.us')) return identifier;

    // Nettoyage: retirer le device suffix (ex: "123:45@s.whatsapp.net" -> "123@s.whatsapp.net")
    const id = identifier.split(':')[0];

    // Cas 1: Déjà un JID (numéro de téléphone) → Retour direct
    if (id.endsWith('@s.whatsapp.net')) return id;

    // Cas 2: C'est un LID → Chercher le mapping
    if (id.endsWith('@lid')) {
      const numericId = extractNumericId(id);
      const lidKey = `map:lid:${numericId}`;

      // A. Cache Redis (Rapide, <1ms)
      const cachedJid = await redis?.get(lidKey);
      if (cachedJid) return cachedJid;

      // B. Fallback Supabase (Lent, ~50-200ms)
      if (supabase) {
        const { data } = await supabase
          .from('users')
          .select('jid')
          .eq('lid', id)
          .single();

        if (data?.jid) {
          // Hydrater le cache pour les prochaines requêtes
          await redis?.set(lidKey, data.jid, { EX: 86400 * 7 }); // TTL: 7 jours
          return data.jid;
        }
      }

      // C. Inconnu: Retourner le LID tel quel (évite les crashs)
      return id;
    }

    return id;
  },

  /**
   * Enregistre l'association LID <-> JID et fusionne les comptes fantômes
   * @param id1 Premier identifiant (JID ou LID)
   * @param id2 Second identifiant (JID ou LID)
   */
  async register(id1: string | null | undefined, id2: string | null | undefined): Promise<void> {
    if (!id1 || !id2) return;

    let phoneJid: string | null = null;
    let deviceLid: string | null = null;

    if (id1.includes('@s.whatsapp.net')) phoneJid = id1;
    else if (id1.includes('@lid')) deviceLid = id1;

    if (id2.includes('@s.whatsapp.net')) phoneJid = id2;
    else if (id2.includes('@lid')) deviceLid = id2;

    if (!phoneJid || !deviceLid) return;

    // ──────────────────────────────────────────────────────────────────
    // Mise à jour du cache Redis
    // ──────────────────────────────────────────────────────────────────
    const lidKey = `map:lid:${extractNumericId(deviceLid)}`;
    await redis?.set(lidKey, phoneJid);

    if (supabase) {
      try {
        // A. Vérifier si le "Fantôme" existe
        const { data: ghostUser } = await supabase
          .from('users')
          .select('*')
          .eq('jid', deviceLid)
          .single();

        if (ghostUser) {
          const debugIdentity = await redis?.get('config:debug:identity') === 'true';
          if (debugIdentity) {
            console.log(`[IdentityMap] 👻 Fantôme détecté (${deviceLid}). Fusion vers le JID réel (${phoneJid})...`);
          }

          // B. Récupérer ou créer le vrai User
          const { data: realUser } = await supabase
            .from('users')
            .select('*')
            .eq('jid', phoneJid)
            .single();

          // C. Calculer les nouvelles stats fusionnées
          const ghostXp = parseInt(ghostUser.interaction_count) || 0;
          const realXp = realUser ? (parseInt(realUser.interaction_count) || 0) : 0;
          const newXp = ghostXp + realXp;

          // D. Transaction de fusion
          const { error: upsertError } = await supabase.from('users').upsert({
            jid: phoneJid,
            lid: deviceLid,
            username: realUser?.username || ghostUser.username,
            interaction_count: newXp,
            updated_at: new Date().toISOString()
          }, { onConflict: 'jid' });

          if (!upsertError) {
            await supabase.from('users').delete().eq('jid', deviceLid);
            if (debugIdentity) {
              console.log(`[IdentityMap] ✨ Fusion terminée : ${deviceLid} -> ${phoneJid} (Total XP: ${newXp})`);
            }
          } else {
            console.error('[IdentityMap] Echec fusion (Upsert failed):', upsertError.message);
          }
          return;
        }

        // E. Cas Standard
        await supabase.from('users').upsert({
          jid: phoneJid,
          lid: deviceLid,
          updated_at: new Date().toISOString()
        }, { onConflict: 'jid' });

      } catch (error: any) {
        console.error('[IdentityMap] Erreur process identity:', error.message);
      }
    }
  }
};
