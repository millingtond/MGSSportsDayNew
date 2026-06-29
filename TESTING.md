# Testing MGS Sports Day

Two layers: **(A) automated checks** and **(B) a full hands-on run**. Do the hands-on run on the
**emulator** first — it's a safe local sandbox you can wipe just by restarting — then optionally repeat
on the live site.

---

## A. Automated checks (no services needed)

```bash
pnpm install                            # once
pnpm -r test                            # scoring engine — 19 unit tests
pnpm -r typecheck                       # every package type-checks
pnpm --filter @mgs/scoreboard check     # Svelte type + a11y check
pnpm --filter @mgs/admin check
pnpm --filter @mgs/entry check
pnpm build                              # all 3 apps + functions build for production
```

Expect: **19 passed**; checks report **0 errors**; the build writes `apps/*/build`.

---

## B. Full hands-on run on the emulator (recommended)

Nothing here touches the live site. Needs **Java 17+** (for the Firestore emulator).

**Terminal 1 — emulator suite (Firestore + Auth + Functions):**
```bash
pnpm --filter @mgs/functions build
firebase emulators:start --only firestore,auth,functions
```
Emulator UI (inspect data live): http://127.0.0.1:4000

**Terminal 2 — seed + automated end-to-end:**
```bash
pnpm seed:emulator                            # loads the 2026 config + 44 records
pnpm --filter @mgs/seed run itest:emulator    # commit → recompute → standings, records, void
pnpm --filter @mgs/seed run rulestest:emulator# security rules + the prefect submit path
```
Both should print **"ALL … CHECKS PASSED"**.

**Terminal 3 — run an app (auto-connects to the emulator via `VITE_USE_EMULATORS=1`):**
```bash
pnpm dev:admin        # http://localhost:5174
pnpm dev:entry        # http://localhost:5175
pnpm dev:scoreboard   # http://localhost:5173
```

### Click-through — the whole day in ~5 minutes
1. **Admin** (5174): *Create account* with any email/password (e.g. `test@test.com` / `test1234`) →
   *Claim admin access* → *Initialise 2026 season*.
2. **Admin → Access codes**: create one (Area `100m-Finish`, scope = `100m`) → note the 6-char code (+ QR).
3. **Entry** (5175): open `http://localhost:5175/?code=YOURCODE` (or type the code) → enter a name →
   *Year 9 → 100m → A* → tap forms in finishing order → *Review* → *Submit* → "Saved ✓".
4. **Admin → Queue**: the submission appears → **Commit**. (Or **Contests** → pick a contest → type the
   order → Commit, exactly like typing in a paper sheet.)
5. **Scoreboard** (5173, open in another window): watch the row slide to its new position and the points
   count up. Commit a few more and watch it move.
6. **Records**: Admin → **Records** → Year 9 → *shot* → enter a distance bigger than the standing record →
   *Save* → see **"+2 / beat"** and that form's total jump on the board.
7. **Suspense / Reveal**: Admin → **Dashboard** → *Suspense* (board hides the result) → *Reveal Champions*
   (confetti) → *Go Live* to return to normal.
8. **Offline** (entry): Chrome DevTools → Network → **Offline** → submit a result → "Saved on your phone…"
   → switch back to **Online** → it syncs and the "N to sync" pill clears.
9. **Reset & repeat**: Admin → **Config → Danger zone → Reset season** (or just restart the emulator for a
   totally clean slate).

---

## C. Live (production) test

The deployed apps:
- Scoreboard — https://mgssportsday-55624.web.app
- Entry — https://mgssportsday-entry.web.app
- Admin — https://mgssportsday-admin.web.app

Run the same steps as **B 1–8** on these URLs. **First admin:** Create account → *Claim admin access* →
*Initialise 2026 season*. (If it says "an admin already exists" but it's you, just **reload** — the app now
refreshes your token automatically; or sign out and back in.)

⚠️ This writes **real data**. When you've finished testing, use **Admin → Config → Danger zone →
Reset season** to wipe it clean before the event.

### Safe live rehearsal — the dry-run season (recommended)

To rehearse on the **live apps without touching the real board**, add `?season=2026-dryrun` to each URL:
- Scoreboard — `https://mgssportsday-55624.web.app/?season=2026-dryrun`
- Entry — `https://mgssportsday-entry.web.app/?season=2026-dryrun`
- Admin — `https://mgssportsday-admin.web.app/?season=2026-dryrun`

Every app shows a yellow **DRY RUN** banner. From the admin dashboard click **Initialise "2026-dryrun" season**, then run the whole flow — codes you create carry the season into their QR, commits/standings/records all live under `2026-dryrun`, and the **real `2026` board, standings and queue stay untouched**. The real day just uses the plain URLs (no `?season`). Reset the rehearsal anytime with **Config → Danger zone → Reset season** while on the dry-run URL.

---

## D. Paper backup sheets

Open [print/index.html](print/index.html) → choose a pack → **Print → A4** (check the preview shows one
sheet per page), or just use the ready-made `print/backup-by-year.pdf` / `print/backup-by-station.pdf`.
Regenerate after roster changes with `pnpm sheets`.

---

## E. Scoring simulation (fuzz)

A property-based harness that runs thousands of randomized full seasons (ties, partial fields, voids,
records, athlete-name collisions) and asserts every engine invariant — exact ladder points, competition
ranking, idempotency, the athlete projection, record evaluation, "no NaN anywhere". A failure prints its
seed so it's reproducible.

```bash
pnpm --filter @mgs/seed run simulate           # 20,000 seasons (~a few seconds)
pnpm --filter @mgs/seed run simulate 200000    # hammer it harder
```
Expect: **✓ ALL CHECKS PASSED**.

## F. Visual / browser check (optional)

To eyeball the live board with real data: with the emulator running + seeded (B above), populate a full
played season and point the scoreboard at it:
```bash
pnpm --filter @mgs/seed run populate:emulator   # 82%-played season + athlete names
pnpm dev:scoreboard                             # http://localhost:5173 — live board, Events, Individuals, ?kiosk=1
```
