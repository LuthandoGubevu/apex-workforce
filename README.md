# Apex Workforce

Biometric time & attendance system for South African Breweries (SAB, AB InBev).

Employees clock in/out at site entry points using a ZKTeco ZK9500 fingerprint
reader. The same scan controls the turnstile gate via a USB relay.

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │          Firebase (africa-south1)         │
                    │                                          │
  ┌───────────┐     │  ┌──────────┐  ┌───────────┐           │
  │  Web app  │────►│  │Firestore │  │  Auth     │           │
  │ (React 18)│     │  │          │  │ (email/pw)│           │
  └───────────┘     │  └────┬─────┘  └───────────┘           │
                    │       │  ┌──────────────────┐           │
  ┌───────────┐     │       │  │ Cloud Functions  │           │
  │ Station PC│────►│       │  │ encryptTemplate  │           │
  │ (.NET 8)  │     │       │  │ deleteTemplates  │           │
  └─────┬─────┘     │       │  │ onEmployeeWrite  │           │
        │           │       └──┴──────────────────┘           │
  ┌─────▼─────┐     └──────────────────────────────────────────┘
  │ ZK9500    │
  │ reader +  │     ┌──────────────────────────────────────────┐
  │ HID relay │     │             Shared (TypeScript)           │
  └───────────┘     │  types · checkAccess · getClockDirection  │
                    │  computeDailyAttendance · test vectors    │
                    └──────────────────────────────────────────┘
```

---

## Repository layout

```
apex-workforce/
├── shared/        TypeScript types, business rules, JSON test vectors
├── web/           React 18 + Vite + Tailwind — web admin app
├── functions/     Firebase Cloud Functions (TypeScript)
├── station/       .NET 8 + Avalonia — clocking-station PC app
│   ├── Station.App/
│   └── Station.Tests/
├── rules/         Firestore security rules + Vitest tests
└── docs/
    ├── deployment-guide.md
    └── site-setup-guide.md
```

---

## Milestones

| # | Name | Status |
|---|------|--------|
| 1 | Foundation — types, rules, web scaffold, auth, Employees + Sites pages | ✅ Done |
| 2 | Attendance & Reports — timesheets, exports, On Site Now, corrections | ✅ Done |
| 3 | Enrolment & Biometric consent — POPIA flow, Cloud Functions, template encryption | ✅ Done |
| 4 | Clocking Station PC — .NET 8 + Avalonia shell, offline queue, hardware interfaces | ✅ Done |
| 5 | Hardware Integration — ZKTeco ZK9500 SDK, HID/serial relay, `--hardware-test` mode | ✅ Done |
| 6 | Hardening & Docs — E2E tests, security rules tests, .NET xUnit, deployment docs | ✅ Done |

---

## Quick start

### Web app (dev)

```bash
npm install
npm run dev
# opens http://localhost:5173
```

### Firestore rules tests

```bash
# Terminal 1 — start emulator
firebase emulators:start --only firestore

# Terminal 2 — run tests
cd rules && npm test
```

### Station PC app (simulate)

```bash
cd station
dotnet run --project Station.App -- --simulate
```

### Station PC app (.NET unit tests)

```bash
cd station
dotnet test Station.Tests/Station.Tests.csproj
```

---

## Key business rules

1. **Timezone:** Africa/Johannesburg (UTC+2, no DST).
2. **Accepted scan:** status `active` AND today within [startDate, endDate] AND employee's access group covers this station.
3. **Denial reasons (verbatim):** `Fingerprint not recognised` · `Employee suspended` · `Employee no longer active` · `Access ended DD Mon YYYY` · `Access starts DD Mon YYYY` · `No access to this entry` · `Not registered at this site`.
4. **Gate:** relay pulse 500 ms on accepted; none on denied.
5. **Direction on BOTH station:** last IN → next OUT; last OUT or none → IN.
6. **Attendance:** last OUT − first IN. IN with no OUT = zero hours until HR correction.

Business rules are implemented in TypeScript (`shared/src/rules/`) and mirrored in C# (`station/Station.App/Rules/`). Both are driven by the same JSON test vectors.

---

## POPIA compliance

- Templates stored encrypted (AES-256-GCM); raw image buffers zeroed after extraction.
- Biometric consent recorded (date + staff member) before enrolment.
- Templates auto-deleted on employee termination (`onEmployeeWrite` trigger).
- SA ID/passport fields restricted to Admin/HR in Firestore rules.
- Retention period configurable (default 3 years, SA Labour Relations Act).

---

## Branding

| Token | Value |
|-------|-------|
| Primary colour | `#0B5D52` |
| Background | `#FAF9F5` |

---

## Documentation

- [Deployment guide](docs/deployment-guide.md) — Firebase setup, Cloud Functions, Hosting, production checklist.
- [Site setup guide](docs/site-setup-guide.md) — Hardware wiring, turnstile diagram, enrolment walkthrough.
