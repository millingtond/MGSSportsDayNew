# MGS Sports Day 2026 — Platform

A modern, real-time, offline-tolerant platform that replaces the old Google Sheets + manual-typing
workflow for Manchester Grammar School's inter-form Sports Day (Years 7–10, 32 forms).

Three apps on one Firebase project (`mgssportsday-55624`):

| App | Who | What |
|---|---|---|
| **Scoreboard** | Students / parents / big screen | Public live leaderboard with animated movement, per-year + whole-school tables, record callouts, and a results-tent "suspense → reveal" kill switch. |
| **Entry** | Sixth-form prefects (phones) | Tap-to-record finishing order, validated, **works offline** and auto-syncs. QR/code access, no accounts. |
| **Admin** | Results tent | Review & **commit** submissions, manual entry, corrections, records, roster/scoring config, station QR codes, suspense control, audit log. |

Nothing scores until a human commits it. Standings are always **recomputed** from committed results +
records (never incremented), so corrections are always safe.

> **Running the event?** → **[RUNBOOK.md](RUNBOOK.md)** (day-of run-of-show, pre-flight checklist, failure recovery).
> **Testing it first?** → **[TESTING.md](TESTING.md)**.

## Architecture

- **Monorepo** (pnpm workspaces). `packages/scoring` is one pure TypeScript scoring engine shared by the
  Cloud Function (authoritative) and the admin live preview. `packages/config-types` (shared types),
  `packages/firebase` (SDK wiring), `packages/ui` (design system).
- **Firestore** is the source of truth + realtime + offline cache. **One Cloud Function codebase** writes
  all scored data (the commit gate). **SvelteKit** static PWAs, deployed to three Firebase Hosting sites.
- The real MGS scoring is a single 30-deep points ladder; A/B/C strings are tiers of it (A winner 31,
  B 20, C 10). Records add bonus points (equal +1, beat +2), with direction by units (seconds: lower wins,
  metres: higher wins). All configurable in the admin UI.

## Prerequisites

- Node 20+ and `pnpm` (via `corepack enable pnpm`), Java 17+ (for the Firestore emulator), Firebase CLI.

## Local development

```bash
pnpm install

# Terminal 1 — full emulator suite (firestore + auth + functions)
pnpm --filter @mgs/functions run build      # bundle the functions once
firebase emulators:start --only firestore,auth,functions

# Terminal 2 — seed the emulator with the 2026 config + records
pnpm seed:emulator

# Terminal 3 — run an app against the emulator (VITE_USE_EMULATORS=1 is set by `dev`)
pnpm dev:scoreboard   # http://localhost:5173
pnpm dev:admin        # http://localhost:5174
pnpm dev:entry        # http://localhost:5175
```

First admin: open the admin app, create an account (email/password), then click **Claim admin access**
(works for the first admin only). Create a station access code under **Access codes**, print/scan its QR,
and the entry app opens ready to submit.

## Tests

```bash
pnpm --filter @mgs/scoring test          # scoring engine unit tests
# with the full emulator running + seeded:
pnpm --filter @mgs/seed run itest:emulator      # commit -> recompute -> standings, records, void
pnpm --filter @mgs/seed run rulestest:emulator  # security rules + prefect submission path
```

## Deploy

```bash
firebase login
# one-time: create the two extra Hosting sites (scoreboard uses the default site)
firebase hosting:sites:create mgssportsday-entry
firebase hosting:sites:create mgssportsday-admin

pnpm build                # builds all three apps + bundles functions
firebase deploy           # rules, indexes, functions, all three hosting targets
```

URLs: scoreboard → `mgssportsday-55624.web.app`, entry → `mgssportsday-entry.web.app`,
admin → `mgssportsday-admin.web.app`. (Functions require the Blaze plan; a one-day event costs pennies —
set a £5 budget alert.)

**App Check** (extra anti-abuse layer) is wired in but inactive/fail-safe — see **[APP-CHECK.md](APP-CHECK.md)**
to register a key and turn it on when you're ready.

## Paper backup result sheets

A full set of printable A4 handwriting sheets (a Plan B for patchy signal / system failure) is generated
from the live roster data:

```bash
pnpm sheets   # writes to print/
```

Outputs (open `print/index.html` → pick a pack → Print → A4, or use the pre-rendered PDFs):
- **By year group** — all 44 sheets grouped Y7→Y10 (for the results tent).
- **By event / station** — the same sheets grouped by event, so each marshal gets their event's four sheets.

Each sheet has the event/year header, fill-in instructions, the year's form-code legend, a prominent
"event best" box (form + name + time/distance for records), and big 1st–8th ranking rows per race. Typing a
sheet back in maps directly to the admin **Contests** page. Re-run `pnpm sheets` whenever the roster changes.

## Running a new year (no code changes)

In the admin app: edit the **roster** (Year 9/10 tutor-pair codes change yearly; Year 7/8 are always
`B D E H J L S W`), adjust the **scoring ladder** if needed, **roll records forward**, generate new
**station QR codes**, and update the **admin list**. Then `firebase deploy` only if code changed.

> The seed currently ships the 2025 structure as a working default. For 2026, send the real Year 9 codes
> (and any Year 10 changes) — edit `tools/seed/src/data.ts` or just change them in the admin roster editor.

## Plan

The full design rationale is in `~/.claude/plans/i-want-you-to-valiant-lerdorf.md`.
