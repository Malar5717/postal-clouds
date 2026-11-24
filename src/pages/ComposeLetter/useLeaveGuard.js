import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* Guards an opened draft while it is being edited: Browser Back and tab close
   must not silently discard local edits. A same-URL history entry absorbs the
   first Back; the leave dialog then either re-arms it (cancel) or sends the
   user where they meant to go. Copying the router's history state keeps its
   index bookkeeping intact. */
export default function useLeaveGuard({ active }) {
  const navigate = useNavigate();
  const [leaveRequest, setLeaveRequest] = useState(null);
  const sentinelActiveRef = useRef(false);
  const ignorePopRef = useRef(false);
  const leavingRef = useRef(false);

  const armHistorySentinel = useCallback(() => {
    if (sentinelActiveRef.current) return;

    ignorePopRef.current = false;
    window.history.pushState(
      { ...window.history.state },
      "",
      window.location.href,
    );
    sentinelActiveRef.current = true;
  }, []);

  const dropHistorySentinel = useCallback(() => {
    if (!sentinelActiveRef.current) return;

    sentinelActiveRef.current = false;
    ignorePopRef.current = true;
    window.history.back();
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    armHistorySentinel();

    function handlePopState() {
      if (leavingRef.current) return;

      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        sentinelActiveRef.current = false;
        return;
      }

      /* Re-arm before showing the dialog so a second Back press cannot slip
         past the guard while the user is deciding. */
      sentinelActiveRef.current = false;
      armHistorySentinel();
      setLeaveRequest((current) => current ?? { kind: "back" });
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [active, armHistorySentinel]);

  /* A reload or tab close cannot show a custom dialog, so the browser's
     native "leave site?" prompt is the best available guard. */
  useEffect(() => {
    if (!active) return undefined;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);

  function finishLeave(request) {
    if (!request) return;

    /* The navigation itself fires popstate; the guard must not treat that as
       another attempt to leave. */
    leavingRef.current = true;

    if (request.kind === "back") {
      /* The re-armed sentinel sits directly above the compose entry, so going
         back twice lands on the page the user came from. */
      navigate(-2);
      return;
    }

    navigate(request.to, { replace: true });
  }

  function cancelLeave() {
    setLeaveRequest(null);
    armHistorySentinel();
  }

  return {
    leaveRequest,
    setLeaveRequest,
    armHistorySentinel,
    dropHistorySentinel,
    finishLeave,
    cancelLeave,
  };
}
