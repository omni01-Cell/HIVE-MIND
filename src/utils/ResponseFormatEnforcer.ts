import json5 from 'json5';
import { jsonrepair } from 'jsonrepair';

export interface EnforceOptions<T> {
    validate?: (parsed: T) => boolean | string;
    maxRetries?: number;
}

/**
 * Tente de parser et de réparer le JSON de manière résiliente.
 */
export function tryParseJson<T>(content: string): T {
    let cleaned = content.trim();

    // 1. Tenter d'extraire le bloc ```json ... ```
    const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
        cleaned = jsonBlockMatch[1].trim();
    } else {
        // 2. Tenter de nettoyer les backticks d'un bloc simple si présent au début/fin
        cleaned = cleaned.replace(/^```json\s*|```$/g, '').trim();
    }

    // 3. Si on a extrait un bloc ```json ... ```, on essaie de le parser directement
    try {
        return parseCleanedJson<T>(cleaned);
    } catch (e) {
        // Si cela échoue ou qu'il n'y avait pas de bloc, on continue avec la recherche robuste
    }

    // 4. Recherche globale robuste de blocs JSON (objets ou tableaux)
    const rawContent = content;
    const candidates: string[] = [];
    
    // Trouver tous les indices de '{' et '['
    for (let i = 0; i < rawContent.length; i++) {
        const char = rawContent[i];
        if (char === '{' || char === '[') {
            const closeChar = char === '{' ? '}' : ']';
            // Chercher les caractères de fermeture correspondants de la fin vers i (décroissant)
            let j = rawContent.lastIndexOf(closeChar);
            while (j > i) {
                const candidate = rawContent.slice(i, j + 1).trim();
                candidates.push(candidate);
                j = rawContent.lastIndexOf(closeChar, j - 1);
            }
        }
    }

    // Trier les candidats par longueur décroissante pour privilégier le plus grand bloc JSON
    candidates.sort((a, b) => b.length - a.length);

    // Essayer de parser chaque candidat
    for (const candidate of candidates) {
        try {
            return parseCleanedJson<T>(candidate);
        } catch {
            // Continuer
        }
    }

    throw new Error('Response does not contain a valid JSON object or array');
}

/**
 * Tente de parser une chaîne de caractères déjà nettoyée qui doit commencer par { ou [.
 */
function parseCleanedJson<T>(cleaned: string): T {
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        throw new Error('Not a JSON object or array');
    }
    try {
        return JSON.parse(cleaned);
    } catch {
        try {
            return json5.parse(cleaned) as T;
        } catch {
            const repaired = jsonrepair(cleaned);
            return JSON.parse(repaired) as T;
        }
    }
}

/**
 * Force la réponse du LLM à respecter un format JSON et un schéma spécifique
 * en injectant un message d'erreur système correctif en cas d'échec.
 */
export async function enforceFormat<T>(
    executeCall: (retryPromptModifier?: string) => Promise<string>,
    options: EnforceOptions<T> = {}
): Promise<{ success: boolean; data?: T; rawResponse: string; error?: string }> {
    const maxRetries = options.maxRetries ?? 2;
    let attempt = 0;
    let retryPromptModifier: string | undefined;

    while (attempt <= maxRetries) {
        let rawResponse = '';
        try {
            rawResponse = await executeCall(retryPromptModifier);
            const parsed = tryParseJson<T>(rawResponse);

            if (options.validate) {
                const validationResult = options.validate(parsed);
                if (validationResult !== true) {
                    throw new Error(typeof validationResult === 'string' ? validationResult : 'Validation failed');
                }
            }

            return { success: true, data: parsed, rawResponse };
        } catch (error: any) {
            attempt++;
            if (attempt > maxRetries) {
                return { success: false, rawResponse, error: error.message || 'Parsing failed' };
            }

            const errorMsg = error.message || 'Malformed JSON format';
            retryPromptModifier = `[SYSTEM REJECTION]
Votre réponse précédente est invalide. Elle doit être au format JSON strict et respecter le schéma.
Erreur d'analyse/validation : ${errorMsg}
Veuillez générer à nouveau la réponse en corrigeant cette erreur, sans inclure de texte libre en dehors du bloc JSON.`;
        }
    }

    return { success: false, rawResponse: '', error: 'Max retries exceeded' };
}
