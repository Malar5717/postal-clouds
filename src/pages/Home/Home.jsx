import { Link } from "react-router-dom";
import { SignedIn } from "@clerk/clerk-react";

import SignedInTools from "../../components/SignedInTools/SignedInTools";
import "./Home.css";

/* Public page: the world is open to everyone. The two destinations are guarded
   by RequireAuth, which is why nothing here checks the session. */
function Home() {
  return (
    <main className="home-world">
      {/* Only signed-in visitors see these; <SignedIn> handles the condition. */}
      <SignedIn>
        <SignedInTools />
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
