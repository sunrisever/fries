[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.1-beta

## Summary

This beta narrows the public release story to the platforms we actually want to maintain right now:

- Windows as the primary supported desktop platform
- macOS as the visual/design-focused beta platform

Linux is intentionally removed from the official release promise for now.

## What's new

- Changed the GitHub Actions release matrix from `Windows + Linux + macOS` to `Windows + macOS`
- Removed Linux from the documented packaging surface
- Kept local Windows packaging and CI-driven macOS artifacts aligned with the repository docs
- Preserved unsigned macOS `dmg` / `zip` output as an early beta channel

## Notes

- macOS artifacts are still unsigned in this beta
- Linux is not an official public release target in this version
- Runtime data migration behavior remains unchanged and still migrates local user data on startup
