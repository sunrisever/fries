[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.0-beta

## Summary

This beta upgrades Fries from a Windows-only local release flow to a multi-platform publishing pipeline with explicit release channels:

- Local Windows packaging for day-to-day testing
- GitHub Actions workflow artifacts for each platform
- GitHub Releases assets built from a tag-driven matrix

## What's new

- Added GitHub Actions release matrix for:
  - Windows: installer + portable
  - Linux: AppImage + deb
  - macOS: unsigned zip + dmg
- Added local packaging scripts:
  - `npm run pack:linux`
  - `npm run pack:mac`
- Refreshed publishing documentation so local packaging and CI-based release uploads are clearly separated
- Kept local packaging safe with `--publish never`

## Notes

- macOS artifacts are intentionally unsigned in this beta
- Linux and macOS artifacts are primarily intended for early adopters until wider validation is complete
- Runtime data still migrates locally via the built-in data migration layer and is not bundled into release assets
