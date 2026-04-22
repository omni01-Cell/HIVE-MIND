/**
 * config/index.ts
 * Centralized Configuration for HIVE-MIND
 * Single entry point for all application settings with Zod validation.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { envResolver } from '../services/envResolver.js';
import { 
  AppConfigSchema, 
  ModelsConfigSchema, 
  SchedulerSchema,
  AppConfig,
  ModelsConfig,
  SchedulerConfig 
} from './config.schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

/**
 * Validates and loads a JSON configuration file.
 * @template T
 * @param {string} filename - The filename (relative to /config).
 * @param {import('zod').ZodSchema<T>} schema - The Zod schema for validation.
 * @returns {T} - The validated configuration object.
 */
function loadAndValidateConfig<T>(filename: string, schema: import('zod').ZodSchema<T>): T {
  const filePath = join(__dirname, filename);
  if (!existsSync(filePath)) {
    console.warn(`[Config] File not found: ${filename}`);
    return {} as T;
  }

  try {
    const rawJson = JSON.parse(readFileSync(filePath, 'utf-8'));
    const validated = schema.safeParse(rawJson);

    if (!validated.success) {
      console.error(`[Config] ❌ Validation error for ${filename}:`);
      console.error(JSON.stringify(validated.error.format(), null, 2));
      throw new Error(`Invalid configuration: ${filename}`);
    }

    return validated.data;
  } catch (e: any) {
    console.error(`[Config] Critical error in ${filename}:`, e.message);
    throw e; // Block startup if configuration is corrupted
  }
}

/**
 * Loads a JSON file without validation (legacy support).
 */
function loadJsonConfig(filename: string): any {
  const filePath = join(__dirname, filename);
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Resolves an environment value (literal or ${ENV_VAR} notation).
 */
function resolveEnvValue(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const resolved = envResolver.resolve(value);
  return resolved !== null ? resolved : undefined;
}

// 1. Load Base Configurations
const baseConfig = loadAndValidateConfig<AppConfig>('config.json', AppConfigSchema);
const credentials = loadJsonConfig('credentials.json');
const modelsConfig = loadAndValidateConfig<ModelsConfig>('models_config.json', ModelsConfigSchema);
const schedulerConfig = loadAndValidateConfig<SchedulerConfig>('scheduler.json', SchedulerSchema);

/**
 * Typed Configuration Interface
 */
export interface HIVEConfig {
  env: string;
  debug: boolean;
  timezone: string;
  supabase: {
    url: string | undefined;
    key: string | undefined;
  };
  redis: {
    url: string | undefined;
  };
  apiKeys: {
    gemini: string | undefined;
    openai: string | undefined;
    anthropic: string | undefined;
    groq: string | undefined;
    mistral: string | undefined;
    minimax: string | undefined;
    nvidia: string | undefined;
  };
  models: ModelsConfig;
  priorityFamilies: string[];
  embeddings: {
    primary: {
      provider: string;
      model: string;
      dimensions: number;
    };
  };
  voice: any;
  scheduler: SchedulerConfig;
  app: AppConfig & { version: string };
  hasApiKey(provider: string): boolean;
  getFirstAvailableFamily(): string | null;
}

/**
 * Resolved and Exported Configuration Object
 */
export const config: HIVEConfig = {
  env: process.env.NODE_ENV || 'development',
  debug: process.env.DEBUG === 'true',
  timezone: process.env.TZ || 'Europe/Paris',

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY
  },

  redis: {
    url: process.env.REDIS_URL
  },

  apiKeys: {
    gemini: process.env.GEMINI_KEY || resolveEnvValue(credentials.familles_ia?.gemini),
    openai: process.env.OPENAI_KEY || resolveEnvValue(credentials.familles_ia?.openai),
    anthropic: process.env.ANTHROPIC_KEY || resolveEnvValue(credentials.familles_ia?.anthropic),
    groq: process.env.GROQ_KEY || resolveEnvValue(credentials.familles_ia?.groq),
    mistral: process.env.MISTRAL_KEY || resolveEnvValue(credentials.familles_ia?.mistral),
    minimax: process.env.MINIMAX_KEY || resolveEnvValue(credentials.familles_ia?.minimax),
    nvidia: process.env.VOTRE_CLE_NVIDIA || resolveEnvValue(credentials.familles_ia?.nvidia)
  },

  models: modelsConfig,
  priorityFamilies: modelsConfig.reglages_generaux?.familles_prioritaires || ['gemini'],
  embeddings: modelsConfig.reglages_generaux?.embeddings || {
    primary: {
      provider: 'gemini',
      model: 'gemini-embedding-001',
      dimensions: 1024
    }
  },

  voice: modelsConfig.reglages_generaux?.audio_strategy || {},
  scheduler: schedulerConfig,

  app: {
    ...baseConfig,
    version: '3.0.0'
  } as AppConfig & { version: string },

  hasApiKey(provider: string): boolean {
    return !!(this.apiKeys as any)[provider];
  },

  getFirstAvailableFamily(): string | null {
    for (const family of this.priorityFamilies) {
      if (this.hasApiKey(family)) return family;
    }
    return null;
  }
};

export default config;
