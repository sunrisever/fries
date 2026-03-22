[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.9-beta

This beta finishes the Linux release metadata work needed for a proper public multi-platform release page with direct-download assets.

## Highlights

- Added maintainer metadata required by Linux `deb` / `rpm` packaging.
- Kept the explicit PNG Linux icon path so Linux packaging no longer falls back to the failing ICNS conversion path.
- Re-ran the Windows + macOS + Linux release pipeline on a fresh beta tag so the GitHub release page can expose direct-download assets.

## Assets

- Windows installer: `Fries-Setup-0.4.9-beta-x64.exe`
- Windows portable: `Fries-Portable-0.4.9-beta-x64.exe`
- macOS: `Fries-0.4.9-beta-arm64.zip` and `Fries-0.4.9-beta-arm64.dmg`
- Linux: `Fries-0.4.9-beta-x86_64.AppImage`, `Fries-0.4.9-beta-amd64.deb`, `Fries-0.4.9-beta-x86_64.rpm`

## Notes

- macOS artifacts are still published as unsigned beta builds unless Apple signing credentials are configured.
- Linux artifacts are intended for direct download from the GitHub release page.
