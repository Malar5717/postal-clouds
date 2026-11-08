import { useNavigate } from "react-router-dom";

import { clearReturnTo } from "../../lib/returnTo";
import "./AuthCloseButton.css";

/* Shared close control for the Clerk auth pages and profile setup. Closing
   abandons the pending return destination and opens Home. */
function AuthCloseButton() {
  const navigate = useNavigate();

  function close() {
    clearReturnTo();
    navigate("/home", { replace: true });
  }

  return (
    <button
      type="button"
      className="auth-close"
      aria-label="Close and go home"
      onClick={close}
    >
      <span aria-hidden="true">&times;</span>
    </button>
  );
}

export default AuthCloseButton;
