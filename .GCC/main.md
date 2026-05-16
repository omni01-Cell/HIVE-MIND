# Current task context

## 🏆 Major Milestones (Archived Epics)
- **[Phase 1] [2026-04-22] Migration TypeScript & Blueprinting** : Migration complète de la codebase JavaScript brute (+20k lignes) vers TypeScript strict.
- **[Phase 2] [2026-04-23] System & FS Capabilities (Claude Code Alignment)** : Bash persistant, Ripgrep, mtime tracking.
- **[Phase 3] [2026-04-23] Multi-Interface Adaptation & Dual Rendering** : Découplage Brain/Adapteurs, WhatsApp/CLI/Discord, client MCP.
- **[Phase 4] [2026-04-24] Agent Hardening & FinOps** : Implémentation de 8 fonctionnalités critiques (Compression LLM, SubAgent isolé, Callback onProgress, Kill Switch FinOps, Dual-Logic HITL, Dual Rendering CLI/WhatsApp, Chain of Thought obligatoire, et interception de sécurité).
- **Epic Dirac** : Hash-Anchored Edits (AnchorStateManager, lineHashing, hashDictionary), AST-Native Tools (TreeSitterService, 3 outils), Multi-File Batching, Parallel Tool Execution (`Promise.all` read-only), Context Curation + Minimal Prompting (DIRAC CODING PROTOCOL).
- **Epic SOTA Browser Agent Integration** : Installation agent-browser + Chrome for Testing, BrowserService (CLI wrapper), BrowserTools plugin (13 outils browser_*), Intégration PTC, System Prompt browser instructions, Sécurité & Guardrails (NVM path, type safety, sendMedia fix).
- [2026-05-02] HIVE-MIND-RAILWAY Stabilization Roadmap: V3 refactor, infrastructure stabilization, security hardening for Railway deployment.

## Objective
Stabilize the HIVE-MIND production deployment on Railway by resolving critical infrastructure, database, and runtime failures identified during the initial launch, and executing remaining E2E tests.

## Decisions made
### Architecture & Infrastructure (HIVE-MIND Legacy Core)
- [2026-04-24] Clôture de la Phase 4 avec une architecture complètement refactorisée et documentée.
- [2026-04-24] Lancement de la Phase 5 focalisée sur la validation des cas limites et la robustesse en production.
- [2026-04-24] [Omni-Channel DB] Remplacement de l'architecture base de données (basée sur WhatsApp 'jid') par un modèle Identity Access Management (table 'users' universelle + table 'user_identities' par plateforme).
- [2026-04-24] Implémentation d'une couche de rétrocompatibilité intelligente (`resolveContextFromLegacyId`) dans `services/supabase.ts`.
- [2026-04-24] Résolution des crashs Jest/ESM majeurs en remplaçant les `require` par `await import()` et en fixant l'initialisation du `ServiceContainer`.
- [2026-04-28] Restructuration complète des plugins et outils pour la compatibilité Omni-Channel : renommage massif `gm_` → `whatsapp_`, mécanisme `forceModeration`, retrait de `react_to_message` des `CORE_TOOLS`.
- [2026-04-25] Restriction de la Sandbox : '/home/omni/Code/Sandbox1' au lieu de 'process.cwd()'. Création de `storage_hm` (espace dédié agent IA).
- [2026-04-25] Ajout d'OpenRouter comme provider IA rapide (remplace NVIDIA NIM). Modèles free : `gemma-4-31b-it:free`, `minimax-m2.5:free`, `glm-4.5-air:free`.
- [2026-04-25] Port du skill Python "google-ai-researcher" en plugin TypeScript (`plugins/web/google_ai_search`).
- [2026-04-25] [PTC] Implémentation du Programmatic Tool Calling (Pilier D AION). Node.js `vm` natif, 0 dépendance. Pas de bridge MCP en V1.
- [2026-04-25] [SafeScript] Validateur SafeScript (3 couches): Layer 1 AST (acorn), Layer 2 Proxy Scope Guard, Layer 3 Auto-Repair. Classification modèles en tiers S/A/B/C via `ptc_tier`.
- [2026-04-25] [Omni-Channel Tools] `send_message`, `create_poll`, `send_contact`, `react_to_message` omni-channel avec `target_channel` et `target_chat_id`.
- [2026-04-25] FastPath: nvidia/minimax-m2.7 → gemini-3.1-flash-lite-preview (363 tok/s). Live: → gemini-3.1-flash-live-preview.
- [2026-04-25] AGENTIC: kimi-k2.5 → gemini-3.1-flash-lite-preview (primary). ptc_tier B→A. Boucle ReAct utilise `category: 'AGENTIC'`.
- [2026-04-26] Correction Sandbox : PersistentShell utilise correctement Sandbox1 ou `SANDBOX_DIR`. FileEditTool résout les chemins relatifs dans la sandbox.
- [2026-04-26] Ajout des informations Sandbox (SandboxDir et storage_hm) dans le System Prompt via `TieredContextLoader.ts`.
- [2026-04-26] Création de l'outil universel `send_file` dans `sys_interaction` (omni-channel via `transport.sendMedia`).
- [2026-04-26] Fix critique Planner JSON : 3 bugs ESM corrigés (json5.default, cleanedJson scope, Ajv.default).
- [2026-04-26] Fix 9 bugs critiques runtime Agentic : ServiceContainer DI, FastPath ESM, Planner tool validation, Observer config, Summary family, Empty response fallback, Execute success check, NVIDIA timeout.
- [2026-04-26] Refactoring nomenclature : `service_agents`/`chat_agents` → `service_recipes`/`chat_recipes`.
- [2026-04-26] Implémentation `SubAgentEngine` (Swarm Architecture) : Moteur ReAct générique standardisé. Refonte de ShoppingAgent, DeepResearchAgent et SubAgentTool. Outil `spawn_sub_agent` pour orchestration dynamique.
- [2026-04-30] Validation finale des corrections des biais d'architecture (commit 71 fichiers).
- [Consciousness System] Intégration de `WakeSystem` (Heartbeat/Cron push-based), Bridge `HIVE` injecté dans sandbox VM PTC, Execution Bias, Silent Reply Token `__HIVE_SILENT_7f3a__`.
- [Epistemic Memory] `agent_workspace` (SuperLocalMemory V3) via AGBoost. Champs de Langevin (variance, access_count). Cron Job `memoryEventScanner` avec gestion événements récurrents (`cron-parser`).

### Railway Deployment & Stabilization (HIVE-MIND-RAILWAY)
- [2026-05-01] Migrated to V3 Dynamic Context Engineering (Redis L1 cache).
- [2026-05-01] Switched from Browser Whitelist to Blacklist.
- [2026-05-02] Standardized Plugin return signatures to `{ success, message }`.
- [2026-05-03] Initialized `AGBoost_inlite` for standardized rule enforcement.
- [2026-05-04] Fixed Provider Adapters TypeScript compilation errors (Railway deploy).
- [2026-05-04] Fixed GeminiTTS FFmpeg raw PCM input option order.
- [2026-05-04] Configured Gemini CLI Security Policies.
- [2026-05-04] Updated EnvResolver to support Smart Router V2 *_KEY_1 fallback for legacy single-key dependencies (EmbeddingsService).
- [2026-05-04] Migrated EXECUTOR and PLANNER from OpenRouter to Google Gemini API (`gemma-4-31b-it`).
- [2026-05-04] PERMANENTLY DISABLED LLM classification: Removed `classifier.ts`, `ReflexClassifier.ts`, `FastPathHandler.ts`. Router defaults to AGENTIC category. Only the degree of context (TieredContextLoader V3 UNIFIED) remains. Saves ~200ms + 1 API call per message.
- [2026-05-06] Fixed `send_file` tool: Transport `sendMedia` defaults to `image` type. When sending PDFs or documents, it failed silently. Added extension inference (`.pdf` -> `document`, etc.) in `plugins/base/sys_interaction/index.ts`.
- [2026-05-06] Fixed GeminiLive WebSocket provider (Error 1007): Reverted the JSON setup schema back to using `setup` as the root key and nesting parameters inside `generationConfig` according to the official API spec.
- [2026-05-06] Fixed GroupService.getGroupSettings: was calling `supabase.getGroupConfig()` on raw Supabase client instead of the `db` wrapper that defines that method.
- [2026-05-06] Fixed agent read access: system prompt + TieredContextLoader + PermissionManager all said "stay in sandbox" which blocked universal read. Clarified: read=universal, write=sandbox only.
- [2026-05-06] Resolved naming collision in prompt: "Workspace" & "Persistent Memory" (physical folders) confused the agent against `workspace_write` (Supabase DB). Renamed to "Code Sandbox" & "File Storage" for files, and "Epistemic Workspace (Database)" for Supabase.
- [2026-05-06] Updated model routing policy after live provider model-list checks: usable keys verified for Mistral, Gemini, GitHub Models, Groq, Hugging Face Router, NVIDIA NIM, and OpenRouter; OpenAI/Anthropic/Moonshot/Kimi keys exist locally but returned 401. Chat/service recipes now avoid sub-30B/small models except `TAG_SERVICE`.
- [2026-05-06] Standardized Smart Router API key resolution to strict `PROVIDER_KEY` / `PROVIDER_KEY_N` environment variables only. Legacy `VOTRE_CLE_*` provider aliases are ignored, `no_key` disables a key slot, and missing provider keys no longer emit undefined-key warnings.
- [2026-05-06] Removed OpenRouter Gemma 4 free model entry (`google/gemma-4-31b-it:free`) because OpenRouter quota is unavailable; Google/Gemini `gemma-4-31b-it` remains the Gemma 4 route.
- [2026-05-06] Fixed Gemini Live API-key regression at the credential resolver boundary: `resolveApiKey()` now maps legacy placeholders like `VOTRE_CLE_GEMINI` to strict `PROVIDER_KEY[_N]` env vars, and `GeminiLiveProvider` now falls back to `envResolver.resolveProviderKey('gemini')` plus an explicit missing-key error instead of silently opening a WS with an empty key.
- [2026-05-06] Removed the legacy `VOTRE_CLE_*` scheme entirely from active config/runtime paths. `credentials.json` now references `${PROVIDER_KEY}` values, runtime guards validate real non-empty keys instead of placeholder substrings, and repo-wide text references were cleaned to avoid reintroducing the old pattern.
- [2026-05-06] Fixed post-cleanup TypeScript build regression: the bulk text replacement also changed two `scratch/` scripts into invalid `process.env.${VAR}` syntax; they were corrected to `process.env.GEMINI_KEY` / `process.env.GROQ_KEY` and the build is green again.

## Current status
### ✅ Done (HIVE-MIND-RAILWAY)
- [2026-05-07] Fixed Gemini Live 1011 crash: Removed PTC `code_execution` from Live mode (its description embeds all tool docs ~5KB+ which exceeded setup message limits). Added sanitization layer in `geminiLiveProvider._sendSetup` to strip `additionalProperties` from schemas and truncate descriptions to 500 chars.
- [2026-05-08] Fixed Gemini Live 1011 crash (payload 10KB): Added payload size guard (truncate system prompt to 2000 chars, description cap 300 chars, progressive tool-dropping over 8KB). Then diagnosed that the REAL root cause was `responseModalities: ['AUDIO', 'TEXT']` — the model `gemini-3.1-flash-live-preview` no longer accepts TEXT modality (Google-side change). Reverted to `['AUDIO']` only; text transcriptions still arrive via `outputTranscription` events.
- [2026-05-11] Fixed WhatsApp voice note flat waveform (no oscillations): Two root causes — (1) `audio-decode` npm package was missing, which Baileys requires internally for `getAudioWaveform()`. Without it, Baileys silently overwrites our computed waveform with `undefined`. Installed `audio-decode`. (2) Our FFmpeg-based `generateWaveformFromFile` was producing values in 5-255 range, but WhatsApp expects 0-100 (max 127). Aligned to Baileys' own range `Math.floor(100 * n)`. Fixed both the FFmpeg generator and the static fallback values.
- [2026-05-07] Changed Gemini Live voice: Switched default voice from "Aoede" to "Kore" in `config/models_config.json` for a friendlier, less dramatic tone.
- [2026-05-07] Fixed Gemini Live API silent timeout on long generation: Increased `waitForResponse` timeout from 30s to 120s and implemented a dynamic activity-based timeout that resets upon receiving server messages, ensuring the bot does not abruptly close the WebSocket and remain silent when generating long voice notes or executing long tools. Also added explicit fallback text if the native audio pipeline throws an error.
- [2026-05-06] Fixed document display type in WhatsApp: added robust `mimetype` inference in `send_file` using the `mime-types` module and forwarded it through Baileys' `sendMedia` to prevent `.md` and other files from defaulting to `.pdf` representation.
- [2026-05-06] Smart Router key resolution hardened: `ProviderRouter.getApiKey()` now delegates to `EnvResolver.resolveProviderKey()` and only considers `PROVIDER_KEY`, `PROVIDER_KEY_1..7` values that are not `no_key`.
- [2026-05-06] Fixed live audio key initialization regression: `core/ServiceContainer`, `services/graphMemory`, and `resolveCredentials()` now pass explicit provider names into `resolveApiKey()`, which restores real Gemini key injection for paths still backed by `VOTRE_CLE_GEMINI` in `credentials.json`.
- [2026-05-06] Completed migration away from `VOTRE_CLE_*`: `resolveApiKey()` now infers providers from `${PROVIDER_KEY}` notation only, and `config/index.ts` / ingestion helpers use `*_KEY` variables instead of legacy env names.
- [2026-05-06] Rebalanced `models_config.json` toward verified high-performance models: Gemini 3.1 Pro for reasoning/agentic/vision, NVIDIA Kimi K2.6 for coding fallback, Groq GPT-OSS 120B/Qwen 32B for service fallback, with `TAG_SERVICE` retaining Llama 3.1 8B for fast group tagging.
- [2026-05-06] OpenRouter no longer lists `google/gemma-4-31b-it:free`; pricing now tracks `gemma-4-31b-it` directly for the Google/Gemini provider path.
- [2026-05-06] Validated Gemini Live Audio + Tool Calling: Successfully executed the user's `test.opus` audio on Railway. The bot successfully bypassed the "silent failure" state, understood the context, and replied with generated PCM 24kHz audio (`Quel est le nom du fichier?`). The entire voice-to-voice pipeline is stable.
- [2026-05-06] Fixed "silent ignore" bug in Gemini Live: Added `['AUDIO', 'TEXT']` modalities to prevent the model from silencing itself when asked to perform non-audio actions (like tool calls), and added an explicit fallback message in `core/index.ts` to prevent the bot from ignoring the user if the audio/text response is totally empty.
- [2026-05-06] Fixed robust `<thought>` tag stripping in `core/index.ts`: implemented multi-pass regex extraction to prevent thoughts from leaking to the user even when the LLM forgets to open or close the tags.
- [2026-05-06] Fixed `send_file` tool hallucinated success in `plugins/base/sys_interaction/index.ts`: added path resolution using `SANDBOX_DIR` and explicit file existence checks to return meaningful errors instead of failing silently.
- [2026-05-06] Core integration fix: Updated `core/index.ts` to use `transportManager.sendVoiceNote` instead of the non-existent `sendVoice` method, successfully completing the Gemini Live multimodal Voice-to-Voice roundtrip on Railway.
- [2026-05-06] Fixed GeminiLiveProvider audio processing timeout: implemented `realtimeInput` audio chunking (4096 bytes per frame), appended 2 seconds of trailing silence to force natural Voice Activity Detection (VAD) triggers, and completely removed the explicit `clientContent` turnComplete signal which was prematurely aborting the stream.
- [2026-05-06] Fixed GeminiLiveProvider according to latest BidiGenerateContent API specs: root key is confirmed to be 'setup' for raw WebSockets (the 'config' wrapper belongs to high-level SDKs), restored setupComplete block, and extracted input/output text transcriptions.
- [TESTING] Programmatic WA E2E Test Suite (`scripts/test_wa_e2e.ts`).
- [TESTING] Integrated Railway logs streaming in E2E runner.
- [DOCS] Comprehensive Testing Guide (`docs/TESTS.md`).
- [SECURITY] Configured custom CLI policies (safe_mode.toml).
- [VOICE] GeminiTTS FFmpeg Fix (Raw PCM input handling).
- [INFRA] Headless Mode Detection (disabled ink-cli in non-TTY).
- [DB] Race Condition Fixes (migrated to upsert in Supabase).
- [AGENTIC] MultiAgent Stability & Planner Resilience.
- [PROTOCOL] Gemini Thought Persistence for tool calling.
- [SECURITY] MoralCompass Refactor, Bypass, and Refusal Visibility.
- [SECURITY] Browser Blacklist & Universal Read/Restricted Write.
- [SECURITY] VM Escape Mitigation & Dynamic HITL.
- [ARCH] V3 Dynamic Context Engineering (Redis L1).
- [DB] Supabase Users Schema update (v3).
- [FEATURE] WhatsApp File Reception & GC.
- [CRITICAL] Error Logs Fix (scheduler target undefined).
- [PLUGINS] V3 Migration & Localization (English-native).
- [ROUTER] Smart Router V2 with Quota Management (multi-key rotation 7 keys, Redis quotas, proactive 429).
- [VOICE] TTS Overhaul (Gemini 3.1 Director's Chair + Minimax Persona).
- [DEVX] Created `.codex/AGENTS.md` & updated CLAUDE/GEMINI.md with Testing Protocol (§8.5 WA E2E, §8.6 Railway CLI).
- [DEVX] Fixed §7 Project Context — replaced `infra/` with real 4-layer architecture.
- [DOCS] Professional README.md overhaul.
- [AUDIT] Deep code audit — 13 findings (2 CRITICAL, 4 HIGH, 4 MEDIUM, 3 LOW). Fixed 10 issues.
- [DEPLOY] Fixed Provider Adapters TypeScript build errors on Railway (14 adapters).
- [INFRA] Fixed Smart Router V2 integration with `envResolver`.
- [PLUGINS] Fixed ESM import sticker plugin, Baileys sendSticker, CrawlFire safety guards.
- [CORE] Fixed ReferenceError in ProviderRouter, disabled plugin auto-sync in local mode.
- [ARCH] Permanently disabled LLM-based classification (classifier.ts, ReflexClassifier.ts, FastPathHandler.ts deleted). Router defaults to AGENTIC. Context degree via TieredContextLoader V3 UNIFIED only.
- [REFACTOR] Renamed SwarmDispatcher.isFastPath → isPriorityCommand for clarity.
- [TOOLS] Fixed `send_file` silently failing for non-images: now automatically infers MIME type from file extension (document, video, audio) and passes it to `sendMedia`.
- [VOICE] Fixed GeminiLive WebSocket API (Error 1007): Restored official JSON schema wrapper `setup` and nested `generationConfig`. Kept turnComplete signal & debug logging.
- [GROUPS] Fixed GroupService.getGroupSettings calling `supabase.getGroupConfig()` on raw client — routed to `db` wrapper.
- [AGENT] Fixed universal read access: system prompt, TieredContextLoader execution block, and PermissionManager error hints now correctly distinguish read (universal) vs write (sandbox-only).
- [AGENT] Resolved "Workspace" naming collision in prompts, separating Physical File Storage ("Code Sandbox") from Epistemic Memory Database (`workspace_write`).
- [AGENT] Audited and updated system prompt (`persona/prompts/system.md`): Corrected obsolete reminder tools (replaced with autonomous goals tools) and refactored prompt to follow best practices from `Prompt.md` (instructions over constraints).

### ✅ Done (HIVE-MIND Legacy Core)
- Commit global des 71 fichiers englobant l'intégralité des corrections.
- Réécriture complète `GeminiLiveProvider` — API format aligné (v1beta, `realtimeInput.audio`, `config` setup). Modèle: `gemini-3.1-flash-live-preview`.
- Refacto FastPath → `category: 'FAST_CHAT'` via Smart Router (quotas, circuit breaker, reliability score, fallback cascade).
- Fix 3 bugs runtime — shutdown_bot (`sendPresenceUpdate` → `setPresence`), quoted msg (audioMessage/documentMessage dans contextInfo), quote+mention forcés quand bot adressé.
- Codebase Build TypeScript OK. Plan de test structuré `.GCC/branches/test.md`.
- Réécriture `supabase_setup.sql` avec schéma OMNI-CHANNEL idempotent (DROP CASCADE + RPC RAG). Correction dimensions vecteurs (1024 Gemini au lieu de 1536).
- Mise à jour `services/supabase.ts` avec `resolveUser` / `resolveGroup`.
- Refonte totale gestion d'état et d'identité (`StateManager.ts` & `IdentityMap.ts`) — UUIDs, `user_identities`, Ghost User Merge conservé.
- Fix des 160 tests (100% verte, mocks ESM, Redis, détection open handles).
- Résolution erreurs runtime `sendPresenceUpdate` et `sendReaction` (alignement `TransportInterface`).
- Intégration OpenRouter (adapter + config + credentials + pricing).
- Plugin `google_ai_search` — SerpApi Google AI Mode (3 modes).
- Analyse complète repo `programmatic-tool-calling` + Implémentation PTC (`services/ptc/` : 4 fichiers). Build TS: 0 erreur.
- Fix Omni-Channel `send_message` + `get_my_capabilities` incluant `code_execution`.
- SafeScript Validator détaillé (Layer 1 AST + Layer 2 Proxy + Layer 3 Auto-Repair). `acorn` + `acorn-walk`.
- Classification `ptc_tier` (S/A/B/C) dans `models_config.json`. FastPath exclut Tier C du PTC.
- Fix Humanisation (Quote vs Tag) : logique mutuellement exclusive chaos/actif/solo.
- Fix FuzzyMatcher : seuil 0.40 → 0.65, `implicitMentions` désactivées.
- Mise à jour `models_config.json` : minimax-m2.5 Tier S (80.2% SWE-Bench), gemini-3-flash-preview Tier S fallback AGENTIC.
- Correction critique Sandbox (PersistentShell & FileEditTool). Ajout `STORAGE_DIR` dans `.env`.
- Fix critique Planner 3 bugs ESM (json5.default, cleanedJson scope, Ajv.default). Validation E2E: json5 ✅, jsonrepair ✅, Ajv ✅.
- Fix 9 bugs runtime Agentic pipeline. Build TS: 0 erreur.
- Fix FastPath `PTC_SINGLE_TOOL` crash : VM (~5ms) autorisée + warning au lieu du throw.
- Analyse OpenClaw + Implémentation 4 concepts : WakeSystem, Bridge HIVE, Execution Bias, Silent Reply Token.
- Architecture GWT (`consciousness_system_design.md`) + refactoring TieredContextLoader (balises XML `<system_identity>`, `<current_consciousness_state>`, `<execution_engine>`).
- Audit implementation_audit.md : 5 oublis corrigés (WakeSystem shutdown, regex system.md, checkEveryMs, `<inner_monologue>`).
- [Expert Audit #1] 7 biais : _compactHistory (P0), FastPath escalation (P1), AntiDelete race (P1), Observer dupliqué (P2), SILENT_HM namespaced (P2), Conscience throttle (P3), FairnessQueue réfuté (N/A).
- [Expert Audit #2] 11 biais : _naturalDelay jitter (P0), SwarmDispatcher FastLane (P0), FairnessQueue dequeue (P1), _isBotMentioned cache (P1), sanitizeXml injection (P1), PermissionManager feedback (P2), Circuit Breaker BUDGET_EXCEEDED (P2), addMessage contrat (P2), Semantic Memory dédup (P3), Observer h.tool_name (P3), Rehydration SYSTEM_RESUME (P3).
- [Expert Audit #3] 11 biais (Couche Service) : dreamService errors (P0), Vector Recall context_id (P0), JSONB destruction (P0), Rehydration ID Mismatch (P1), MoralCompass fail-closed (P1), workingMemory limit (P1), consolidation locks (P2), feedback window (P2), groupService reference (P2), PTC timeout leak (P2), AdminService retry (P3).
- Synchronisation automatique plugins au démarrage (`core/index.ts` détecte new/modified).
- Fix bug "J'ai terminé ma réflexion" — SILENT_TOKEN intercepte les réponses vides post-action silencieuse.
- Fix chemins Sandbox/storage_hm codés en dur → `STORAGE_DIR` env var.
- Fix fuite meta-tool `code_execution` — scrubber Regex dans FastPathHandler + core/index.ts.
- Audit complet architecture mémoire (RAG passif, factsMemory R/W explicite).
- `agent_workspace` (Mémoire Épistémique) AGBoost — table Langevin, 4 outils agentiques (workspace_write/read/search/delete). Vérification E2E (`verify_workspace.js`).
- Cron Job `memoryEventScanner` — événements ponctuels (`date_iso`) vs récurrents (expression `cron`), `[CRON:]` prefix, recalcul automatique.
- [Expert Audit #4] Epistemic Memory : Bug RPC increment_workspace_access (P0), Orphaned Reminders (P1), Duplication événements Cron (P1), Extraction JSON instable json5 (P2), Drift Temporel crons (P3).
- Fix erreurs compilation TS : schedulerHandler.ts (backticks), TreeSitterService.ts (nouvelle API web-tree-sitter). Build TS: 0 erreur.
- Prompt système SOTA unifié (XML/Modular) dans `persona/prompts/system.md`. Suppression profile.json, values.json, refusal.md.
- Ajout outils Agentiques dans `CORE_TOOLS` de `plugins/loader.ts` (injection inconditionnelle).
- Traduction INTÉGRALE prompts système vers anglais (system.md, TieredContextLoader, schedulerHandler, index.ts, contextBuilder, plugins).
- Extraction dynamique nom agent depuis `<name>` de `system.md`. Suppression nom codé en dur.
- Fix crash "downloadMedia is not a function" dans TransportManager et baileys.ts.
- Fix fuite pensée interne `<thought>` — regex robustes `(?:<\/\1>|$)`.
- Fix critique `_isBotMentioned` — résolution reverse JID→LID, `getLidForJid` synchrone, hydratation cache LID au boot Baileys.

- [2026-05-11] [PLUGINS] Renovated `send_email` plugin v2.0: typed interfaces (SendEmailArgs, SendEmailResult), email validation regex, AbortController timeout (15s), proper timeout vs network error discrimination. Created n8n automation workflow "HiveMind-SendEmail" (Webhook → Send Email) on self-hosted instance at `http://13.53.192.140:5678`. SMTP credential configured with `lender926@gmail.com` App Password. Webhook tested successfully via curl.
- [2026-05-11] [PLUGINS] Renovated `translate`, `shopping`, `visual_reporter`, and `daily_pulse` plugins: Replaced raw `any` types with strict TypeScript interfaces (`TranslateArgs`, `TranslateContext`, `GeneratePdfArgs`, etc.), replaced legacy `tools: []` property with `toolDefinitions: []` in `visual_reporter`, and enforced safe error casting (`error instanceof Error`). All plugins in `plugins/tools/` are now fully strictly typed.
- [2026-05-11] [TESTING] Created and passed comprehensive unit tests for all renovated plugins (`translate`, `shopping`, `visual_reporter`, `daily_pulse`, `send_email`). 23/23 tests passing. Successfully proved real-world execution by writing a scratch script that successfully sent a real test email to the user's personal address via the n8n webhook.
- [2026-05-13] [BUGFIX] Fixed send_email n8n workflow: "Send an Email" node had duplicate closing braces in expression fields (e.g. `{{ $json.body.header }} }}` instead of `{{ $json.body.header }}`). The extra ` }}` was rendered as literal text in Subject and HTML body, causing users to see raw curly braces and parentheses in received emails. Fixed by correcting all three expression fields (Subject, HTML, To Email) in the n8n HiveMind-SendEmail workflow and re-publishing.
- [2026-05-13] [PLUGINS] Created `send_sticker` plugin. Features: auto-discovery of stickers from `storage_hm/stickers/` using filename tags (`id__tag1_tag2__desc.webp`), dynamic tool definition containing a tag cloud of available moods, and a 2-step system (intent-based search -> pick -> send). Passed 18/18 unit tests.
- [2026-05-13] [ROUTER] Smart Router V2 — Fixed 7 bugs in quota/key state management. Fix #1: `await recordUsage()` (was fire-and-forget). Fix #2: `isModelAvailable()` now iterates all keys (was hardcoded k1). Fix #3+#4: VoiceProvider uses `getAvailableKeyForModel()` + passes `keyIndex`. Fix #5: L0 in-memory cache (2s TTL) on QuotaManager for intra-cycle reads. Fix #6: `filterHealthyModels()`/`getHealthyFamilies()` check all keys per provider. Fix #7: `recordQuotaExceeded()` writes L0 cache immediately. Build TS: 0 errors.
- [2026-05-14] [ROUTER & CORE] Validated Smart Router V2 via CLI E2E stress test. Implemented transparent inner retry loop in `providers/index.ts` so that when a 429 occurs, it instantly pivots to the next key for the *same model* without failing the task or degrading the model. Added validation in `workspace_write` to safely reject tool calls with missing `key` arguments, preventing database `null value` crashes.
- [2026-05-14] [TESTING] User successfully validated send_sticker plugin E2E on their live WhatsApp account.
- [2026-05-14] [DB] Successfully applied the `supabase_setup.sql` idempotent schema update to the Railway production database via Supabase Management API.
- [2026-05-14] [PLUGINS] Completed strict typing renovation across all plugins in `plugins/base/` (admin, memory, sys_interaction, system, dev_tools, goals, mcp_tools) and `plugins/web/` (google_ai_search, duckduck_search, wikipedia, crawlfire_web, deep_research). Removed all `@ts-nocheck` directives, replaced `args: any` / `context: any` with `args: unknown` + typed interfaces, added typed dispatch (`as FooArgs`) in every switch-case. Fixed 2 pre-existing API mismatches exposed by strict typing (softDelete signature, missing restore method). Build: `npx tsc --noEmit` → 0 errors.
- [2026-05-14] [TESTING] Executed the 10-prompt agentic battery using CLI. Evaluated strong capabilities in coding and structured output, but identified bugs in `agent-browser` (black screenshots) and `workspace_write` (silent file creation failures). Tracked in afaire.md.
- [2026-05-14] [BUGFIX] Fixed `agent-browser` black screenshots bug by injecting an eval script (`document.body.style.backgroundColor = "white"`) before capturing screenshots in `BrowserTools.ts`.
- [2026-05-14] [BUGFIX] Fixed screenshot naming issue. Enforced descriptive filename extraction by making `name` a required parameter in the `browser_screenshot` tool schema, and added `.png` auto-append + sanitization.
- [2026-05-14] [BUGFIX] Fixed `workspace_write` silent markdown generation failure. The tool writes to Supabase Epistemic Memory, NOT the local filesystem. Added a strict warning in the tool description to prevent the agent from hallucinating local file creation and forcing it to use `code_execution` or file editing tools instead.
- [2026-05-14] [TESTING] Isolés les contextes de session de test dans `run_cli_battery.ts` pour empêcher le débordement de mémoire (chatId unique par test) et intégré l'écriture séquentielle du rapport E2E avec capture complète des logs (via `process.stdout`/`stderr`).
- [2026-05-14] [BUGFIX] Résolu la dernière instabilité du `agent-browser` : 1) Remplacé `browserService.wait` (qui bloquait) par un vrai `setTimeout`. 2) Ajouté un paramètre `url` à `browser_screenshot` qui force la navigation automatique si l'agent oublie de le faire avant. 3) Implémenté l'extraction de `document.title` via JS comme fallback de nommage dynamique si le modèle omet le nom du fichier.
- [2026-05-15] [CORE] Global Tool Retry System: Added pre-execution argument validation in `executeAndRecord()` (core/index.ts). Validates tool call args against JSON Schema `required` fields before execution. Returns structured `MISSING_REQUIRED_PARAMETERS` error with exact missing params and full schema, guiding the LLM to self-correct. Max 2 retries per tool per ReAct turn, then graceful degradation. 13/13 unit tests passed (`tests/unit/core/toolValidator.test.ts`). Build: `tsc --noEmit` → 0 errors.

- [2026-05-15] [TESTING] Fixed `npm test` hanging issue by adding `--forceExit` to `package.json` test script. Fixed Jest ESM mocking failures (`import.meta` and `top-level await` SyntaxErrors) by enabling Node `--experimental-vm-modules` and transitioning from `jest.mock` to `jest.unstable_mockModule` in `tests/unit/PermissionManager.test.ts`, `tests/unit/moralCompass.test.ts`, `tests/unit/plugins/bashTool.test.ts`, and `tests/unit/core/permissionManager.test.ts`.
- [2026-05-15] [BROWSER] Added `full_page: boolean` option to the `browser_screenshot` tool, allowing the agent to capture the entire scrollable content of a page.
- [2026-05-15] [TESTING] Validated `browser_screenshot` dual-mode via CLI E2E (`scripts/test_full_page_screenshot.ts`): viewport (1280×577, 116KB) and full-page (1265×1179, 221KB) both generated from Hacker News. Agent correctly dispatched `full_page: true` for the full capture and omitted it for viewport. Both files exist on disk, dimensions prove full-page captures ~2× the vertical content.
- [2026-05-15] [CORE] Implemented a 2-Layer Response Defense System (`utils/responseSanitizer.ts`) against weak model hallucinations (e.g., `flash-lite`). Layer 1 (In-Loop): detects missing `<thought>` tags, leaked tool calls, or raw code dominance and forces a retry (max 2) with explicit correction instructions. Layer 2 (Post-Loop): a final safety net that strips any remaining leaked tool calls, orphan code blocks, or JSON tool objects before sending the text to the user. Validated with 15/15 unit tests.
- [2026-05-15] [TESTING] Stabilized E2E Agent Automation Battery (7 Priorities): Blocked false Planner success claims via strict prompt and short-circuit guard. Disambiguated storage tools by renaming `workspace_*` to `db_document_*`. Fixed `code_execution` routing within the Planner via PTC integration. Prevented `unknown_tool` infinite loops in replanning by enforcing available tools. Hardened parameter validation against malformed JSON. Isolated CLI E2E test runner streams by `chatId` and increased async drain timeouts. Structured test verdicts.
- [2026-05-15] [CORE] Centralized code_execution into `_executePtcCode` to unify the Global Tool Retry System across both the standard ReAct loop and the Planner execution paths. Ensures identical Layer C validation (malformed JSON catching) and `PTC_SINGLE_TOOL` Layer B fallback validation across all paths.
- [2026-05-15] [WEB] Fixed `firecrawl_scrape` hallucinatory relative URLs failure. Added `ensureAbsoluteUrl` to force the agent to use `http://` or `https://` absolute URLs, preventing cryptic API failures.
- [2026-05-15] [CORE] Fixed Planner Limitation (15 tool cap on prompt LLM) preventing the use of standard file IO / system tools. Systematically injected `execute_bash_command`, `run_scratchpad`, `list_directory` and `grep_search` into `CORE_TOOLS` in `plugins/loader.ts`.
- [2026-05-15] [CORE] Fixed JSON.parse error unhandled in `_safeExecuteTool` line 1928 for Observer multiAgent coherence evaluation. Wrapped it in a try-catch to prevent execution crashing if LLM outputs malformed args.
- [2026-05-15] [CORE/PTC] Fixed LLM hallucinating API return format inside `code_execution` scripts (TypeError reading 'data'). Added `llmOutput` and `userOutput` to the `extractText` defensive helper in `SandboxHelpers.ts`, and updated the `code_execution` tool description in `ProgrammaticExecutor.ts` to explicitly warn the LLM that tools return `{ success, llmOutput }`.
- [2026-05-15] [SECURITY] Fixed PTC_SINGLE_TOOL privileged shortcut: the fallback path called `pluginLoader.execute()` directly, bypassing MultiAgent critique, MoralCompass, Observer, and DB action logging. Now routes through `_safeExecuteTool()`. Also unified ReAct loop: `code_execution` no longer special-cased — it goes through `_safeExecuteTool` which internally routes to `_executePtcCode` after security checks.
- [2026-05-15] [TESTING] Fixed CLI battery double-counting bug: global wrappers for `sendFile`/`sendMedia`/`sendUniversalResponse` stacked with per-test wrappers, causing every file/media send to increment `currentCapturedFiles` twice. Removed global wrappers; per-test wrappers now delegate directly to saved originals. `hasEnoughFiles` verdict is now trustworthy.
- [2026-05-15] [CORE] Fixed TS7023 circular inference: added explicit `Promise<any>` return types to `_safeExecuteTool` and `_executePtcCode` to break the recursive type chain. `npx tsc --noEmit` → 0 errors, 0 warnings.
- [2026-05-15] [TESTING] Fixed CLI battery cross-test pollution: introduced `activeChatId` (exact match `cli_chat_e2e_${test.id}`) across all per-test wrappers (sendUniversalResponse, sendFile, sendMedia, sendText) to prevent async responses from previous tests contaminating current test captures.
- [2026-05-15] [TESTING] Fixed false timeout log for file-less tests (5, 7): inactivity break now sets `completed = true`, preventing the misleading "Timeout atteint" message from printing when the test actually finished normally.
- [2026-05-16] [SYSTEM AUDIT REMEDIATION] Implemented all 7 priority items from system_audit_remediation_plan.md:
  - P0: Restored Planner tool-context propagation (`tools: relevantTools` in `planner.execute()`)
  - P0: Guarded post-action JSON.parse — hoisted `parsedParams` for Observer+ActionEvaluator reuse
  - P1: Completed workspace to db_document migration (system.md, moralCompass SAFE_TOOLS, toolValidator tests, comments)
  - P1: Replaced all `gemini-3.1-flash-lite-preview` fallbacks with `gemma-4-31b-it`
  - P2: Fixed BashTool test contract drift (French to English assertions)
  - P2: Rewrote BrowserService.test.ts with ESM-safe jest.unstable_mockModule
  - P3: Added activeChatId reset before drain in E2E runner
  - Verified: tsc 0 errors, 32/32 suites, 251/251 tests passed

### Current status
- ✅ Done: All 7 remediation items implemented and verified
- ⏳ Pending (POSTPONED): Test fonctionnel global en conditions reelles — En attente de cles API

## Next action
- Run full E2E CLI battery to validate end-to-end agent behavior with all 7 remediation fixes applied.

## Abandoned branches
- [2026-05-15] Utilisation exclusive de getRelevantTools pour les outils systeme -> see .GCC/branches/attempt_core_tools_failed.md
