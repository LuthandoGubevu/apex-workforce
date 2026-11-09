# Apex Workforce — Site Setup Guide

This guide walks a site administrator through adding a new site, wiring the
hardware, enrolling employees, and verifying the first scan.

---

## Overview

Each site has:
- One or more **turnstiles** fitted with a ZKTeco ZK9500 fingerprint reader.
- A **relay** (HID USB or CH340 serial) that pulses to open the turnstile.
- A **clocking-station PC** running the Apex Station app.

```
                       ┌──────────────────────────────────┐
                       │        Clocking-Station PC        │
                       │                                   │
  ┌──────────────┐     │  ┌─────────────┐  ┌───────────┐  │
  │ ZK9500       │USB  │  │ ZkFingerprint│  │ LocalDB   │  │
  │ fingerprint  │────►│  │ Reader      │  │ (SQLite)  │  │
  │ reader       │     │  └──────┬──────┘  └─────┬─────┘  │
  └──────────────┘     │         │  ClockingService│        │
                       │         └────────┬────────┘        │
  ┌──────────────┐     │  ┌──────▼──────┐              │
  │ HID/Serial   │USB  │  │ Turnstile   │              │
  │ relay module │◄────│  │ Relay       │              │
  └──────┬───────┘     │  └─────────────┘              │
         │             │                                   │
  ┌──────▼───────┐     │         ▲ Firestore REST sync     │
  │  Turnstile   │     │         │ every 15 s               │
  │  gate        │     └─────────┼─────────────────────────┘
  └──────────────┘               │
                        ┌────────▼────────┐
                        │   Firebase       │
                        │   Firestore      │
                        │  africa-south1   │
                        └─────────────────┘
```

---

## Part 1 — Web admin: create the site

1. Log in to the web app as **Admin**.
2. Navigate to **Sites → Add site**.
3. Fill in:
   - **Site name** (e.g. "SAB Johannesburg Brewery")
   - **Site code** (short identifier, e.g. `JNB01`)
   - **Address** (optional)
4. Click **Save**. The site document appears in Firestore under `sites/{siteId}`.

---

## Part 2 — Web admin: create access groups

Access groups define which employees may pass through which turnstiles.

1. Navigate to **Access Groups → Add group**.
2. Name the group (e.g. "All Employees — JNB01").
3. Select the site.
4. Add the stations (turnstiles) that members of this group may use.
5. Click **Save**.

Assign employees to access groups via **Employees → (employee) → Access Groups**.

---

## Part 3 — Web admin: add the station

1. Navigate to **Sites → (your site) → Stations → Add station**.
2. Fill in:
   - **Station name** (e.g. "Main Gate")
   - **Direction**: `In`, `Out`, or `Both`
   - **Access groups**: select the groups that may use this station
3. Click **Save**.  
   Note the **Station ID** — you will need it for the PC app config.

---

## Part 4 — Hardware wiring

### 4.1 Components

| Part | Model | Purpose |
|------|-------|---------|
| Fingerprint reader | ZKTeco ZK9500 | Biometric capture |
| USB relay (option A) | HID relay, VID 0x16C0 / PID 0x05DF | Gate control |
| Serial relay (option B) | CH340 USB-serial relay | Gate control |
| PC | Windows 10/11 x64 | Runs station app |

### 4.2 Turnstile wiring diagram

```
                12 V DC supply
                     │
            ┌────────┴────────┐
            │   Relay module  │
            │  NO  COM  NC    │
            │   │   │   │     │
            └───┼───┼───┼─────┘
                │   │   │
         ┌──────┘   │   └──────────┐
         │          │              │
  ┌──────▼──┐  ┌────▼────┐  ┌─────▼──────┐
  │ Turnstile│  │ Common  │  │ Turnstile  │
  │ OPEN in  │  │ 12 V    │  │ LOCK in   │
  │ (NO)     │  │ return  │  │ (NC)       │
  └──────────┘  └─────────┘  └────────────┘

  NO = Normally Open  → gate opens when relay fires (use this)
  NC = Normally Closed → gate opens when relay releases
```

**Recommended wiring**: connect the turnstile's unlock terminal to `NO` and
`COM`. The relay fires for 500 ms (configurable) on each accepted scan.

### 4.3 USB connections

1. Connect the ZK9500 to the PC via USB.  
   Driver: install `ZKFPModule` from the ZKTeco developer package.  
   Confirm the reader appears in Device Manager as a ZKFinger device.

2. Connect the relay module to the PC via USB.
   - **HID relay**: no driver needed; appears as a HID device.
   - **CH340 serial relay**: install CH340 driver from manufacturer; note the COM port (e.g. `COM3`).

---

## Part 5 — Clocking-station PC app installation

### 5.1 Prerequisites

- Windows 10 or 11 (x64)
- .NET 8 Desktop Runtime (or use the self-contained publish)
- `libzkfp.dll` (64-bit) placed in the same folder as `Station.App.exe`

### 5.2 Deploy the app

Copy the publish output to the PC (e.g. to `C:\ApexStation\`):

```
C:\ApexStation\
├── Station.App.exe
├── libzkfp.dll          ← ZKTeco native library (64-bit)
├── appsettings.json
└── ...
```

### 5.3 Run the setup wizard

```powershell
cd C:\ApexStation
.\setup.ps1
```

The wizard will:
1. Verify .NET 8 is installed.
2. Verify `libzkfp.dll` is present.
3. Ask for:
   - Firebase project ID
   - Firebase API key
   - Station ID (from Part 3 above)
   - Station name
   - Site ID
   - Relay type (`hid` or `serial`)
   - Serial port (if serial relay, e.g. `COM3`)
   - Relay pulse duration (default 500 ms)
4. Write `appsettings.json`.
5. Optionally run `--hardware-test` to verify reader + relay.

### 5.4 Manual `appsettings.json`

If the wizard isn't available, create `appsettings.json` manually:

```json
{
  "Station": {
    "StationId":   "station_main_gate",
    "StationName": "Main Gate",
    "SiteId":      "site_jnb01"
  },
  "Firebase": {
    "ProjectId": "apex-workforce",
    "ApiKey":    "AIzaSy…"
  },
  "Hardware": {
    "RelayType":            "hid",
    "SerialPort":           "",
    "RelayPulseDurationMs": 500
  }
}
```

### 5.5 Hardware test

```powershell
Station.App.exe --hardware-test
```

This runs a guided sequence:
1. Initialises the ZK9500 reader — confirms green LED.
2. Fires the relay for 500 ms — the gate should click open and close.
3. Captures one fingerprint scan and prints the quality score.

Pass = all three steps succeed. If any step fails, see Troubleshooting below.

---

## Part 6 — Simulation mode (no hardware)

For office testing without physical hardware:

```powershell
Station.App.exe --simulate
```

Simulated reader returns a random match every 3 seconds with a fixed
employee ID. Useful for verifying the UI, Firestore sync, and business rules
without touching real hardware.

---

## Part 7 — Employee enrolment

### 7.1 Prerequisites

- Employee record created in the web app.
- Employee assigned to an access group that includes this station.
- Site HR or Admin present to record biometric consent.

### 7.2 Consent

POPIA requires written (or recorded digital) consent before capturing a
biometric template.

In the web app:
1. **Enrolment → Find employee**.
2. Tick **"I confirm the employee has given their informed biometric consent"**.
3. Click **Request enrolment**.

An enrolment request document is created in Firestore.

### 7.3 Capture at the station

The station app polls for pending enrolment requests.

1. The employee places their finger on the reader — prompted on screen.
2. Three captures are taken and merged into a single template.
3. The raw captures are **zeroed from memory immediately** after merging (POPIA).
4. The merged template is stored locally in SQLite.
5. The station calls `encryptAndStoreTemplate` (Cloud Function) which:
   - Encrypts the template (AES-256-GCM).
   - Stores the encrypted copy in Firestore `encryptedTemplates/{empId}/devices/{stationId}`.
   - Marks the employee `fingerprintEnrolled = true`.

### 7.4 Verify enrolment

In the web app: **Employees → (employee)** — the **Fingerprint enrolled** badge
should appear green.

---

## Part 8 — First live scan

1. Ensure the station app is running (or launch `Station.App.exe`).
2. Employee approaches and places finger on reader.
3. Station identifies the template, checks access rules, fires relay if accepted.
4. Scan appears in **Firestore → clockEvents** within seconds.
5. Attendance is visible in the web app under **Attendance → Today**.

---

## Part 9 — Ongoing operations

### Add a new employee

1. Web app → **Employees → Add employee**.
2. Assign to access group.
3. Enrol fingerprint (Part 7).

### Remove an employee

1. Web app → **Employees → (employee) → Terminate**.
2. Status is set to `terminated`.
3. `onEmployeeWrite` Cloud Function automatically deletes all encrypted templates
   from Firestore.
4. The station app clears the local template on next sync (within 15 s).

### Corrections

If an employee clocked in but not out (missed clock-out):

1. Web app → **Attendance → (day) → Add correction**.
2. HR enters the actual clock-out time.
3. The correction event is flagged `isCorrection = true` in Firestore.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Reader not detected | `libzkfp.dll` missing or wrong bitness | Copy 64-bit DLL; check Device Manager |
| "Fingerprint not recognised" always | Templates not loaded from SQLite | Check sync log; verify station is online |
| Relay doesn't fire | Wrong VID/PID or COM port | Re-run `--hardware-test`; check Device Manager |
| Gate stays open | NC wired instead of NO | Rewire to NO+COM terminals |
| Sync stops after restart | Firestore API key wrong | Re-run setup wizard; check `appsettings.json` |
| Enrolment quality never passes | Dirty platen or incorrect pressure | Clean reader with microfibre cloth; guide employee to press firmly and flatly |
