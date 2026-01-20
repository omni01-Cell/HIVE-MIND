// utils/jidHelper.js
// Module utilitaire centralisé pour la gestion des JID/LID WhatsApp
// Single Source of Truth pour tous les matchings d'identifiants
// NE TOUCHE PAS LA DB - Pure logique

/**
 * Formats WhatsApp:
 * - JID: 22569456432@s.whatsapp.net (numéro de téléphone)
 * - LID: 90366833332436@lid (identifiant interne WhatsApp)
 * - Le même utilisateur peut avoir les deux formats selon le contexte
 */

/**
 * Extrait la partie numérique d'un JID ou LID
 * @param {string} jid - Format: xxx@s.whatsapp.net, xxx@lid, ou xxx:yyy@...
 * @returns {string} - Partie numérique uniquement
 */
export function extractNumericId(jid) {
    if (!jid) return '';
    // Supprimer tout après @ et avant : (pour les device IDs)
    return jid.split('@')[0].split(':')[0];
}

/**
 * Normalise un JID vers le format standard s.whatsapp.net
 * @param {string} jid 
 * @returns {string}
 */
export function normalizeJid(jid) {
    if (!jid) return '';
    const num = extractNumericId(jid);
    return num ? `${num}@s.whatsapp.net` : '';
}

/**
 * Vérifie si deux JID/LID correspondent au même utilisateur
 * Compare les parties numériques avec tolérance pour les sous-chaînes
 * @param {string} jid1 
 * @param {string} jid2 
 * @returns {boolean}
 */
export function jidMatch(jid1, jid2) {
    if (!jid1 || !jid2) return false;

    const num1 = extractNumericId(jid1);
    const num2 = extractNumericId(jid2);

    if (!num1 || !num2) return false;

    // Match exact
    if (num1 === num2) return true;

    // Match par inclusion (pour les LID qui peuvent être des sous-parties)
    // LID peut être plus long/court que le numéro de téléphone
    if (num1.includes(num2) || num2.includes(num1)) return true;

    return false;
}

/**
 * Trouve un match dans une Map de JID
 * Retourne le premier match trouvé
 * @param {string} searchJid - JID/LID à chercher
 * @param {Map<string, any>} jidMap - Map avec JID comme clés
 * @returns {{key: string, value: any}|null}
 */
export function findInJidMap(searchJid, jidMap) {
    if (!searchJid || !jidMap) return null;

    // Essai 1: Match exact (rapide)
    if (jidMap.has(searchJid)) {
        return { key: searchJid, value: jidMap.get(searchJid) };
    }

    // Essai 2: Match par numéro
    const searchNum = extractNumericId(searchJid);
    for (const [key, value] of jidMap) {
        if (jidMatch(searchJid, key)) {
            return { key, value };
        }
    }

    return null;
}

/**
 * Trouve un match dans un tableau d'objets contenant des JID
 * @param {string} searchJid 
 * @param {Array<Object>} array 
 * @param {string} jidField - Nom du champ contenant le JID (default: 'jid')
 * @returns {Object|null}
 */
export function findInJidArray(searchJid, array, jidField = 'jid') {
    if (!searchJid || !array) return null;

    for (const item of array) {
        if (jidMatch(searchJid, item[jidField])) {
            return item;
        }
    }

    return null;
}

/**
 * Vérifie si un JID est dans une liste (Set ou Array de JID)
 * @param {string} jid 
 * @param {Set<string>|Array<string>} jidList 
 * @returns {boolean}
 */
export function jidInList(jid, jidList) {
    if (!jid || !jidList) return false;

    const list = Array.isArray(jidList) ? jidList : [...jidList];
    return list.some(item => jidMatch(jid, item));
}

/**
 * Identifie le type de JID
 * @param {string} jid 
 * @returns {'phone'|'lid'|'group'|'unknown'}
 */
export function getJidType(jid) {
    if (!jid) return 'unknown';
    if (jid.endsWith('@g.us')) return 'group';
    if (jid.endsWith('@lid')) return 'lid';
    if (jid.endsWith('@s.whatsapp.net')) return 'phone';
    return 'unknown';
}

/**
 * Formate un JID pour l'affichage utilisateur (sans exposer le JID brut)
 * @param {string} jid 
 * @param {string} name - Nom optionnel à afficher
 * @returns {string}
 */
export function formatForDisplay(jid, name = null) {
    if (name && name !== 'Inconnu') {
        return name;
    }
    // Fallback: afficher le numéro masqué
    const num = extractNumericId(jid);
    if (num.length > 6) {
        return `+${num.substring(0, 3)}***${num.substring(num.length - 3)}`;
    }
    return num || 'Inconnu';
}

export default {
    extractNumericId,
    normalizeJid,
    jidMatch,
    findInJidMap,
    findInJidArray,
    jidInList,
    getJidType,
    formatForDisplay
};
