/**
 * installationInfo — Informations d'installation du TUI HIVE-MIND.
 *
 * Stub minimal : remplace l'ancien module Gemini CLI pour les besoins du TUI.
 */

export const isDevelopment =
    process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

export const isInstalledGlobally = false;

export const getInstallationPath = (): string => process.cwd();
