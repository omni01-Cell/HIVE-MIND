# Railway Stabilization Log — [2026-04-30]

## 📋 Diagnosed Issues
Analysis of Railway logs revealed three primary failure vectors:
1.  **Environment Mismatch**: Ink CLI attempting to enter "Raw Mode" on a non-TTY Railway server.
2.  **Concurrency Conflicts**: Supabase 23505 errors during high-frequency identity resolution.
3.  **Protocol Violation**: Gemini API errors due to missing `thought_signature` in multi-turn tool calls.
4.  **Legacy Configuration**: MoralCompass crashing due to missing `values.json` (deprecated).

## 🔧 Implemented Solutions

### 1. Headless Infrastructure
Modified `core/index.ts` to detect environment:
```typescript
if (appEnv === 'server' || !process.stdin.isTTY) {
    // Disable interactive CLI
}
```

### 2. Supabase Upsert Logic
Updated `services/supabase.ts` to use `upsert` for identities:
```typescript
await supabase.from('user_identities').upsert(data, { onConflict: 'platform,platform_user_id' });
```

### 3. Gemini Thinking Support
Updated `providers/adapters/gemini.ts` to extract and re-inject `thought` parts:
- **Turn 1**: Capture `thought` or `thought_signature`.
- **Turn 2**: Re-send `thought` in the `model` role message along with the `functionCall`.

### 4. MoralCompass Unified Refactor
Updated `services/moralCompass.ts` to parse `system.md`:
```typescript
const securityMatch = systemPrompt.match(/<priority_2_security_boundaries>([\s\S]*?)<\/priority_2_security_boundaries>/);
```

## 📈 Impact
- Bot startup is now successful on Railway.
- Identity resolution is thread-safe.
- Agentic loops are resilient to Gemini "Thinking" protocol requirements.
- Security checks are aligned with the unified system prompt.
