# AGENTS.md — postal-clouds

> Companion: `DATA_FLOW.md` documents the provider pipeline and asset registry. Its §2/§5 are
> current; its auth/route text predates `RequireAuth`. `PRD.md` is a product spec for a different
> planned frontend, not the current app — see “Docs that mislead” below.

## Commands & verification

- npm only (`package-lock.json`). `npm run dev` · `npm run build` · `npm run lint` (`eslint .`).
  There is no test script, test runner, TypeScript, formatter, or CI config.
- Verified this session: `npm run lint` and `npm run build` both pass. The build prints a
  >500 kB chunk warning and exits 0 — expected with Clerk + Supabase, not a failure.
- No test DOM; a connected browser is not assumed. Runtime layout/timing is only verifiable
  manually through `npm run dev` + a browser; otherwise reason about measurements instead of
  claiming they were executed.
- ESLint ignores only `dist`. Delete scratch dirs such as `.routecheck` before linting, or lint
  reports hundreds of errors from generated files.
- React Compiler is enabled through `@rolldown/plugin-babel` + `reactCompilerPreset()` in
  `vite.config.js`; it is load-bearing. It has crashed on dereferencing a possibly-undefined object
  in JSX/handlers. `react-hooks` also enables `set-state-in-effect`, so do not call `setState`
  synchronously in an effect body (see `LampTransition`’s null-frame rewind).
- A bare `vite build --ssr` is not a valid compiler check. To verify the compiler ran, do a
  throwaway lib-mode SSR build (`vite.routecheck.config.js` + `src/__routecheck.jsx` rendering every
  route in `StaticRouter`) and confirm `memo_cache_sentinel` in `.routecheck/check.js`. Then kill
  the leftover node process and delete all three temp files. Do source-text checks in the shell;
  `node:fs` is stubbed inside the harness.

## Current architecture

Stack: Vite 8 · React 19 · react-router-dom v6 · Clerk · Supabase; JavaScript/JSX only (no
TypeScript).

Provider order in `src/main.jsx` is load-bearing:
`ClerkProvider` → `SupabaseProvider` → `BrowserRouter` → `App`. `SupabaseProvider` calls Clerk’s
`useAuth()`, so it must stay inside `ClerkProvider`.

Routes are a flat table in `src/App.jsx` (no catch-all):

| Path | Page / notes |
|---|---|
| `/` | Preloader (public); `enter` → `/auth` |
| `/auth` | Custom Auth page; signed-out buttons go to the Clerk routes |
| `/auth/sign-up/*`, `/auth/sign-in/*` | Clerk prebuilt `SignUp` / `SignIn` |
| `/home` | Home (public) |
| `/letters` | HouseDesk (received inbox); inside the pathless `RequireAuth` layout |
| `/letters/:letterId` | ReadLetter placeholder; inside `RequireAuth` |
| `/post-office` | PostOfficeDesk (sent list); inside `RequireAuth` |
| `/post-office/drafts` | Drafts list for the signed-in user; inside `RequireAuth` |
| `/post-office/compose` | ComposeLetter (new draft); inside `RequireAuth` |
| `/post-office/compose/:draftId` | ComposeLetter (opens an existing draft); inside `RequireAuth` |
| `/post-office/post` | Post placeholder; inside `RequireAuth` |

- **Clerk auth is live.** `SignIn`/`SignUp` use `routing="path"` with `path` props matching the
  wildcard routes; change both together. `RequireAuth` renders `AuthPrompt` instead of redirecting;
  closing it navigates to `/home`. Prompt copy switches on `/post-office` vs the house area.
- **Supabase is wired and used by features.** Profiles and letter drafts read/write it.
  `createSupabaseClient(getToken)` uses the `accessToken` callback, so each request gets Clerk’s
  Bearer token. In this mode `supabase.auth.*` throws — use Clerk for auth. `useSupabase()` returns
  `null` outside the provider.
- `src/lib/TestSupabase.jsx` is a debug component currently commented out in `App.jsx`; enabling it
  runs a one-row `users` query and logs the result.
- **Env:** `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`. `.env` contains real keys (don’t
  print or commit it); `.env.example` has blanks. A blank Clerk key white-screens the app. Blank
  Cloudinary values leave signatures local; drafts still save and an autosave toast reports it.

## Non-obvious constraints

- **Artwork is read-only.** Never edit/redraw/rename `public/assets/**`. Lamp frame paths live only
  in the `FRAMES` registry in `src/components/effects/LampTransition.jsx`. `write-post-office`
  deliberately ends `pdesk-1 → 2 → 3 → 1`; `pdesk-4.svg` is unused — do not “fix” it.
- **Desk layout:** HouseDesk/PostOfficeDesk/Preloader use an `aspect-ratio: 1440/1024` box sized
  `min(100%, 100dvh * 1440 / 1024)` with the SVG as a CSS background, so percentage positions map
  1:1 to viewBox coordinates. Home is a horizontally scrolling `100dvh` world. There is no global
  `box-sizing` reset; Compose opts in locally.
- **PostOfficeDesk reuses HouseDesk’s `.house-desk*` styles** (heading/inbox/rows/read button) but
  imports only `PostOfficeDesk.css`. It works because `App.jsx` eagerly imports HouseDesk; preserve
  that import or move the shared rules if you introduce lazy routes.
- **Type:** Irish Grover is global; only the compose letter/ruler use Times New Roman. The Google
  Fonts link ships Irish Grover 400 only (bold is synthetic). Material Symbols is loaded only for
  the logout icon.
- **`react-signature-canvas` interop:** its UMD build exports `{ default: Component }`, so a bare
  default import is an object at runtime. `SignaturePad` normalizes it; keep that fallback.
- **SignaturePad load timing:** it restores `initialData` at mount. Compose keys it with
  `signatureLoadVersion` so the saved Cloudinary image can arrive after the first render and still
  be loaded into a fresh canvas.
- **Compose capacity:** an off-screen `.compose__ruler` mirror plus binary search. No `maxLength`,
  no scrollbar. Over-capacity input is trimmed to the longest fitting prefix and shows a 2 s toast;
  raising the font size instead lowers the slider `max`, never the text. Text is local state plus
  draft autosave. Signatures use `react-signature-canvas`; the PNG is uploaded to Cloudinary by the
  same autosave queue, and the secure URL is stored in `letters.signature_path`. The local PNG stays
  in the session recovery buffer until the upload finishes.
- Keep the scoped `react-refresh/only-export-components` disables in `src/main.jsx` and
  `src/lib/SupabaseProvider.jsx`; they are intentional (entry point / provider + hook module).

## Current state / traps

- `ReadLetter` ignores `:letterId`; `Post` is only two links. Both are placeholders.
- **Draft flow:** Compose autosaves title/content/signature to `public.letters`
  (`status = 'DRAFT'`) after 1.5 s, keeps a per-tab `sessionStorage` recovery buffer, and updates
  the same row through `/post-office/compose/:draftId`. `Drafts` lists the user’s draft rows and
  reopens them.
- `RECEIVED_LETTERS` (HouseDesk) and `SENT_LETTERS` (PostOfficeDesk) are duplicated 8-item arrays
  with the same ids/titles and no shared source of truth.
- **Signature storage:** Cloudinary receives the PNG through an unsigned upload preset; the
  `secure_url` goes in `letters.signature_path`. On reopen, the URL is fetched and converted to a
  data URL before being handed to the canvas, because a cross-origin image would taint it. Replacing
  or clearing a signature does not delete the old Cloudinary asset; unsigned uploads cannot.
- **Uncommitted work:** this is a git repo, but the current feature work is uncommitted; do not
  assume a deletion or overwrite can be recovered from history.
- **Docs that mislead:** `README.md` is the stock Vite template. `PRD.md` describes Tailwind,
  Supabase Auth, and routes `/login`, `/signup`, `/compose`, `/inbox`, `/sent`, `/board`,
  `/directory`; none of those are current routes. It also names `VITE_SUPABASE_ANON_KEY`, but the
  client reads `VITE_SUPABASE_PUBLISHABLE_KEY`. Use `PRD.md` for intent/backend contracts only.

## Open work

1. Wire real received/sent letter data through `useSupabase()`; de-duplicate the two letter arrays
   and replace the two placeholder pages. Draft persistence is already implemented.
2. Browser-verify compose (Enter at full, slider ceiling, large paste, toast wording), the
   signature pad (draw, clear, resize, reload recovery), and the Cloudinary upload/reopen/clear
   path with a configured unsigned preset.
3. Add Cloudinary asset cleanup if replaced/cleared signature images need to be removed; that
   requires a signed server-side delete because the browser only has an unsigned preset.
