[CmdletBinding()]
param(
  [string]$Repo = "sunrisever/fries",
  [string]$P12Path,
  [string]$P12Password,
  [string]$AppleApiKeyId,
  [string]$AppleApiIssuer,
  [string]$AppleApiKeyP8Path,
  [string]$AppleId,
  [string]$AppleAppSpecificPassword,
  [string]$AppleTeamId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "缺少命令：$Name"
  }
}

function Resolve-RequiredFile {
  param(
    [string]$PathValue,
    [string]$Label
  )
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    throw "缺少 $Label 文件路径。"
  }
  $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
  return $resolved.Path
}

function Encode-FileBase64 {
  param([string]$LiteralPath)
  $bytes = [System.IO.File]::ReadAllBytes($LiteralPath)
  return [Convert]::ToBase64String($bytes)
}

function Set-GitHubSecret {
  param(
    [string]$Name,
    [string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }
  Write-Host "设置 GitHub Secret: $Name"
  $Value | gh secret set $Name --repo $Repo --body-file -
}

Require-Command "gh"

if ([string]::IsNullOrWhiteSpace($P12Path) -or
    [string]::IsNullOrWhiteSpace($P12Password) -or
    [string]::IsNullOrWhiteSpace($AppleApiKeyId) -or
    [string]::IsNullOrWhiteSpace($AppleApiIssuer) -or
    [string]::IsNullOrWhiteSpace($AppleApiKeyP8Path)) {
  throw @"
缺少必填参数。至少需要这 5 项来打通 macOS 签名/公证主链路：
- P12Path
- P12Password
- AppleApiKeyId
- AppleApiIssuer
- AppleApiKeyP8Path

示例：
  powershell -ExecutionPolicy Bypass -File scripts/setup-macos-secrets.ps1 `
    -Repo sunrisever/fries `
    -P12Path C:\path\DeveloperID.p12 `
    -P12Password 'your-p12-password' `
    -AppleApiKeyId ABC123DEFG `
    -AppleApiIssuer 00000000-0000-0000-0000-000000000000 `
    -AppleApiKeyP8Path C:\path\AuthKey_ABC123DEFG.p8
"@
}

$resolvedP12 = Resolve-RequiredFile -PathValue $P12Path -Label "Developer ID Application .p12"
$resolvedP8 = Resolve-RequiredFile -PathValue $AppleApiKeyP8Path -Label "App Store Connect API .p8"

$p12Base64 = Encode-FileBase64 -LiteralPath $resolvedP12
$p8Base64 = Encode-FileBase64 -LiteralPath $resolvedP8

Set-GitHubSecret -Name "CSC_LINK" -Value $p12Base64
Set-GitHubSecret -Name "CSC_KEY_PASSWORD" -Value $P12Password
Set-GitHubSecret -Name "APPLE_API_KEY_ID" -Value $AppleApiKeyId
Set-GitHubSecret -Name "APPLE_API_ISSUER" -Value $AppleApiIssuer
Set-GitHubSecret -Name "APPLE_API_KEY_P8_BASE64" -Value $p8Base64

Set-GitHubSecret -Name "APPLE_ID" -Value $AppleId
Set-GitHubSecret -Name "APPLE_APP_SPECIFIC_PASSWORD" -Value $AppleAppSpecificPassword
Set-GitHubSecret -Name "APPLE_TEAM_ID" -Value $AppleTeamId

Write-Host ""
Write-Host "已完成 secrets 写入。建议下一步执行："
Write-Host "  gh secret list --repo $Repo"
Write-Host "然后重新推一个 beta tag 或手动触发 Release workflow。"
