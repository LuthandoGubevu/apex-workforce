import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const REGION = 'africa-south1';
const db = () => admin.firestore();

export const createStaffUser = onCall(
  { region: REGION },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Not signed in');

    const callerSnap = await db().collection('staffUsers').doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin role required');
    }

    const { email, fullName, role, siteId = '' } = request.data as {
      email: string;
      fullName: string;
      role: string;
      siteId?: string;
    };

    if (!email?.trim())    throw new HttpsError('invalid-argument', 'Email is required');
    if (!fullName?.trim()) throw new HttpsError('invalid-argument', 'Full name is required');
    if (!['admin', 'hr', 'supervisor'].includes(role)) {
      throw new HttpsError('invalid-argument', 'Invalid role');
    }

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: email.trim(),
        displayName: fullName.trim(),
        emailVerified: false,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'A user with this email already exists');
      }
      throw new HttpsError('internal', 'Failed to create user account');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db().collection('staffUsers').doc(userRecord.uid).set({
      email:     email.trim(),
      fullName:  fullName.trim(),
      role,
      siteId:    siteId ?? '',
      active:    true,
      createdAt: now,
      updatedAt: now,
      createdBy: callerUid,
    });

    return { uid: userRecord.uid };
  }
);
