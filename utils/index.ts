/**
 * utils/index.ts
 * Barrel export pour tous les utilitaires
 * Usage: import { logger, formatToWhatsApp } from '../utils/index.js';
 */

export * as logger from './logger.js';

export { 
  formatToWhatsApp, 
  isStorable, 
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
  extractMentions as extractSimpleMentions
} from './helpers.js';

export { startupDisplay } from './startup.js';
export { botIdentity } from './botIdentity.js';

export {
  extractNumericId,
  jidMatch,
  formatForDisplay,
  normalizeJid
} from './jidHelper.js';

export {
  splitMessage,
  getToolFeedback
} from './messageSplitter.js';

export {
  findBestMatch,
  extractMentions,
  resolveMentionsInText,
  resolveImplicitMentions,
  levenshteinDistance
} from './fuzzyMatcher.js';

export {
  oggToPcm,
  pcmToOgg,
  wavToOgg,
  cleanupTempFiles,
  checkFfmpeg
} from './audioConverter.js';
