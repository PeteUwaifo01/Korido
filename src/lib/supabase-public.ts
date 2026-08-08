import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Anon-key client for public reads (provider board, corridor pages). RLS is
// enforced: the migration grants anon SELECT on the catalog tables, quotes and
// mid_rates only. Nothing user-adjacent is reachable with this key.
//
// Deliberately NOT "server-only" — unlike supabase-server.ts, this key is safe
// in a browser bundle. Today it is used from server components.

let cached: SupabaseClient | null = null;

export function supabasePublic(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
