import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

/* The old auth chooser is gone. This route remains as a safe landing point for
   old bookmark links: signed-out visitors start at sign-up, signed-in visitors
   go straight to Home. */
function Auth() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  return (
    <Navigate
      to={isSignedIn ? "/home" : "/auth/sign-up"}
      replace
    />
  );
}

export default Auth;
