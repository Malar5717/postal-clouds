import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

import "./Preloader.css";

function Preloader() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  function enter() {
    if (!isLoaded) return;
    navigate(isSignedIn ? "/home" : "/auth/sign-up");
  }

  return (
    <main className="preloader">
      <div className="preloader__art">
        <button
          type="button"
          className="preloader__enter"
          onClick={enter}
          disabled={!isLoaded}
        >
          enter
        </button>
      </div>
    </main>
  );
}

export default Preloader;
