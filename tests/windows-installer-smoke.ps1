$ErrorActionPreference = 'Stop'
$setup = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $setup) { throw 'NSIS installer missing' }
$installDir = Join-Path $env:RUNNER_TEMP 'gs-installer-smoke'
$dataDir = Join-Path $env:APPDATA 'br.gs.deposito'
function Install-App {
  # The CI runner is disposable; this exercises the real per-user installer.
  $installer = Start-Process -FilePath $setup.FullName -ArgumentList '/S',"/D=$installDir" -Wait -PassThru
  if ($installer.ExitCode -ne 0) { throw "Installer exit code: $($installer.ExitCode)" }
}
function Verify-InstalledApp([string] $mode) {
  $exe = Get-ChildItem $installDir -Filter '*.exe' | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1
  if (-not $exe) { throw 'Installed executable missing' }
  $app = Start-Process -FilePath $exe.FullName -PassThru
  try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      Start-Sleep -Seconds 1
      $app.Refresh()
      if ($app.HasExited) { throw "Installed app exited during startup: $($app.ExitCode)" }
      $copies = @(Get-ChildItem (Join-Path $dataDir 'backups/*.sqlite') -ErrorAction SilentlyContinue)
      if ((Test-Path (Join-Path $dataDir 'deposito.db')) -and $copies.Count -gt 0 -and -not (Test-Path (Join-Path $dataDir 'restore-pending.json')) -and $app.MainWindowHandle -ne [IntPtr]::Zero) { $ready = $true; break }
    }
    if (-not $ready) { throw 'Installed app did not initialize its window, database, backup and recovery' }
    python tests/windows-installer-smoke.py $dataDir $mode
    if ($LASTEXITCODE -ne 0) { throw "Installed SQLite validation failed: $mode" }
  } finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
    if (-not $app.WaitForExit(10000)) { throw "Installed process did not stop" }
  }
}
Install-App
Verify-InstalledApp 'validate'
python tests/windows-installer-smoke.py $dataDir 'prepare-restore'
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare restore fixture' }
Verify-InstalledApp 'verify-restore'
python tests/windows-installer-smoke.py $dataDir 'seed-reinstall'
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare reinstall fixture' }
Install-App
Verify-InstalledApp 'verify-reinstall'
Write-Output 'PASS: NSIS installation, native startup, automatic backup, recovery and reinstall with data preserved'
