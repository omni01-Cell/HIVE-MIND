# HIVE-MIND-RAILWAY — Stabilization Roadmap

## 🚀 Objective
Stabilize the HIVE-MIND production deployment on Railway by resolving critical infrastructure, database, and runtime failures identified during the initial launch.

## 🛠️ Status (Stabilization Phase)
- **Current Milestone**: Infrastructure Hardening & Protocol Fixes.
- **Environment**: Railway (Headless, Non-TTY).
- **Core AI**: Gemini 2.0 Flash (Thinking Mode) with Minimax Fallback.

## ✅ Done (Recent Fixes)
- **[INFRA] Headless Mode Detection**: Added `process.stdin.isTTY` check in `core/index.ts` to automatically disable `ink-cli` in production (Railway), preventing "Raw mode" errors.
- **[DB] Race Condition Fixes**: Migrated `resolveUser` and `resolveGroup` in `services/supabase.ts` from `insert` to `upsert` with `onConflict` clauses to handle concurrent platform events.
- **[AGENTIC] MultiAgent Stability**: Added safety guards in `needsCritique` to prevent TypeErrors when tool context or names are undefined.
- **[AGENTIC] Planner Resilience**: Implemented fallback for missing tool names in plan steps to prevent execution loop crashes.
- **[PROTOCOL] Gemini Thought Persistence**: Updated `providers/adapters/gemini.ts` to correctly handle `thought` and `thought_signature` fields, essential for Gemini 2.0+ tool calling protocols.
- **[SECURITY] MoralCompass Refactor**: Removed legacy `values.json` dependency. Refactored `MoralCompass.ts` to use the unified `system.md` XML security boundaries.
- **[ARCH] V3 Dynamic Context Engineering**: Eliminated the split Fast/Agentic paths. Implemented a single `TieredContextLoader` that pulls a strictly formatted "Bureau de Travail" (User Passport, Scratchpad, Action History) from Redis L1 cache (~50ms).
- **[DB] Supabase Users Schema**: Added `language` and `timezone` to `userService.ts` and `StateManager.ts` for real-time syncing of user preferences into the Passport.

## ⏳ Pending / Next Actions
- **[DB] Run SQL Schema Update**: User must execute `.GCC/supabase_update_v3.sql` in Supabase to add `language` and `timezone` columns to the `users` table.
- **[ENV] Secret Validation**: Verify `SUPER_ADMIN_JID` is correctly set in Railway environment variables to enable HITL (Human-In-The-Loop) permissions.
- **[DB] Admin Table Sync**: Verify if `group_admins` table exists in Supabase and ensure synchronization is functional.
- **[TEST] End-to-End Integration**: Validate the new unified ReAct loop and `agent-browser` tools in the Railway environment.

## 📝 Technical Notes
- The system now follows the **V3 Dynamic Context / Pull-Based RAG** architecture.
- All core instructions are located in `persona/prompts/system.md`.
- Deployment relies on `APP_ENV=server` to trigger headless optimizations.
