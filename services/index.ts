/**
 * services/index.ts
 * Barrel export pour tous les services
 */

// =================== SERVICES MIGRÉS (TS) ===================
export { userService } from './userService.js';
export { groupService } from './groupService.js';
export { adminService } from './adminService.js';
export { workingMemory } from './workingMemory.js';
export { consciousness } from './consciousnessService.js';
export { factsMemory, semanticMemory } from './memory.js';
export { graphMemory } from './graphMemory.js';
export { moralCompass } from './moralCompass.js';
export { supabase, db } from './supabase.js';
export { redis, ensureConnected } from './redisClient.js';
export { quotaManager } from './quotaManager.js';
export { CleanupService } from './cleanup.js';

// =================== SERVICES EN ATTENTE (JS) ===================
// @ts-ignore
export { dreamService } from './dreamService.js';
// @ts-ignore
export { moralCompass } from './moralCompass.js';
// @ts-ignore
export { feedbackService } from './feedbackService.js';
// @ts-ignore
export { agentMemory } from './agentMemory.js';
// @ts-ignore
export { goalsService } from './goalsService.js';
// @ts-ignore
export { socialCueWatcher } from './socialCueWatcher.js';
// @ts-ignore
export { consolidationService } from './consolidationService.js';
// @ts-ignore
export { knowledgeWeaver } from './knowledgeWeaver.js';
