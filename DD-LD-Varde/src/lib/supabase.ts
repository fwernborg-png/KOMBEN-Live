import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const RECONSTRUCTIBLE_CACHE_KEYS = [
  "komben-live-odds-history-v1",
  "komben-live-gallop-cache-v1",
  "komben-live-locked-strength-v1",
  "komben-live-place-evaluations-cache-v1",
  "komben-live-place-bets-cache-v1",
] as const;

/*
 * Dessa är endast lokala kopior av data som finns
 * centralt eller kan hämtas igen.
 *
 * De får inte konkurrera med Supabase Auth om
 * webbläsarens begränsade localStorage-utrymme.
 *
 * Viktiga lokala journaler, signaler och UI-val
 * rörs inte.
 */
if (typeof window !== "undefined") {
  for (const key of RECONSTRUCTIBLE_CACHE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Auth ska kunna fortsätta även om browser storage
      // av någon anledning inte är tillgängligt.
    }
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
