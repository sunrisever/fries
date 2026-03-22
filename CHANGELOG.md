[简体中文](./README_CN.md) | [English](./README.md)

# Changelog

## 0.4.7-beta

- Published a clean multi-platform beta after the earlier stale-tag release mismatch, so release assets can line up with the real version number again.
- Kept Linux in the official release matrix with `AppImage`, `deb`, and `rpm` targets alongside Windows and macOS artifacts.
- Carried forward the latest heatmap threshold-mode work and documentation alignment into a fresh release tag.

## 0.4.8-beta

- Fixed the Linux packaging path so electron-builder uses an explicit PNG icon instead of falling back to a failing ICNS conversion step.
- Added Linux AppImage / deb / rpm files to the final GitHub Release asset collection step, so the public release page can expose direct-download Linux assets.
- Prepared a fresh multi-platform beta after the earlier Linux job blocked the final publish step for Windows and macOS as well.

## 0.4.9-beta

- Added explicit maintainer metadata for Linux package targets so `deb` / `rpm` packaging can complete in CI.
- Kept the Linux PNG icon fix and release-asset collection fix from the previous beta, then reran the multi-platform release on a clean tag.
- Continued to align release docs and artifact names with the new beta version.

## 0.4.6-beta

- Added Linux release targets to the official GitHub Release matrix, including `AppImage`, `deb`, and `rpm` assets.
- Expanded packaging docs so users can now choose Windows, macOS, or Linux downloads directly from the release page.
- Prepared the next beta release around a fuller multi-platform assets page, closer to a traditional desktop app release archive.

## 0.4.5-beta

- Added a settings-level toggle for heatmap threshold mode, so users can switch between adaptive auto thresholds and stable fixed thresholds.
- Improved heatmap legends with an explicit current-mode label to make fixed vs auto scaling obvious at a glance.
- Refreshed the latest local analytics/UI fixes and prepared a new beta release after the threshold-mode rollout.

## 0.4.4-beta

- Fixed the dual-chart token analytics panel so the lower delta chart uses signed deltas, keeps zero as the baseline, and respects locale-specific rise/fall colors.
- Tightened account routing and timeline interactions with the latest local fixes, including safer signature-based routing and less intrusive timeline auto-positioning.
- Refreshed the user download guidance and archived a few one-off maintenance scripts out of the active scripts root.

## 0.4.3-beta

- Cleaned the GitHub release workflow so public release pages only keep end-user assets instead of debug and blockmap noise.
- Made release notes resolution tag-driven, which removes the previous hard-coded version dependency in the publish workflow.
- Rolled in the latest Codex sync freshness guard and OpenAI seat labeling fixes so this beta matches the current local desktop behavior.

## 0.4.2-beta

- Added macOS-specific titlebar polish with traffic-light window controls and a cleaner custom desktop shell layout.
- Prepared Apple signing / notarization hooks, entitlements, and CI secret plumbing while keeping unsigned macOS fallback artifacts available.
- Added maintainer-facing macOS signing docs so future public macOS distribution can move toward a smoother install story.

## 0.4.1-beta

- Narrowed the official release matrix to Windows + macOS so the public release story stays aligned with what is actually maintained.
- Kept macOS as an unsigned beta channel aimed at design-sensitive desktop users while leaving Linux out of the official release promise for now.
- Updated packaging docs, release workflow, and artifact naming to match the new two-platform release scope.

## 0.4.0-beta

- Added a GitHub Actions release matrix for Windows, Linux, and macOS packaging.
- Added local packaging scripts for Linux (`AppImage` / `deb`) and macOS (`zip` / `dmg`) alongside the existing Windows installer and portable flow.
- Upgraded the publishing docs so local packaging, CI artifacts, and GitHub Releases are documented as separate release channels.
- Kept Windows local packaging safe with `--publish never` while preparing tag-driven multi-platform uploads in CI.

## 0.3.1-beta

- Renamed the project and published artifacts from `Token Chowhound / 大胃袋` to `Fries / 薯条`.
- Renamed the GitHub repository to `sunrisever/fries` and refreshed the release About metadata and topics.
- Switched runtime defaults to the new `%APPDATA%\\Fries` path while keeping automatic migration compatibility from older app-data folders.

## 0.3.0-beta

- Added repository-grade `typecheck`, `node:test`, example-data validation, and release consistency checks.
- Added a built-in self-checker for duplicate OpenAI signatures, orphan timeline events, and orphan snapshot files.
- Split heavy pages into lazy-loaded bundles and expanded snapshot indexing toward persistent cache usage.
- Aligned runtime docs and sample data with the current `subscriptions.json` storage layout.
- Prepared the repository for a more formal beta release with CI and refreshed release notes.
