import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import AuthPrompt from "../AuthPrompt/AuthPrompt";
import { clearReturnTo } from "../../lib/returnTo";

/* Route guard for the signed-in-only pages. It is used as a pathless layout
   route, so `children` come through as an <Outlet />.

   - While Clerk is still loading we render nothing, otherwise the prompt would
     flash for a visitor who turns out to be signed in.
   - Anonymous visitors get the AuthPrompt instead of the page (this catches
     direct URLs, which a Home-only click gate cannot).
   - The prompt remembers the requested page so Clerk can return there after
     auth; closing it lands them back on /home. */
function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  /* A successful auth redirect has landed on the protected page, so the saved
     destination is no longer needed. */
  useEffect(() => {
    if (isLoaded && isSignedIn) clearReturnTo();
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    /* The prompt copy depends on which area was requested. */
    const variant = pathname.startsWith("/post-office")
      ? "post-office"
      : "house";

    return (
      <AuthPrompt
        variant={variant}
        returnTo={`${pathname}${search}${hash}`}
        onClose={() => navigate("/home", { replace: true })}
      />
    );
  }

  return <Outlet />;
}

export default RequireAuth;
