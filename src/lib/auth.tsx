import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "contractor" | "pending";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  mustChangePassword: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    meta: { full_name: string; company_name: string; phone: string },
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .order("role")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", uid)
        .maybeSingle(),
    ]);
    setRole((roleRow?.role as Role) ?? "pending");
    setMustChangePassword(Boolean(profile?.must_change_password));
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadProfile(sess.user.id), 0);
      } else {
        setRole(null);
        setMustChangePassword(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthCtx["signUp"] = async (email, password, meta) => {
    const redirectTo = `${window.location.origin}/pro-hub`;
    console.log("[auth.signUp] start", { email, redirectTo, supabaseUrl: import.meta.env.VITE_SUPABASE_URL });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo, data: meta },
    });
    console.log("[auth.signUp] result", {
      userId: data?.user?.id,
      identitiesLen: data?.user?.identities?.length,
      sessionPresent: !!data?.session,
      error: error?.message,
    });
    if (error) return { error: error.message };
    // Supabase obfuscates duplicate-email signups: returns a fake user with
    // identities=[] and no session. Detect and surface as a real error.
    if (data?.user && (data.user.identities?.length ?? 0) === 0) {
      return { error: "User already registered" };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, role, mustChangePassword, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
