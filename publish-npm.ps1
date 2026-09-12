# Publish dsh-plugin-mermaid-preview to npm.
#
# Why a token instead of `npm login`: this machine runs npm 12, whose `npm login`
# drives a web flow. The legacy `/-/v1/login` endpoint the CLI falls back to in a
# terminal no longer exists (it answers 401), which is what surfaced as
# `ECONNRESET`. A Granular Access Token skips that endpoint entirely — the
# registry authenticates the publish request directly.
#
# Usage:
#   $env:NPM_TOKEN = 'npm_xxxxxxxx'      # token with read+write for this package
#   pwsh -File publish-npm.ps1
#
#   pwsh -File publish-npm.ps1 -DryRun   # everything except the real publish
#
# If NPM_TOKEN is unset the script explains how to create one and exits; it never
# prompts, because an interactive prompt cannot complete in a non-interactive
# shell.

param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $here
try {
  $pkg = Get-Content package.json -Raw | ConvertFrom-Json
  Write-Host "package: $($pkg.name)@$($pkg.version)"

  $extra = @()
  if ($env:NPM_TOKEN) {
    # Passed per-invocation, so nothing is written to any .npmrc.
    $extra = @("--//registry.npmjs.org/:_authToken=$($env:NPM_TOKEN)")
    Write-Host 'auth: NPM_TOKEN from the environment'
  } else {
    $who = (& npm whoami 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
      Write-Host ''
      Write-Host 'No npm credentials found. Create a Granular Access Token, then re-run:' -ForegroundColor Yellow
      Write-Host '  1. https://www.npmjs.com/settings/~/tokens  ->  Generate New Token  ->  Granular Access Token'
      Write-Host '  2. Permissions: Read and write.  Packages: the package name (or all).'
      Write-Host '  3. Copy the token, then:'
      Write-Host '       $env:NPM_TOKEN = ''npm_xxxxxxxx'''
      Write-Host '       pwsh -File publish-npm.ps1'
      exit 1
    }
    Write-Host "auth: logged in as $who"
  }

  # Dry run first: runs prepublishOnly (the build, so lib/ is current), shows the
  # exact tarball, touches no registry, and catches a bad token early.
  Write-Host ''
  Write-Host '--- dry run ---'
  & npm publish --dry-run @extra
  if ($LASTEXITCODE -ne 0) { throw 'dry run failed; nothing was published' }

  if ($DryRun) {
    Write-Host ''
    Write-Host 'Dry run requested; stopping before the real publish.' -ForegroundColor Cyan
    exit 0
  }

  Write-Host ''
  Write-Host '--- publishing ---'
  & npm publish @extra
  if ($LASTEXITCODE -ne 0) { throw 'publish failed' }

  Write-Host ''
  Write-Host "published $($pkg.name)@$($pkg.version)" -ForegroundColor Green
  Write-Host "verify:  npm view $($pkg.name) version"
  Write-Host "install: dsh plugin --profile web add $($pkg.name)"
} finally {
  Pop-Location
}
