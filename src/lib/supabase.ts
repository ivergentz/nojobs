import { createClient } from "@supabase/supabase-js";

/**
 * Nur serverseitig verwenden. Der Service-Role-Key umgeht Row Level Security
 * und darf niemals in eine Client-Komponente gelangen.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in den Umgebungsvariablen."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
