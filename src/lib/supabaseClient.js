import { createClient } from "@supabase/supabase-js";

// Creates a Supabase client for our app.
// Clerk handles login, so we use Clerk's token when talking to Supabase.
export function createSupabaseClient(getToken) {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      // Gets the signed-in user's Clerk token for Supabase requests.
      accessToken: async () => {
        return await getToken();
      },
    }
  );
}
