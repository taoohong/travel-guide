$ErrorActionPreference = 'Stop'
$apiDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workspace = (Resolve-Path (Join-Path $apiDir '..\..')).Path
$envLine = (Get-Content -LiteralPath (Join-Path $apiDir '.env') | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
if ($envLine -notmatch '^DATABASE_URL="postgresql://travel_guide:([0-9a-f]{48})@127\.0\.0\.1:55432/travel_guide\?schema=public"$') {
  throw 'Restore verification requires the dedicated local database from start-local-db.ps1.'
}

$password = $Matches[1]
$database = 'travel_guide_restore_' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$previousUrl = $env:DATABASE_URL
$previousPassword = $env:PGPASSWORD
$created = $false

try {
  $env:PGPASSWORD = $password
  & createdb -h 127.0.0.1 -p 55432 -U travel_guide $database
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the empty restore database.' }
  $created = $true
  $env:DATABASE_URL = "postgresql://travel_guide:${password}@127.0.0.1:55432/${database}?schema=public"

  Push-Location $workspace
  try {
    & pnpm api:prisma:deploy
    if ($LASTEXITCODE -ne 0) { throw 'Migration restore failed.' }
    & pnpm api:seed
    if ($LASTEXITCODE -ne 0) { throw 'Seed restore failed.' }
    & pnpm db:verify
    if ($LASTEXITCODE -ne 0) { throw 'Restored database verification failed.' }
  } finally {
    Pop-Location
  }
  Write-Output 'Empty-database migrate + seed + verification succeeded.'
} finally {
  if ($created) {
    & dropdb -h 127.0.0.1 -p 55432 -U travel_guide $database
    if ($LASTEXITCODE -ne 0) { Write-Warning "Temporary database $database could not be removed." }
  }
  $env:DATABASE_URL = $previousUrl
  $env:PGPASSWORD = $previousPassword
}
