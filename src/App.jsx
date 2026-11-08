import { Route, Routes } from "react-router-dom";

import RequireAuth from "./components/RequireAuth/RequireAuth";
import Preloader from "./pages/Preloader/Preloader";
import Auth from "./pages/Auth/Auth";
import SignUp from "./pages/Auth/SignUp/SignUp";
import SignIn from "./pages/Auth/SignIn/SignIn";
import Home from "./pages/Home/Home";
import ProfileSetup from "./pages/ProfileSetup/ProfileSetup";
import HouseDesk from "./pages/HouseDesk/HouseDesk";
import ReadLetter from "./pages/ReadLetter/ReadLetter";
import PostOfficeDesk from "./pages/PostOfficeDesk/PostOfficeDesk";
import ComposeLetter from "./pages/ComposeLetter/ComposeLetter";
import Post from "./pages/Post/Post";
// import TestSupabase from "./lib/TestSupabase.jsx";

import "./App.css";

function App() {
  return (
    <>
      {/* <TestSupabase /> */}
      <Routes>
        <Route path="/" element={<Preloader />} />

        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/sign-up/*" element={<SignUp />} />
        <Route path="/auth/sign-in/*" element={<SignIn />} />

        <Route path="/home" element={<Home />} />

        {/* Signed-in only. Anonymous visitors get the AuthPrompt, including on
            direct URLs. */}
        <Route element={<RequireAuth />}>
          <Route path="/profile-setup" element={<ProfileSetup />} />

          <Route path="/letters" element={<HouseDesk />} />
          <Route path="/letters/:letterId" element={<ReadLetter />} />
          <Route path="/post-office" element={<PostOfficeDesk />} />
          <Route path="/post-office/compose" element={<ComposeLetter />} />
          <Route path="/post-office/post" element={<Post />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
