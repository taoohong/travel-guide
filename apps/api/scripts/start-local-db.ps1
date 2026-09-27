param([int]$Port = 55432)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$dataDir = Join-Path $workspace '.pgdata'
$envPath = Join-Path $workspace 'apps\api\.env'
$database = 'travel_guide'
$role = 'travel_guide'

if ((Test-Path $dataDir) -xor (Test-Path $envPath)) {
  throw 'Local cluster and apps/api/.env must either both exist or both be absent. No existing data was changed.'
}

if (-not (Test-Path $dataDir)) {
  $password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
  $passwordFile = New-TemporaryFile
  try {
    Set-Content -LiteralPath $passwordFile.FullName -Value $password -NoNewline -Encoding ascii
    & initdb -D $dataDir -U $role --pwfile=$($passwordFile.FullName) --auth-local=scram-sha-256 --auth-host=scram-sha-256 -E UTF8
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
  } finally {
    Remove-Item -LiteralPath $passwordFile.FullName -Force -ErrorAction SilentlyContinue
  }
  Set-Content -LiteralPath $envPath -Value "DATABASE_URL=`"postgresql://${role}:${password}@127.0.0.1:${Port}/${database}?schema=public`"" -Encoding utf8
}

$connection = Get-Content -LiteralPath $envPath -Raw
$match = [regex]::Match($connection, "DATABASE_URL=`"postgresql://${role}:([0-9a-f]{48})@127\.0\.0\.1:${Port}/${database}\?schema=public`"")
if (-not $match.Success) { throw 'apps/api/.env does not point to this dedicated local cluster.' }

& pg_isready -h 127.0.0.1 -p $Port *> $null
if ($LASTEXITCODE -ne 0) {
  & pg_ctl -D $dataDir -l (Join-Path $dataDir 'server.log') -o "-h 127.0.0.1 -p $Port" start
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the dedicated PostgreSQL cluster.' }
}

try {
  $env:PGPASSWORD = $match.Groups[1].Value
  $exists = & psql -h 127.0.0.1 -p $Port -U $role -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database'"
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the dedicated PostgreSQL cluster.' }
  if (($exists | Out-String).Trim() -ne '1') {
    & createdb -h 127.0.0.1 -p $Port -U $role $database
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the travel_guide database.' }
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Output "Dedicated PostgreSQL database is ready on 127.0.0.1:$Port."
