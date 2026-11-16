import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let anonClient: SupabaseClient | undefined;

/**
 * Cookie-free anon client for `unstable_cache` / background reads where
 * request cookies must not be captured in the cache closure.
 */
export function getSupabaseAnon(): SupabaseClient {
  if (!anonClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL — required for the anon Supabase client.",
      );
    }
    if (!anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY — required for the anon Supabase client.",
      );
    }

    anonClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return anonClient;
}
