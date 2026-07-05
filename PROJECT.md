# PROJECT.md — HIVE-MIND Core & TUI

## 🏗 Architecture

HIVE-MIND has a strict layered architecture with one-way dependency flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRANSPORT LAYER                              │
│   WhatsApp (Baileys)  ·  Discord  ·  Telegram  ·  CLI (Ink TUI)    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ORCHESTRATION CORE                            │
│  ┌──────────┐  ┌───────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ ReAct    │  │ Smart Router  │  │ Permission │  │ Fairness    │  │
│  │ Engine   │  │ V2 (Zero-429) │  │ Manager    │  │ Queue       │  │
│  │          │  │ (Multi-Key)   │  │            │  │             │  │
│  └──────────┘  └───────────────┘  └────────────┘  └─────────────┘  │
│  ┌──────────┐  ┌───────────────┐  ┌────────────────────────────┐   │
│  │ Context  │  │ Blueprint     │  │ Service Container (DI)     │   │
│  │ Loader   │  │ Manager       │  │                            │   │
│  └──────────┘  └───────────────┘  └────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     RUNTIME INFRASTRUCTURE                          │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────┐   │
│  │ Safety       │  │ Task Checker  │  │ Budget Throttle        │   │
│  │ Guard        │  │               │  │                        │   │
│  └──────────────┘  └───────────────┘  └────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         COGNITIVE LAYER                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Memory   │  │ Learning  │  │ Driver   │  │ Consciousness    │   │
│  │ Stack    │  │ Engine    │  │ System   │  │ (WakeSystem)     │   │
│  └──────────┘  └───────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Agentic  │  │ PTC &     │  │ Browser  │  │ Voice & Audio    │   │
│  │ Swarm    │  │ Sandbox   │  │ Agent    │  │ Pipeline         │   │
│  └──────────┘  └───────────┘  └──────────┘  └──────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                            │
│     Supabase (PostgreSQL + pgvector)  ·  Redis (Upstash)            │
│     AI Providers (Gemini, Groq, OpenRouter, ...)  ·  Playwright     │
└─────────────────────────────────────────────────────────────────────┘
```

1. **Transport Layer**: Abstracts communication channels. Standardizes incoming events and routes outgoing messages/media.
2. **Orchestration Core**: Runs the central ReAct reasoning loop, handles system contexts, rotates keys to bypass 429 quota exhaustion, and controls task execution.
3. **Runtime Infrastructure**: Intercepts LLM outputs. Handles 3-tier safety checks, anti-laziness task verification, and FinOps budget throttling.
4. **Cognitive Layer**: Manages memory levels (Working, Redis Cache, Supabase Vector RAG), decays older memories, extracts user models (`fact:`, `pref:`, `goal:`), executes sandboxed JS code (PTC), and drives proactive motivations.
5. **Infrastructure Layer**: Low-level clients for databases (Supabase, Redis) and external services.

---

## 🏆 Milestones Table

| Milestone Date | Title / Description | Status |
|:---|:---|:---:|
| **2026-04-22** | **Phase 1: Migration TypeScript & Blueprinting** — Migration of 20k lines of JS to strict TS, introducing Zod blueprints. | Completed |
| **2026-04-23** | **Phase 2: System & FS Capabilities** — Setup of persistent bash execution, ripgrep search, and mtime file cache. | Completed |
| **2026-04-23** | **Phase 3: Multi-Interface Adaptation** — Decoupling brain from transport adapters (CLI, WhatsApp, Telegram, Discord). | Completed |
| **2026-04-24** | **Phase 4: Agent Hardening & FinOps** — Memory compression, sub-agents, kill switches, and in-band HITL approvals. | Completed |
| **2026-05-19** | **Phase 5: Unified Runtime Infrastructure** — Safety Sentinel evaluation and token budget throttling. | Completed |
| **2026-05-19** | **Phase 6: Epic AION (Memory decay)** — MAPLE taxonomy, forget decay laws, and RAG consolidation. | Completed |
| **2026-06-03** | **Epic ESLint Eradication** — Eradication of 1257 linter errors across all backend services and plugins. | Completed |
| **2026-06-04** | **Epic Gemini Embedding 2** — Vector indexing for multimodal documents (images, video, audio, PDF) with local HNSW. | Completed |
| **2026-06-08** | **Epic ESLint TUI Eradication** — Cleanup of 348 ESLint warnings and errors in Ink components. | Completed |
| **2026-07-02** | **GitHub Actions Synchronization** — Bidirectional upstream sync with automated PR merges and branch force-pushes. | Completed |
| **2026-07-03** | **TUI Modernization** — Purge of Google/Gemini labels, neon theme, local HITL routing, and status bar widget integration. | Completed |
| **2026-07-05** | **Node.js LTS (v22+) Migration & Hardening** — Deprecated package review, Undici removal, path traversal checks. | Completed |

---

## 📐 Interface Contracts

### 1. Transport Interface (`src/core/transport/`)
All channel adapters (Baileys, Discord, Telegram, CLI) must implement or subclass the transport wrapper:
```typescript
interface Transport {
    onMessage(callback: (msg: NormalizedMessage) => Promise<void>): void;
    sendText(chatId: string, text: string, options?: SendOptions): Promise<void>;
    sendMedia(chatId: string, buffer: Buffer, mimeType: string, options?: SendOptions): Promise<void>;
}
```

### 2. Provider Adapter Interface (`src/providers/adapters/`)
Integrations with various AI models implement a unified interface to be callable by the Smart Router:
```typescript
interface ProviderAdapter {
    chat(
        messages: ChatMessage[],
        options: {
            model: string;
            apiKey: string;
            temperature?: number;
            max_tokens?: number;
            [key: string]: any;
        }
    ): Promise<{
        text: string;
        usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
    }>;
}
```

### 3. Modular Plugin System (`src/plugins/`)
Tools available to the ReAct engine must be declared inside a plugin and register via `loader.ts`:
```typescript
interface PluginTool {
    name: string;
    description: string;
    parameters: ZodSchema<any>;
    execute(args: any, context: ExecutionContext): Promise<any>;
}
```

### 4. Sandboxed SafeScript Validation (`src/services/ptc/`)
Programmatic Tool Calling (PTC) parses and runs user-submitted or model-generated scripts inside a restricted `vm` context:
- Validated via `acorn` AST check against a strict blacklist (no `require`, `eval`, `process`, `__proto__`).
- Safe execution bounded by a strict `timeout` window.

---

## 📂 Code Layout

The project files are strictly organized to maintain loose coupling:

```
├── .GCC/                       # Git-Context-Controller (session handoffs & plans)
├── .agents/                    # Agent metadata, plans, and reports (NO SOURCE CODE)
├── Sandbox1/                   # Sandbox execution environment for PTC (temp scripts)
├── storage_hm/                 # Persistent storage (stickers, screenshots, downloads)
├── src/                        # Main application source code
│   ├── bin/                    # Executable entry point (hive-mind.ts)
│   ├── config/                 # Central schema configurations and default blueprints
│   ├── core/                   # Orchestration (ReAct Engine, Router, Transports)
│   │   ├── transport/          # Adapters (baileys, discord, telegram, cli, ink)
│   │   └── security/           # PermissionManager & Sandbox validators
│   ├── plugins/                # Modular tool implementations (web, sys, tools)
│   ├── providers/              # Model adapters and Quota Smart Router
│   ├── services/               # Core domain services (memory, logic, audio, browser)
│   ├── types/                  # Internal TypeScript definitions
│   └── utils/                  # Common utilities
├── supabase/                   # Supabase migration scripts and SQL schema definition
├── tests/                      # Jest test suites
│   ├── unit/                   # Unit tests
│   └── integration/            # Integration tests
├── eslint.config.js            # Linter rules
├── jest.config.js              # Testing framework setup
├── package.json                # Dependencies and launch scripts
└── tsconfig.json               # TypeScript compiler config
```
