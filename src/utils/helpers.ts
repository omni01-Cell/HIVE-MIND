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
  if (COMMAND_PREFIXES.some((prefix: any) => cleanText.startsWith(prefix))) return false;

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
  if (NOISE_PATTERNS.some((pattern: any) => pattern.test(cleanText))) return false;

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

  // 1. Convertir les liens Markdown [Texte](URL) en "Texte (URL)"
  // On le fait en premier pour éviter que les * ou _ dans les URL ne soient formatés
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // 2. Convertir les TITRES Markdown (# Titre) en (**TITRE EN MAJUSCULES**) pour que le Bold processing (5) le gère
  formatted = formatted.replace(/^#+\s*(.*$)/gm, (_, title: string) => {
    return `**${title.toUpperCase().trim()}**`;
  });

  // Guard: Si le texte est très long, on limite les remplacements complexes
  const MAX_COMPLEX_FORMAT_LENGTH = 5000;
  if (formatted.length > MAX_COMPLEX_FORMAT_LENGTH) {
    return formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
  }

  // 3. Convertir le GRAS+ITALIQUE (***text*** ou ___text___) en WhatsApp (*_text_*)
  formatted = formatted.replace(/\*\*\*([^\*]+)\*\*\*/g, '*_$1_*');
  formatted = formatted.replace(/___([^_]+)___/g, '*_$1_*');

  // 4. Convertir l'ITALIQUE Markdown simple (*text*) en WhatsApp (_text_)
  // Regex : un seul astérisque, pas d'espace juste après ni juste avant
  formatted = formatted.replace(/(?<!\*)\*(?!\s)([^\*]+?)(?<!\s)\*(?!\*)/g, '_$1_');

  // 5. Convertir le GRAS Markdown (**text**) en WhatsApp (*text*)
  formatted = formatted.replace(/\*\*([^\*]+)\*\*/g, '*$1*');

  // 6. Convertir l'italique Markdown alternatif (__text__) en WhatsApp (_text_)
  formatted = formatted.replace(/__([^_]+)__/g, '_$1_');

  // 7. Convertir le barré (~~text~~) en WhatsApp (~text~)
  formatted = formatted.replace(/~~([^~]+)~~/g, '~$1~');

  // 8. Nettoyer les blocs de code (WhatsApp supporte ```code``` nativement, on s'assure juste de la propreté)
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/gs, (_, lang, code) => `\`\`\`\n${code.trim()}\n\`\`\``);

  // 9. Listes et Citations : WhatsApp supporte nativement -, *, 1. et >
  // On nettoie juste les espaces superflus en début de ligne pour garantir la détection par WhatsApp
  formatted = formatted.replace(/^[ \t]+([-*]|\d+\.|>)\s/gm, '$1 ');

  // 10. Nettoyer les sauts de ligne excessifs
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted.trim();
};

/**
 * Nettoie le texte pour WhatsApp en retirant les informations sensibles
 * (chemins de fichiers locaux, commandes système, etc.)
 * @param text 
 */
export const sanitizeForWhatsApp = (text: string | null | undefined): string => {
  if (!text) return '';
  
  let sanitized = text;
  
  // 1. Masquer les chemins de fichiers (ex: /home/user/...)
  sanitized = sanitized.replace(/\/home\/[a-zA-Z0-9._-]+\//g, '~/');
  
  // 2. Masquer les variables d'environnement sensibles
  const SENSITIVE_VARS = ['API_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'SUPABASE_KEY', 'OPENAI_API_KEY'];
  SENSITIVE_VARS.forEach(v => {
    const regex = new RegExp(`${v}=[a-zA-Z0-9._-]+`, 'gi');
    sanitized = sanitized.replace(regex, `${v}=********`);
  });

  return sanitized;
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
