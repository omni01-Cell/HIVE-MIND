// tests/unit/services/envResolver.test.ts
import { describe, it, beforeEach, expect } from '@jest/globals';
import { envResolver } from '../../../services/envResolver.js';

describe('EnvResolver unit tests', () => {
  
  beforeEach(() => {
    envResolver.clearCache();
  });

  it('should return null if value is null', () => {
    expect(envResolver.resolve(null)).toBeNull();
  });

  it('should return value directly if not a placeholder', () => {
    expect(envResolver.resolve('real_api_key_123')).toBe('real_api_key_123');
  });

  it('should resolve format ${VAR_NAME}', () => {
    process.env.TEST_VAR = 'secret_value';
    expect(envResolver.resolve('${TEST_VAR}')).toBe('secret_value');
    delete process.env.TEST_VAR;
  });

  it('should resolve format VOTRE_XXX directly', () => {
    process.env.VOTRE_CLE_GEMINI = 'gemini_secret';
    expect(envResolver.resolve('VOTRE_CLE_GEMINI')).toBe('gemini_secret');
    delete process.env.VOTRE_CLE_GEMINI;
  });

  it('should infer var name from VOTRE_XXX (e.g. GEMINI_KEY)', () => {
    process.env.GEMINI_KEY = 'gemini_inferred';
    expect(envResolver.resolve('VOTRE_CLE_GEMINI')).toBe('gemini_inferred');
    delete process.env.GEMINI_KEY;
  });

  it('should return null and log warning if variable is not found', () => {
    // We expect a null return and a warning in console
    expect(envResolver.resolve('VOTRE_MISSING_VAR')).toBeNull();
  });

  it('should use explicit varName if provided', () => {
    process.env.EXPLICIT_VAR = 'explicit_value';
    expect(envResolver.resolve('VOTRE_MISSING_VAR', 'EXPLICIT_VAR')).toBe('explicit_value');
    delete process.env.EXPLICIT_VAR;
  });
});
