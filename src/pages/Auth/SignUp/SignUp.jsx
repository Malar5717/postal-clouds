import { SignUp as ClerkSignUp } from "@clerk/clerk-react";

import { readReturnTo } from "../../../lib/returnTo";

function SignUp() {
  return (
    <ClerkSignUp
      routing="path"
      path="/auth/sign-up"
      signInUrl="/auth/sign-in"
      fallbackRedirectUrl={readReturnTo() ?? "/home"}
    />
  );
}

export default SignUp;

// Clerk's prebuilt authentication component