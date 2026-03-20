# AGENTS.md

## Project

- Name: `Fries / 薯条`
- Stack: `Electron + React + Vite + TypeScript`
- Goal: local-first dashboard for account quota, subscription, and snapshot operations

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Build renderer: `npm run build`
- Package unpacked: `npm run pack:dir`
- Package installer: `npm run pack:installer`
- Package portable: `npm run pack:portable`

## Data Model

- Runtime state file: `%APPDATA%\\Fries\\subscriptions.json`
- Snapshot cache: `%APPDATA%\\Fries\\data\\snapshots`
- Manual import folder: `%APPDATA%\\Fries\\data\\imports`
- Public examples: `examples/sample-data/`
- Private local-only files: `local/`

## Editing Guidance

- Keep the app local-first. Do not require a backend for basic usage.
- Prefer extending the settings page and JSON schema over hard-coded personal assumptions.
- Preserve bilingual copy when editing user-facing text.
- Keep sample data desensitized and commit-safe.
- OpenAI live expiry should prefer `liveUsage.subscriptionActiveUntil` over manual fallback fields.

## Release Notes

- Target repository: `sunrisever/fries`
- License: MIT
- Release artifacts should use the `Fries-${version}-${arch}` pattern

## Assistant Compatibility

This repository is intended to work well with Codex, Claude Code, OpenCode, and OpenClaw. Keep `AGENTS.md` and `CLAUDE.md` aligned when updating project guidance.
