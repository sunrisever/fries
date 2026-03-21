[简体中文](../../README_CN.md) | [English](../../README.md)

# Fries v0.4.3-beta

## Summary

This beta cleans up the public release surface and rolls in the latest local sync fixes:

- GitHub Releases now focus on end-user assets instead of debug and blockmap noise
- release notes are resolved dynamically from the pushed tag version
- Codex sync freshness guards and OpenAI seat labeling fixes are included in the release

## What's new

- Filtered GitHub Release uploads down to installer, portable build, updater manifests, and primary macOS archives
- Removed the hard-coded release-notes path from the release workflow
- Included the recent source-timestamp freshness guard for Codex usage sync
- Included the latest OpenAI Plus / Team label alignment and Vucovs dirty-snapshot cleanup support

## Notes

- Public release pages are intentionally slimmer now; maintenance-only files such as `builder-debug.yml` and `*.blockmap` are no longer meant for end users
- macOS artifacts may still be unsigned unless Apple signing secrets are configured
- Windows remains the primary local packaging target
