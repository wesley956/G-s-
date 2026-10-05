$ErrorActionPreference = 'Stop'
$setup = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $setup) { throw 'NSIS installer missing' }
$installDir = Join-Path $env:RUNNER_TEMP 'gs-installer-smoke'
# The CI runner is disposable; this exercises the actual per-user installer.
$installer = Start-Process -FilePath $setup.FullName -ArgumentList '/S',"/D=$installDir" -Wait -PassThru
if ($installer.ExitCode -ne 0) { throw "Installer exit code: $($installer.ExitCode)" }
$exe = Join-Path $installDir 'gs_deposito.exe'
if (-not (Test-Path $exe)) { throw 'Installed executable missing' }
$app = Start-Process -FilePath $exe -PassThru
$dataDir = Join-Path $env:APPDATA 'br.gs.deposito'
$db = Join-Path $dataDir 'deposito.db'
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    $app.Refresh()
    if ($app.HasExited) { throw "Installed app exited during startup: $($app.ExitCode)" }
    $copies = @(Get-ChildItem (Join-Path $dataDir 'backups/*.sqlite') -ErrorAction SilentlyContinue)
    if ((Test-Path $db) -and $copies.Count -gt 0) { $ready = $true; break }
  }
  if (-not $ready) { throw 'Installed app did not initialize its database and automatic backup' }
  python tests/windows-installer-smoke.py $dataDir
  if ($LASTEXITCODE -ne 0) { throw 'Installed SQLite validation failed' }
  Write-Output 'PASS: NSIS installation, native startup, migrations and automatic backup'
} finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
}
