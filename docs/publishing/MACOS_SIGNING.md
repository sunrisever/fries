[简体中文](../../README_CN.md) | [English](../../README.md)

# macOS Signing / Notarization Prep

This project is prepared for Apple signing and notarization, but it does not hard-require secrets in CI.

## Current repository status

As of `2026-03-21`, the repository currently has **no Apple signing secrets configured**.
Without these secrets, CI will still build unsigned beta `zip` / `dmg` artifacts for macOS.

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

### What each secret should contain

- `CSC_LINK`
  - Base64 of the `Developer ID Application` `.p12` certificate file
- `CSC_KEY_PASSWORD`
  - Password for that `.p12`
- `APPLE_API_KEY_ID`
  - The 10-character App Store Connect API key ID
- `APPLE_API_ISSUER`
  - The App Store Connect issuer UUID
- `APPLE_API_KEY_P8_BASE64`
  - Base64 of the `AuthKey_XXXXXX.p8` file

### One-command setup

Once you have the `.p12`, `.p12` password, and `.p8`, you can upload everything with:

```powershell
npm run setup:macos-secrets -- `
  -Repo sunrisever/fries `
  -P12Path C:\path\DeveloperID.p12 `
  -P12Password "your-p12-password" `
  -AppleApiKeyId ABC123DEFG `
  -AppleApiIssuer 00000000-0000-0000-0000-000000000000 `
  -AppleApiKeyP8Path C:\path\AuthKey_ABC123DEFG.p8
```

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
- When no signing secrets are present, CI explicitly falls back to **unsigned beta** macOS builds instead of failing the full release pipeline
