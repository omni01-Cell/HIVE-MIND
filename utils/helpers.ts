/**
 * utils/helpers.ts
 * Fonctions utilitaires diverses
 */

/**
 * Délai async
 * @param ms Millisecondes à attendre
 */
export const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Délai aléatoire entre min et max
 * @param min 
 * @param max 
 */
export const randomDelay = (min: number, max: number): Promise<void> => {
  const ms = min + Math.random() * (max - min);
  return delay(ms);
};

export interface DelayRange {
  min: number;
  max: number;
}

/**
 * Parse un délai du format "1000-3000" en {min, max}
 * @param delayStr 
 */
export const parseDelayRange = (delayStr: string | null | undefined): DelayRange => {
  const DEFAULT_MIN = 1000;
  const DEFAULT_MAX = 2000;
  
  if (!delayStr) return { min: DEFAULT_MIN, max: DEFAULT_MAX };
  
  const [min, max] = delayStr.split('-').map(Number);
  return { 
    min: min || DEFAULT_MIN, 
    max: max || min || DEFAULT_MAX 
  };
};

/**
 * Tronque un texte à une longueur max
 * @param text 
 * @param maxLength 
 */
export const truncate = (text: string | null | undefined, maxLength: number = 100): string => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Extrait le numéro de téléphone d'un JID
 * @param jid 
 */
export const jidToPhone = (jid: string | null | undefined): string => {
  return jid?.split('@')[0] || '';
};

/**
 * Convertit un numéro en JID
 * @param phone 
 */
export const phoneToJid = (phone: string): string => {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return `${cleaned}@s.whatsapp.net`;
};

/**
 * Vérifie si un JID est un groupe
 * @param jid 
 */
export const isGroupJid = (jid: string | null | undefined): boolean => {
  return jid?.endsWith('@g.us') || false;
};

/**
 * Échape les caractères spéciaux pour regex
 * @param str 
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Génère un ID unique
 */
export const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Formate une date en français
 * @param date 
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

/**
 * Parse un texte pour extraire les mentions
 * @param text 
 */
export const extractMentions = (text: string | null | undefined): string[] => {
  if (!text) return [];
  const mentions: string[] = [];
  const regex = /@(\d+)/g;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    mentions.push(`${match[1]}@s.whatsapp.net`);
  }
  return mentions;
};

/**
 * Détermine si un message doit être stocké dans la mémoire sémantique
 * @param text Le contenu du message
 * @param role 'user' ou 'assistant'
 * @returns 
 */
export const isStorable = (text: string | null | undefined, role: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  const cleanText = text.trim();

  // 1. Exclure les commandes (commençant par !, /, .)
  const COMMAND_PREFIXES = ['!', '/', '.', '?'];
  if (COMMAND_PREFIXES.some(prefix => cleanText.startsWith(prefix))) return false;

  // 2. Exclure les messages trop courts (peu de valeur sémantique)
  const MIN_STORABLE_LENGTH = 5;
  if (cleanText.length < MIN_STORABLE_LENGTH) return false;

  // 3. Exclure les messages d'erreur types ou techniques
  const NOISE_PATTERNS = [
    /🤖 Démarrage/i,
    /❌ Erreur/i,
    /Oups, j'ai bugué/i,
    /Veuillez patienter/i,
    /Scannez le QR Code/i
  ];
  if (NOISE_PATTERNS.some(pattern => pattern.test(cleanText))) return false;

  // 4. Exclure les messages de l'assistant qui sont des refus
  if (role === 'assistant' && (cleanText.includes("Désolé") || cleanText.includes("Je ne peux pas"))) {
    return false;
  }

  return true;
};

/**
 * Convertit le Markdown standard (Web) en format compatible WhatsApp
 * Gère: Gras (**→*), Titres (#→*CAPS*), Liens, Listes, Code
 * @param text 
 */
export const formatToWhatsApp = (text: string | null | undefined): string => {
  if (!text) return '';

  let formatted = text;

  // 1. Convertir le GRAS+ITALIQUE (***text***) en WhatsApp (*_text_*)
  formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '*_$1_*');

  // Guard: Si le texte est trop long, on simplifie le formatage
  const MAX_COMPLEX_FORMAT_LENGTH = 5000;
  if (formatted.length > MAX_COMPLEX_FORMAT_LENGTH) {
    return formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
  }

  // 2. Convertir le GRAS standard (**text**) en WhatsApp (*text*)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // 3. Convertir les TITRES Markdown (# Titre) en (*TITRE EN MAJUSCULES*)
  formatted = formatted.replace(/^#+\s*(.*$)/gm, (_, title: string) => {
    return `\n*${title.toUpperCase().trim()}*`;
  });

  // 4. Convertir les liens Markdown [Texte](URL) en "Texte (URL)"
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // 5. Convertir l'italique Markdown (__text__) en WhatsApp (_text_)
  formatted = formatted.replace(/__(.*?)__/g, '_$1_');

  // 6. Convertir le barré (~~text~~) en WhatsApp (~text~)
  formatted = formatted.replace(/~~(.*?)~~/g, '~$1~');

  // 7. Nettoyer les blocs de code
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/gs, '```\n$2```');

  // 8. Standardiser les listes
  formatted = formatted.replace(/^\s*[-*]\s+/gm, '• ');

  // 9. Nettoyer les sauts de ligne excessifs
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
