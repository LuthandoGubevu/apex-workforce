# Apex Workforce — Biometric Time & Attendance for SAB

## Scope
Production T&A system for South African Breweries (SAB, AB InBev).  
Employees clock in/out at site entry points with a ZKTeco ZK9500 fingerprint reader.  
The same scan controls gate access via a USB relay.  

**Out of scope:** payroll calculation, leave management, shift rostering, visitor management,
facial recognition, card readers, mobile app, live HR/payroll system integration.

## Defaults chosen for the 11 open questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Sites / stations / employees | Any number configurable. One reader per turnstile, direction = BOTH (alternates by last event). |
| 2 | Shift times | **No** – daily attendance only (first IN, last OUT, hours on site). |
| 3 | Daily hours | **Last OUT − first IN.** IN with no OUT = "missing clock-out", zero hours until corrected. |
| 4 | Cross-site clocking | **Yes** – controlled by access groups. |
| 5 | Contractors | Added by HR or Admin. End date **required** for Contractor and Temporary. |
| 6 | Infrastructure | Firebase + Google Cloud, **africa-south1** region. No Azure / SSO. |
| 7 | HR/payroll formats | CSV or Excel import; CSV payroll export (columns: employeeNumber, fullName, department, date, hoursOnSite, status). |
| 8 | Biometric decline | Flagged `biometricDeclined = true`. Cannot clock in; HR must resolve. No PIN/card fallback. |
| 9 | Retention | Clock events and attendance kept **3 years** (SA Labour Relations Act). Configurable in settings. |
| 10 | Branding | Neutral "Apex Workforce" product brand. Primary `#0B5D52`, background `#FAF9F5`. |
| 11 | Pilot | Configured by admin when first site is added. |

## Repository layout

```
apex-workforce/
├── shared/        TypeScript types, pure business-rule functions, JSON test vectors
├── web/           React 18 + Vite + TypeScript + Tailwind — web admin app
├── functions/     Firebase Cloud Functions (TypeScript)  [Milestone 3]
├── station/       .NET 8 + Avalonia — clocking-station PC app  [Milestone 4]
├── rules/         Firestore security rules + emulator tests
└── docs/          Deployment guide, site-setup guide, hardware wiring  [Milestone 6]
```

## Architecture
- **Backend:** Firebase Auth + Cloud Firestore (africa-south1). All writes through one `actions` module that wraps each write in a batch and appends an audit entry.
- **Clocking station PC:** .NET 8 + Avalonia; hardware behind `IFingerprintReader` / `ITurnstileRelay` interfaces; Firestore REST sync; offline-first with local SQLite.
- **Tests:** Vitest for `shared/` rules; `@firebase/rules-unit-testing` for Firestore rules; xUnit for `station/`.

## Business rules (each has unit tests)

1. **Timezone:** Africa/Johannesburg. All dates are calendar dates in that zone.
2. **Accepted scan:** status = `active` AND today within [startDate, endDate] AND employee is in an access group that includes this station (cross-site allowed if the group covers it).
3. **Denied reasons (verbatim):**
   - `Fingerprint not recognised`
   - `Employee suspended`
   - `Employee no longer active`
   - `Access ended <DD Mon YYYY>`
   - `Access starts <DD Mon YYYY>`
   - `No access to this entry`
   - `Not registered at this site`
4. **Gate:** one relay pulse (500 ms, configurable) on ACCEPTED; none on DENIED.
5. **Direction on BOTH station:** last event was IN → next is OUT; last was OUT or none → IN.
6. **Missing clock-out:** IN with no OUT by end of day = zero hours until HR correction adds the OUT.
7. **Night shift:** counts towards the day the IN event occurred.
8. **Rules run in two places** (web TypeScript + station C#). Both must pass the same JSON test vectors.

## POPIA (non-negotiable)
- Store templates only; wipe raw image buffers immediately after extraction.
- Encrypt templates at rest (AES-256-GCM) and in transit (HTTPS only).
- Record biometric consent (date + staff member) before enrolment is allowed.
- On employee removal: delete templates everywhere including devices. Attendance records retained.
- Restricted fields (SA ID/passport): readable by Admin/HR only. Never in logs or audit trail.
- Retention period configurable (default 3 years).

## Roles

| Role | Access |
|------|--------|
| admin | All sites, all settings, role management |
| hr | Their site: employees, enrolment, corrections, reports |
| supervisor | Read-only attendance for their department |
| device | Clocking-station PC only; cannot log in to web app |

## Milestones

| # | Name | Contents |
|---|------|----------|
| 1 | Foundation | Shared types + rules + tests, Firebase config, Firestore rules, web scaffold + auth + Employees + Sites pages |
| 2 | Attendance & Reports | Attendance computation, timesheets, exports (Excel/PDF/CSV), On Site Now, corrections |
| 3 | Enrolment & Biometric consent | Enrolment request flow, Cloud Functions, template encryption |
| 4 | Clocking Station PC | .NET 8 + Avalonia shell, simulation mode, offline queue, hardware interfaces |
| 5 | Hardware Integration | ZKTeco SDK, relay, --hardware-test mode, guided setup script |
| 6 | Hardening & Docs | E2E test, security rules tests, .NET tests, deployment guide, site-setup guide |

## Git workflow
Feature branch → `staging` → (user confirms) → `main`. Never push directly to `main`.
