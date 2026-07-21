#!/bin/bash
# Revert to original just in case we need to
git restore src/tui/config/hiveConfig.ts

# Try to change `any` to `unknown` and fix type castings
sed -i 's/const msgObj = msg as any; \/\/ eslint-disable-line @typescript-eslint\/no-explicit-any/const msgObj = msg as { type?: string; content?: string; text?: string };/' src/tui/config/hiveConfig.ts
