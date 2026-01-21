// utils/fuzzyMatcher.js
// Utilitaire de recherche floue pour les mentions WhatsApp

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

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
 * @param {string} str 
 * @returns {string}
 */
function normalize(str) {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Enlève les accents
        .replace(/[^a-z0-9]/g, '');       // Garde que alphanum
}

/**
 * Vérifie si query est un préfixe ou diminutif de target
 * Ex: "Seb" match "Sébastien", "Jojo" match "Jordan"
 * @param {string} query 
 * @param {string} target 
 * @returns {boolean}
 */
function isPrefixOrNickname(query, target) {
    const q = normalize(query);
    const t = normalize(target);

    // Préfixe exact
    if (t.startsWith(q)) return true;

    // Première syllabe commune (min 2 chars)
    if (q.length >= 2 && t.startsWith(q.substring(0, 2))) {
        // Vérifier similarité
        const similarity = 1 - (levenshteinDistance(q, t.substring(0, q.length + 2)) / Math.max(q.length, 3));
        if (similarity > 0.6) return true;
    }

    return false;
}

/**
 * Trouve le meilleur match pour une query parmi une liste de candidats
 * @param {string} query - Le nom à chercher (ex: "Seb")
 * @param {Array<{name: string, jid: string}>} candidates - Liste des membres avec noms
 * @param {number} threshold - Score minimum pour un match (0-1, défaut: 0.4)
 * @returns {{match: {name: string, jid: string}|null, score: number, exact: boolean}}
 */
export function findBestMatch(query, candidates, threshold = 0.4) {
    if (!query || !candidates || candidates.length === 0) {
        return { match: null, score: 0, exact: false };
    }

    // === DUAL RESOLVER: Phone Number Check (Priority #1) ===
    // Si la query ressemble à un numéro (contient uniquement des chiffres), chercher par JID
    const isNumericQuery = /^\d+$/.test(query);

    if (isNumericQuery) {
        console.log(`[FuzzyMatcher] Numeric query detected: "${query}" - Searching by phone number...`);

        // Chercher un match exact dans les JIDs
        for (const candidate of candidates) {
            if (!candidate.jid) continue;

            // Extraire le numéro du JID (partie avant @)
            const phoneNumber = candidate.jid.split('@')[0];

            // Match exact ou prefix
            if (phoneNumber === query || phoneNumber.startsWith(query)) {
                console.log(`[FuzzyMatcher] Phone match found: ${query} → ${candidate.name || 'Unknown'} (${phoneNumber})`);
                return { match: candidate, score: 1, exact: true };
            }
        }

        // Si aucun match exact, le numéro est inconnu
        console.log(`[FuzzyMatcher] No phone match for: ${query}`);
        return { match: null, score: 0, exact: false };
    }

    // === NAME MATCHING (Existing Logic) ===
    const normalizedQuery = normalize(query);
    let bestMatch = null;
    let bestScore = 0;
    let isExact = false;

    for (const candidate of candidates) {
        if (!candidate.name) continue;

        const normalizedName = normalize(candidate.name);

        // 1. Match exact (priorité maximale)
        if (normalizedName === normalizedQuery) {
            return { match: candidate, score: 1, exact: true };
        }

        // 2. Préfixe ou diminutif
        if (isPrefixOrNickname(normalizedQuery, normalizedName)) {
            const prefixScore = 0.9 - (normalizedQuery.length / normalizedName.length) * 0.1;
            if (prefixScore > bestScore) {
                bestScore = prefixScore;
                bestMatch = candidate;
            }
            continue;
        }

        // 2.5 Match Partiel (Inclusion) - Pour "Christ" dans "Christ-Leandre" (si préfixe échoue ou pour renforcer)
        if (normalizedName.includes(normalizedQuery)) {
            // Score basé sur la ratio de longueur (plus la partie est grande, meilleur est le score)
            const partScore = 0.7 + (normalizedQuery.length / normalizedName.length) * 0.15;
            if (partScore > bestScore) {
                bestScore = partScore;
                bestMatch = candidate;
            }
        }

        // 3. Distance de Levenshtein
        const distance = levenshteinDistance(normalizedQuery, normalizedName);
        const maxLen = Math.max(normalizedQuery.length, normalizedName.length);
        const similarity = 1 - (distance / maxLen);

        if (similarity > bestScore) {
            bestScore = similarity;
            bestMatch = candidate;
        }

        // 4. Vérifier aussi chaque partie du nom (prénom/nom)
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

    // Appliquer le seuil
    if (bestScore >= threshold) {
        return { match: bestMatch, score: bestScore, exact: isExact };
    }

    return { match: null, score: bestScore, exact: false };
}

/**
 * Extrait toutes les mentions @Nom d'un texte
 * @param {string} text 
 * @returns {string[]} - Liste des noms mentionnés (sans le @)
 */
export function extractMentions(text) {
    if (!text) return [];

    // Pattern: @ suivi d'un mot (lettres, accents, chiffres)
    const regex = /@([\p{L}\p{N}]+)/gu;
    const mentions = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        mentions.push(match[1]);
    }

    return mentions;
}

/**
 * Résout les mentions dans un texte en les remplaçant par des JIDs WhatsApp
 * @param {string} text - Texte contenant des @mentions
 * @param {Array<{name: string, jid: string}>} members - Liste des membres du groupe
 * @returns {{text: string, mentions: string[], resolved: {name: string, jid: string}[]}}
 */
export function resolveMentionsInText(text, members) {
    if (!text || !members || members.length === 0) {
        return { text, mentions: [], resolved: [] };
    }

    const mentionNames = extractMentions(text);
    if (mentionNames.length === 0) {
        return { text, mentions: [], resolved: [] };
    }

    const resolvedJids = [];
    const resolvedMembers = [];
    let processedText = text;

    for (const mentionName of mentionNames) {
        const { match, score, exact } = findBestMatch(mentionName, members);

        if (match) {
            console.log(`[FuzzyMatcher] "@${mentionName}" → "${match.name}" (JID: ${match.jid.substring(0, 15)}..., score: ${score.toFixed(2)})`);

            // Ajouter le JID à la liste des mentions
            if (!resolvedJids.includes(match.jid)) {
                resolvedJids.push(match.jid);
                resolvedMembers.push(match);
            }

            // Remplacer @Nom par @NuméroID dans le texte (pour l'affichage WhatsApp)
            // WhatsApp affiche le nom automatiquement si le JID est dans mentions[]
            const phoneNumber = match.jid.split('@')[0];
            processedText = processedText.replace(
                new RegExp(`@${mentionName}\\b`, 'gi'),
                `@${phoneNumber}`
            );
        } else {
            console.log(`[FuzzyMatcher] "@${mentionName}" → ❌ Aucun match trouvé`);
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
 * Utilisé en fallback si l'IA oublie de taguer
 * @param {string} text 
 * @param {Array<{name: string, jid: string}>} members 
 */
export function resolveImplicitMentions(text, members) {
    if (!text || !members || members.length === 0) {
        return { text, mentions: [], resolved: [] };
    }

    let processedText = text;
    const resolvedJids = [];
    const resolvedMembers = [];

    // Trier les membres par longueur de nom décroissante pour éviter les problèmes de sous-chaînes
    // (ex: remplacer "Jean-Pierre" avant "Jean")
    const sortedMembers = [...members].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));

    for (const member of sortedMembers) {
        if (!member.name || member.name.length < 3) continue; // Ignorer noms trop courts (risque de faux positifs)

        // Regex pour trouver le nom complet (mot entier) insensible à la casse
        // On échappe les caractères spéciaux du nom
        const escapedName = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');

        if (regex.test(processedText)) {
            // Trouvé !
            if (!resolvedJids.includes(member.jid)) {
                resolvedJids.push(member.jid);
                resolvedMembers.push(member);

                console.log(`[ImplicitMention] Nom trouvé: "${member.name}" → JID: ${member.jid}`);

                // Remplacement par mention WhatsApp (@PhoneNumber)
                // Attention: on remplace toutes les occurrences
                const phoneNumber = member.jid.split('@')[0];
                processedText = processedText.replace(regex, `@${phoneNumber}`);
            }
        }
    }

    return {
        text: processedText, // Texte transformé avec les @ID
        mentions: resolvedJids,
        resolved: resolvedMembers
    };
}

export default {
    findBestMatch,
    extractMentions,
    resolveMentionsInText,
    levenshteinDistance
};
