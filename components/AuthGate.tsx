"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { loadDisplayName, saveDisplayName } from "@/lib/identity";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export type SessionInfo =
  | { kind: "no-backend" }
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "email"; email: string };

type SendResult = { ok: true } | { ok: false; error: string };

export const IdentityContext = createContext<{
  displayName: string;
  setDisplayName: (name: string) => void;
  session: SessionInfo;
  sendMagicLink: (email: string) => Promise<SendResult>;
  signOut: () => Promise<void>;
}>({
  displayName: "",
  setDisplayName: () => undefined,
  session: { kind: "no-backend" },
  sendMagicLink: async () => ({ ok: false, error: "Backend not configured" }),
  signOut: async () => undefined
});

// No sign-in wall. When Supabase is configured we silently sign the
// visitor in as an anonymous user so realtime writes carry an auth uid
// for the audit log. A `sendMagicLink` helper is exposed so anyone who
// wants a stable, email-backed identity can opt in from the Picker.
export default function AuthGate({ children }: { children: ReactNode }) {
  const [displayName, setNameState] = useState("");
  const [session, setSession] = useState<SessionInfo>(
    isSupabaseConfigured ? { kind: "loading" } : { kind: "no-backend" }
  );

  useEffect(() => {
    setNameState(loadDisplayName());

    if (!isSupabaseConfigured) {
      setSession({ kind: "no-backend" });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    function applySession(s: { user?: { email?: string | null; is_anonymous?: boolean } } | null) {
      if (!s || !s.user) {
        // No session at all; try anonymous (the user will get a real
        // uid silently). If anonymous sign-ins are disabled in the
        // Supabase dashboard this will error and we fall back to "no
        // backend" UX so the app stays usable.
        supabase!.auth
          .signInAnonymously()
          .catch((err: { message?: string }) => {
            console.warn("Anonymous sign-in failed:", err?.message ?? err);
            setSession({ kind: "no-backend" });
          });
        return;
      }
      const email = s.user.email ?? null;
      const isAnon = s.user.is_anonymous === true || !email;
      setSession(isAnon ? { kind: "anonymous" } : { kind: "email", email });
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => applySession(s));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, s) => applySession(s));

    return () => subscription.unsubscribe();
  }, []);

  function setDisplayName(name: string) {
    const trimmed = name.trim();
    setNameState(trimmed);
    saveDisplayName(trimmed);
  }

  async function sendMagicLink(email: string): Promise<SendResult> {
    if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: "Backend not configured" };
    const trimmed = email.trim();
    if (!trimmed) return { ok: false, error: "Enter an email address" };
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.href : undefined
      }
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function signOut(): Promise<void> {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    // Quietly re-sign anonymously so the board keeps writing to Supabase.
    supabase.auth
      .signInAnonymously()
      .catch((err: { message?: string }) => {
        console.warn("Anonymous re-sign-in failed:", err?.message ?? err);
      });
  }

  return (
    <IdentityContext.Provider
      value={{ displayName, setDisplayName, session, sendMagicLink, signOut }}
    >
      {children}
    </IdentityContext.Provider>
  );
}
