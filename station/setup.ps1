#Requires -Version 5
<#
  Apex Workforce — Clocking Station Setup Script
  Run from the apex-workforce\station directory:
    powershell -ExecutionPolicy Bypass -File setup.ps1
#>

$ErrorActionPreference = "Stop"
$AppDir = Join-Path $PSScriptRoot "Station.App"

function Write-Header($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "  OK  $msg"  -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "  >>  $msg"  -ForegroundColor Yellow }
function Write-Fail($msg)   { Write-Host " FAIL $msg"  -ForegroundColor Red }

Write-Host @"
╔══════════════════════════════════════════╗
║   Apex Workforce — Station Setup         ║
║   SAB Biometric Time & Attendance        ║
╚══════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# ── 1. .NET 8 ────────────────────────────────────────────────────────────────
Write-Header ".NET 8 Runtime"
try {
    $ver = & dotnet --version 2>&1
    if ($ver -match "^8\.") { Write-Ok ".NET $ver" }
    else {
        Write-Warn ".NET $ver found — recommend 8.x."
        Write-Warn "Download from: https://dotnet.microsoft.com/download/dotnet/8.0"
    }
} catch {
    Write-Fail ".NET not found. Install from https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
}

# ── 2. libzkfp.dll ───────────────────────────────────────────────────────────
Write-Header "ZKTeco ZK9500 SDK"
$dllPath = Join-Path $AppDir "libzkfp.dll"
if (Test-Path $dllPath) {
    Write-Ok "libzkfp.dll found in $AppDir"
} else {
    Write-Warn "libzkfp.dll not found."
    Write-Warn "Copy the 64-bit libzkfp.dll from the ZKTeco ZK9500 SDK (SDK\Lib\x64\) to:"
    Write-Warn "  $AppDir"
    Write-Warn "Connect the ZK9500 via USB before continuing."
    $null = Read-Host "Press ENTER when libzkfp.dll is in place (Ctrl+C to exit)"
}

# ── 3. appsettings.json ──────────────────────────────────────────────────────
Write-Header "Station Configuration"
$settingsPath = Join-Path $AppDir "appsettings.json"

if (Test-Path $settingsPath) {
    Write-Ok "appsettings.json already exists — skipping interactive setup."
    Write-Warn "Delete appsettings.json and re-run to reconfigure."
} else {
    Write-Host "`nFirebase configuration:" -ForegroundColor White
    $projectId = Read-Host "  Firebase Project ID (default: apex-workforce)"
    if (!$projectId) { $projectId = "apex-workforce" }
    $apiKey      = Read-Host "  Firebase API Key"
    $devEmail    = Read-Host "  Device account email"
    $devPwdSec   = Read-Host "  Device account password" -AsSecureString
    $devPwd      = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                     [Runtime.InteropServices.Marshal]::SecureStringToBSTR($devPwdSec))

    Write-Host "`nStation identity:" -ForegroundColor White
    $stationId   = Read-Host "  Station ID (from Firestore stations collection)"
    $stationName = Read-Host "  Station display name (e.g. Main Gate)"
    $siteId      = Read-Host "  Site ID (from Firestore sites collection)"
    $siteName    = Read-Host "  Site name (e.g. Johannesburg Brewery)"

    Write-Host "`nHardware:" -ForegroundColor White
    $simInput  = Read-Host "  Run in simulation mode? [y/N]"
    $simBool   = if ($simInput -eq "y") { "true" } else { "false" }
    $relayType = Read-Host "  Relay type — hid (USB HID board) or serial (CH340) [hid]"
    if (!$relayType) { $relayType = "hid" }
    $relayPort = "COM3"
    if ($relayType -eq "serial") {
        $relayPort = Read-Host "  Serial port (e.g. COM3)"
        if (!$relayPort) { $relayPort = "COM3" }
    }

    $cfg = [ordered]@{
        Firebase = [ordered]@{
            ProjectId      = $projectId
            ApiKey         = $apiKey
            DeviceEmail    = $devEmail
            DevicePassword = $devPwd
        }
        Station = [ordered]@{
            StationId   = $stationId
            StationName = $stationName
            SiteId      = $siteId
            SiteName    = $siteName
        }
        Hardware = [ordered]@{
            Simulate                 = $simBool
            FingerprintMatchThreshold = 70
            ClockCooldownMs          = 2500
            RelayPulseDurationMs     = 500
            RelayType                = $relayType
            RelayVid                 = "0x16C0"
            RelayPid                 = "0x05DF"
            RelaySerialPort          = $relayPort
            RelaySerialBaud          = "9600"
        }
    }

    $cfg | ConvertTo-Json -Depth 5 | Set-Content $settingsPath -Encoding UTF8
    Write-Ok "appsettings.json written to $settingsPath"
}

# ── 4. Build ─────────────────────────────────────────────────────────────────
Write-Header "Build"
Push-Location $AppDir
try {
    & dotnet build -c Release --nologo 2>&1 | ForEach-Object { Write-Host "  $_" }
    Write-Ok "Build succeeded"
} catch {
    Write-Fail "Build failed. See output above."
    Pop-Location; exit 1
} finally { Pop-Location }

# ── 5. Hardware test ─────────────────────────────────────────────────────────
Write-Header "Hardware Test"
Push-Location $AppDir
try {
    & dotnet run -c Release --no-build -- --hardware-test 2>&1 | ForEach-Object { Write-Host "  $_" }
    Write-Ok "Hardware test complete"
} catch {
    Write-Warn "Hardware test could not run. Check the output above."
} finally { Pop-Location }

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Header "Setup Complete"
Write-Host @"

To start the clocking station:
  cd "$AppDir"
  dotnet run -c Release

Simulate mode (no hardware needed):
  dotnet run -c Release -- --simulate

Re-run hardware test:
  dotnet run -c Release -- --hardware-test

"@ -ForegroundColor White
