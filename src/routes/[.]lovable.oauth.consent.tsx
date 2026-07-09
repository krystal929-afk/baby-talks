import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Local typed wrapper — supabase.auth.oauth is beta and not in the TS defs yet.
type AuthorizationDetails = {
  client?: { name?: string | null; logo_uri?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scopes?: string[] | null;
};
type OAuthNs = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
      Could not load this authorization request: {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const result = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    const target = result.data?.redirect_url ?? result.data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card/80 p-6 backdrop-blur">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-primary">
            Connect an app
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            Let {clientName} into Baby&apos;s notepad?
          </h1>
          <p className="text-sm text-muted-foreground">
            It&apos;ll be able to read and change your memories, calendar, and ideas as you.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button onClick={() => decide(true)} disabled={busy} className="flex-1 gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Approve
          </Button>
          <Button
            onClick={() => decide(false)}
            disabled={busy}
            variant="outline"
            className="flex-1"
          >
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
