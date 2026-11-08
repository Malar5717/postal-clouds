import { Link } from "react-router-dom";
import { SignedIn, SignOutButton, useUser } from "@clerk/clerk-react";

import { clearReturnTo } from "../../lib/returnTo";
import "./Home.css";

/* Public page: the world is open to everyone. The two destinations are guarded
   by RequireAuth, which is why nothing here checks the session. */
function Home() {
  const { user } = useUser();

  const initial =
    user?.firstName?.[0] ??
    user?.username?.[0] ??
    user?.primaryEmailAddress?.emailAddress?.[0] ??
    "?";

  return (
    <main className="home-world">
      {/* Only signed-in visitors see these; <SignedIn> handles the condition. */}
      <SignedIn>
        <div className="home-user-tools">
          <Link
            className="home-profile"
            to="/profile-setup"
            aria-label="Open profile"
            title="profile"
            onClick={clearReturnTo}
          >
            <span className="home-profile__fallback" aria-hidden="true">
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

          <SignOutButton>
            <button
              type="button"
              className="home-signout"
              data-tooltip="signout"
              aria-label="Sign out"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
            </button>
          </SignOutButton>
        </div>
      </SignedIn>

      <div className="home-track">
        <Link className="home-location" to="/letters" aria-label="House">
          <img
            className="home-art"
            src="/assets/home/house.svg"
            alt=""
            width="1440"
            height="1024"
          />
        </Link>

        <Link
          className="home-location"
          to="/post-office"
          aria-label="Post Office"
        >
          <img
            className="home-art"
            src="/assets/home/post-office.svg"
            alt=""
            width="1440"
            height="1024"
          />
        </Link>
      </div>
    </main>
  );
}

export default Home;
