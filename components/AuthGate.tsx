"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { loadDisplayName, saveDisplayName } from "@/lib/identity";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const IdentityContext = createContext<{
  displayName: string;
  setDisplayName: (name: string) => void;
}>({
  displayName: "",
  setDisplayName: () => undefined
});

// No sign-in wall. When Supabase is configured we silently sign the
// visitor in as an anonymous user so realtime writes carry an auth uid
// for the audit log; otherwise we just render. Either way, an inline
// "Your name" capture (in the Board header) labels every audit entry.
export default function AuthGate({ children }: { children: ReactNode }) {
  const [displayName, setNameState] = useState("");

  useEffect(() => {
    setNameState(loadDisplayName());

    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously().catch((err) => {
          // Anonymous sign-ins must be enabled in the Supabase dashboard
          // (Authentication → Providers → Anonymous Sign-Ins). Without it
          // this errors but the app stays usable in localStorage-only mode.
          console.warn("Anonymous sign-in failed:", err.message);
        });
      }
    });
  }, []);

  function setDisplayName(name: string) {
    const trimmed = name.trim();
    setNameState(trimmed);
    saveDisplayName(trimmed);
  }

  return (
    <IdentityContext.Provider value={{ displayName, setDisplayName }}>
      {children}
    </IdentityContext.Provider>
  );
}
