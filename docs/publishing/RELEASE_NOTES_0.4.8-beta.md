[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.8-beta

This beta fixes the release pipeline so the GitHub release page can expose real downloadable assets across Windows, macOS, and Linux.

## Highlights

- Fixed Linux packaging to use an explicit PNG icon during AppImage / deb / rpm builds.
- Added Linux outputs to the final GitHub Release asset collection step.
- Prepared a fresh multi-platform beta after the earlier Linux packaging failure blocked the full public release publish.

## Assets

- Windows installer: `Fries-Setup-0.4.8-beta-x64.exe`
- Windows portable: `Fries-Portable-0.4.8-beta-x64.exe`
- macOS: `Fries-0.4.8-beta-arm64.zip` and `Fries-0.4.8-beta-arm64.dmg`
- Linux: `Fries-0.4.8-beta-x86_64.AppImage`, `Fries-0.4.8-beta-amd64.deb`, `Fries-0.4.8-beta-x86_64.rpm`

## Notes

- macOS artifacts are still published as unsigned beta builds unless Apple signing credentials are configured.
- Linux artifacts are intended for direct download from the GitHub release page.
