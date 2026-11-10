import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import { useSupabase } from "../../lib/SupabaseProvider";
import "./Drafts.css";

/* Lists the signed-in user's saved drafts. RLS limits reads to the sender;
   the explicit sender_id filter keeps the query clear. Opening a card uses
   the compose route's :draftId param so the editor loads the existing row. */
function Drafts() {
  const { userId } = useAuth();
  const supabase = useSupabase();
  const [drafts, setDrafts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId || !supabase) return;

    let cancelled = false;

    async function loadDrafts() {
      const { data, error: loadError } = await supabase
        .from("letters")
        .select("id, title")
        .eq("sender_id", userId)
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (loadError) {
        setError(loadError.message);
        setStatus("error");
        return;
      }

      setDrafts(data ?? []);
      setStatus("ready");
    }

    loadDrafts();

    return () => {
      cancelled = true;
    };
  }, [userId, supabase, reloadKey]);

  function retry() {
    setStatus("loading");
    setError("");
    setReloadKey((key) => key + 1);
  }

  return (
    <main className="drafts">
      <div className="drafts__shell">
        <header className="drafts__header">
          <Link
            className="drafts__back"
            to="/post-office"
            aria-label="Back to post office"
          >
            &lt;
          </Link>
          <h1 className="drafts__title">drafts</h1>
        </header>

        {status === "loading" && (
          <p className="drafts__message">loading drafts…</p>
        )}

        {status === "error" && (
          <div className="drafts__message">
            <p>{error || "could not load drafts"}</p>
            <button type="button" className="drafts__action" onClick={retry}>
              try again
            </button>
          </div>
        )}

        {status === "ready" && drafts.length === 0 && (
          <div className="drafts__message">
            <p>no drafts yet.</p>
            <Link className="drafts__action" to="/post-office/compose">
              write a letter
            </Link>
          </div>
        )}

        {status === "ready" && drafts.length > 0 && (
          <ul className="drafts__grid">
            {drafts.map((draft) => {
              const title = draft.title || "untitled";

              return (
                <li key={draft.id}>
                  <Link
                    className="drafts__card"
                    to={`/post-office/compose/${draft.id}`}
                    aria-label={`Open draft: ${title}`}
                  >
                    <span className="drafts__card-title">{title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

export default Drafts;
