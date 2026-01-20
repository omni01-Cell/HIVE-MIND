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
    async resolve(identifier) {
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

    // ========================================================================
    // MÉTHODE DE FUSION D'IDENTITÉ (Ghost User Merge)
    // ========================================================================

    /**
     * Enregistre l'association LID <-> JID et fusionne les comptes fantômes
     * 
     * SCÉNARIO TYPE:
     * 1. User "Irving" envoie un status WhatsApp → Bot reçoit son LID
     * 2. Bot crée un profil avec JID = LID (car on ne connait pas encore son vrai numéro)
     * 3. Plus tard, Irving rejoint un groupe → Bot reçoit [JID, LID] côte à côte
     * 4. Cette méthode détecte le "fantôme" et FUSIONNE les comptes
     * 
     * @param {string} id1 - Premier identifiant (JID ou LID, ordre indifférent)
     * @param {string} id2 - Second identifiant (JID ou LID, ordre indifférent)
     * 
     * @example
     * // Appelé automatiquement par GroupService lors du scan des membres
     * await IdentityMap.register('33612345678@s.whatsapp.net', '186101520...@lid');
     */
    async register(id1, id2) {
        if (!id1 || !id2) return;

        // ──────────────────────────────────────────────────────────────────
        // ÉTAPE 1: Détection automatique des types (ordre-agnostique)
        // ──────────────────────────────────────────────────────────────────
        let phoneJid = null;  // Le "vrai" identifiant (numéro de téléphone)
        let deviceLid = null; // L'identifiant device (cryptique)

        if (id1.includes('@s.whatsapp.net')) phoneJid = id1;
        else if (id1.includes('@lid')) deviceLid = id1;

        if (id2.includes('@s.whatsapp.net')) phoneJid = id2;
        else if (id2.includes('@lid')) deviceLid = id2;

        // Si on n'a pas les deux types, impossible de faire le mapping
        if (!phoneJid || !deviceLid) return;

        // ──────────────────────────────────────────────────────────────────
        // ÉTAPE 2: Mise à jour du cache Redis (toujours faire en premier)
        // ──────────────────────────────────────────────────────────────────
        const lidKey = `map:lid:${extractNumericId(deviceLid)}`;
        await redis?.set(lidKey, phoneJid); // Écrase toute valeur précédente

        if (supabase) {
            try {
                // A. Vérifier si le "Fantôme" (LID stocké comme JID) existe
                // C'est le cas critique : User enregistré via LID avant qu'on connaisse son JID
                const { data: ghostUser } = await supabase
                    .from('users')
                    .select('*')
                    .eq('jid', deviceLid) // On cherche le LID dans la colonne JID
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

                    // D. Transaction de fusion (Sequentielle)
                    // 1. Mettre à jour le vrai user (ou le créer s'il n'existe pas encore)
                    const { error: upsertError } = await supabase.from('users').upsert({
                        jid: phoneJid,
                        lid: deviceLid, // On lie enfin le LID
                        // On garde le nom le plus récent ou celui du fantôme si pas de réal
                        // Note: username depend de la structure de table, assumons validité
                        username: realUser?.username || ghostUser.username,
                        interaction_count: newXp,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'jid' });

                    if (!upsertError) {
                        // 2. Supprimer le fantôme SEULEMENT si l'upsert a réussi
                        await supabase.from('users').delete().eq('jid', deviceLid);
                        if (debugIdentity) {
                            console.log(`[IdentityMap] ✨ Fusion terminée : ${deviceLid} -> ${phoneJid} (Total XP: ${newXp})`);
                        }
                    } else {
                        console.error('[IdentityMap] Echec fusion (Upsert failed):', upsertError.message);
                    }
                    return;
                }

                // E. Cas Standard : Pas de fantôme, on fait juste un upsert normal
                // (Mise à jour du LID sur un user existant ou création)
                await supabase.from('users').upsert({
                    jid: phoneJid,
                    lid: deviceLid,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'jid' });

            } catch (error) {
                console.error('[IdentityMap] Erreur process identity:', error.message);
            }
        }
    }
};
