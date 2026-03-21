[简体中文](../../README_CN.md) | [English](../../README.md)

# macOS Signing / Notarization Prep

This project is prepared for Apple signing and notarization, but it does not hard-require secrets in CI.

## Current behavior

- If macOS signing secrets are configured, the release workflow can sign the app and run notarization automatically.
- If secrets are missing, CI still produces unsigned beta `zip` / `dmg` artifacts.

## Supported credential paths

### Recommended: App Store Connect API key

Configure these GitHub Actions secrets:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY_P8_BASE64`

The workflow decodes `APPLE_API_KEY_P8_BASE64` into a temporary `.p8` file and exposes it as `APPLE_API_KEY_PATH`.

### Fallback: Apple ID

If API-key notarization is not available, the notarization hook also supports:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## Build configuration

- `package.json` sets `afterSign` to `scripts/notarize.cjs`
- `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist` are included for hardened runtime signing
- `release.yml` only runs `Windows + macOS` public release jobs

## Notes

- Windows local packaging still uses `--publish never`
- macOS signing only happens on macOS runners
- Do not commit `.p12` or `.p8` files into the repository
