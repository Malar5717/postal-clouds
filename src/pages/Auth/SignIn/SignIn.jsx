import { SignIn as ClerkSignIn } from "@clerk/clerk-react";

import { readReturnTo } from "../../../lib/returnTo";

function SignIn() {
  return (
    <ClerkSignIn
      routing="path"
      path="/auth/sign-in"
      signUpUrl="/auth/sign-up"
      fallbackRedirectUrl={readReturnTo() ?? "/home"}
    />
  );
}

export default SignIn;

// Clerk's prebuilt authentication component