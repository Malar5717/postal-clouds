import { Link } from "react-router-dom";
import { SignOutButton, useUser } from "@clerk/clerk-react";

import { clearReturnTo } from "../../lib/returnTo";
import "./SignedInTools.css";

/* Shared signed-in controls: profile shortcut plus sign out. Rendered on Home
   and through SignedInLayout on every protected page. */
function SignedInTools() {
  const { user } = useUser();

  const initial =
    user?.firstName?.[0] ??
    user?.username?.[0] ??
    user?.primaryEmailAddress?.emailAddress?.[0] ??
    "?";

  return (
    <div className="signed-in-tools">
      <Link
        className="signed-in-tools__profile"
        to="/profile-setup"
        aria-label="Open profile"
        data-tooltip="profile"
        onClick={clearReturnTo}
      >
        <span className="signed-in-tools__fallback" aria-hidden="true">
          {initial.toUpperCase()}
        </span>

        {user?.hasImage && user.imageUrl && (
          <img
            src={user.imageUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
      </Link>

      <SignOutButton redirectUrl="/home">
        <button
          type="button"
          className="signed-in-tools__signout"
          data-tooltip="signout"
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            logout
          </span>
        </button>
      </SignOutButton>
    </div>
  );
}

export default SignedInTools;
