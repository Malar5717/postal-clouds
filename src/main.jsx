/* eslint-disable react-refresh/only-export-components -- app entry point; it
   mounts the providers rather than exporting a component to refresh. */
import { ClerkProvider } from "@clerk/clerk-react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { SupabaseProvider } from "./lib/SupabaseProvider.jsx";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <SupabaseProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SupabaseProvider>
  </ClerkProvider>,
);
