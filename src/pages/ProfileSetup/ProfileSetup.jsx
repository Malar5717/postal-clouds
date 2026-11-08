import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";

import AuthCloseButton from "../../components/AuthCloseButton/AuthCloseButton";
import { useSupabase } from "../../lib/SupabaseProvider";
import { clearReturnTo, readReturnTo } from "../../lib/returnTo";
import "./ProfileSetup.css";

/* Create or edit the public.users profile for the signed-in Clerk user.
   The profile is optional: this page is reached automatically after sign-up,
   or from the user logo later. Closing it always goes to /home. */
function ProfileSetup() {
  const { isLoaded, user } = useUser();
  const supabase = useSupabase();
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading");
  const [profileExists, setProfileExists] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const userId = user?.id ?? null;
  const username = user?.username ?? null;

  useEffect(() => {
    if (!isLoaded || !userId || !supabase) return;

    let cancelled = false;

    async function loadProfile() {
      const { data, error } = await supabase
        .from("users")
        .select("display_name, bio")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        setStatus("error");
        return;
      }

      setLoadError("");
      setProfileExists(Boolean(data));
      setDisplayName(data?.display_name ?? "");
      setBio(data?.bio ?? "");
      setStatus("ready");
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, supabase, reloadKey]);

  function retryLoad() {
    setStatus("loading");
    setLoadError("");
    setReloadKey((key) => key + 1);
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (saving || !userId || !supabase) return;

    if (!profileExists && !username) {
      setSaveError(
        "Your Clerk account does not have a username. Add one in your account settings and try again.",
      );
      return;
    }

    setSaving(true);
    setSaveError("");

    const values = {
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
    };

    const { error } = profileExists
      ? await supabase.from("users").update(values).eq("id", userId)
      : await supabase.from("users").insert({
          id: userId,
          username,
          ...values,
        });

    if (error) {
      setSaving(false);
      setSaveError(
        error.code === "23505"
          ? "That username is already taken."
          : error.message,
      );
      return;
    }

    /* A new profile created right after sign-up returns to the page that sent
       the visitor to auth. Editing an existing profile goes home. */
    const destination = profileExists
      ? "/home"
      : readReturnTo() ?? "/home";

    clearReturnTo();
    navigate(destination, { replace: true });
  }

  if (!isLoaded) return null;
  if (!user) return null;

  return (
    <main className="profile-setup">
      <AuthCloseButton />

      <section className="profile-setup__card">
        {status === "loading" && (
          <p className="profile-setup__message">loading...</p>
        )}

        {status === "error" && (
          <>
            <h1>profile unavailable</h1>
            <p className="profile-setup__error" role="alert">
              {loadError || "Could not load your profile."}
            </p>
            <button type="button" onClick={retryLoad}>
              try again
            </button>
          </>
        )}

        {status === "ready" && (
          <>
            <h1>{profileExists ? "your profile" : "set up your profile"}</h1>
            <p className="profile-setup__username">
              @{username ?? "no username"}
            </p>

            <form className="profile-setup__form" onSubmit={saveProfile}>
              <label>
                display name
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>

              <label>
                bio
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                />
              </label>

              {saveError && (
                <p className="profile-setup__error" role="alert">
                  {saveError}
                </p>
              )}

              <button type="submit" disabled={saving}>
                {saving ? "saving..." : "save"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default ProfileSetup;
