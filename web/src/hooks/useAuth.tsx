import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import type { StaffUser } from '@/types';

interface AuthCtx {
  user: User | null;
  staffUser: StaffUser | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, staffUser: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() =>
    onAuthStateChanged(auth, u => {
      setUser(u);
      if (!u) { setStaffUser(null); setLoading(false); }
    })
  , []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'staffUsers', user.uid), snap => {
      setStaffUser(snap.exists() ? ({ id: snap.id, ...snap.data() } as StaffUser) : null);
      setLoading(false);
    });
  }, [user]);

  return <Ctx.Provider value={{ user, staffUser, loading }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
