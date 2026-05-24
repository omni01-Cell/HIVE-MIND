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
    const cleaned = content.trim().replace(/^```json\s*|```$/g, '').trim();
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        throw new Error('Response is not a JSON object or array');
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
