import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: Set<string>;
  loading: boolean;
  configured: boolean;
  has: (permission: string) => boolean;
  hasAny: (...permissions: string[]) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, role:roles(id, code, name, description)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  const profile = data as Profile | null;
  if (!profile) return { profile: null, permissions: new Set<string>() };

  let permissions = new Set<string>();
  if (profile.role_id) {
    const { data: rp } = await supabase
      .from('role_permissions')
      .select('permissions(code)')
      .eq('role_id', profile.role_id);

    const rows = (rp ?? []) as unknown as { permissions: { code?: string } | null }[];
    permissions = new Set(
      rows
        .map((row) => row.permissions?.code)
        .filter((code): code is string => Boolean(code)),
    );
  }

  return { profile, permissions };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next?.user) {
      setProfile(null);
      setPermissions(new Set());
      return;
    }
    try {
      const loaded = await loadProfile(next.user.id);
      setProfile(loaded.profile);
      setPermissions(loaded.permissions);
    } catch (err) {
      console.error('Failed to load profile', err);
      setProfile(null);
      setPermissions(new Set());
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      await applySession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const loaded = await loadProfile(session.user.id);
    setProfile(loaded.profile);
    setPermissions(loaded.permissions);
  }, [session?.user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions(new Set());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      permissions,
      loading,
      configured: isConfigured,
      has: (permission: string) => permissions.has(permission),
      hasAny: (...list: string[]) => list.some((p) => permissions.has(p)),
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, permissions, loading, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
