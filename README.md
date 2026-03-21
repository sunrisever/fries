[简体中文](./README_CN.md) | English

# Fries

Fries is a desktop dashboard for multi-account quota, subscription, and snapshot operations. It is designed for people who rotate multiple OpenAI seats or API providers and want a single local panel for window limits, subscription expiry, token analytics, and timeline visibility.

## Description

Desktop dashboard for multi-account quota and subscription ops | 多账号流量额度与订阅运营桌面仪表盘

## Highlights

- OpenAI-first operations board with automatic local Codex usage sync
- Separate handling for OpenAI, observer providers, and exact-quota API providers
- Unified snapshot cache with retention policies and manual cleanup controls
- Day / week / month analytics with stock-style token charts and heatmaps
- Built-in settings page for theme, language, data paths, cache policy, and account editing
- JSON import/export plus example data for onboarding new users
- Built-in self-checker for duplicate OpenAI signatures, orphan snapshots, and timeline anomalies
- AI coding assistant support with aligned `AGENTS.md` and `CLAUDE.md`

## Built For

- OpenAI Team / Business seat rotation
- ChatGPT Plus / Codex local quota observation
- Secondary observation providers such as Claude, Gemini, Kimi, and Qwen
- Users who prefer a local-first desktop tool instead of a hosted web dashboard

## Tech Stack

- Electron
- React + Vite + TypeScript
- Lightweight Charts
- Local JSON state + snapshot files

## Project Structure

```text
build/                         Build resources such as icons
electron/                      Electron main/preload/sync logic
examples/sample-data/          Public example state and snapshot files
local/                         Private local-only workspace (ignored by Git)
public/                        Static assets
scripts/                       Release, icon, and validation scripts
src/                           React application
tests/                         Node-based smoke tests
```

## Data Layout

Runtime data is stored outside the project directory:

- State file: `%APPDATA%\\Fries\\subscriptions.json`
- Snapshots: `%APPDATA%\\Fries\\data\\snapshots`
- Imports: `%APPDATA%\\Fries\\data\\imports`
- Timeline logs: `%APPDATA%\\Fries\\data\\timeline-events`

The app also exposes these paths from the settings page so users can open them without leaving the UI.

## Themes

Theme selection is split into three layers:

- Appearance mode: `Follow system`, `Light`, `Dark`
- Visual effect: `Transparent / Frosted`, `Opaque / Solid`
- Palette preset: `Nordic blue`, `Sea salt`, `Vital orange`, `Retro amber`, `Rose red`, `Lemon lime`, `Flamingo`, `Violet`, `Lavender`, `Peach pink`, `Sakura pink`

This keeps light/dark behavior separate from accent palettes, which is more reusable for open-source users.

## Example Data

Public examples live in:

- `examples/sample-data/subscriptions.example.json`
- `examples/sample-data/snapshots/openai-snapshot.example.json`

These files are desensitized and safe to commit. Real cookies, auth tokens, private logs, and raw exports should stay under `local/`.

## Development

```bash
npm install
npm run dev
npm run check
npm run self-check
```

Checks included in `npm run check`:

- TypeScript typecheck
- Built-in `node:test` smoke tests
- Example data validation
- Release-doc consistency validation

## Packaging

```bash
npm run pack:dir
npm run pack:installer
npm run pack:portable
npm run pack:mac
npm run release:beta
```

Current packaged artifacts:

- Windows installer: `Fries-Setup-<version>-x64.exe`
- Windows portable: `Fries-Portable-<version>-x64.exe`
- Windows unpacked dir: `release/win-unpacked/`
- macOS zip / dmg: `Fries-<version>-arm64.zip` / `Fries-<version>-arm64.dmg`

Local packaging output:

- Local `npm run pack:*` commands now write to `%USERPROFILE%\\Desktop\\Fries Releases` by default so the source repository stays slimmer.
- CI packaging still writes to the in-repo `release/` directory because GitHub Actions needs a predictable artifact path.
- If you want to override the local output path, set `FRIES_OUTPUT_DIR` before running the pack script.

Release channels:

- Local packaging on Windows still uses `--publish never`, so running scripts locally never uploads anything by accident.
- GitHub Actions now builds a Windows + macOS release matrix on tags and uploads assets to GitHub Releases.
- Workflow artifacts also keep per-platform packages available even before a formal GitHub Release is downloaded.

Multi-platform note:

- Windows ships as installer, portable, and unpacked directory.
- macOS ships in CI as `dmg` / `zip`; when Apple signing secrets are configured, the workflow is prepared to sign and notarize builds automatically. Without those secrets, CI still falls back to unsigned beta artifacts.
- Linux is intentionally not an official release target for now.

For signing/notarization setup details, see `docs/publishing/MACOS_SIGNING.md`.

## Release Notes

- Current app version: `0.4.3-beta`
- Product name: `Fries / 薯条`
- Default Windows installer artifact: `Fries-Setup-0.4.3-beta-x64.exe`
- Default Windows portable artifact: `Fries-Portable-0.4.3-beta-x64.exe`

## Open-Source Publishing Notes

- License: MIT
- Suggested repository: `sunrisever/fries`
- GitHub Actions CI: `.github/workflows/ci.yml`
- GitHub Actions release matrix (Windows + macOS): `.github/workflows/release.yml`
- Maintainer release docs: `docs/publishing/`
- macOS signing / notarization prep: `docs/publishing/MACOS_SIGNING.md`
- Suggested GitHub topics:
  `codex`, `claude-code`, `opencode`, `openclaw`, `agents-md`, `agent-skill`, `claude-code-skill`

## Privacy Notes

- Do not commit real account exports, auth material, or private screenshots
- The `local/` directory is reserved for sensitive local-only files
- Example data should always be sanitized before publishing

## License

MIT © sunrisever
