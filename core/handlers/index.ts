// core/handlers/index.js
// Barrel export pour tous les handlers
// Usage: import { SchedulerHandler, GroupHandler } from './handlers/index.js';

export { SchedulerHandler } from './schedulerHandler.js';
export { GroupHandler } from './groupHandler.js';

// Re-export contextBuilder pour facilité
export { buildContext } from '../context/contextBuilder.js';
