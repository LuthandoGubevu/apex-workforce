import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { encryptTemplate } from './crypto';

const REGION = 'africa-south1';
const db = () => admin.firestore();

// ── encryptAndStoreTemplate ──────────────────────────────────────────────────
// Called by the clocking-station PC app (M4) after a successful enrolment scan.
// Receives raw template bytes as base64, encrypts AES-256-GCM, stores to Firestore,
// marks employee enrolled, and completes the enrolment request.
export const encryptAndStoreTemplate = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Not signed in');

    const userSnap = await db().collection('staffUsers').doc(uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'device') {
      throw new HttpsError('permission-denied', 'Device role required');
    }

    const { employeeId, stationId, templateBase64, enrolmentRequestId } =
      request.data as {
        employeeId:         string;
        stationId:          string;
        templateBase64:     string;
        enrolmentRequestId: string;
      };

    if (!employeeId || !stationId || !templateBase64 || !enrolmentRequestId) {
      throw new HttpsError('invalid-argument', 'employeeId, stationId, templateBase64, enrolmentRequestId are required');
    }

    const empSnap = await db().collection('employees').doc(employeeId).get();
    if (!empSnap.exists) throw new HttpsError('not-found', 'Employee not found');

    const emp = empSnap.data()!;
    if (!emp.biometricConsent) {
      throw new HttpsError(
        'failed-precondition',
        'Biometric consent has not been recorded for this employee. HR must record consent before enrolment.',
      );
    }
    if (emp.status !== 'active') {
      throw new HttpsError('failed-precondition', `Employee status is "${emp.status}" — only active employees may be enrolled`);
    }

    const rawBytes = Buffer.from(templateBase64, 'base64');
    const blob = encryptTemplate(rawBytes); // rawBytes zeroed inside

    const batch = db().batch();

    batch.set(
      db().collection('encryptedTemplates').doc(employeeId)
        .collection('devices').doc(stationId),
      {
        ...blob,
        stationId,
        employeeId,
        enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
        enrolledBy: uid,
      },
    );

    batch.update(db().collection('employees').doc(employeeId), {
      fingerprintEnrolled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: uid,
    });

    batch.update(db().collection('enrolmentRequests').doc(enrolmentRequestId), {
      status:      'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.set(db().collection('audit').doc(), {
      timestamp:  admin.firestore.FieldValue.serverTimestamp(),
      userId:     uid,
      userEmail:  request.auth?.token?.email ?? '',
      action:     'template_stored',
      collection: 'encryptedTemplates',
      documentId: `${employeeId}/devices/${stationId}`,
      before:     null,
      after:      { employeeId, stationId },
      note:       'Raw template encrypted AES-256-GCM and stored; buffer zeroed per POPIA',
    });

    await batch.commit();
    return { success: true };
  },
);

// ── deleteEmployeeTemplates ──────────────────────────────────────────────────
// Called by web app (HR) or station PC when an employee is removed.
// Deletes all encrypted templates for the employee from Firestore.
// Physical device deletion is handled by the station PC in M5.
export const deleteEmployeeTemplates = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Not signed in');

    const userSnap = await db().collection('staffUsers').doc(uid).get();
    const role = userSnap.data()?.role as string | undefined;
    if (!role || !['admin', 'hr'].includes(role)) {
      throw new HttpsError('permission-denied', 'Admin or HR role required');
    }

    const { employeeId } = request.data as { employeeId: string };
    if (!employeeId) throw new HttpsError('invalid-argument', 'employeeId required');

    const devicesSnap = await db()
      .collection('encryptedTemplates').doc(employeeId)
      .collection('devices').get();

    const batch = db().batch();
    devicesSnap.docs.forEach(d => batch.delete(d.ref));

    batch.set(db().collection('audit').doc(), {
      timestamp:  admin.firestore.FieldValue.serverTimestamp(),
      userId:     uid,
      userEmail:  request.auth?.token?.email ?? '',
      action:     'templates_deleted',
      collection: 'encryptedTemplates',
      documentId: employeeId,
      before:     { count: devicesSnap.size },
      after:      null,
      note:       'POPIA template deletion — manual HR/Admin action',
    });

    await batch.commit();
    return { deleted: devicesSnap.size };
  },
);

// ── onEmployeeWrite (Firestore trigger) ───────────────────────────────────────
// When an employee's status changes to 'terminated', auto-delete all Firestore
// templates for that employee (POPIA requirement).
export const onEmployeeWrite = onDocumentWritten(
  { document: 'employees/{employeeId}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    if (!after || before?.status === after.status) return;
    if (after.status !== 'terminated') return;

    const { employeeId } = event.params;
    const devicesSnap = await db()
      .collection('encryptedTemplates').doc(employeeId)
      .collection('devices').get();

    if (devicesSnap.empty) return;

    const batch = db().batch();
    devicesSnap.docs.forEach(d => batch.delete(d.ref));

    batch.set(db().collection('audit').doc(), {
      timestamp:  admin.firestore.FieldValue.serverTimestamp(),
      userId:     'system',
      userEmail:  'system',
      action:     'templates_auto_deleted',
      collection: 'encryptedTemplates',
      documentId: employeeId,
      before:     { count: devicesSnap.size },
      after:      null,
      note:       'Auto POPIA deletion — employee status changed to terminated',
    });

    await batch.commit();
  },
);
