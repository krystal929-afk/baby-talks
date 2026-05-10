import { createStart, createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// Forward the current Supabase session access token as a Bearer header on
// every server function call so requireSupabaseAuth can validate it.
const attachAuthHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let headers: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers = { Authorization: `Bearer ${token}` };
    } catch {
      // no session — let server-side middleware reject if required
    }
    return next({ headers });
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachAuthHeader],
}));
