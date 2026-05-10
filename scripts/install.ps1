#!/usr/bin/env pwsh
<#
.SYNOPSIS
  March CLI one-click installer for Windows
.DESCRIPTION
  Checks Node.js >= 20, installs February CLI globally via npm,
  and verifies the installation.
.NOTES
  Run: powershell -ExecutionPolicy Bypass -File install.ps1
#>

$ErrorActionPreference = "Stop"
$MinimumNode = 20

Write-Host "── March CLI installer ──" -ForegroundColor Cyan

# ── Node.js check ──────────────────────────────────────────────
try {
  $nodeVersion = (node --version 2>&1).TrimStart('v')
  $major = [int]($nodeVersion.Split('.')[0])
  if ($major -lt $MinimumNode) {
    Write-Host "Error: Node.js $MinimumNode+ required, found v$nodeVersion" -ForegroundColor Red
    Write-Host "Install from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "  Node.js v$nodeVersion  OK" -ForegroundColor Green
} catch {
  Write-Host "Error: Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
  exit 1
}

# ── Install ────────────────────────────────────────────────────
$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgRoot = Resolve-Path (Join-Path $srcDir "..")
Write-Host "  Installing from $pkgRoot ..."
npm install -g $pkgRoot 2>&1 | ForEach-Object { Write-Host "  $_" }

# ── Verify ─────────────────────────────────────────────────────
try {
  $marchVersion = (march --help 2>&1 | Select-Object -First 1) -replace '\s+$',''
  Write-Host "  March CLI installed  OK" -ForegroundColor Green
  Write-Host "  $marchVersion"
  Write-Host ""
  Write-Host "Run 'march' to start. Run 'march --help' for options." -ForegroundColor Cyan
} catch {
  Write-Host "Warning: march command not found in PATH. Check your npm global bin directory." -ForegroundColor Yellow
  Write-Host "  npm bin -g"
}
