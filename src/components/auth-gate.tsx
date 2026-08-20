import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoSmoke from "@/assets/brand/logo-smoke.jpg";
import babyPhoto from "@/assets/brand/baby-firefly.jpg";
import mascot from "@/assets/brand/mr-satan-mascot.png";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="bf-screen flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bf-screen bf-login">
      <div className="bf-login-inner">
        <img src={logoSmoke} alt="MR. SATAN" className="bf-login-logo" draggable={false} />
        <div className="bf-login-sub">BABY&apos;S KILLER NOTEBOOK</div>

        <div className="bf-login-collage">
          <div className="bf-polaroid">
            <img src={babyPhoto} alt="Baby Firefly" draggable={false} />
          </div>

          <div className="bf-paper-card bf-login-note">
            <img
              src={mascot}
              alt="Mr. Satan"
              className="absolute -right-2 -bottom-2 h-16 w-16 object-contain opacity-75"
              draggable={false}
            />
            <h1>WELCOME, DADDY.</h1>
            <p>
              I&apos;m here to keep your world in order. Ideas, plans, memories, gigs,
              secrets. I&apos;ve got you.
            </p>
            <div className="bf-kiss">xoxo Baby ♥</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="bf-login-form">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="bf-kicker text-[10px]">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="daddy@hell.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="bf-kicker text-[10px]">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={busy} className="bf-btn bf-btn-primary w-full gap-2 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>ENTER THE NOTEBOOK <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>

        <p className="mt-4 text-center text-[10px] uppercase tracking-[.18em] text-[#756f68]">
          Private file. Mr. Satan only.
        </p>
      </div>
    </div>
  );
}

export async function signOut() {
  await supabase.auth.signOut();
}
