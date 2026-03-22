[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.4-beta

## Highlights

- Fixed the dual-chart token analytics panel so the lower delta chart now uses signed deltas with a real zero baseline and locale-aware rise/fall colors.
- Rolled in the latest routing and timeline interaction fixes, including safer signature-aware account writes and calmer timeline auto-positioning.
- Refreshed the user download guidance and archived a few one-off maintenance scripts out of the active scripts root.

## Assets

- Windows installer: `Fries-Setup-0.4.4-beta-x64.exe`
- Windows portable: `Fries-Portable-0.4.4-beta-x64.exe`
- macOS unsigned beta: `Fries-0.4.4-beta-arm64.zip`
- macOS unsigned beta: `Fries-0.4.4-beta-arm64.dmg`

## Notes

- macOS artifacts are still unsigned beta builds until Apple signing secrets are configured.
- If you already rely on the GitHub Release assets, local `release/` copies can be cleaned up and regenerated later with the packaging scripts.
