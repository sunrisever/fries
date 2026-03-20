# CLAUDE.md

## Project

- Name: `Token Chowhound / 大胃袋`
- Stack: `Electron + React + Vite + TypeScript`
- Purpose: a desktop control panel for quota windows, subscription expiry, token analytics, and local snapshots

## Common Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run pack:dir`
- `npm run pack:installer`
- `npm run pack:portable`

## Runtime Data

- State: `%APPDATA%\\Token Chowhound\\subscriptions.json`
- Snapshots: `%APPDATA%\\Token Chowhound\\data\\snapshots`
- Imports: `%APPDATA%\\Token Chowhound\\data\\imports`
- Safe public examples: `examples/sample-data/`
- Sensitive local-only files: `local/`

## Editing Rules

- Keep the app usable without any hosted backend.
- Prefer schema-driven settings and UI editing over personal hard-coded paths.
- Maintain Chinese and English user-facing copy together.
- Keep public examples sanitized.
- For OpenAI accounts, treat `liveUsage.subscriptionActiveUntil` as the primary live expiry signal.

## Release Guidance

- Expected repository: `sunrisever/token-chowhound`
- License: MIT
- Windows artifacts should use the `Token-Chowhound-${version}-${arch}` name pattern

## Multi-Agent Support

This repository is designed for Codex, Claude Code, OpenCode, and OpenClaw collaboration. Keep `CLAUDE.md` and `AGENTS.md` synchronized when guidance changes.
