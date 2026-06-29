# App Check — activation guide

App Check binds backend traffic to *your real apps* (an extra layer on top of the security rules + the commit gate). The code is **already wired** into every app — but it's **inactive and fail‑safe**: a complete no‑op until you set a key, and wrapped so a wrong/missing key can never break the apps. Turning it on is a deliberate, three‑stage rollout you do from the Firebase console.

> **Recommended timing:** do this **after** Sports Day, or with plenty of slack before it. Enforcement, if misconfigured, can lock legitimate apps out of the backend — a worse failure mode than the abuse it prevents for a one‑day event. The platform is already hard to abuse without it (human commit gate, 8‑char station codes, per‑device caps, instant code revocation, deny‑by‑default rules).

---

## Stage 1 — Register a key (no risk)

1. Firebase console → **App Check** → **Apps** tab.
2. The three sites share one web app (`1:251720074527:web:…`). Register it with the **reCAPTCHA** (Enterprise) or **reCAPTCHA v3** provider — the console will create/relay a **site key**.
3. **Add all three domains** to the key's allowed domains (in the reCAPTCHA admin):
   `mgssportsday-55624.web.app`, `mgssportsday-entry.web.app`, `mgssportsday-admin.web.app`.

## Stage 2 — Switch the apps on (low risk: monitoring only)

Build with the key set, then redeploy. The apps start attaching App Check tokens; nothing is blocked yet.

```bash
# bash
VITE_APPCHECK_KEY=<your-site-key> pnpm build && firebase deploy --only hosting
```
```powershell
# PowerShell
$env:VITE_APPCHECK_KEY="<your-site-key>"; pnpm build; firebase deploy --only hosting
```

- Default provider is reCAPTCHA **Enterprise**. For a classic **v3** key, also set `VITE_APPCHECK_PROVIDER=v3`.
- Then watch **App Check → Metrics** for a day or two. You want **Verified ≈ 100%** of requests for Firestore and Functions before enforcing. (If you see lots of "unverified", a domain is missing from the key — fix Stage 1, don't enforce.)

## Stage 3 — Enforce (the irreversible‑in‑effect step)

Only once metrics show requests are verified:

- **Firestore:** App Check → **Firestore** → **Enforce** (console toggle, no redeploy).
- **Cloud Functions:** add `enforceAppCheck: true` to the callables and redeploy. In `functions/src`, change e.g. `onCall(async (req) => …)` → `onCall({ enforceAppCheck: true }, async (req) => …)` (and keep the explicit `{ region: REGION }` where present: `onCall({ region: REGION, enforceAppCheck: true }, …)`). Then `firebase deploy --only functions`.

To back out: flip the Firestore toggle off / remove the option and redeploy. (Tokens keep flowing harmlessly either way.)

---

*Implementation: `packages/firebase/src/index.ts` → `setupAppCheck()`. It reads `VITE_APPCHECK_KEY` (+ optional `VITE_APPCHECK_PROVIDER`), is skipped under the emulators, and is `try/catch`‑guarded so it can never break startup.*
