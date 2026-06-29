# MGS Sports Day — Event‑Day Runbook

The one‑page plan for running the day. (For *testing* the platform beforehand, see [TESTING.md](TESTING.md).)

| App | URL | Who holds it |
|---|---|---|
| **Scoreboard** | `mgssportsday-55624.web.app` (add `?kiosk=1` on the big screen) | On the projector / big screen |
| **Entry** | `mgssportsday-entry.web.app` (prefects scan a QR — no typing the URL) | Prefects' phones at each station |
| **Admin** | `mgssportsday-admin.web.app` | The results tent (laptop/tablet) |

**The golden rule:** *nothing scores until the tent presses Commit, and standings are always re‑derived from the committed results.* So you can never "break" the table — any mistake is fixed by correcting the result, and the board recomputes itself.

---

## ✅ T‑minus: pre‑flight (the day before / that morning)

- [ ] **Wipe the test data.** Admin → **Config → Danger zone → Reset season**. The board should go blank (0 of 100).
- [ ] **Board is Live.** Admin → **Dashboard** → confirm the status strip says *Board is LIVE* (not Suspense).
- [ ] **Add your helpers as admins.** Admin → **Admins** → add each tent helper's email (they each create an account first, then you add them).
- [ ] **Generate a code per station.** Admin → **Access codes** → one per marshal point (e.g. `100m‑Finish`, `Long‑Jump`), scoped to that station's event(s), `maxMints` = how many phones share it. **Print the QR cards.**
- [ ] **Print the paper backups.** `print/backup-by-station.pdf` — give each marshal **their event's sheets** as a Plan B. (Regenerate with `pnpm sheets` if you changed the roster.)
- [ ] **Put the board up.** Open the scoreboard with `?kiosk=1`, press **F11** (full‑screen), and set the display to **never sleep**.
- [ ] **One live rehearsal result.** Have one phone scan → submit a result → tent commits → watch the board move. Then **Reset season** once more so you start clean.

---

## 👥 Who does what

- **Prefects (trackside):** scan their station QR → tap their name once → after each race, tap the forms **in finishing order** → **Submit**. It says *Saved* instantly, even with no signal, and syncs itself. *If their phone is dead or won't scan: write on the paper sheet and walk it to the tent.*
- **Results tent (admin):** work the **Review Queue** — green/agreed results commit in one tap (or press **C** to commit all agreed); red **conflicts** show a diff, pick the right one. Type **paper sheets** in via **Contests**. Enter record marks. Keep an eye on the status strip.
- **Board operator:** runs the scoreboard, and works the **Suspense → Reveal** kill‑switch around announcements.

---

## 🎬 Run of show

1. **Events run.** Prefects submit after each race; the tent commits from the Queue; the board moves live.
2. **Keep the queue drained.** Commit agreed results as they land (keyboard: **J/K** to move, **Enter** to commit, **C** for all‑agreed). Don't let a backlog build before announcements.
3. **Before the final announcements** (e.g. before the relays, or before prize‑giving): Admin → **Dashboard → Suspense**. The public board hides the live result so the winner stays a secret.
4. **The reveal.** When you're ready to announce: **Reveal Champions** → the board plays the champion animation with confetti. **Go Live** afterwards to return to normal.

---

## 🔧 If something goes wrong (quick reference)

| Problem | What to do |
|---|---|
| **A prefect's phone has no signal** | Nothing to do — their result saved on the phone and syncs automatically when signal returns. The phone shows a "↻ N to sync" pill until it does. |
| **A phone is dead / won't scan** | Use the **paper sheet** for that event; a tent helper types it into **Contests** (pick the cell → type the order → Commit). Identical result. |
| **Two prefects entered the same race differently** | It shows in the Queue as a red **Conflict** with the differing positions highlighted — pick the correct submission and commit it. |
| **A result was committed wrong** | Admin → **Contests** → open that cell → **Edit/correct** → fix the order → give a reason → Commit. The board re‑derives instantly; the old version is kept in the audit log. |
| **A record needs entering** | Admin → **Records** (or type the winner's mark when committing) → enter the time/distance → it auto‑checks against the standing record and flags **equals/beats**. |
| **The big screen froze** | It auto‑reloads if data stops arriving. If not, just **refresh the page** (the board is read‑only — refreshing loses nothing). |
| **A station code leaked / wrong people using it** | Admin → **Access codes** → **disable** that code. Prefects minted from it lose access within a few minutes. Issue a fresh code. |
| **The tent laptop drops offline** | The status strip turns to **⚠ Offline — reconnecting** — *stop committing* until it says **Live data** again, so you're not acting on stale info. |
| **You need to start completely fresh** | Admin → **Config → Danger zone → Reset season**. Wipes all results/submissions, reseeds a blank season, sets the board back to Live. |

---

## 🏁 After the event

- Leave the board on **Reveal** for as long as you like for photos.
- The **audit log** (Admin → Audit) is the full record of every commit, correction and void for sign‑off.
- Nothing else to do — there's no "save" step; the committed results *are* the record.

---

*Built so a new year is just config edits: change the roster, roll records forward, print new QR cards. See the README for "Running a new year".*
