"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type AuthState =
  | { kind: "no-backend" }
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; email: string };

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(
    isSupabaseConfigured ? { kind: "loading" } : { kind: "no-backend" }
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuth({
          kind: "signed-in",
          email: session.user.email ?? "(no email)"
        });
      } else {
        setAuth({ kind: "signed-out" });
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuth({
          kind: "signed-in",
          email: session.user.email ?? "(no email)"
        });
      } else {
        setAuth({ kind: "signed-out" });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (auth.kind === "no-backend" || auth.kind === "signed-in") {
    return (
      <>
        {auth.kind === "signed-in" ? <SignedInBar email={auth.email} /> : null}
        {children}
      </>
    );
  }
  if (auth.kind === "loading") {
    return (
      <main className="mx-auto max-w-md p-8 text-sm text-slate-500">
        Checking sign-in…
      </main>
    );
  }
  return <SignInScreen />;
}

function SignedInBar({ email }: { email: string }) {
  async function signOut() {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }
  return (
    <div className="flex items-center justify-end gap-3 border-b border-slate-200 bg-slate-50 px-4 py-1 text-xs text-slate-600 print:hidden">
      <span>
        Signed in as <span className="font-medium">{email}</span>
      </span>
      <button onClick={signOut} className="underline">
        Sign out
      </button>
    </div>
  );
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function send() {
    const supabase = getSupabase();
    if (!supabase || !email.trim()) return;
    setStatus({ kind: "sending" });
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.href : undefined
      }
    });
    if (error) setStatus({ kind: "error", message: error.message });
    else setStatus({ kind: "sent" });
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-2 text-2xl font-semibold">ED Assignment System</h1>
      <p className="mb-6 text-sm text-slate-600">
        Sign in with your work email. We&apos;ll send you a one-time link.
      </p>
      <div className="space-y-3 rounded border border-slate-300 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@kp.org"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={send}
          disabled={!email.trim() || status.kind === "sending"}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status.kind === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
        {status.kind === "sent" ? (
          <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
            Check your inbox for a link from Supabase. Open it on this device
            to finish signing in.
          </div>
        ) : null}
        {status.kind === "error" ? (
          <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
            {status.message}
          </div>
        ) : null}
      </div>
    </main>
  );
}
