/**
 * utils/fuzzyMatcher.ts
 * Utilitaire de recherche floue pour les mentions WhatsApp
 */

export interface Member {
  name: string;
  jid: string;
  phoneNumber?: string;
}

export interface MatchResult {
  match: Member | null;
  score: number;
  exact: boolean;
}

export interface ResolvedMentions {
  text: string;
  mentions: string[];
  resolved: Member[];
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalise une chaîne pour la comparaison
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlève les accents
    .replace(/[^a-z0-9]/g, '');       // Garde que alphanum
}

/**
 * Vérifie si query est un préfixe ou diminutif de target
 */
function isPrefixOrNickname(query: string, target: string): boolean {
  const q = normalize(query);
  const t = normalize(target);

  if (t.startsWith(q)) return true;

  const MIN_SYLLABLE_LEN = 2;
  const SIMILARITY_THRESHOLD = 0.6;

  if (q.length >= MIN_SYLLABLE_LEN && t.startsWith(q.substring(0, 2))) {
    const similarity = 1 - (levenshteinDistance(q, t.substring(0, q.length + 2)) / Math.max(q.length, 3));
    if (similarity > SIMILARITY_THRESHOLD) return true;
  }

  return false;
}

/**
 * Trouve le meilleur match pour une query parmi une liste de candidats
 */
export function findBestMatch(query: string, candidates: Member[], threshold: number = 0.65): MatchResult {
  if (!query || !candidates || candidates.length === 0) {
    return { match: null, score: 0, exact: false };
  }

  // === DUAL RESOLVER: Phone Number Check (Priority #1) ===
  const isNumericQuery = /^\d+$/.test(query);

  if (isNumericQuery) {
    for (const candidate of candidates) {
      if (candidate.phoneNumber) {
        const cleanPhone = candidate.phoneNumber.split('@')[0];
        if (cleanPhone === query || cleanPhone.startsWith(query)) {
          return { match: candidate, score: 1, exact: true };
        }
      }

      if (!candidate.jid) continue;
      const idPart = candidate.jid.split('@')[0];
      const isLid = candidate.jid.endsWith('@lid');

      if (!isLid && (idPart === query || idPart.startsWith(query))) {
        return { match: candidate, score: 1, exact: true };
      }
    }
    return { match: null, score: 0, exact: false };
  }

  // === NAME MATCHING ===
  const normalizedQuery = normalize(query);
  let bestMatch: Member | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (!candidate.name) continue;

    const normalizedName = normalize(candidate.name);

    if (normalizedName === normalizedQuery) {
      return { match: candidate, score: 1, exact: true };
    }

    if (isPrefixOrNickname(normalizedQuery, normalizedName)) {
      const prefixScore = 0.9 - (normalizedQuery.length / normalizedName.length) * 0.1;
      if (prefixScore > bestScore) {
        bestScore = prefixScore;
        bestMatch = candidate;
      }
      continue;
    }

    if (normalizedName.includes(normalizedQuery)) {
      const partScore = 0.7 + (normalizedQuery.length / normalizedName.length) * 0.15;
      if (partScore > bestScore) {
        bestScore = partScore;
        bestMatch = candidate;
      }
    }

    const distance = levenshteinDistance(normalizedQuery, normalizedName);
    const maxLen = Math.max(normalizedQuery.length, normalizedName.length);
    const similarity = 1 - (distance / maxLen);

    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = candidate;
    }

    const nameParts = candidate.name.split(/\s+/);
    for (const part of nameParts) {
      const normalizedPart = normalize(part);

      if (normalizedPart === normalizedQuery) {
        return { match: candidate, score: 1, exact: true };
      }

      if (isPrefixOrNickname(normalizedQuery, normalizedPart)) {
        const partScore = 0.85;
        if (partScore > bestScore) {
          bestScore = partScore;
          bestMatch = candidate;
        }
      }
    }
  }

  if (bestScore >= threshold) {
    return { match: bestMatch, score: bestScore, exact: false };
  }

  return { match: null, score: bestScore, exact: false };
}

/**
 * Extrait toutes les mentions @Nom d'un texte
 */
export function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];

  const regex = /@([\p{L}\p{N}]+)/gu;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Résout les mentions dans un texte en les remplaçant par des JIDs WhatsApp
 */
export function resolveMentionsInText(text: string | null | undefined, members: Member[]): ResolvedMentions {
  if (!text || !members || members.length === 0) {
    return { text: text || '', mentions: [], resolved: [] };
  }

  const mentionNames = extractMentions(text);
  if (mentionNames.length === 0) {
    return { text, mentions: [], resolved: [] };
  }

  const resolvedJids: string[] = [];
  const resolvedMembers: Member[] = [];
  let processedText = text;

  for (const mentionName of mentionNames) {
    const { match, score } = findBestMatch(mentionName, members);

    if (match) {
      console.log(`[FuzzyMatcher] "@${mentionName}" → "${match.name}" (score: ${score.toFixed(2)})`);

      if (!resolvedJids.includes(match.jid)) {
        resolvedJids.push(match.jid);
        resolvedMembers.push(match);
      }

      const phoneNumber = match.jid.split('@')[0];
      processedText = processedText.replace(
        new RegExp(`@${mentionName}(?![\\p{L}\\p{N}])`, 'giu'),
        `@${phoneNumber}`
      );
    }
  }

  return {
    text: processedText,
    mentions: resolvedJids,
    resolved: resolvedMembers
  };
}

/**
 * Scan le texte pour trouver des noms de membres connus SANS le préfixe @
 */
export function resolveImplicitMentions(text: string | null | undefined, members: Member[]): ResolvedMentions {
  if (!text || !members || members.length === 0) {
    return { text: text || '', mentions: [], resolved: [] };
  }

  let processedText = text;
  const resolvedJids: string[] = [];
  const resolvedMembers: Member[] = [];

  const sortedMembers = [...members].sort((a: any, b: any) => (b.name?.length || 0) - (a.name?.length || 0));

  for (const member of sortedMembers) {
    const MIN_NAME_LEN = 3;
    if (!member.name || member.name.length < MIN_NAME_LEN) continue;

    const escapedName = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');

    if (regex.test(processedText)) {
      if (!resolvedJids.includes(member.jid)) {
        resolvedJids.push(member.jid);
        resolvedMembers.push(member);

        console.log(`[ImplicitMention] Nom trouvé: "${member.name}" → JID: ${member.jid}`);

        const phoneNumber = member.jid.split('@')[0];
        processedText = processedText.replace(regex, `@${phoneNumber}`);
      }
    }
  }

  return {
    text: processedText,
    mentions: resolvedJids,
    resolved: resolvedMembers
  };
}

export default {
  findBestMatch,
  extractMentions,
  resolveMentionsInText,
  resolveImplicitMentions,
  levenshteinDistance
};
