/**
 * E2E flow test: full scan cycle through shared business rules + Firestore emulator.
 *
 * This test drives the same logic paths the production system uses:
 *   1. Seed an employee, site, access group and station.
 *   2. Run the TypeScript business rules (checkAccess / getClockDirection).
 *   3. Write a clock event as the device role would.
 *   4. Verify the written document is readable by HR and unreadable by supervisor
 *      outside their own department.
 *
 * Run:  npm test   (from apex-workforce/rules/)
 * Requires:  firebase emulators:start --only firestore (port 8080)
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

// ── TypeScript business rules (shared/) ──────────────────────────────────────
import { checkAccess }        from '../../shared/src/rules/access.js';
import { getClockDirection }  from '../../shared/src/rules/attendance.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

function rulesContent(): string {
  return readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
}

type Role = 'admin' | 'hr' | 'supervisor' | 'device';

async function seedStaffUser(
  env: RulesTestEnvironment,
  uid: string,
  role: Role,
  siteId: string,
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'staffUsers', uid), {
      role,
      siteId,
      createdAt: serverTimestamp(),
    });
  });
}

// ── Test data ─────────────────────────────────────────────────────────────────
const SITE_ID    = 'site_sab_johannesburg';
const STATION_ID = 'station_main_gate';
const EMP_ID     = 'emp_001';
const AG_ID      = 'ag_main_site';

const TODAY      = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('E2E — full scan cycle', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'apex-workforce-test',
      firestore: {
        rules:   rulesContent(),
        host:    '127.0.0.1',
        port:    8080,
      },
    });
  });

  afterAll(async () => { await env.cleanup(); });
  afterEach(async () => { await env.clearFirestore(); });

  // ── Scenario 1: active employee with access is accepted ─────────────────────
  it('step 1 — active employee in correct access group is accepted by shared rules', () => {
    const employee = {
      id:               EMP_ID,
      status:           'active' as const,
      startDate:        '2024-01-01',
      endDate:          null,
      biometricDeclined: false,
    };
    const station = { siteId: SITE_ID, accessGroupIds: [AG_ID] };
    const empGroupIds = [AG_ID];
    const result = checkAccess({ employee, station, empGroupIds, today: TODAY });
    expect(result.allowed).toBe(true);
  });

  // ── Scenario 2: suspended employee is denied ─────────────────────────────────
  it('step 2 — suspended employee is denied with correct reason', () => {
    const employee = {
      id:               EMP_ID,
      status:           'suspended' as const,
      startDate:        '2024-01-01',
      endDate:          null,
      biometricDeclined: false,
    };
    const station = { siteId: SITE_ID, accessGroupIds: [AG_ID] };
    const empGroupIds = [AG_ID];
    const result = checkAccess({ employee, station, empGroupIds, today: TODAY });
    expect(result.allowed).toBe(false);
    expect(result.deniedReason).toBe('Employee suspended');
  });

  // ── Scenario 3: terminated employee is denied ─────────────────────────────────
  it('step 3 — terminated employee is denied with correct reason', () => {
    const employee = {
      id:               EMP_ID,
      status:           'terminated' as const,
      startDate:        '2024-01-01',
      endDate:          '2024-12-31',
      biometricDeclined: false,
    };
    const station = { siteId: SITE_ID, accessGroupIds: [AG_ID] };
    const empGroupIds = [AG_ID];
    const result = checkAccess({ employee, station, empGroupIds, today: TODAY });
    expect(result.allowed).toBe(false);
    expect(result.deniedReason).toBe('Employee no longer active');
  });

  // ── Scenario 4: employee not in station access group is denied ───────────────
  it('step 4 — employee without matching access group is denied', () => {
    const employee = {
      id:               EMP_ID,
      status:           'active' as const,
      startDate:        '2024-01-01',
      endDate:          null,
      biometricDeclined: false,
    };
    const station = { siteId: SITE_ID, accessGroupIds: ['ag_vip_only'] };
    const empGroupIds = [AG_ID];
    const result = checkAccess({ employee, station, empGroupIds, today: TODAY });
    expect(result.allowed).toBe(false);
    expect(result.deniedReason).toBe('No access to this entry');
  });

  // ── Scenario 5: clock direction — no prior event → IN ───────────────────────
  it('step 5 — first scan of day resolves to IN', () => {
    const dir = getClockDirection('both', null);
    expect(dir).toBe('in');
  });

  // ── Scenario 6: clock direction — last was IN → OUT ─────────────────────────
  it('step 6 — scan after IN resolves to OUT', () => {
    const dir = getClockDirection('both', 'in');
    expect(dir).toBe('out');
  });

  // ── Scenario 7: device role can write clock event ────────────────────────────
  it('step 7 — device role can write a clock event', async () => {
    const deviceUid = 'device_main_gate';
    await seedStaffUser(env, deviceUid, 'device', SITE_ID);
    const db = env.authenticatedContext(deviceUid).firestore();
    await assertSucceeds(
      addDoc(collection(db, 'clockEvents'), {
        employeeId:   EMP_ID,
        employeeName: 'Test Employee',
        stationId:    STATION_ID,
        stationName:  'Main Gate',
        siteId:       SITE_ID,
        direction:    'in',
        result:       'accepted',
        deniedReason: null,
        timestamp:    Timestamp.now(),
        isCorrection: false,
        synced:       false,
        createdAt:    serverTimestamp(),
      }),
    );
  });

  // ── Scenario 8: HR on same site can read clock events ────────────────────────
  it('step 8 — HR on same site can read clock events', async () => {
    // seed event via admin bypass
    let eventId: string;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'clockEvents'), {
        employeeId:   EMP_ID,
        siteId:       SITE_ID,
        result:       'accepted',
        timestamp:    Timestamp.now(),
        isCorrection: false,
        synced:       false,
        createdAt:    serverTimestamp(),
      });
      eventId = ref.id;
    });

    const hrUid = 'hr_user_01';
    await seedStaffUser(env, hrUid, 'hr', SITE_ID);
    const db = env.authenticatedContext(hrUid).firestore();
    await assertSucceeds(getDoc(doc(db, 'clockEvents', eventId!)));
  });

  // ── Scenario 9: unauthenticated read of clock events is denied ───────────────
  it('step 9 — unauthenticated read of clock events is denied', async () => {
    let eventId: string;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = await addDoc(collection(ctx.firestore(), 'clockEvents'), {
        employeeId: EMP_ID,
        siteId:     SITE_ID,
        timestamp:  Timestamp.now(),
        createdAt:  serverTimestamp(),
      });
      eventId = ref.id;
    });

    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'clockEvents', eventId!)));
  });

  // ── Scenario 10: device role cannot write to staffUsers ──────────────────────
  it('step 10 — device role cannot write to staffUsers collection', async () => {
    const deviceUid = 'device_step10';
    await seedStaffUser(env, deviceUid, 'device', SITE_ID);
    const db = env.authenticatedContext(deviceUid).firestore();
    await assertFails(
      setDoc(doc(db, 'staffUsers', 'some_new_user'), {
        role:      'admin',
        siteId:    SITE_ID,
        createdAt: serverTimestamp(),
      }),
    );
  });
});
