import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, limit,
  serverTimestamp, writeBatch,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/firebase';

export {
  collection, doc, query, where, orderBy, limit,
  serverTimestamp, writeBatch, getDocs, getDoc,
  addDoc, setDoc, updateDoc, deleteDoc,
};

export const col = (path: string) => collection(db, path);
export const ref = (path: string, id: string) => doc(db, path, id);

export async function fetchAll<T>(path: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(query(col(path), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
}

export async function fetchOne<T>(path: string, id: string): Promise<T | null> {
  const snap = await getDoc(ref(path, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
}
