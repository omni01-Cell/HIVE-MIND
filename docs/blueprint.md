# 🏗️ HIVE-MIND Architecture Blueprint
> Generated on 2026-04-20
> **156** files scanned | **89** files imported | **66** potential orphans | **9** circular dependencies

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total JS files | 156 |
| Files imported by others | 89 |
| Potential orphan files | 66 |
| Circular dependencies | 9 |

---

## ⚠️ Circular Dependencies

- `services/groupService.js` → `core/ServiceContainer.js`
- `services/groupService.js` → `core/ServiceContainer.js` → `services/consciousnessService.js`
- `core/ServiceContainer.js` → `services/consciousnessService.js` → `services/memory.js`
- `core/ServiceContainer.js` → `services/consciousnessService.js` → `services/memory.js` → `services/tagService.js` → `providers/index.js`
- `services/memory.js`
- `core/ServiceContainer.js` → `services/dreamService.js`
- `services/index.js`
- `utils/index.js`

---

## 💀 Potential Orphan Files (never imported)

> These files are never imported by any other file. They may be entry points, scripts, or dead code.

- `audit/apply_db_corrections.js`
- `bin/hive-mind.js`
- `config/plugin-config-schema.js`
- `core/handlers/groupHandler.js`
- `core/handlers/schedulerHandler.js`
- `core/schedulerHandlers.js`
- `core/transport/interface.js`
- `plugins/admin/index.js`
- `plugins/daily_pulse/index.js`
- `plugins/deep_research/index.js`
- `plugins/dev_tools/index.js`
- `plugins/goals/index.js`
- `plugins/memory/index.js`
- `plugins/send_email/index.js`
- `plugins/shopping/index.js`
- `plugins/sticker/index.js`
- `plugins/system/index.js`
- `plugins/sys_interaction/index.js`
- `plugins/translate/index.js`
- `plugins/tts/index.js`
- `plugins/visual_reporter/index.js`
- `plugins/wikipedia/index.js`
- `providers/adapters/anthropic.js`
- `providers/adapters/gemini.js`
- `providers/adapters/github.js`
- `providers/adapters/groq.js`
- `providers/adapters/huggingface.js`
- `providers/adapters/kimi.js`
- `providers/adapters/mistral.js`
- `providers/adapters/moonshot.js`
- `providers/adapters/nvidia.js`
- `providers/adapters/openai.js`
- `scripts/admin-cli.js`
- `scripts/audit-group.js`
- `scripts/check-redis.js`
- `scripts/debug-wa-metadata.js`
- `scripts/fix-missing-usernames.js`
- `scripts/generate-blueprint.js`
- `scripts/health-check.js`
- `scripts/ingest_docs.js`
- `scripts/repair-session.js`
- `scripts/test_10_10.js`
- `scripts/test_models.js`
- `services/sync/EmbeddingSyncService.js`
- `test/live_mention_test.js`
- `test/mention_test.js`
- `test/verify_fix_success.js`
- `test/verify_tagging_fix.js`
- `tests/debug_env.js`
- `tests/debug_plugins.js`
- `tests/debug_shopping_only.js`
- `tests/test_reflex_classifier.js`
- `tests/test_swarm_core.js`
- `tests/unit/config/keyResolver.test.js`
- `tests/unit/services/userService.test.js`
- `tests/unit/transport/handlers/antiDeleteHandler.test.js`
- `tests/unit/transport/handlers/audioHandler.test.js`
- `tests/unit/utils/helpers.test.js`
- `tests/unit/utils/pidLock.test.js`
- `tests/verify_classifier.js`
- `tests/verify_integration.js`
- `tests/verify_plugins_manual.js`
- `tests/verify_state.js`
- `tests/verify_sync.js`
- `tests/verify_sync_manual.js`
- `utils/logger.js`

---

## 📦 File Dependency Map

### 📁 config/

#### `config/index.js`
**Exports:** `config` (named), `config` (default)

**Local imports:**
- → `services/envResolver.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `dotenv`

#### `config/keyResolver.js`
**Exports:** `resolveApiKey` (named), `resolveCredentials` (named)

**Local imports:**
- → `services/envResolver.js`

#### `config/plugin-config-schema.js`
**Exports:** `pluginSchemas` (named), `pluginSchemas` (default)

*No dependencies (leaf node)*

### 📁 utils/

#### `utils/audioConverter.js`
**Exports:** `AUDIO_FORMATS` (named), `oggToPcm` (named), `pcmToOgg` (named), `wavToOgg` (named), `cleanupTempFiles` (named), `checkFfmpeg` (named), `(anonymous)` (default)

**External packages:**
- 📦 `child_process`
- 📦 `fs`
- 📦 `path`
- 📦 `os`
- 📦 `crypto`
- 📦 `@ffmpeg-installer/ffmpeg`

#### `utils/botIdentity.js`
**Exports:** `botIdentity` (named), `botIdentity` (default)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `utils/dnsHelpers.js`
**Exports:** `forceIPv4ForUrl` (named), `createIPv4Agent` (named), `getDNSConfig` (named), `shouldTryIPv4Fallback` (named), `fetchWithIPv4Fallback` (named)

**External packages:**
- 📦 `dns`
- 📦 `http`
- 📦 `https`

#### `utils/fuzzyMatcher.js`
**Exports:** `findBestMatch` (named), `extractMentions` (named), `resolveMentionsInText` (named), `resolveImplicitMentions` (named), `(anonymous)` (default)

*No dependencies (leaf node)*

#### `utils/helpers.js`
**Exports:** `delay` (named), `randomDelay` (named), `parseDelayRange` (named), `truncate` (named), `jidToPhone` (named), `phoneToJid` (named), `isGroupJid` (named), `escapeRegex` (named), `generateId` (named), `formatDate` (named), `extractMentions` (named), `isStorable` (named), `formatToWhatsApp` (named), `(anonymous)` (default)

*No dependencies (leaf node)*

#### `utils/index.js`
**Local imports:**
- → `utils/index.js`

#### `utils/jidHelper.js`
**Exports:** `extractNumericId` (named), `normalizeJid` (named), `jidMatch` (named), `findInJidMap` (named), `findInJidArray` (named), `jidInList` (named), `getJidType` (named), `formatForDisplay` (named), `(anonymous)` (default)

*No dependencies (leaf node)*

#### `utils/logger.js`
**Exports:** `enableDebug` (named), `disableDebug` (named), `setDebugCategories` (named), `resetDebug` (named), `debugStatus` (named), `clearGroupCache` (named), `flushRedisCache` (named), `redisStats` (named), `refreshAdminCache` (named), `systemStatus` (named), `help` (named), `logger` (named), `Logger` (default)

*No dependencies (leaf node)*

#### `utils/messageSplitter.js`
**Exports:** `splitMessage` (named), `TOOL_FEEDBACK` (named), `getToolFeedback` (named)

*No dependencies (leaf node)*

#### `utils/pidLock.js`
**Exports:** `acquireLock` (named), `releaseLock` (named), `isLocked` (named)

**External packages:**
- 📦 `fs`
- 📦 `path`

#### `utils/startup.js`
**Exports:** `startupDisplay` (named), `startupDisplay` (default)

**Local imports:**
- → `utils/botIdentity.js`

**External packages:**
- 📦 `cli-progress`

#### `utils/toolCallExtractor.js`
**Exports:** `extractToolCallsFromText` (named), `extractToolCallsFromOpenAI` (named), `isValidToolCall` (named), `parseToolArguments` (named), `formatToolCall` (named), `deduplicateToolCalls` (named), `getToolCallStats` (named)

*No dependencies (leaf node)*

### 📁 core/

#### `core/FairnessQueue.js`
**Exports:** `FairnessQueue` (named)

*No dependencies (leaf node)*

#### `core/ServiceContainer.js`
**Exports:** `ServiceContainer` (named), `container` (named)

**Local imports:**
- → `config/keyResolver.js`
- → `services/ai/EmbeddingsService.js`
- → `services/memory/SemanticMemory.js`
- → `services/supabase.js`
- ⚡ `services/redisClient.js`
- ⚡ `services/adminService.js`
- ⚡ `services/userService.js`
- ⚡ `services/agentMemory.js`
- ⚡ `services/memory/ActionMemory.js`
- ⚡ `services/groupService.js`
- ⚡ `services/workingMemory.js`
- ⚡ `services/consciousnessService.js`
- ⚡ `services/moderationService.js`
- ⚡ `services/quotaManager.js`
- ⚡ `services/voice/voiceProvider.js`
- ⚡ `services/voice/minimax.js`
- ⚡ `services/transcription/groqSTT.js`
- ⚡ `services/graphMemory.js`
- ⚡ `services/knowledgeWeaver.js`
- ⚡ `services/consolidationService.js`
- ⚡ `services/audio/geminiLiveProvider.js`
- ⚡ `services/dreamService.js`
- ⚡ `services/moralCompass.js`
- ⚡ `services/memory.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `core/cli.js`
**Exports:** `cli` (named)

**Local imports:**
- → `services/supabase.js`

**External packages:**
- 📦 `readline`
- 📦 `child_process`

#### `core/concurrency/SwarmDispatcher.js`
**Exports:** `new` (default)

**External packages:**
- 📦 `os`

#### `core/container.js`
**Exports:** `container` (default)

**Local imports:**
- → `core/ServiceContainer.js`

#### `core/context/TieredContextLoader.js`
**Exports:** `TieredContextLoader` (named), `tieredContextLoader` (named), `tieredContextLoader` (default)

**Local imports:**
- → `core/ServiceContainer.js`
- → `utils/botIdentity.js`
- ⚡ `services/dreamService.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `core/context/contextBuilder.js`
**Exports:** `buildContext` (named), `(anonymous)` (default)

**Local imports:**
- → `core/ServiceContainer.js`
- → `services/memory.js`
- → `services/consciousnessService.js`
- → `plugins/loader.js`
- ⚡ `services/dreamService.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `core/events.js`
**Exports:** `BotEvents` (named), `eventBus` (named), `EventBus` (default)

**External packages:**
- 📦 `events`

#### `core/handlers/FastPathHandler.js`
**Exports:** `FastPathHandler` (named), `FastPathHandler` (default)

**Local imports:**
- → `providers/index.js`
- → `plugins/loader.js`
- → `utils/toolCallExtractor.js`

#### `core/handlers/groupHandler.js`
**Exports:** `GroupHandler` (named), `GroupHandler` (default)

**Local imports:**
- → `core/ServiceContainer.js`
- → `services/groupService.js`
- → `services/supabase.js`

#### `core/handlers/index.js`
**Local imports:**
- → `core/handlers/handlers/index.js`

#### `core/handlers/schedulerHandler.js`
**Exports:** `SchedulerHandler` (named), `SchedulerHandler` (default)

**Local imports:**
- → `core/events.js`
- → `core/ServiceContainer.js`
- → `services/workingMemory.js`
- → `services/supabase.js`
- ⚡ `services/redisClient.js`
- ⚡ `services/supabase.js`
- ⚡ `services/cleanup.js`
- ⚡ `services/socialCueWatcher.js`
- ⚡ `services/goalsService.js`
- ⚡ `services/memory/MemoryDecay.js`
- ⚡ `scheduler/dbMonitoring.js`
- ⚡ `scheduler/dbMonitoring.js`
- ⚡ `scheduler/dbMonitoring.js`
- ⚡ `scheduler/dbMonitoring.js`

#### `core/index.js`
**Exports:** `botCore` (named), `botCore` (default)

**Local imports:**
- → `config/index.js`
- → `core/orchestrator.js`
- → `core/events.js`
- → `core/transport/baileys.js`
- → `plugins/loader.js`
- → `providers/index.js`
- → `scheduler/index.js`
- → `utils/toolCallExtractor.js`
- → `utils/helpers.js`
- → `utils/startup.js`
- → `utils/botIdentity.js`
- → `utils/jidHelper.js`
- → `core/ServiceContainer.js`
- → `core/cli.js`
- → `core/handlers/index.js`
- → `core/context/contextBuilder.js`
- → `services/ai/ReflexClassifier.js`
- → `core/context/TieredContextLoader.js`
- → `core/handlers/FastPathHandler.js`
- ⚡ `plugins/group_manager/index.js`
- ⚡ `services/feedbackService.js`
- ⚡ `services/goalsService.js`
- ⚡ `services/audio/audioConverter.js`
- ⚡ `services/agentic/Planner.js`
- ⚡ `utils/messageSplitter.js`
- ⚡ `services/agentic/MultiAgent.js`
- ⚡ `utils/messageSplitter.js`
- ⚡ `services/agentic/MultiAgent.js`
- ⚡ `services/agentic/MultiAgent.js`
- ⚡ `services/agentic/ActionEvaluator.js`
- ⚡ `services/redisClient.js`
- ⚡ `services/supabase.js`
- ⚡ `services/cleanup.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `fs`
- 📦 `path`

#### `core/orchestrator.js`
**Exports:** `orchestrator` (named), `Orchestrator` (default)

**Local imports:**
- → `core/FairnessQueue.js`

**External packages:**
- 📦 `events`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `core/schedulerHandlers.js`
**Exports:** `handleSocialCueScan` (named), `handleGoalExecution` (named)

**Local imports:**
- ⚡ `services/socialCueWatcher.js`
- ⚡ `services/goalsService.js`

#### `core/transport/baileys.js`
**Exports:** `baileysTransport` (default)

**Local imports:**
- → `core/concurrency/SwarmDispatcher.js`
- → `services/userService.js`
- → `services/groupService.js`
- → `core/events.js`
- → `utils/helpers.js`
- → `services/workingMemory.js`
- → `utils/botIdentity.js`
- → `utils/fuzzyMatcher.js`
- → `core/transport/handlers/audioHandler.js`
- → `core/transport/handlers/antiDeleteHandler.js`
- → `config/index.js`
- ⚡ `utils/fuzzyMatcher.js`

**External packages:**
- 📦 `@whiskeysockets/baileys`
- 📦 `pino`
- 📦 `qrcode-terminal`
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `events`

#### `core/transport/handlers/antiDeleteHandler.js`
**Exports:** `AntiDeleteHandler` (named)

**Local imports:**
- → `services/workingMemory.js`

#### `core/transport/handlers/audioHandler.js`
**Exports:** `AudioHandler` (named)

**Local imports:**
- → `services/workingMemory.js`
- → `utils/botIdentity.js`
- → `config/index.js`

**External packages:**
- 📦 `@whiskeysockets/baileys`
- 📦 `pino`
- 📦 `path`
- 📦 `url`
- 📦 `fs`

#### `core/transport/interface.js`
**Exports:** `TransportInterface` (named), `validateTransport` (named)

*No dependencies (leaf node)*

### 📁 services/

#### `services/adminService.js`
**Exports:** `adminService` (named), `adminService` (default)

**Local imports:**
- → `services/supabase.js`
- → `utils/jidHelper.js`
- → `services/userService.js`

#### `services/agentMemory.js`
**Exports:** `agentMemory` (named), `agentMemory` (default)

**Local imports:**
- → `services/supabase.js`

#### `services/agentic/ActionEvaluator.js`
**Exports:** `ActionEvaluator` (named), `actionEvaluator` (named), `actionEvaluator` (default)

**Local imports:**
- → `services/supabase.js`
- → `providers/index.js`

#### `services/agentic/MultiAgent.js`
**Exports:** `LightweightMultiAgent` (named), `multiAgent` (named), `multiAgent` (default)

**Local imports:**
- → `providers/index.js`

#### `services/agentic/Planner.js`
**Exports:** `ExplicitPlanner` (named), `planner` (named), `planner` (default)

**Local imports:**
- → `providers/index.js`
- → `services/memory/ActionMemory.js`
- → `services/supabase.js`
- ⚡ `services/dreamService.js`

**External packages:**
- 📦 `json5`
- 📦 `jsonrepair`
- 📦 `ajv`

#### `services/ai/EmbeddingsService.js`
**Exports:** `EmbeddingsService` (named)

*No dependencies (leaf node)*

#### `services/ai/ReflexClassifier.js`
**Exports:** `classifyLocally` (named), `isConfident` (named), `getPatternStats` (named), `(anonymous)` (default)

*No dependencies (leaf node)*

#### `services/ai/classifier.js`
**Exports:** `classifier` (named), `classifier` (default)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/audio/audioConverter.js`
**Exports:** `convertOggToPcm` (named), `convertPcmToOgg` (named), `processAudioPipeline` (named), `(anonymous)` (default)

**External packages:**
- 📦 `fluent-ffmpeg`
- 📦 `util`
- 📦 `fs/promises`

#### `services/audio/geminiLiveProvider.js`
**Exports:** `GeminiLiveProvider` (named), `GeminiLiveProvider` (default)

**External packages:**
- 📦 `ws`
- 📦 `fs`
- 📦 `fs`
- 📦 `path`

#### `services/cleanup.js`
**Exports:** `CleanupService` (named)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/consciousnessService.js`
**Exports:** `consciousness` (named), `consciousness` (default)

**Local imports:**
- → `services/redisClient.js`
- → `services/workingMemory.js`
- → `utils/jidHelper.js`
- → `services/userService.js`
- ⚡ `services/groupService.js`
- ⚡ `services/memory.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/consolidationService.js`
**Exports:** `consolidationService` (named), `consolidationService` (default)

**Local imports:**
- → `services/workingMemory.js`
- → `services/memory.js`
- → `services/knowledgeWeaver.js`
- → `providers/index.js`

#### `services/dreamService.js`
**Exports:** `dreamService` (named), `dreamService` (default)

**Local imports:**
- → `services/agentMemory.js`
- → `providers/index.js`
- → `services/supabase.js`
- → `core/ServiceContainer.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/envResolver.js`
**Exports:** `EnvResolver` (named), `envResolver` (named), `envResolver` (default)

*No dependencies (leaf node)*

#### `services/feedbackService.js`
**Exports:** `feedbackService` (named), `feedbackService` (default)

**Local imports:**
- → `core/events.js`
- → `services/supabase.js`
- → `services/agentMemory.js`

#### `services/goalsService.js`
**Exports:** `goalsService` (named), `goalsService` (default)

**Local imports:**
- → `services/supabase.js`

#### `services/graphMemory.js`
**Exports:** `graphMemory` (named), `graphMemory` (default)

**Local imports:**
- → `services/supabase.js`
- → `services/ai/EmbeddingsService.js`
- → `config/keyResolver.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/groupService.js`
**Exports:** `groupService` (named), `groupService` (default)

**Local imports:**
- → `services/redisClient.js`
- → `services/state/StateManager.js`
- → `services/supabase.js`
- ⚡ `core/ServiceContainer.js`
- ⚡ `core/ServiceContainer.js`
- ⚡ `services/userService.js`

#### `services/index.js`
**Local imports:**
- → `services/index.js`

#### `services/knowledgeWeaver.js`
**Exports:** `knowledgeWeaver` (named), `knowledgeWeaver` (default)

**Local imports:**
- → `providers/index.js`
- → `services/graphMemory.js`

#### `services/memory.js`
**Exports:** `semanticMemory` (named), `factsMemory` (named), `(anonymous)` (default)

**Local imports:**
- → `services/supabase.js`
- ⚡ `core/ServiceContainer.js`
- ⚡ `services/tagService.js`
- ⚡ `providers/index.js`
- ⚡ `services/memory.js`

#### `services/memory/ActionMemory.js`
**Exports:** `ActionMemory` (named), `actionMemory` (named), `actionMemory` (default)

**Local imports:**
- → `services/redisClient.js`
- → `services/supabase.js`

#### `services/memory/MemoryDecay.js`
**Exports:** `MemoryDecaySystem` (named), `memoryDecay` (named), `memoryDecay` (default)

**Local imports:**
- → `services/supabase.js`
- → `providers/index.js`

#### `services/memory/SemanticMemory.js`
**Exports:** `SemanticMemory` (named)

*No dependencies (leaf node)*

#### `services/moderationService.js`
**Exports:** `ModerationService` (named), `moderationService` (named)

**Local imports:**
- → `services/supabase.js`
- → `services/redisClient.js`
- → `services/workingMemory.js`

#### `services/monitoring/DatabaseMonitor.js`
**Exports:** `DatabaseMonitor` (named), `databaseMonitor` (named), `databaseMonitor` (default)

**Local imports:**
- → `services/supabase.js`

#### `services/moralCompass.js`
**Exports:** `moralCompass` (named), `moralCompass` (default)

**Local imports:**
- → `providers/index.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/quotaManager.js`
**Exports:** `quotaManager` (named)

**Local imports:**
- → `services/redisClient.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/redisClient.js`
**Exports:** `redis` (default)

**External packages:**
- 📦 `redis`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/socialCueWatcher.js`
**Exports:** `socialCueWatcher` (named), `socialCueWatcher` (default)

**Local imports:**
- → `services/workingMemory.js`
- → `providers/index.js`

#### `services/state/IdentityMap.js`
**Exports:** `IdentityMap` (named)

**Local imports:**
- → `services/redisClient.js`
- → `services/supabase.js`
- → `utils/jidHelper.js`

#### `services/state/LockManager.js`
**Exports:** `LockManager` (named)

**Local imports:**
- → `services/redisClient.js`

#### `services/state/StateManager.js`
**Exports:** `StateManager` (named)

**Local imports:**
- → `services/redisClient.js`
- → `services/supabase.js`
- → `services/state/LockManager.js`
- → `services/state/IdentityMap.js`

#### `services/supabase.js`
**Exports:** `db` (named), `db` (default)

**External packages:**
- 📦 `@supabase/supabase-js`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/sync/EmbeddingSyncService.js`
**Exports:** `EmbeddingSyncService` (named), `embeddingSyncService` (named), `embeddingSyncService` (default)

**Local imports:**
- → `services/supabase.js`
- → `core/ServiceContainer.js`

#### `services/tagService.js`
**Exports:** `tagService` (named), `tagService` (default)

**Local imports:**
- → `providers/index.js`

#### `services/transcription/groqSTT.js`
**Exports:** `GroqTranscriptionService` (named)

**External packages:**
- 📦 `fs`
- 📦 `form-data`
- 📦 `groq-sdk`

#### `services/userService.js`
**Exports:** `userService` (named), `userService` (default)

**Local imports:**
- → `services/state/StateManager.js`
- → `services/state/IdentityMap.js`
- → `services/supabase.js`
- → `services/redisClient.js`

**External packages:**
- 📦 `crypto`
- 📦 `crypto`

#### `services/voice/minimax.js`
**Exports:** `MinimaxVoiceService` (named)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `path`
- 📦 `fluent-ffmpeg`
- 📦 `@ffmpeg-installer/ffmpeg`

#### `services/voice/voiceProvider.js`
**Exports:** `VoiceProvider` (named)

**Local imports:**
- → `config/keyResolver.js`
- → `providers/adapters/minimaxTTS.js`
- → `providers/adapters/geminiTTS.js`
- → `providers/adapters/gttsTTS.js`
- → `providers/adapters/geminiLive.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `services/workingMemory.js`
**Exports:** `workingMemory` (named), `workingMemory` (default)

**Local imports:**
- → `services/redisClient.js`

### 📁 providers/

#### `providers/adapters/anthropic.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/gemini.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/geminiLive.js`
**Exports:** `GeminiLiveAdapter` (named), `GeminiLiveAdapter` (default)

**Local imports:**
- → `providers/geminiLive.js`
- → `utils/audioConverter.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `providers/adapters/geminiTTS.js`
**Exports:** `GeminiTTSAdapter` (named)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `path`
- 📦 `fluent-ffmpeg`
- 📦 `@ffmpeg-installer/ffmpeg`

#### `providers/adapters/github.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/groq.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/gttsTTS.js`
**Exports:** `GttsTTSAdapter` (named)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `path`
- 📦 `fluent-ffmpeg`
- 📦 `@ffmpeg-installer/ffmpeg`
- 📦 `node-gtts`

#### `providers/adapters/huggingface.js`
**Exports:** `new` (default)

**External packages:**
- 📦 `openai`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `providers/adapters/kimi.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `utils/dnsHelpers.js`

#### `providers/adapters/minimaxTTS.js`
**Exports:** `MinimaxTTSAdapter` (named)

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `path`
- 📦 `fluent-ffmpeg`
- 📦 `@ffmpeg-installer/ffmpeg`

#### `providers/adapters/mistral.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/moonshot.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/nvidia.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/adapters/openai.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `providers/geminiLive.js`
**Exports:** `HD_VOICES` (named), `GeminiLiveProvider` (named), `createGeminiLiveProvider` (named), `GeminiLiveProvider` (default)

**External packages:**
- 📦 `@google/genai`
- 📦 `fs`
- 📦 `path`
- 📦 `os`
- 📦 `crypto`

#### `providers/index.js`
**Exports:** `providerRouter` (named), `providerRouter` (default)

**Local imports:**
- → `services/ai/classifier.js`
- → `services/envResolver.js`
- ⚡ `core/ServiceContainer.js`
- ⚡ `core/ServiceContainer.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

### 📁 plugins/

#### `plugins/admin/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `services/userService.js`
- → `services/adminService.js`
- → `services/workingMemory.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `plugins/crawlfire_web/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `core/ServiceContainer.js`

#### `plugins/daily_pulse/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `plugins/daily_pulse/journal_generator.js`

#### `plugins/daily_pulse/journal_generator.js`
**Exports:** `journalGenerator` (named)

**Local imports:**
- → `core/container.js`
- → `services/workingMemory.js`
- ⚡ `services/supabase.js`
- ⚡ `providers/geminiLive.js`

**External packages:**
- 📦 `fs`
- 📦 `path`

#### `plugins/deep_research/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `plugins/deep_research/research_agent.js`
- → `core/container.js`
- ⚡ `plugins/loader.js`

#### `plugins/deep_research/research_agent.js`
**Exports:** `DeepResearchAgent` (named)

**Local imports:**
- → `core/container.js`
- ⚡ `plugins/loader.js`

#### `plugins/dev_tools/index.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `plugins/duckduck_search/index.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `plugins/goals/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `services/goalsService.js`

#### `plugins/group_manager/actions.js`
**Exports:** `moderationActions` (named), `moderationActions` (default)

*No dependencies (leaf node)*

#### `plugins/group_manager/database.js`
**Exports:** `filterDB` (named), `whitelistDB` (named), `warningsDB` (named), `configDB` (named), `(anonymous)` (default)

**Local imports:**
- → `services/supabase.js`

#### `plugins/group_manager/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `plugins/group_manager/database.js`
- → `plugins/group_manager/processor.js`
- → `providers/index.js`
- → `services/workingMemory.js`
- → `utils/jidHelper.js`
- ⚡ `services/supabase.js`
- ⚡ `services/userService.js`
- ⚡ `services/supabase.js`
- ⚡ `services/userService.js`
- ⚡ `services/groupService.js`
- ⚡ `services/groupService.js`
- ⚡ `services/groupService.js`
- ⚡ `services/supabase.js`
- ⚡ `services/groupService.js`
- ⚡ `services/supabase.js`
- ⚡ `services/redisClient.js`
- ⚡ `plugins/group_manager/database.js`

#### `plugins/group_manager/processor.js`
**Exports:** `FilterProcessor` (named), `filterProcessor` (named), `filterProcessor` (default)

**Local imports:**
- → `plugins/group_manager/database.js`
- → `plugins/group_manager/actions.js`
- → `providers/index.js`

#### `plugins/loader.js`
**Exports:** `pluginLoader` (named), `PluginLoader` (default)

**Local imports:**
- → `core/events.js`
- ⚡ `services/supabase.js`
- ⚡ `core/ServiceContainer.js`

**External packages:**
- 📦 `fs/promises`
- 📦 `path`
- 📦 `url`

#### `plugins/memory/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `services/memory.js`

#### `plugins/send_email/index.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `plugins/shopping/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- → `plugins/shopping/shopping_agent.js`

#### `plugins/shopping/scraper.js`
**Exports:** `scraper` (named)

**Local imports:**
- → `core/container.js`

#### `plugins/shopping/shopping_agent.js`
**Exports:** `ShoppingAgent` (named)

**Local imports:**
- → `core/container.js`
- → `plugins/shopping/scraper.js`
- ⚡ `plugins/loader.js`

#### `plugins/sticker/index.js`
**Exports:** `(anonymous)` (default)

*No dependencies (leaf node)*

#### `plugins/sys_interaction/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- ⚡ `plugins/loader.js`
- ⚡ `services/consciousnessService.js`

#### `plugins/system/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- ⚡ `services/adminService.js`

**External packages:**
- 📦 `os`
- 📦 `child_process`
- 📦 `util`

#### `plugins/translate/index.js`
**Exports:** `(anonymous)` (default)

**External packages:**
- 📦 `@vitalets/google-translate-api`

#### `plugins/tts/index.js`
**Exports:** `(anonymous)` (default)

**Local imports:**
- ⚡ `services/voice/voiceProvider.js`
- ⚡ `config/index.js`
- ⚡ `services/quotaManager.js`

#### `plugins/visual_reporter/index.js`
**Exports:** `plugin` (named), `plugin` (default)

**External packages:**
- 📦 `pdfkit`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `plugins/wikipedia/index.js`
**Exports:** `(anonymous)` (default)

**External packages:**
- 📦 `wikipedia`

### 📁 scheduler/

#### `scheduler/dbMonitoring.js`
**Exports:** `monitorDatabaseHealth` (named), `cleanupOldData` (named), `analyzePerformance` (named), `generateWeeklyReport` (named), `getMonitoringStatus` (named), `forceHealthCheck` (named)

**Local imports:**
- → `services/monitoring/DatabaseMonitor.js`

**External packages:**
- 📦 `fs`
- 📦 `path`

#### `scheduler/index.js`
**Exports:** `scheduler` (named), `scheduler` (default)

**Local imports:**
- → `core/orchestrator.js`
- → `core/events.js`

**External packages:**
- 📦 `node-cron`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

### 📁 tests/

#### `tests/debug_env.js`
**Local imports:**
- ⚡ `plugins/loader.js`

**External packages:**
- 📦 `dotenv/config`

#### `tests/debug_plugins.js`
**External packages:**
- 📦 `url`
- 📦 `path`

#### `tests/debug_shopping_only.js`
**External packages:**
- 📦 `url`
- 📦 `path`

#### `tests/test_reflex_classifier.js`
**Local imports:**
- → `services/ai/ReflexClassifier.js`

#### `tests/test_swarm_core.js`
**Local imports:**
- → `core/concurrency/SwarmDispatcher.js`

#### `tests/unit/config/keyResolver.test.js`
**Local imports:**
- → `config/keyResolver.js`

**External packages:**
- 📦 `node:test`
- 📦 `node:assert`

#### `tests/unit/services/userService.test.js`
**External packages:**
- 📦 `node:test`
- 📦 `node:assert`

#### `tests/unit/transport/handlers/antiDeleteHandler.test.js`
**Local imports:**
- → `core/transport/handlers/antiDeleteHandler.js`

**External packages:**
- 📦 `node:test`
- 📦 `node:assert`

#### `tests/unit/transport/handlers/audioHandler.test.js`
**Local imports:**
- → `core/transport/handlers/audioHandler.js`

**External packages:**
- 📦 `node:test`
- 📦 `node:assert`

#### `tests/unit/utils/helpers.test.js`
**External packages:**
- 📦 `node:test`
- 📦 `node:assert`

#### `tests/unit/utils/pidLock.test.js`
**Local imports:**
- → `utils/pidLock.js`

**External packages:**
- 📦 `node:test`
- 📦 `node:assert`
- 📦 `node:fs`
- 📦 `node:path`

#### `tests/verify_classifier.js`
**Local imports:**
- → `providers/index.js`

#### `tests/verify_integration.js`
**Local imports:**
- → `services/userService.js`
- → `services/state/StateManager.js`
- → `services/redisClient.js`

#### `tests/verify_plugins_manual.js`
**Local imports:**
- → `plugins/duckduck_search/index.js`
- → `plugins/crawlfire_web/index.js`
- → `core/container.js`

**External packages:**
- 📦 `dotenv/config`

#### `tests/verify_state.js`
**Local imports:**
- → `services/state/StateManager.js`
- → `services/state/IdentityMap.js`
- → `services/state/LockManager.js`
- → `services/redisClient.js`
- → `utils/helpers.js`

#### `tests/verify_sync.js`
**Local imports:**
- ⚡ `plugins/loader.js`

**External packages:**
- 📦 `dotenv/config`
- 📦 `@supabase/supabase-js`

#### `tests/verify_sync_manual.js`
**Local imports:**
- → `plugins/loader.js`

**External packages:**
- 📦 `dotenv/config`
- 📦 `@supabase/supabase-js`

### 📁 scripts/

#### `scripts/admin-cli.js`
**Local imports:**
- → `core/ServiceContainer.js`
- → `services/state/StateManager.js`
- ⚡ `plugins/loader.js`

**External packages:**
- 📦 `dotenv/config`
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `scripts/audit-group.js`
**Local imports:**
- → `services/redisClient.js`
- → `services/supabase.js`

**External packages:**
- 📦 `@whiskeysockets/baileys`
- 📦 `pino`

#### `scripts/check-redis.js`
**Local imports:**
- → `services/redisClient.js`

#### `scripts/debug-wa-metadata.js`
**External packages:**
- 📦 `@whiskeysockets/baileys`
- 📦 `pino`
- 📦 `fs`

#### `scripts/fix-missing-usernames.js`
**Local imports:**
- → `services/redisClient.js`
- → `services/supabase.js`

#### `scripts/generate-blueprint.js`
**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `scripts/health-check.js`
**Local imports:**
- → `core/ServiceContainer.js`
- → `providers/index.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `scripts/ingest_docs.js`
**Local imports:**
- → `services/ai/EmbeddingsService.js`

**External packages:**
- 📦 `@supabase/supabase-js`
- 📦 `fs`
- 📦 `path`
- 📦 `url`
- 📦 `dotenv/config`

#### `scripts/repair-session.js`
**External packages:**
- 📦 `fs`
- 📦 `path`

#### `scripts/test_10_10.js`
**Local imports:**
- → `services/memory/MemoryDecay.js`
- → `services/agentic/ActionEvaluator.js`
- → `services/agentic/Planner.js`
- → `services/agentic/MultiAgent.js`
- → `services/supabase.js`

#### `scripts/test_models.js`
**Local imports:**
- → `providers/index.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

### 📁 bin/

#### `bin/hive-mind.js`
**External packages:**
- 📦 `child_process`
- 📦 `url`
- 📦 `path`

### 📁 (root)

#### `audit/apply_db_corrections.js`
**Exports:** `applyDBCorrections` (named), `execSQL` (named), `runCleanup` (named)

**Local imports:**
- → `services/supabase.js`

**External packages:**
- 📦 `fs`
- 📦 `path`
- 📦 `url`

#### `bot.js`
**Local imports:**
- → `utils/pidLock.js`
- → `core/index.js`
- → `services/userService.js`
- → `core/events.js`
- → `services/state/StateManager.js`

**External packages:**
- 📦 `dotenv/config`

#### `test/live_mention_test.js`
**Local imports:**
- → `core/transport/baileys.js`

#### `test/mention_test.js`
**Local imports:**
- → `utils/fuzzyMatcher.js`

#### `test/verify_fix_success.js`
**Local imports:**
- → `utils/fuzzyMatcher.js`

#### `test/verify_tagging_fix.js`
**Local imports:**
- → `utils/fuzzyMatcher.js`

**External packages:**
- 📦 `assert`

#### `test_db.js`
**Local imports:**
- → `core/ServiceContainer.js`

