/* eslint-disable react-refresh/only-export-components -- the provider and the
   hook that reads its context share this module by design. */

// Gives the whole app a single Supabase client that authenticates via Clerk.
import { createContext, useContext, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";

import { createSupabaseClient } from "./supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseProvider({ children }) {
  // Clerk's token getter for the current session. The Supabase client calls it
  // for every request.
  const { getToken } = useAuth();

  // Clerk can hand out a fresh token while the same session stays active, so the
  // client is rebuilt when the getter changes instead of being cached forever.
  const supabase = useMemo(() => createSupabaseClient(getToken), [getToken]);

  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
