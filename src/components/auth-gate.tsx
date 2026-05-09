import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoPrimary from "@/assets/brand/logo-primary.png";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Set up listener FIRST, then read existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account made. Logging you in.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <img
        src={logoPrimary}
        alt="MR. SATAN"
        className="mb-6 h-28 w-auto select-none drop-shadow-[0_0_24px_oklch(0.92_0.23_124/25%)]"
        draggable={false}
      />
      <p className="mb-8 text-[10px] font-semibold uppercase tracking-[0.4em] text-primary flicker">
        Baby&apos;s Killer Notepad
      </p>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 backdrop-blur"
      >
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-background"
          />
        </div>

        <Button type="submit" disabled={busy} className="w-full gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>

        <button
          type="button"
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          className="block w-full text-center text-xs uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
        >
          {mode === "signin" ? "Need to make the account? Sign up" : "Got an account? Sign in"}
        </button>
      </form>

      <p className="mt-6 max-w-sm text-center text-[11px] text-muted-foreground">
        Locked door, daddy. Only Mr. S and his manager get in.
      </p>
    </div>
  );
}

export async function signOut() {
  await supabase.auth.signOut();
}
