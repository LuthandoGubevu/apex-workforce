import { writeBatch, serverTimestamp, doc, collection } from 'firebase/firestore';
import { db } from '@/firebase';

export interface AuditMeta {
  userId: string;
  userEmail: string;
  action: string;
  collection: string;
  documentId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
}

export async function writeWithAudit(
  writes: (batch: ReturnType<typeof writeBatch>) => void,
  audit: AuditMeta,
): Promise<void> {
  const batch = writeBatch(db);
  writes(batch);
  batch.set(doc(collection(db, 'audit')), {
    timestamp:   serverTimestamp(),
    userId:      audit.userId,
    userEmail:   audit.userEmail,
    action:      audit.action,
    collection:  audit.collection,
    documentId:  audit.documentId,
    before:      audit.before  ?? null,
    after:       audit.after   ?? null,
    note:        audit.note    ?? null,
  });
  await batch.commit();
}
