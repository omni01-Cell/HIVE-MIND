<p align="center">
  <img src="https://img.shields.io/badge/HIVE--MIND-V3-0D1117?style=for-the-badge&labelColor=0D1117&color=58A6FF&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQyIDAtOC0zLjU4LTgtOHMzLjU4LTggOC04IDggMy41OCA4IDgtMy41OCA4LTggOHptLTItM2g0di0ySDEwdjJ6bTAtNGg0VjdoLTR2NnoiLz48L3N2Zz4=" alt="HIVE-MIND V3" />
</p>

<h1 align="center">HIVE-MIND</h1>

<p align="center">
  <strong>Autonomous AI Agent Framework — Omni-Channel, Multi-Provider, Agentic</strong>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-→-58A6FF?style=flat-square" alt="Quick Start" /></a>
  <a href="#-architecture"><img src="https://img.shields.io/badge/Architecture-→-58A6FF?style=flat-square" alt="Architecture" /></a>
  <a href="#-plugins"><img src="https://img.shields.io/badge/Plugins-→-58A6FF?style=flat-square" alt="Plugins" /></a>
  <a href="#-deployment"><img src="https://img.shields.io/badge/Deploy-→-58A6FF?style=flat-square" alt="Deploy" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-3.0.0-0D1117?style=flat-square&labelColor=0D1117&color=3FB950" alt="Version" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-0D1117?style=flat-square&labelColor=0D1117&color=3178C6&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-0D1117?style=flat-square&labelColor=0D1117&color=F0883E" alt="License" />
  <img src="https://img.shields.io/badge/Autonomy-Level_5-0D1117?style=flat-square&labelColor=0D1117&color=A371F7" alt="Autonomy" />
  <img src="https://img.shields.io/badge/Node.js-18+-0D1117?style=flat-square&labelColor=0D1117&color=3FB950&logo=node.js&logoColor=white" alt="Node.js" />
</p>

---

## Overview

HIVE-MIND is a production-grade **Autonomous AI Agent** framework built in strict TypeScript. Unlike conventional chatbots that react to commands, HIVE-MIND operates as a **Level 5 Autonomous Agent** — it reasons, plans, executes multi-step tasks, orchestrates sub-agents, and proactively engages across multiple communication channels simultaneously.

**Key differentiators:**

- 🧠 **Agentic Reasoning** — ReAct loop with planning, tool calling, and self-correction
- 🌐 **Omni-Channel** — WhatsApp · Discord · Telegram · CLI with unified identity
- 🔀 **Smart Router V2** — Multi-key rotation across 10+ AI providers with zero-429 quota management
- 🐝 **Swarm Architecture** — Dynamic sub-agent orchestration for complex tasks
- ⚡ **Programmatic Tool Calling (PTC)** — AST-validated JS execution in a sandboxed VM
- 🎙️ **Native Audio** — Voice-to-voice via Gemini Live, TTS via Gemini/Minimax
- 🛡️ **Defense-in-Depth Security** — MoralCompass, SafeScript AST validator, Permission Manager

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#-architecture)
- [Core Systems](#-core-systems)
- [Supported Providers](#-supported-providers)
- [Plugins](#-plugins)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)
- [Scripts & Commands](#-scripts--commands)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🏗 Architecture

HIVE-MIND follows a strict **layered architecture** with one-way dependency flow:

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
│  └──────────┘  └───────────────┘  └────────────┘  └─────────────┘  │
│  ┌──────────┐  ┌───────────────┐  ┌────────────────────────────┐   │
│  │ Context  │  │ Tool Call     │  │ Service Container (DI)     │   │
│  │ Loader   │  │ Extractor     │  │                            │   │
│  └──────────┘  └───────────────┘  └────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVICE LAYER                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Memory   │  │ Agentic   │  │ PTC &    │  │ Voice & Audio    │   │
│  │ Stack    │  │ Swarm     │  │ Sandbox  │  │ Pipeline         │   │
│  └──────────┘  └───────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Browser  │  │ Moral     │  │ FinOps   │  │ Consciousness    │   │
│  │ Agent    │  │ Compass   │  │ Tracker  │  │ (WakeSystem)     │   │
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

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **SOLID** | Service Container with dependency injection, single-responsibility modules |
| **Strict Typing** | TypeScript strict mode, Zod validation on external payloads |
| **Immutability** | Spread-only state updates, read-only properties |
| **Fail-Closed Security** | MoralCompass rejects by default, explicit allow-listing |
| **Event-Driven** | Core EventBus for decoupled inter-module communication |

---

## 🧠 Core Systems

### ReAct Engine

The central reasoning loop follows the **ReAct** pattern (Reasoning + Acting):

1. **Perceive** — Multi-channel input analysis with context hydration (GWT)
2. **Think** — Internal reasoning via `<think>` blocks and monologue
3. **Act** — Tool execution, PTC batching, or Swarm delegation
4. **Observe** — Result analysis with automatic error recovery and retry

### Smart Router V2 (Zero-429)

Intelligent multi-provider routing with proactive quota management:

- **Multi-Key Rotation** — Up to 7 API keys per provider with granular Redis-tracked quotas
- **Tiered Fallback** — S → A → B → C tier cascade across providers
- **Zero-429 Strategy** — Proactive key rotation before rate limits hit
- **Real-Time Metrics** — Per-key usage tracking and automatic cooldown

### Memory Stack

| Layer | Backend | Purpose | Latency |
|-------|---------|---------|---------|
| **L0 — Working Memory** | In-process | Current conversation turn | ~0ms |
| **L1 — Context Cache** | Redis | Recent messages, session state | ~2ms |
| **L2 — Semantic Memory** | Supabase pgvector | Long-term recall via RAG embeddings | ~50ms |
| **L3 — Persistent Store** | Supabase PostgreSQL | User profiles, goals, graph relations | ~30ms |

### Agentic Swarm

Dynamic multi-agent orchestration for complex tasks:

- **Planner** — Decomposes goals into executable sub-tasks
- **SubAgentEngine** — Spawns specialized agents (Shopping, Deep Research, etc.)
- **ActionEvaluator** — Validates and scores action outcomes
- **MultiAgent** — Coordinates parallel agent execution

### Programmatic Tool Calling (PTC)

Instead of sequential tool calls (N round-trips), the LLM generates JavaScript that calls multiple tools in a single execution:

```
Traditional:  LLM → Tool₁ → LLM → Tool₂ → LLM → Tool₃  (6 steps)
PTC:          LLM → JS{Tool₁ + Tool₂ + Tool₃}            (2 steps)
```

Security enforced via **SafeScript** AST validation:
- Static analysis with `acorn` parser
- Blocked patterns: `process.exit`, `require`, `eval`, `__proto__`
- Sandboxed execution in Node.js `vm` with timeout

### Consciousness Layer (WakeSystem)

Background autonomous loop that enables proactive behavior:

- **Inner Monologue** — Silent background thinking with `SILENT_HM` tags
- **Goal Tracking** — Self-assigned objectives with progress monitoring
- **Social Cue Watcher** — Detects conversation patterns to intervene naturally
- **Dream Service** — Offline memory consolidation and knowledge weaving

---

## 🤖 Supported Providers

### LLM Providers

| Provider | Models | Tier | Use Case |
|----------|--------|------|----------|
| **Google** | Gemini 3.1 Flash, Flash-Lite | S | Primary agentic reasoning |
| **Minimax** | m2.5 | S | PTC execution, Swarm |
| **Groq** | LLaMA, Whisper v3 | A | Fast inference, STT |
| **Anthropic** | Claude 3.5 Sonnet | A | Complex reasoning |
| **OpenAI** | GPT-4o | A | General purpose |
| **Mistral** | Mistral Large | B | European alternative |
| **NVIDIA** | Kimi K2.5 | B | Specialized tasks |
| **OpenRouter** | 200+ models | B | Gateway fallback |
| **Kimi/Moonshot** | Kimi, Moonshot | C | Budget fallback |
| **HuggingFace** | Open-source models | C | Experimental |

### Audio & Media

| Capability | Provider | Details |
|-----------|----------|---------|
| **Voice-to-Voice** | Gemini Live 2.5 | Native bidirectional audio streaming |
| **Text-to-Speech** | Gemini TTS / Minimax | Director's Chair persona voices |
| **Speech-to-Text** | Groq Whisper v3 | Ultra-fast transcription |
| **Web Search** | SerpApi | Google AI Search (Standard, Chat, News) |
| **Browser Agent** | Playwright | Headless Chromium with screenshot capture |

---

## 🔌 Plugins

HIVE-MIND uses a modular plugin architecture with auto-discovery:

### Web & Research
| Plugin | Description |
|--------|-------------|
| `google_ai_search` | Google AI Search via SerpApi with multiple modes |
| `deep_research` | Multi-source deep research with synthesis |
| `crawlfire_web` | Web page crawling and content extraction |
| `duckduck_search` | DuckDuckGo search fallback |
| `wikipedia` | Wikipedia knowledge lookup |

### Tools & Utilities
| Plugin | Description |
|--------|-------------|
| `shopping` | Product search and comparison |
| `send_email` | Email composition and dispatch |
| `translate` | Multi-language translation |
| `daily_pulse` | Daily briefing and news aggregation |
| `visual_reporter` | PDF report generation with PDFKit |

### WhatsApp-Specific
| Plugin | Description |
|--------|-------------|
| `sticker` | Sticker creation from images |
| `group_manager` | Group administration (ban, promote, settings) |

### Media
| Plugin | Description |
|--------|-------------|
| `tts` | Text-to-speech audio generation |

> **Plugin SDK:** Each plugin is a self-contained directory under `plugins/` with a standardized `{ success: boolean, message: string }` return signature. See `plugins/base/` for the plugin interface.

---

## 🚀 Quick Start

### Prerequisites

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | 18.x LTS | 20.x LTS |
| **OS** | Windows 10+ / Linux / macOS | Debian / Ubuntu |
| **RAM** | 512 MB | 1 GB+ |

### Required Services (Free Tiers Available)

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Supabase** | Database & Vector memory | [supabase.com](https://supabase.com) |
| **Redis (Upstash)** | Cache & Ephemeral context | [upstash.com](https://upstash.com) |
| **Google AI Studio** | Primary AI provider | [aistudio.google.com](https://aistudio.google.com) |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/leandre755/HIVE-MIND.git
cd HIVE-MIND

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys and service credentials

# 4. Deploy database schema
# Execute supabase/supabase_setup.sql in your Supabase SQL editor

# 5. Start the agent
npm run dev
```

> **WhatsApp:** On first launch, scan the QR code displayed in the terminal with your WhatsApp app to link the session.

### CLI Mode (No WhatsApp Required)

```bash
npm run cli
```

Launches an interactive terminal interface (Ink TUI) for local development and testing without any messaging platform.

---

## ⚙ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following sections:

#### Database (Required)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
REDIS_URL=redis://default:password@host:port
```

#### AI Providers (Smart Router V2)

HIVE-MIND supports **multi-key rotation** — up to 7 keys per provider for zero-downtime:

```env
# Primary key (fallback)
${GEMINI_KEY}=your-gemini-api-key

# Rotation keys (optional, improves quota resilience)
GEMINI_KEY_1=your-first-key
GEMINI_KEY_2=your-second-key
# ... up to GEMINI_KEY_7
```

Same pattern applies to: `GROQ`, `MISTRAL`, `MOONSHOT`, `MINIMAX`, `HF`, `NVIDIA`, `OPENROUTER`.

#### Behavioral Settings
```env
TZ=Europe/Paris                    # Timezone for scheduler
DEBUG=false                        # Verbose logging
SEND_DELIVERY_RECEIPTS=true        # WhatsApp blue ticks
PTC_ENABLED=true                   # Programmatic Tool Calling
PTC_TIMEOUT_MS=30000               # PTC execution timeout
```

#### Browser Agent
```env
AGENT_BROWSER_IDLE_TIMEOUT_MS=300000    # Auto-shutdown after 5min idle
# AGENT_BROWSER_BLOCKED_DOMAINS=malware.com,phishing.net
```

### Runtime Configuration

| File | Purpose |
|------|---------|
| `config/config.json` | Backlog protection, voice transcription mode |
| `config/models_config.json` | Model definitions, tiers, capabilities |
| `config/pricing.json` | Per-model cost tracking |
| `config/scheduler.json` | Cron jobs and scheduled tasks |

---

## 📂 Project Structure

```
HIVE-MIND/
├── bin/                    # CLI entrypoint (hive-mind.ts)
├── core/                   # Orchestration layer
│   ├── index.ts            # Main ReAct engine & message loop
│   ├── orchestrator.ts     # High-level orchestration
│   ├── ServiceContainer.ts # Dependency injection container
│   ├── FairnessQueue.ts    # Per-user message queuing
│   ├── context/            # GWT context loading & prompt assembly
│   ├── handlers/           # Message & event handlers
│   ├── security/           # PermissionManager (RBAC)
│   ├── transport/          # Omni-channel adapters
│   │   ├── baileys.ts      # WhatsApp (Baileys)
│   │   ├── discord.ts      # Discord self-bot
│   │   ├── telegram.ts     # Telegram
│   │   ├── cli.ts          # Terminal CLI
│   │   └── ink/            # Ink TUI components
│   └── types/              # Core type definitions
├── services/               # Domain services
│   ├── agentic/            # Swarm: Planner, SubAgentEngine, MultiAgent
│   ├── ptc/                # PTC: Executor, SafeScript, WakeSystem
│   ├── memory/             # Memory consolidation & retrieval
│   ├── browser/            # Playwright-based browser agent
│   ├── voice/              # TTS providers (Minimax, Gemini)
│   ├── audio/              # Audio conversion & Gemini Live
│   ├── finops/             # Cost tracking per-model
│   ├── monitoring/         # Database health monitoring
│   ├── memory.ts           # Supabase memory operations
│   ├── workingMemory.ts    # Redis working memory (L1)
│   ├── redisClient.ts      # Redis connection management
│   ├── supabase.ts         # Supabase client & queries
│   ├── moralCompass.ts     # Ethical guardrails
│   ├── quotaManager.ts     # Smart Router quota tracking
│   └── ...                 # User, group, admin, feedback services
├── plugins/                # Modular plugin system
│   ├── base/               # Plugin interface & types
│   ├── loader.ts           # Auto-discovery & registration
│   ├── tools/              # Utility plugins
│   ├── web/                # Web & research plugins
│   ├── media/              # Media processing plugins
│   └── whatsapp/           # WhatsApp-specific plugins
├── providers/              # AI provider adapters
│   ├── index.ts            # Smart Router V2 (provider selection)
│   ├── geminiLive.ts       # Gemini Live audio streaming
│   └── adapters/           # Individual provider implementations
│       ├── gemini.ts       # Google Gemini
│       ├── groq.ts         # Groq
│       ├── anthropic.ts    # Anthropic Claude
│       ├── openai.ts       # OpenAI
│       ├── mistral.ts      # Mistral AI
│       ├── openrouter.ts   # OpenRouter gateway
│       └── ...             # NVIDIA, Kimi, Moonshot, HuggingFace
├── config/                 # Configuration files
├── persona/                # Agent personality & GWT prompts
├── scheduler/              # Cron job definitions & DB monitoring
├── scripts/                # Utility & diagnostic scripts
├── supabase/               # Database schema (SQL)
├── tests/                  # Test suites
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── types/                  # Global TypeScript declarations
├── utils/                  # Shared utilities
├── docs/                   # Extended documentation
├── Sandbox1/               # PTC sandboxed execution environment
└── storage_hm/             # Persistent agent data (screenshots, files)
```

---

## 📜 Scripts & Commands

| Script | Command | Description |
|--------|---------|-------------|
| **Start** | `npm start` | Production launch |
| **Dev** | `npm run dev` | Development with hot-reload (tsx --watch) |
| **CLI** | `npm run cli` | Local CLI mode (no WhatsApp) |
| **Build** | `npm run build` | TypeScript type-check (noEmit) |
| **Lint** | `npm run lint` | ESLint static analysis |
| **Lint Fix** | `npm run lint:fix` | Auto-fix lint issues |
| **Test** | `npm test` | Run all test suites |
| **Test Unit** | `npm run test:unit` | Unit tests only |
| **Test Integration** | `npm run test:integration` | Integration tests only |
| **Test E2E** | `npm run test:e2e` | End-to-end tests only |
| **Repair Session** | `npm run repair` | Repair corrupted WhatsApp session |
| **Audit Group** | `npm run audit:group` | Audit WhatsApp group metadata |
| **Fix Usernames** | `npm run fix:usernames` | Backfill missing user display names |

---

## 🧪 Testing

HIVE-MIND follows a **TDD workflow** with three test tiers:

```bash
# Run all tests
npm test

# Run specific tier
npm run test:unit
npm run test:integration
npm run test:e2e

# Full E2E with real services (requires configured .env)
npx tsx scripts/test_cli_e2e.ts
```

### Test Stack

| Tool | Version | Purpose |
|------|---------|---------|
| **Jest** | 30.x | Test runner & assertions |
| **ts-jest** | 29.x | TypeScript transformer |
| **VM Modules** | Experimental | ESM support in tests |

### Coverage Targets

| Layer | Target | Focus |
|-------|--------|-------|
| Unit | > 80% | Pure logic, validators, utilities |
| Integration | > 60% | Service interactions, DB queries |
| E2E | Critical paths | Full ReAct loop, tool execution |

---

## 🚢 Deployment

### Railway (Recommended)

HIVE-MIND is pre-configured for [Railway](https://railway.app) deployment via `nixpacks.toml`:

```toml
[phases.setup]
nixPkgs = ["...", "chromium", "playwright-driver"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["npm run build"]
```

**Steps:**
1. Push to your GitHub repository
2. Connect the repo to a Railway project
3. Set all environment variables from `.env.example` in the Railway dashboard
4. Deploy — Railway auto-detects Nixpacks and builds

### Environment Requirements

| Service | Required | Notes |
|---------|----------|-------|
| **Supabase** | ✅ | Deploy `supabase/supabase_setup.sql` first |
| **Redis** | ✅ | Upstash recommended for serverless |
| **Chromium** | ⚠️ | Required only if Browser Agent is used |

### Health Monitoring

```bash
# Check Redis connectivity
npx tsx scripts/check-redis.ts

# Full health check (DB + Redis + Providers)
npx tsx scripts/health-check.ts
```

---

## 🛡 Security

### Defense-in-Depth Architecture

| Layer | Component | Strategy |
|-------|-----------|----------|
| **L1 — Input** | Permission Manager | RBAC with Super-Admin, Admin, User roles |
| **L2 — Reasoning** | MoralCompass | Ethical guardrails with fail-closed defaults |
| **L3 — Execution** | SafeScript (AST) | Static analysis blocking dangerous patterns |
| **L4 — Runtime** | VM Sandbox | Isolated execution with timeout enforcement |
| **L5 — Network** | Browser Blacklist | Domain-based blocking (open-by-default) |
| **L6 — System** | Banned Commands | VM escape prevention (no `process.exit`, `rm -rf /`) |

### Permission Model

```
Global Owner  →  Full system control (HITL approvals routed here)
Super Admin   →  Plugin management, user administration
Admin         →  Group management, moderation
User          →  Standard interaction
```

### Key Security Features

- **Human-in-the-Loop (HITL)** — Dangerous operations require explicit owner approval
- **Universal Read / Restricted Write** — Agent can read system files but writes are sandboxed to `Sandbox1/` and `storage_hm/`
- **AST Validation** — Every PTC script is parsed and analyzed before execution
- **Automatic Cooldown** — Rate limiting and backlog protection prevent abuse

> ⚠️ **Important:** Configure your Super-Admin users in the Supabase `users` table before deploying to production. Unconfigured instances default to open access.

---

## 🤝 Contributing

### Development Workflow

1. **Read Context** — Check `.GCC/main.md` for current project state
2. **Design First** — Create or update `docs/design_docs/` before coding
3. **Write Tests** — Tests must compile and fail (red) before implementation
4. **Implement** — Write the minimum code to pass tests (green)
5. **Verify** — Run `npx tsx scripts/test_cli_e2e.ts` for full validation

### Code Standards

- TypeScript strict mode — no `any`, explicit return types
- Functions: max 20 lines, max 2 parameters (use objects beyond)
- Naming: intent-revealing, no abbreviations, booleans use verbs (`isLoading`)
- Error handling: `Result<T, Error>` pattern or explicit throws — never silent `null`
- Comments explain **why**, not **how**

### Branch Strategy

- `main` — Production (auto-deploys to Railway)
- Feature branches merged via PR with review

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Built by <a href="https://github.com/leandre755">Christ-Leandre</a> — HIVE-MIND V3</sub>
</p>
