# Apex Workforce — Deployment Guide

This guide covers the full production deployment of the Apex Workforce system:
Firebase (Firestore + Auth + Cloud Functions), the React web admin app, and
the clocking-station PC app.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 LTS | https://nodejs.org |
| npm | 10 | bundled with Node 20 |
| Firebase CLI | 13 | `npm install -g firebase-tools` |
| .NET SDK | 8.0 | https://dotnet.microsoft.com/download |
| Git | 2.40 | https://git-scm.com |

---

## 1 — Firebase project setup

### 1.1 Create the project

1. Open [Firebase console](https://console.firebase.google.com).
2. Click **Add project** → name it `apex-workforce`.
3. Enable Google Analytics (optional; required if `measurementId` is used).
4. Select **Blaze** (pay-as-you-go) plan — Cloud Functions require it.

### 1.2 Enable Firestore

1. In the console sidebar: **Build → Firestore Database → Create database**.
2. Choose **Production mode**.
3. Region: **africa-south1** (Johannesburg) — this cannot be changed later.

### 1.3 Enable Authentication

1. **Build → Authentication → Get started**.
2. Enable **Email/Password** sign-in provider.
3. No other providers are needed.

### 1.4 Set the region for Cloud Functions

Cloud Functions v2 defaults to `us-central1`. Apex uses `africa-south1`.
Confirm in `functions/src/index.ts` that each function is set to that region.

---

## 2 — Local environment setup

```bash
git clone https://github.com/<org>/apex-workforce.git
cd apex-workforce
npm install          # installs workspaces: web + rules
cd functions && npm install && cd ..
```

### 2.1 Web environment variables

```bash
cp web/.env.example web/.env.local
```

Edit `web/.env.local` with the values from **Firebase console → Project settings → Your apps → SDK setup and configuration**:

```
VITE_FIREBASE_API_KEY=AIzaSy…
VITE_FIREBASE_AUTH_DOMAIN=apex-workforce.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=apex-workforce
VITE_FIREBASE_STORAGE_BUCKET=apex-workforce.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1060412763732
VITE_FIREBASE_APP_ID=1:1060412763732:web:…
VITE_FIREBASE_MEASUREMENT_ID=G-…
```

> `web/.env.local` is gitignored and must never be committed.

---

## 3 — Firestore security rules

Deploy the rules from the repo root:

```bash
firebase deploy --only firestore:rules
```

Verify deployment:

1. Firebase console → **Firestore → Rules**.
2. Check the timestamp matches your deploy time.
3. Run the rules test suite to confirm correctness:

```bash
cd rules
npm test
```

All tests must pass before proceeding.

---

## 4 — Cloud Functions

### 4.1 Set the template encryption key

The encryption key must be a 64-character hex string (32 raw bytes → AES-256):

```bash
# Generate a fresh key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it as a Firebase Secret:

```bash
firebase functions:secrets:set TEMPLATE_ENCRYPTION_KEY
# Paste the 64-char hex string when prompted.
```

Confirm it is set:

```bash
firebase functions:secrets:access TEMPLATE_ENCRYPTION_KEY
```

### 4.2 Build and deploy

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

Expected output: three functions deployed:
- `encryptAndStoreTemplate`
- `deleteEmployeeTemplates`
- `onEmployeeWrite`

### 4.3 Verify function deployment

```bash
firebase functions:list
```

Each function should show region `africa-south1` and status `ACTIVE`.

---

## 5 — Web admin app

### 5.1 Build for production

```bash
cd web
npm run build
```

Output is in `web/dist/`.

### 5.2 Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

The app will be available at `https://apex-workforce.web.app`.

### 5.3 Custom domain (optional)

1. Firebase console → **Hosting → Add custom domain**.
2. Follow the DNS verification steps.
3. SSL certificate is provisioned automatically.

---

## 6 — First admin account

Cloud Function `onEmployeeWrite` and all security rules require at least one
admin in `staffUsers`. Bootstrap it via the Firebase console:

1. **Authentication → Users → Add user** — create `admin@your-org.com`.
2. Copy the UID.
3. **Firestore → staffUsers → Add document**:
   - Document ID: the UID from step 2.
   - Fields:
     ```
     role     : "admin"
     siteId   : ""          (admin sees all sites)
     createdAt: (timestamp)
     ```

The admin can now log in to the web app and begin site setup.

---

## 7 — Firestore indexes

Apex uses composite queries for attendance reports. Deploy the index definitions:

```bash
firebase deploy --only firestore:indexes
```

If `firestore.indexes.json` doesn't exist yet, the console will prompt you
with the required indexes the first time a query runs. Add them and redeploy.

---

## 8 — Emulator suite (CI / local testing)

The rules tests and E2E tests require the Firestore emulator.

### 8.1 Install emulators

```bash
firebase setup:emulators:firestore
```

### 8.2 Run tests with emulators

```bash
firebase emulators:exec --only firestore "cd rules && npm test"
```

Or in two terminals:

```bash
# Terminal 1
firebase emulators:start --only firestore

# Terminal 2
cd rules && npm test
```

---

## 9 — Clocking-station PC app

The station app is a .NET 8 self-contained executable. Build and deploy it
separately per the [Site Setup Guide](site-setup-guide.md).

For CI builds:

```bash
cd station
dotnet restore
dotnet build --configuration Release
dotnet test station/Station.Tests/Station.Tests.csproj --configuration Release
dotnet publish Station.App/Station.App.csproj \
  -c Release -r win-x64 --self-contained true \
  -o publish/win-x64
```

The publish directory is what gets deployed to each clocking-station PC.

---

## 10 — Environment promotion (staging → main)

Per `CLAUDE.md`, all changes must be tested on `staging` before being promoted
to `main` and therefore to production.

```bash
# Merge staging → main only after user confirmation
git checkout main
git merge --no-ff staging
git push origin main
```

Then re-deploy:

```bash
firebase deploy
```

---

## 11 — Monitoring and alerts

### 11.1 Cloud Functions logs

```bash
firebase functions:log --only encryptAndStoreTemplate
```

Or in the console: **Functions → Logs**.

### 11.2 Firestore usage

**Firestore → Usage** tab shows reads/writes/deletes per day.

### 11.3 Set up budget alerts

1. Google Cloud console → **Billing → Budgets & alerts**.
2. Create a budget for the `apex-workforce` project.
3. Set alert thresholds at 50 %, 90 %, 100 %.

---

## 12 — Data retention

The default retention period is 3 years (SA Labour Relations Act requirement).
It is configurable in **Firestore → settings → retentionYears**.

Deletion of aged records must be triggered manually or via a scheduled Cloud
Function (not included in M6 scope; add as a maintenance function).

---

## 13 — POPIA checklist

Before go-live confirm:

- [ ] `TEMPLATE_ENCRYPTION_KEY` secret set and not stored anywhere else.
- [ ] No raw fingerprint images stored (station zeroes buffers after extraction).
- [ ] `biometricConsent` field recorded on each enrolled employee.
- [ ] `idNumber` field restricted to Admin/HR in Firestore rules.
- [ ] `onEmployeeWrite` trigger auto-deletes templates on termination.
- [ ] Firestore rules deployed and tested.
- [ ] HTTPS enforced everywhere (Firebase Hosting + Functions use HTTPS by default).
- [ ] Retention period set to 3 years in settings.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Functions deploy fails with "UNAUTHENTICATED" | Not logged in | `firebase login` |
| `TEMPLATE_ENCRYPTION_KEY` not found at runtime | Secret not granted to function | Re-deploy functions after setting secret |
| Firestore writes fail in production | Rules too restrictive | Check `staffUsers` doc for user UID, re-deploy rules |
| Station app can't reach Firestore | Outbound HTTPS blocked on PC | Allow `*.googleapis.com` on corporate firewall |
| Emulator tests fail on port 8080 | Port in use | `firebase emulators:start --only firestore --port 8081` and update `vitest.config.ts` |
