import { Link, useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, SignOutButton } from "@clerk/clerk-react";

function Auth() {
  const navigate = useNavigate();

  return (
    <>
      <h1>Auth</h1>

      <SignedOut>
        <button
          type="button"
          onClick={() => navigate("/auth/sign-up")}
        >
          Sign Up
        </button>

        <button
          type="button"
          onClick={() => navigate("/auth/sign-in")}
        >
          Log In
        </button>
      </SignedOut>

      <SignedIn>
        <p>You are already signed in!</p>

        <button
          type="button"
          onClick={() => navigate("/home")}
        >
          Continue to Postal Clouds
        </button>

        <SignOutButton>
          <button type="button">Sign Out</button>
        </SignOutButton>
      </SignedIn>

      <p>
        <Link to="/">Back to entrance</Link>
      </p>
    </>
  );
}

export default Auth;
