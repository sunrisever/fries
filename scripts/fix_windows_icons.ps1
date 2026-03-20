$ErrorActionPreference = "Stop"

$taskbarDir = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
$exePath = "C:\Users\28033\Desktop\ai-account-console\release\win-unpacked\Token Chowhound.exe"
$desktopShortcutPath = "C:\Users\28033\Desktop\Token Chowhound.lnk"
$taskbarShortcutPath = Join-Path $taskbarDir "Token Chowhound.lnk"
$legacyTaskbarShortcutPath = Join-Path $taskbarDir "AI Account Console.lnk"

if (Test-Path $legacyTaskbarShortcutPath) {
  Remove-Item $legacyTaskbarShortcutPath -Force
}

$shell = New-Object -ComObject WScript.Shell

function New-AppShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $exePath
  $shortcut.WorkingDirectory = Split-Path $exePath
  $shortcut.IconLocation = "$exePath,0"
  $shortcut.Description = "Token Chowhound"
  $shortcut.Save()
}

New-AppShortcut -Path $desktopShortcutPath
New-AppShortcut -Path $taskbarShortcutPath

Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

$iconCacheRoot = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Explorer"
Get-ChildItem $iconCacheRoot -Filter "iconcache*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$rootCache = Join-Path $env:LOCALAPPDATA "IconCache.db"
if (Test-Path $rootCache) {
  Remove-Item $rootCache -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500
Start-Process explorer.exe

[PSCustomObject]@{
  DesktopShortcut = $desktopShortcutPath
  TaskbarShortcut = $taskbarShortcutPath
  Exe = $exePath
}
