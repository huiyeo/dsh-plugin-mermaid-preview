# Publish dsh-plugin-mermaid-preview to npm.
#
# Why a script: the npm cache lives outside this session's writable workspace, so
# every npm command here has to point `--cache` somewhere local. After `npm login`
# the default cache works again, but keeping it explicit makes the run
# reproducible from this checkout either way.
#
#   pwsh -File publish-npm.ps1
#
# The script stops before publishing if the registry has no credentials: the
# login is interactive (browser or OTP) and cannot be automated.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cache = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) '.npm-cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

Push-Location $here
try {
  $who = (& npm whoami --cache $cache 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Not logged in to npm. Run this first (interactive):' -ForegroundColor Yellow
    Write-Host "  npm login --cache $cache"
    Write-Host ''
    Write-Host 'Then re-run this script.'
    exit 1
  }
  Write-Host "npm user: $who"

  $name = (Get-Content package.json -Raw | ConvertFrom-Json).name
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  Write-Host "publishing $name@$version"
  Write-Host ''

  # --dry-run first: shows the exact tarball and runs prepublishOnly (the build)
  # without touching the registry.
  & npm publish --dry-run --cache $cache
  if ($LASTEXITCODE -ne 0) { throw 'dry run failed; nothing was published' }

  Write-Host ''
  Write-Host 'Dry run clean. Publishing for real...' -ForegroundColor Cyan
  & npm publish --cache $cache
  if ($LASTEXITCODE -ne 0) { throw 'publish failed' }

  Write-Host ''
  Write-Host "published $name@$version" -ForegroundColor Green
  Write-Host "verify: npm view $name version"
} finally {
  Pop-Location
}
