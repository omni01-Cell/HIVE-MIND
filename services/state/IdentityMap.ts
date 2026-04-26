// services/state/IdentityMap.js
// ============================================================================
// SERVICE DE RÉSOLUTION D'IDENTITÉ (LID <-> JID)
// ============================================================================
// 
// CONTEXTE WHATSAPP:
// - JID (Jabber ID) : Identifiant basé sur le numéro de téléphone (ex: 33612345678@s.whatsapp.net)
// - LID (Local ID)  : Identifiant de device cryptique (ex: 186101520123456@lid)
// 
// PROBLÈME RÉSOLU:
// WhatsApp envoie parfois le LID au lieu du JID (notamment dans les groupes).
// Sans mapping, on créerait des profils "fantômes" distincts pour la même personne.
// 
// SOLUTION:
// 1. resolve() : Convertit un LID en JID si le mapping existe
// 2. register(): Enregistre le lien LID<->JID et FUSIONNE les comptes fantômes
//
// ============================================================================

import { redis } from '../redisClient.js';
import { supabase } from '../supabase.js';
import { extractNumericId } from '../../utils/jidHelper.js';

/**
 * Service de mapping d'identité WhatsApp
 * Gère la correspondance entre LID (device) et JID (téléphone)
 */
export const IdentityMap = {
    /**
     * Résout un identifiant vers le JID canonique (clé primaire DB)
     * 
     * @param {string} identifier - JID, LID, ou identifiant brut
     * @returns {Promise<string>} Le JID canonique ou l'identifiant original si non résolu
     * 
     * @example
     * // Si mapping existe: 186...@lid -> 336...@s.whatsapp.net
     * await IdentityMap.resolve('186101520...@lid'); // '33612345678@s.whatsapp.net'
     * 
     * // Si pas de mapping, retourne l'original
     * await IdentityMap.resolve('inconnu@lid'); // 'inconnu@lid'
     */
    async resolve(identifier: any) {
        if (!identifier) return null;

        // Groupes: pas de résolution nécessaire
        if (identifier.endsWith('@g.us')) return identifier;

        // Nettoyage (supprime le ':12' de '33612345678:12@s.whatsapp.net')
        const id = identifier.replace(/:\d+@/, '@');

        if (id.endsWith('@s.whatsapp.net')) return id;

        if (id.endsWith('@lid')) {
            const numericId = extractNumericId(id);
            const lidKey = `map:lid:${numericId}`;

            // A. Cache Redis
            const cachedJid = await redis?.get(lidKey);
            if (cachedJid) return cachedJid;

            // B. Fallback Supabase (Recherche d'une identité soeur)
            if (supabase) {
                // Trouver le user_id de ce LID
                const { data: lidIdentity } = await supabase
                    .from('user_identities')
                    .select('user_id')
                    .eq('platform', 'whatsapp')
                    .eq('platform_user_id', id)
                    .single();

                if (lidIdentity?.user_id) {
                    // Trouver le JID associé à ce même user_id
                    const { data: phoneIdentity } = await supabase
                        .from('user_identities')
                        .select('platform_user_id')
                        .eq('platform', 'whatsapp')
                        .eq('user_id', lidIdentity.user_id)
                        .like('platform_user_id', '%@s.whatsapp.net')
                        .single();

                    if (phoneIdentity?.platform_user_id) {
                        await redis?.set(lidKey, phoneIdentity.platform_user_id, { EX: 86400 * 7 });
                        return phoneIdentity.platform_user_id;
                    }
                }
            }
            return id;
        }

        return id;
    },

    // ========================================================================
    // MÉTHODE DE FUSION D'IDENTITÉ (Ghost User Merge)
    // ========================================================================

    async register(id1: any, id2: any) {
        if (!id1 || !id2) return;

        let phoneJid: any = null;
        let deviceLid: any = null;

        if (id1.includes('@s.whatsapp.net')) phoneJid = id1;
        else if (id1.includes('@lid')) deviceLid = id1;

        if (id2.includes('@s.whatsapp.net')) phoneJid = id2;
        else if (id2.includes('@lid')) deviceLid = id2;

        if (!phoneJid || !deviceLid) return;

        const lidKey = `map:lid:${extractNumericId(deviceLid)}`;
        await redis?.set(lidKey, phoneJid);

        if (supabase) {
            try {
                // A. Trouver l'identité du Fantôme (LID)
                const { data: ghostIdentity } = await supabase
                    .from('user_identities')
                    .select('id, user_id, users(interaction_count)')
                    .eq('platform', 'whatsapp')
                    .eq('platform_user_id', deviceLid)
                    .single();

                // B. Trouver l'identité du Vrai (JID)
                const { data: realIdentity } = await supabase
                    .from('user_identities')
                    .select('id, user_id, users(interaction_count)')
                    .eq('platform', 'whatsapp')
                    .eq('platform_user_id', phoneJid)
                    .single();

                // Cas 1: Fantôme et Réel existent et sont différents -> FUSION
                if (ghostIdentity && realIdentity && ghostIdentity.user_id !== realIdentity.user_id) {
                    const debugIdentity = await redis?.get('config:debug:identity') === 'true';
                    if (debugIdentity) console.log(`[IdentityMap] 👻 Fusion fantôme: ${deviceLid} -> ${phoneJid}`);

                    const ghostXp = parseInt(ghostIdentity.users?.interaction_count || 0);
                    const realXp = parseInt(realIdentity.users?.interaction_count || 0);
                    const newXp = ghostXp + realXp;

                    // 1. Assigner le LID au vrai user_id
                    await supabase.from('user_identities').update({ user_id: realIdentity.user_id }).eq('id', ghostIdentity.id);
                    
                    // 2. Mettre à jour l'XP
                    await supabase.from('users').update({ interaction_count: newXp }).eq('id', realIdentity.user_id);
                    
                    // 3. Supprimer le user fantôme orphelin
                    await supabase.from('users').delete().eq('id', ghostIdentity.user_id);
                    
                    return;
                }

                // Cas 2: Seulement le LID existe -> Le promouvoir en rajoutant l'identité JID
                if (ghostIdentity && !realIdentity) {
                    await supabase.from('user_identities').insert({
                        user_id: ghostIdentity.user_id,
                        platform: 'whatsapp',
                        platform_user_id: phoneJid
                    });
                    return;
                }

                // Cas 3: Seulement le JID existe -> Lui rajouter l'identité LID
                if (realIdentity && !ghostIdentity) {
                    await supabase.from('user_identities').insert({
                        user_id: realIdentity.user_id,
                        platform: 'whatsapp',
                        platform_user_id: deviceLid
                    });
                    return;
                }

                // Cas 4: Aucun n'existe -> Créer les deux
                if (!realIdentity && !ghostIdentity) {
                    // C'est géré naturellement par Supabase (resolveUser) plus tard si besoin,
                    // mais on peut créer l'utilisateur pro-activement ici.
                    const { data: newUser } = await supabase.from('users').insert({ username: phoneJid }).select().single();
                    if (newUser) {
                        await supabase.from('user_identities').insert([
                            { user_id: newUser.id, platform: 'whatsapp', platform_user_id: phoneJid },
                            { user_id: newUser.id, platform: 'whatsapp', platform_user_id: deviceLid }
                        ]);
                    }
                }

            } catch (error: any) {
                console.error('[IdentityMap] Erreur process identity:', error.message);
            }
        }
    }
};
