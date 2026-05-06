# HIVE-MIND · Codex Agent Instructions

> **Scope:** These instructions govern every Codex session in this repository.  
> They are non-negotiable. Read them fully before writing a single line of code.

---

## 0 · SESSION BOOTSTRAP (Rule Zero — Mandatory)

**Before any action**, you MUST initialize the session context:

1. **Read** `.GCC/main.md` — this is your persistent working memory.
2. **Verify** the file exists. If not, create it using the template in §6.
3. **Internalize** the current objective, decisions, and status.
4. **No code changes** may occur until this bootstrap is complete.

> The session is "Boosted" once `.GCC/main.md` has been read and its state is loaded into your working context. Every subsequent action must be consistent with that state.

---

## 1 · ZERO HALLUCINATION PROTOCOL

| Law | Rule |
|-----|------|
| **Verifiable Execution** | Never proceed to step N+1 without proof that step N succeeded. Words like "probably", "assume", "looks good" are **banned**. State: *"I did X, verified by Y."* |
| **Explicit Plan** | Multi-step tasks require a plan before any execution: `N. [Action] → verify: [Proof method]` |
| **Surgical Scope** | Touch **only** what was explicitly requested. Zero adjacent refactoring. Match existing style. Remove dead code **only** if your changes created it. |

---

## 2 · COGNITIVE & TOOLING LAYER

- **Think first.** List all dependencies, edge cases, and tradeoffs before acting. If ambiguous → **STOP and ask**.
- **Search before coding** for volatile information: API endpoints, model IDs, framework versions, exact error messages. Do **not** search for stable concepts (SOLID, algorithms, basic syntax).
- **Error resolution:** Never guess. Search the exact error trace. If no results, state it explicitly.
- **No silent architectural decisions.** Every non-trivial choice must be stated and reasoned.

---

## 3 · ARCHITECTURE & STATE BOUNDARIES

```
UI (Presentation) → Domain (Framework-agnostic) → Infra (IO/API)
```
- **One-way dependency.** Depend on abstractions, not concretions.
- **1 file = 1 primary responsibility.** No God objects. Loose coupling via interfaces.
- **State is truth.** UI = f(state). One-way flow. Never mutate UI elements directly.
- **Isolated I/O.** Network and disk ops live in repos/services only. Always use explicit timeouts or AbortSignals.
- **Design first.** For new features: verify/create `idee.md` (vision) and a short Design Doc (tradeoffs) before coding. Apply YAGNI — write the absolute minimum.

---

## 4 · CODE QUALITY MATRIX

### Typing & Data
- Strict mode **ON**. Ban `any` — use `unknown`. Explicit return types.
- Validate all external payloads (Zod / Pydantic).
- Replace magic strings/numbers with Enums, Unions, or named Constants.

### Immutability
- Spread syntax only (`{...obj}`). Read-only properties. **Never** mutate parameters.

### Functions
- 1 responsibility. Max 20 lines (no superfluous blank lines). Max 2 args (use objects beyond 2). Early returns.

### Naming & Proximity
- Intent-revealing names. No abbreviations. Booleans as verbs (`isLoading`). Classes as singular nouns.
- Keep related concepts vertically close in the file.

### Error Handling
- Never return `null` silently. Use `Result<T, Error>` or throw.
- Error messages must explain **WHAT** failed and **WHY**.
- Every error path needs a corresponding UI/observable state.

### Comments
- Explain the **WHY** (business logic, constraints). If you're explaining the HOW → rewrite the code instead.
- Zero commented-out code.

---

## 5 · INVARIANT CHECKLIST (Run before every function you write)

Before writing any function, state in **one sentence** the invariant it must preserve on exit, then verify every return path — including error paths — preserves it.

1. **No duplication.** Search the codebase first. Duplication = bug, not shortcut.
2. **No dead parameters.** Every parameter in a signature must be read inside the body.
3. **No fire-and-forget** on state-changing ops. If the failure matters → block or compensate.
4. **Fail closed on security paths.** Never return a permissive default (`true`, `[]`, `allowed: true`) on error in a security-critical path. Throw explicitly.
5. **Verify argument names match callee.** Silent argument mismatch = dead features.
6. **No live stubs.** Never implement a TODO/stub in a code path actively called at runtime. A stub returning empty data in a live path is a live bug.
7. **Consistent ID schemas.** Never write with one identifier schema and read with another without an explicit translation layer.
8. **No stacked intervals.** Before registering an interval/timeout inside a function that can be called multiple times, verify no previous instance is already running.
9. **No fixed-delay race fixes.** `setTimeout(fn, 200)` is a probabilistic bet. Use signals, locks, or event-driven coordination.
10. **Document actual behavior.** Comments and docstrings describe what the code **does**, not what it was *supposed* to do.
11. **No opposing failure modes.** Two components enforcing the same constraint must agree on fail-open vs. fail-closed, with an explicit arbitration rule.
12. **Function names must be honest.** A function named `sendNotification` must always send. No silent early returns that skip the effect.
13. **No orphan config fields.** Every field added to a config object must have at least one traced read path.
14. **Verify async results.** Never trust that an async op succeeded because no exception was thrown. Check return values or resulting state.

---

## 6 · CONTEXT MANAGEMENT — GCC (Git-Context-Controller)

The `.GCC/` directory is your **long-term working memory** — the only persistent state that survives between Codex sessions. You MUST treat it as source of truth.

### 6.1 · File Structure

```
.GCC/
├── main.md                    ← Primary state file (always sync here)
├── afaire.md                  ← Future work items (non-test: refactors, features, debt)
└── branches/
    ├── test.md                ← Completed test log (results, bugs found, fixes applied)
    ├── test_afaire.md         ← Test backlog (pending E2E, unit, integration tests)
    └── attempt_*_failed.md    ← Failed approach logs
```

### 6.2 · `main.md` Template

```markdown
# Current task context

## 🏆 Major Milestones (Archived Epics)
- [YYYY-MM-DD] Name of completed epic and key outcomes

## Objective
[What THIS session is building or solving]

## Decisions made
- [YYYY-MM-DD] Chose X over Y because [reason]

## Current status
- ✅ Done: [list]
- 🔄 In progress: [current item]
- ⏳ Pending: [list]

## Next action
[Single, concrete next step]

## Abandoned branches
- [YYYY-MM-DD] [approach] → see .GCC/branches/[filename].md

## Supabase chunks used
- chunk_id: [id] | source: [book/article] | score: [0.00]
```

### 6.3 · Sync Hooks (When to write `.GCC/main.md`)

| Hook | Trigger | Action |
|------|---------|--------|
| **decision_milestone** | Resolving critical bugs, architecture choices, completing subtasks | Read then write `.GCC/main.md` with date, decision, rationale, updated status |
| **divergence_plan_b** | An approach fails after multiple attempts + new strategy proposed | Write failure context to `.GCC/branches/attempt_[name]_failed.md`, then reference it in `main.md` under "Abandoned Branches" |
| **epic_transition** | Current objective is fully complete, new phase begins | Archive old objective to "Major Milestones", write new objective |

### 6.4 · Confirmation Protocol (Zero Hallucination)

After every `.GCC/main.md` write, you **MUST** output the following tag — and **only** after a verified, successful file-write tool call:

```
<gcc_sync>
[X] .GCC/main.md successfully written — [one-line summary]
</gcc_sync>
```

**This tag is BANNED as roleplay.** If you didn't call the file-write tool and confirm success, you may not output it.

---

## 7 · PROJECT CONTEXT — HIVE-MIND-RAILWAY

Autonomous AI Agent (Level 5) — TypeScript strict, Baileys (WhatsApp), Supabase (PostgreSQL + pgvector), Redis (Upstash), Railway.
**Layers:** `core/` (ReAct engine, transport adapters, handlers, DI) → `services/` (agentic swarm, PTC, memory, browser, voice, moralCompass) → `providers/` (Smart Router V2, 10+ AI adapters) → `plugins/` (auto-discovered, return `{ success, message }`).
**Security:** 6-layer defense-in-depth, all fail-closed. **Memory:** L0 in-process → L1 Redis → L2 pgvector → L3 PostgreSQL.
**Git:** credentials in `git_credential.json` (gitignored).

---

## 8 · TESTING PROTOCOL

### 8.1 · Mandatory Workflow (Design → TDD → Code)

Every new feature or fix MUST follow this exact sequence. Skipping a step is not allowed.

```
1. Design Doc  →  verify: idee.md or inline doc exists with tradeoffs stated
2. Write Tests →  verify: test file compiles AND fails (red — no implementation yet)
3. Write Code  →  verify: all tests pass (green)
4. Style Audit →  verify: test file complies with §8.3 rules (naming, typing, isolation)
5. E2E Real    →  verify: CLI e2e script exits 0 under live conditions
```

> **Why tests first?** A test written after the code always passes by construction — it describes what was built, not what was needed. Tests written first define the contract and catch drift between intention and implementation.

### 8.2 · Test Directory Structure

```
tests/
├── unit/                      ← Pure logic — no I/O, no DB, no network. Fast, deterministic.
│   ├── core/
│   ├── plugins/
│   ├── services/
│   ├── transport/
│   ├── utils/
│   ├── BrowserService.test.ts
│   ├── PermissionManager.test.ts
│   └── moralCompass.test.ts
├── integration/               ← Real DB/Redis. Requires .env.test. Never production keys.
├── e2e/
│   └── bot.e2e.test.ts        ← Full stack with mocked transport (Jest runner)
└── smart_router_v2.test.ts    ← Router + QuotaManager combined (reference test style)
```

**Placement rules:**
- `unit/` — zero external calls. Mock everything with `jest.unstable_mockModule`.
- `integration/` — requires `.env.test`. Never uses production API keys or DB.
- `e2e/` inside `/tests/` uses mocked transport. Real-world validation uses the CLI script (§8.4).

### 8.3 · Test Style Rules

All test files MUST respect these rules (checked at §8.1 step 4 — Style Audit):

| Rule | Requirement |
|------|-------------|
| **Structure** | `describe → describe → it` hierarchy. Each `it` follows AAA: Arrange / Act / Assert |
| **Naming** | `it('should [verb] [subject] when [condition]')` — no abbreviations |
| **Typing** | No `any` except on imported mock casts (`as any` on mock only, with a comment explaining why) |
| **Mocking** | `jest.unstable_mockModule(...)` declared BEFORE any dynamic `import()`. `jest.clearAllMocks()` in every `beforeEach` |
| **Isolation** | Each `it` block is fully self-contained. No shared mutable state between tests |
| **Assertions** | Minimum 1 assertion per `it`. Prefer `toEqual` over `toBe` for objects |
| **Cleanup** | Restore env vars and timers in `afterEach` if they were modified |
| **No live stubs** | §5 rule 6 applies — a test returning hardcoded data from a live code path is a live bug |

**Canonical reference style** (from `tests/smart_router_v2.test.ts`):
```typescript
import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// MUST come before any dynamic import
jest.unstable_mockModule('../services/redisClient.js', () => ({
  redis: { get: jest.fn(), setEx: jest.fn() },
  ensureConnected: jest.fn(),
}));

const { myService } = await import('../services/myService.js');

describe('MyService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('methodName', () => {
    it('should return Key 2 when Key 1 has exhausted its RPM', async () => {
      // Arrange
      (myService as any).config = { limit: 10 };
      // Act
      const result = await myService.getBestKey('model-x');
      // Assert
      expect(result).toEqual(2);
    });
  });
});
```

### 8.4 · Local E2E via CLI (`scripts/test_cli_e2e.ts`)

`scripts/test_cli_e2e.ts` launches a **full local instance of the agent** in CLI mode — it is not a test harness that returns pass/fail codes. It boots the entire production stack (real Supabase, real Redis, real AI providers) and exposes a conversation interface in the terminal. You interact with the agent via text, see its live logs, tool calls, and responses directly in the console. This makes it the primary tool to validate that a newly implemented feature works end-to-end under real conditions.

```bash
npx tsx scripts/test_cli_e2e.ts
```

- Results (features tested, bugs observed) MUST be recorded in `.GCC/branches/test.md` after every session.

### 8.5 · Production WhatsApp E2E (`scripts/test_wa_e2e.ts`)

`scripts/test_wa_e2e.ts` is a **black-box test suite** that uses real WhatsApp accounts (via Baileys) to test the **live bot deployed on Railway**. It tests the system exactly like a real user would — sending messages and asserting on responses.

**When to use:** After deployment, to validate production-only features (Railway infra, Voice/TTS, media handling, permission boundaries).

#### Step 1 — Connect test accounts (one-time QR scan per account)
```bash
# Admin account
npx tsx scripts/test_wa_e2e.ts --account admin

# Regular user account
npx tsx scripts/test_wa_e2e.ts --account user
```

#### Step 2 — Run tests
Modify the `run()` function in the script to add test cases, then:
```bash
npx tsx scripts/test_wa_e2e.ts --account user
```

#### Key capabilities
- **`sendAndWaitForResponse(sock, jid, content, matchFn, timeoutMs)`** — sends a message and waits for a bot reply matching the predicate.
- **Live Railway logs** — automatically tails `railway logs` and prefixes output with `[RAILWAY]` in the terminal (disable with `--no-logs`).
- **Security testing** — switch `--account admin` / `--account user` to verify permission boundaries.

#### Example test case
```typescript
const ok = await sendAndWaitForResponse(
    sock, targetJID,
    "/ping",
    (msg) => (msg.message?.conversation || '').toLowerCase().includes('pong')
);
console.log(ok ? '✅ Ping OK' : '❌ Ping Timeout');
```

### 8.6 · Railway CLI — Live Log Inspection

Railway CLI is installed and authenticated. You can use it at any time to inspect production logs:

```bash
# Stream live logs
railway logs --tail

# Last 5 minutes
railway logs --tail --since 5m
```

**When to use:**
- Debugging production-only failures that don't reproduce locally.
- Monitoring the bot during a WA E2E test session (§8.5 does this automatically).
- Verifying a deployment succeeded after `git push`.

### 8.7 · GCC Test Tracking Files

Two dedicated files in `.GCC/branches/` are the persistent memory for all test activity:

| File | Role | When to update |
|------|------|----------------|
| `.GCC/branches/test.md` | **Test log** — completed tests, results, bugs found, fixes applied, session outcomes | After every test session |
| `.GCC/branches/test_afaire.md` | **Test backlog** — all pending tests (plugins, security, core, WhatsApp) | When new test cases are identified; remove items when completed |

**Protocol after a test session:**
1. Move completed items from `test_afaire.md` → `test.md` with result notes.
2. Append any new bugs, regressions, or blocked items to `test.md`.
3. If a bug was fixed or an architecture decision was made, trigger the `decision_milestone` GCC hook (§6.3).

**Protocol after a code change:**
1. Check `test_afaire.md` first. If the modified module has a pending test item, run that test before considering the change done.

### 8.8 · Future Work Tracking (`afaire.md`)

Non-test work items — refactors, new features, tech debt — are tracked in:

```
.GCC/afaire.md
```

**Rule:** Zero TODO comments in source code. If future work is identified during a session, append it to `.GCC/afaire.md` with a date and the impacted module. Remove the item when the work is done and verified.

---

*Last updated: 2026-05-04 *