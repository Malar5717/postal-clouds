import { Outlet } from "react-router-dom";

import SignedInTools from "../SignedInTools/SignedInTools";

/* Pathless layout for pages that require a Clerk session. Sitting inside
   RequireAuth means the tools only render for signed-in visitors. */
function SignedInLayout() {
  return (
    <>
      <SignedInTools />
      <Outlet />
    </>
  );
}

export default SignedInLayout;
