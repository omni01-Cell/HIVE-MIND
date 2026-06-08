/**
 * Auth module pour HIVE-MIND
 * L'auth Gemini CLI n'est pas nécessaire — le core gère l'auth via .env
 */

export type CliArgs = Record<string, unknown>;

export async function loadCliConfig(): Promise<CliArgs> {
    return {};
}

export function parseArguments(_settings: unknown): CliArgs {
    return {};
}

export async function validateAuthMethod(_method: string): Promise<string | null> {
    return null;
}
