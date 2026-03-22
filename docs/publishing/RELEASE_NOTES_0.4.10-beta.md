[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.10-beta

This beta expands the public release page into a more complete multi-platform download archive, with both Apple Silicon and Intel macOS builds.

## Highlights

- Added macOS `x64` packaging alongside `arm64`.
- Kept Windows and Linux direct-download assets on the release page.
- Removed updater metadata files from the public asset list so the page stays cleaner for normal users.

## Assets

- Windows installer: `Fries-Setup-0.4.10-beta-x64.exe`
- Windows portable: `Fries-Portable-0.4.10-beta-x64.exe`
- macOS Apple Silicon: `Fries-0.4.10-beta-arm64.zip` and `Fries-0.4.10-beta-arm64.dmg`
- macOS Intel: `Fries-0.4.10-beta-x64.zip` and `Fries-0.4.10-beta-x64.dmg`
- Linux: `Fries-0.4.10-beta-x86_64.AppImage`, `Fries-0.4.10-beta-amd64.deb`, `Fries-0.4.10-beta-x86_64.rpm`

## Notes

- macOS artifacts are still published as unsigned beta builds unless Apple signing credentials are configured.
- Updater metadata files are still produced during CI, but they are no longer shown in the public GitHub Release asset list.
