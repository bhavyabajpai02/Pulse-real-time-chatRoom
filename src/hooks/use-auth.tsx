import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Heartbeat: mark online while tab open
  useEffect(() => {
    if (!session?.user) return;
    const setOnline = (online: boolean) =>
      supabase.from("profiles").update({ is_online: online, last_seen: new Date().toISOString() }).eq("id", session.user.id);
    setOnline(true);
    const i = setInterval(() => setOnline(true), 30000);
    const onUnload = () => setOnline(false);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(i);
      window.removeEventListener("beforeunload", onUnload);
      setOnline(false);
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    if (session?.user) {
      await supabase.from("profiles").update({ is_online: false, last_seen: new Date().toISOString() }).eq("id", session.user.id);
    }
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
