import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: server routes and cron only. The service key bypasses
// RLS, so this module imports "server-only" — bundling it into client code is
// a build error, not a runtime leak. Secrets live in Vercel env vars (spec §7).

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
