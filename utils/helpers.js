// utils/helpers.js
// Fonctions utilitaires diverses

/**
 * Délai async
 * @param {number} ms 
 */
export const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Délai aléatoire entre min et max
 * @param {number} min 
 * @param {number} max 
 */
export const randomDelay = (min, max) => {
    const ms = min + Math.random() * (max - min);
    return delay(ms);
};

/**
 * Parse un délai du format "1000-3000" en {min, max}
 * @param {string} delayStr 
 */
export const parseDelayRange = (delayStr) => {
    if (!delayStr) return { min: 1000, max: 2000 };
    const [min, max] = delayStr.split('-').map(Number);
    return { min: min || 1000, max: max || min || 2000 };
};

/**
 * Tronque un texte à une longueur max
 * @param {string} text 
 * @param {number} maxLength 
 */
export const truncate = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
};

/**
 * Extrait le numéro de téléphone d'un JID
 * @param {string} jid 
 */
export const jidToPhone = (jid) => {
    return jid?.split('@')[0] || jid;
};

/**
 * Convertit un numéro en JID
 * @param {string} phone 
 */
export const phoneToJid = (phone) => {
    const cleaned = phone.replace(/[^0-9]/g, '');
    return `${cleaned}@s.whatsapp.net`;
};

/**
 * Vérifie si un JID est un groupe
 * @param {string} jid 
 */
export const isGroupJid = (jid) => {
    return jid?.endsWith('@g.us') || false;
};

/**
 * Échape les caractères spéciaux pour regex
 * @param {string} str 
 */
export const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Génère un ID unique
 */
export const generateId = () => {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Formate une date en français
 * @param {Date} date 
 */
export const formatDate = (date) => {
    return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
};

/**
 * Parse un texte pour extraire les mentions
 * @param {string} text 
 */
export const extractMentions = (text) => {
    const mentions = [];
    const regex = /@(\d+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        mentions.push(`${match[1]}@s.whatsapp.net`);
    }
    return mentions;
};

/**
 * Détermine si un message doit être stocké dans la mémoire sémantique
 * @param {string} text - Le contenu du message
 * @param {string} role - 'user' ou 'assistant'
 * @returns {boolean}
 */
export const isStorable = (text, role) => {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();

    // 1. Exclure les commandes (commençant par !, /, .)
    const commandPrefixes = ['!', '/', '.', '?'];
    if (commandPrefixes.some(prefix => cleanText.startsWith(prefix))) return false;

    // 2. Exclure les messages trop courts (peu de valeur sémantique)
    if (cleanText.length < 5) return false;

    // 3. Exclure les messages d'erreur types ou techniques
    const noisePatterns = [
        /🤖 Démarrage/i,
        /❌ Erreur/i,
        /Oups, j'ai bugué/i,
        /Veuillez patienter/i,
        /Scannez le QR Code/i
    ];
    if (noisePatterns.some(pattern => pattern.test(cleanText))) return false;

    // 4. Exclure les messages de l'assistant qui sont des refus (optionnel)
    if (role === 'assistant' && (cleanText.includes("Désolé") || cleanText.includes("Je ne peux pas"))) {
        return false;
    }

    return true;
};

/**
 * Convertit le Markdown standard (Web) en format compatible WhatsApp
 * Gère: Gras (**→*), Titres (#→*CAPS*), Liens, Listes, Code
 * @param {string} text 
 */
export const formatToWhatsApp = (text) => {
    if (!text) return '';

    let formatted = text;

    // 1. Convertir le GRAS+ITALIQUE (***text***) en WhatsApp (*_text_*)
    formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '*_$1_*');

    // Guard: Si le texte est trop long, on simplifie le formatage pour éviter le ReDoS
    if (formatted.length > 5000) {
        // Formatage simplifié pour les textes très longs
        return formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
    }

    // 2. Convertir le GRAS standard (**text**) en WhatsApp (*text*)
    // Regex optimisé : On capture ce qui n'est PAS une * entre les **
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');

    // 3. Convertir les TITRES Markdown (# Titre) en (*TITRE EN MAJUSCULES*)
    formatted = formatted.replace(/^#+\s*(.*$)/gm, (_, title) => {
        return `\n*${title.toUpperCase().trim()}*`;
    });

    // 4. Convertir les liens Markdown [Texte](URL) en "Texte (URL)"
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // 5. Convertir l'italique Markdown (__text__) en WhatsApp (_text_)
    formatted = formatted.replace(/__(.*?)__/g, '_$1_');

    // 6. Convertir le barré (~~text~~) en WhatsApp (~text~)
    formatted = formatted.replace(/~~(.*?)~~/g, '~$1~');

    // 7. Nettoyer les blocs de code (enlever le nom du langage)
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/gs, '```\n$2```');

    // 8. Standardiser les listes : "* item" → "• item" et "- item" → "• item"
    formatted = formatted.replace(/^\s*[-*]\s+/gm, '• ');

    // 9. Nettoyer les sauts de ligne excessifs (max 2 consécutifs)
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // 10. Nettoyer les espaces en début de ligne (sauf pour les listes)
    formatted = formatted.replace(/^[ \t]+(?!•)/gm, '');

    return formatted.trim();
};

export default {
    delay,
    randomDelay,
    parseDelayRange,
    truncate,
    jidToPhone,
    phoneToJid,
    isGroupJid,
    escapeRegex,
    generateId,
    formatDate,
    extractMentions,
    isStorable,
    formatToWhatsApp
};
