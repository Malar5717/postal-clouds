import { Link } from "react-router-dom";

import "./Preloader.css";

function Preloader() {

  return (
    <main className="preloader">
      <div className="preloader__art">

        <Link
          to="/auth"
          className="preloader__enter"
        >
          enter
        </Link>

      </div>
    </main>
  );

}

export default Preloader;

