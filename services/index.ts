// services/index.js
// Barrel export pour tous les services - Simplifie les imports
// Usage: import { userService, groupService } from '../services/index.js';

// =================== SERVICES PRINCIPAUX ===================
export { userService } from './userService.js';
export { groupService } from './groupService.js';
export { adminService } from './adminService.js';

// =================== MÉMOIRE ===================
export { workingMemory } from './workingMemory.js';
export { factsMemory, semanticMemory } from './memory.js';
export { graphMemory } from './graphMemory.js';

// =================== BASE DE DONNÉES ===================
export { supabase, db } from './supabase.js';
export { redis, ensureConnected } from './redisClient.js';

// =================== CONSCIENCE & RÉFLEXION ===================
export { consciousness } from './consciousnessService.js';
export { dreamService } from './dreamService.js';
export { moralCompass } from './moralCompass.js';
export { feedbackService } from './feedbackService.js';

// =================== AGENTS & PROACTIVITÉ ===================
export { agentMemory } from './agentMemory.js';
export { goalsService } from './goalsService.js';
export { socialCueWatcher } from './socialCueWatcher.js';

// =================== UTILITAIRES ===================
export { consolidationService } from './consolidationService.js';
export { knowledgeWeaver } from './knowledgeWeaver.js';
export { quotaManager } from './quotaManager.js';
export { CleanupService } from './cleanup.js';
