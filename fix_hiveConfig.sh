#!/bin/bash
sed -i 's/const msgObj = msg as any; \/\/ eslint-disable-line @typescript-eslint\/no-explicit-any/const msgObj = msg as { type?: string; content?: string; text?: string };/' src/tui/config/hiveConfig.ts
