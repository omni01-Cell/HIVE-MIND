# 🧪 HIVE-MIND-RAILWAY Testing Guide

This project implements two levels of End-to-End (E2E) testing to ensure stability across both local development and production environments.

## 1. Local CLI E2E Test (`scripts/test_cli_e2e.ts`)

Tests the core agentic logic, tools, and router locally without using WhatsApp.

### Purpose
- Validate tool calling (Shopping, Translate, Goals, etc.).
- Verify the MultiAgent Planner and Smart Router.
- Fast iteration cycle before pushing to production.

### Usage
```bash
npx tsx scripts/test_cli_e2e.ts
```

### How it works
- Boots the full production stack (Redis, Supabase, AI Providers) but uses the `cli` transport.
- Simulates incoming messages using `simulateIncomingMessage()`.
- Uses internal delays to wait for the LLM to process and call tools.

---

## 2. Production WhatsApp E2E Test (`scripts/test_wa_e2e.ts`)

A "Black-Box" test suite that uses real WhatsApp accounts to test the live bot on Railway.

### Purpose
- Test the bot exactly like a real user.
- Verify production-only features (Railway infrastructure, Voice/TTS, Media handling).
- Monitor live server logs (`railway logs`) alongside test execution.

### Prerequisites
- [Railway CLI](https://docs.railway.app/guides/cli) installed and logged in.

### Usage

#### Step 1: Connect your test accounts
You need to scan the QR code for each account once.
```bash
# Connect Admin account
npx tsx scripts/test_wa_e2e.ts --account admin

# Connect Regular User account
npx tsx scripts/test_wa_e2e.ts --account user
```

#### Step 2: Run tests
Modify the `run()` function in `scripts/test_wa_e2e.ts` to add your test cases, then run:
```bash
npx tsx scripts/test_wa_e2e.ts --account user
```

### Key Features
- **Live Logs:** Automatically tails `railway logs` and prefixes them with `[RAILWAY]` in your terminal.
- **Programmatic Assertions:** Use `sendAndWaitForResponse()` to send a message and wait for a specific pattern in the bot's reply.
- **Security Testing:** Easily switch between `admin` and `user` to verify permission boundaries.

### Example Test Case
```typescript
const ok = await sendAndWaitForResponse(
    sock, 
    targetJID, 
    "/ping", 
    (msg) => msg.message?.conversation?.includes('pong')
);
```

---

## 3. Standard Test Protocols

- **Design Doc:** Every major change starts with a Design Doc.
- **TDD:** Write unit tests in `tests/` before implementation.
- **E2E Validation:** Always run the CLI E2E test locally before a `git push`.
- **Production Smoke Test:** After deployment, run the WA E2E test to ensure the live environment is healthy.
