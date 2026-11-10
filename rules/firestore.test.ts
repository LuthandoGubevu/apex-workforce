// Firestore Security Rules Tests
// Prerequisites: firebase emulators:start --only firestore
// Then in another terminal: cd rules && npm test

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

let env: RulesTestEnvironment;

async function seedStaffUser(
  uid: string,
  role: string,
  siteId?: string,
) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'staffUsers', uid), {
      role,
      siteId: siteId ?? null,
      active: true,
      email: `${uid}@test.com`,
      fullName: uid,
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'apex-test',
    firestore: {
      rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8'),
      host:  '127.0.0.1',
      port:  8080,
    },
  });
});

afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// ── Sites ─────────────────────────────────────────────────────────────────────
describe('sites', () => {
  const siteDoc = { name: 'JNB Brewery', code: 'JNB', city: 'Johannesburg' };

  it('admin can create a site', async () => {
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'sites', 's1'), siteDoc));
  });

  it('admin can update a site', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'sites', 's1'), siteDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'sites', 's1'), { city: 'JHB' }));
  });

  it('admin can delete a site', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'sites', 's1'), siteDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'sites', 's1')));
  });

  it('HR can read a site', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'sites', 's1'), siteDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'sites', 's1')));
  });

  it('supervisor can read a site', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'sites', 's1'), siteDoc));
    await seedStaffUser('sup1', 'supervisor', 's1');
    const ctx = env.authenticatedContext('sup1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'sites', 's1')));
  });

  it('unauthenticated cannot read sites', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'sites', 's1'), siteDoc));
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'sites', 's1')));
  });

  it('HR cannot delete a site', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'sites', 's1'), siteDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'sites', 's1')));
  });
});

// ── Employees ────────────────────────────────────────────────────────────────
describe('employees', () => {
  const empDoc = {
    fullName: 'Joe Dlamini', employeeNumber: 'EMP001', department: 'Brewing',
    siteId: 's1', status: 'active', fingerprintEnrolled: false,
    biometricDeclined: false, employmentType: 'permanent',
    startDate: '2024-01-01', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), createdBy: 'admin', updatedBy: 'admin',
  };

  it('HR can create an employee', async () => {
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'employees', 'e1'), empDoc));
  });

  it('HR can update an employee', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'employees', 'e1'), empDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'employees', 'e1'), { department: 'Logistics' }));
  });

  it('admin can delete an employee', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'employees', 'e1'), empDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'employees', 'e1')));
  });

  it('supervisor can read employees', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'employees', 'e1'), empDoc));
    await seedStaffUser('sup1', 'supervisor', 's1');
    const ctx = env.authenticatedContext('sup1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'employees', 'e1')));
    // NOTE: idNumber restriction is enforced at the application layer, not in rules
  });

  it('unauthenticated cannot read employees', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'employees', 'e1'), empDoc));
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'employees', 'e1')));
  });

  it('HR cannot delete an employee', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'employees', 'e1'), empDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'employees', 'e1')));
  });
});

// ── Clock events (add-only, immutable) ───────────────────────────────────────
describe('clockEvents', () => {
  const eventDoc = {
    employeeId: 'e1', employeeNumber: 'EMP001', employeeName: 'Joe',
    stationId: 'sta1', stationName: 'Main Gate', siteId: 's1',
    direction: 'IN', result: 'accepted', timestamp: new Date().toISOString(),
    isCorrection: false, createdAt: new Date().toISOString(),
  };

  it('signed-in user can create a clock event', async () => {
    await seedStaffUser('dev1', 'device');
    const ctx = env.authenticatedContext('dev1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'clockEvents', 'ev1'), eventDoc));
  });

  it('nobody can update a clock event', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'clockEvents', 'ev1'), eventDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertFails(updateDoc(doc(ctx.firestore(), 'clockEvents', 'ev1'), { direction: 'OUT' }));
  });

  it('nobody can delete a clock event', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'clockEvents', 'ev1'), eventDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'clockEvents', 'ev1')));
  });

  it('supervisor can read clock events', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'clockEvents', 'ev1'), eventDoc));
    await seedStaffUser('sup1', 'supervisor', 's1');
    const ctx = env.authenticatedContext('sup1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'clockEvents', 'ev1')));
  });

  it('unauthenticated cannot read clock events', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'clockEvents', 'ev1'), eventDoc));
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'clockEvents', 'ev1')));
  });
});

// ── Audit trail (add-only, immutable) ────────────────────────────────────────
describe('audit', () => {
  const auditDoc = {
    timestamp: new Date().toISOString(), userId: 'u1', userEmail: 'u1@test.com',
    action: 'create_employee', collection: 'employees', documentId: 'e1',
    before: null, after: null, note: null,
  };

  it('signed-in user can create an audit entry', async () => {
    await seedStaffUser('hr1', 'hr');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'audit', 'a1'), auditDoc));
  });

  it('admin can read audit entries', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'audit', 'a1'), auditDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'audit', 'a1')));
  });

  it('HR cannot read audit entries', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'audit', 'a1'), auditDoc));
    await seedStaffUser('hr1', 'hr');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(getDoc(doc(ctx.firestore(), 'audit', 'a1')));
  });

  it('nobody can update an audit entry', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'audit', 'a1'), auditDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertFails(updateDoc(doc(ctx.firestore(), 'audit', 'a1'), { note: 'tampered' }));
  });

  it('nobody can delete an audit entry', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'audit', 'a1'), auditDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'audit', 'a1')));
  });
});

// ── Enrolment requests ────────────────────────────────────────────────────────
describe('enrolmentRequests', () => {
  const reqDoc = {
    employeeId: 'e1', stationId: 'sta1', status: 'pending',
    requestedAt: new Date().toISOString(), requestedBy: 'hr1',
  };

  it('HR can create an enrolment request', async () => {
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'enrolmentRequests', 'r1'), reqDoc));
  });

  it('HR can update an enrolment request', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'enrolmentRequests', 'r1'), reqDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'enrolmentRequests', 'r1'), { status: 'cancelled' }));
  });

  it('HR can read enrolment requests', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'enrolmentRequests', 'r1'), reqDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'enrolmentRequests', 'r1')));
  });

  it('HR can delete an enrolment request', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'enrolmentRequests', 'r1'), reqDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'enrolmentRequests', 'r1')));
  });

  it('unauthenticated cannot read enrolment requests', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'enrolmentRequests', 'r1'), reqDoc));
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'enrolmentRequests', 'r1')));
  });
});

// ── Encrypted templates ───────────────────────────────────────────────────────
describe('encryptedTemplates', () => {
  const tplDoc = {
    iv: 'aabbcc', ciphertext: 'deadbeef', tag: '112233',
    stationId: 'sta1', employeeId: 'e1', enrolledAt: new Date().toISOString(),
  };

  it('device role can write an encrypted template', async () => {
    await seedStaffUser('dev1', 'device');
    const ctx = env.authenticatedContext('dev1');
    await assertSucceeds(
      setDoc(
        doc(ctx.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1'),
        tplDoc,
      ));
  });

  it('admin can read encrypted templates', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1'), tplDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1')));
  });

  it('HR cannot read encrypted templates', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1'), tplDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(
      getDoc(doc(ctx.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1')));
  });

  it('admin can delete encrypted templates', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1'), tplDoc));
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(
      deleteDoc(doc(ctx.firestore(), 'encryptedTemplates', 'e1', 'devices', 'sta1')));
  });
});

// ── Staff users ───────────────────────────────────────────────────────────────
describe('staffUsers', () => {
  const userDoc = {
    email: 'jane@sab.com', fullName: 'Jane Smith', role: 'hr',
    siteId: 's1', active: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'admin1',
  };

  it('admin can read any staff user', async () => {
    await seedStaffUser('admin1', 'admin');
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'staffUsers', 'hr1'), userDoc));
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'staffUsers', 'hr1')));
  });

  it('user can read their own record', async () => {
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'staffUsers', 'hr1')));
  });

  it('user cannot read another user record', async () => {
    await seedStaffUser('hr1', 'hr', 's1');
    await seedStaffUser('hr2', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(getDoc(doc(ctx.firestore(), 'staffUsers', 'hr2')));
  });

  it('admin can create a staff user', async () => {
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'staffUsers', 'newuser'), userDoc));
  });

  it('admin can update a staff user', async () => {
    await seedStaffUser('admin1', 'admin');
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'staffUsers', 'hr1'), userDoc));
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'staffUsers', 'hr1'), { active: false }));
  });

  it('HR cannot create another staff user', async () => {
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'staffUsers', 'newuser'), userDoc));
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────
describe('settings', () => {
  const settingsDoc = {
    relayPulseDurationMs: 500, fingerprintMatchThreshold: 70,
    clockCooldownMs: 2500, dataRetentionDays: 1095, timezone: 'Africa/Johannesburg',
  };

  it('admin can write settings', async () => {
    await seedStaffUser('admin1', 'admin');
    const ctx = env.authenticatedContext('admin1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'settings', 'global'), settingsDoc));
  });

  it('signed-in HR can read settings', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'settings', 'global'), settingsDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'settings', 'global')));
  });

  it('HR cannot write settings', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'settings', 'global'), settingsDoc));
    await seedStaffUser('hr1', 'hr', 's1');
    const ctx = env.authenticatedContext('hr1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'settings', 'global'), { relayPulseDurationMs: 1000 }));
  });

  it('unauthenticated cannot read settings', async () => {
    await env.withSecurityRulesDisabled(async c =>
      setDoc(doc(c.firestore(), 'settings', 'global'), settingsDoc));
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'settings', 'global')));
  });
});
