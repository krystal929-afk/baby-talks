// Server-only Supabase client that uses the service-role key and therefore
// BYPASSES Row Level Security. Only import this from server functions/routes.
//
// Every query made with it MUST be scoped to the authenticated user, e.g.
// `.eq("owner_id", context.userId)`, where `context.userId` comes from the
// verified JWT in `requireSupabaseAuth`. Never trust an owner id sent by the
// browser.
import { env } from "cloudflare:workers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function serverEnv(name: string): string | undefined {
  const workerEnv = env as unknown as Record<string, unknown>;
  const fromBinding = workerEnv?.[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  const fromProcess = process.env[name];
  return typeof fromProcess === "string" && fromProcess.trim() ? fromProcess.trim() : undefined;
}

let adminClient: SupabaseClient | undefined;

// Untyped on purpose: the generated `types.ts` doesn't include every live table
// (e.g. baby_uploads), and the queries below always select explicit columns.
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = serverEnv("SUPABASE_URL");
  const serviceRoleKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
