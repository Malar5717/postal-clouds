import { SignUp as ClerkSignUp } from "@clerk/clerk-react";

import AuthCloseButton from "../../../components/AuthCloseButton/AuthCloseButton";

function SignUp() {
  return (
    <>
      <AuthCloseButton />
      <ClerkSignUp
        routing="path"
        path="/auth/sign-up"
        signInUrl="/auth/sign-in"
        fallbackRedirectUrl="/profile-setup"
      />
    </>
  );
}

export default SignUp;

// Clerk's prebuilt authentication component
