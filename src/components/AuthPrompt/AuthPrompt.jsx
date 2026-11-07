import { useNavigate } from "react-router-dom";

import { clearReturnTo, rememberReturnTo } from "../../lib/returnTo";
import "./AuthPrompt.css";

/* Shown when an anonymous visitor tries to enter a signed-in-only area. The copy
   depends on which area they were after; every caller passes a variant. */
const MESSAGES = {
  house: "uh oh, not your house",
  "post-office": "do you have a postal account?",
};

function AuthPrompt({ variant, returnTo, onClose }) {
  const navigate = useNavigate();

  /* Save the requested page before leaving for Clerk. The sign-in/sign-up
     pages read it back and pass it as their post-auth redirect. */
  function continueTo(path) {
    rememberReturnTo(returnTo);
    navigate(path);
  }

  function close() {
    clearReturnTo();
    onClose();
  }

  return (
    <div className="auth-prompt-backdrop" onClick={close}>
      <section
        className="auth-prompt-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-prompt-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="auth-prompt-title">{MESSAGES[variant]}</h2>

        <div className="auth-prompt-actions">
          <button
            type="button"
            onClick={() => continueTo("/auth/sign-up")}
          >
            Sign up
          </button>

          <button
            type="button"
            onClick={() => continueTo("/auth/sign-in")}
          >
            Log in
          </button>
        </div>
      </section>
    </div>
  );
}

export default AuthPrompt;
