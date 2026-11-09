#!/usr/bin/env bash
set -e
echo "=== Apex Workforce Station Setup (Linux/Mac) ==="
if ! command -v dotnet &>/dev/null; then
  echo "ERROR: dotnet not found. Install .NET 8 from https://dotnet.microsoft.com/download/dotnet/8.0"
  exit 1
fi
echo "dotnet $(dotnet --version)"
echo ""
echo "NOTE: ZKTeco ZK9500 hardware (libzkfp.dll) only works on Windows."
echo "      On Linux/Mac, always use --simulate for development."
echo ""
echo "Steps:"
echo "  1. Copy station/Station.App/appsettings.example.json -> appsettings.json"
echo "  2. Fill in Firebase credentials, station ID, site ID"
echo "  3. Set Hardware.Simulate to true"
echo ""
echo "Run (simulate):  cd station && dotnet run --project Station.App -- --simulate"
echo "Run (hardware):  cd station && dotnet run --project Station.App"
echo "Hardware test:   cd station && dotnet run --project Station.App -- --hardware-test"
