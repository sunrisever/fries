[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.2-beta

## Summary

This beta focuses on macOS polish and release readiness:

- refined macOS-specific titlebar styling in the desktop shell
- prepared Apple signing / notarization hooks for CI
- kept Windows as the primary local packaging target while improving public macOS beta distribution

## What's new

- Added macOS-oriented custom titlebar styling with traffic-light window controls
- Prepared `electron-builder` for hardened runtime, entitlements, and optional notarization
- Added CI secrets plumbing for Apple signing and notarization while preserving unsigned fallback artifacts
- Added maintainer docs for macOS signing / notarization setup

## Notes

- macOS artifacts may still be unsigned unless signing secrets are configured
- Public release scope remains `Windows + macOS`
- Runtime data migration behavior is unchanged in this version
