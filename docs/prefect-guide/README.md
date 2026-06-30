# Prefect scoring guide

End-user documentation for the sixth-form prefects who record results on their phones using the
**entry** app ([apps/entry](../../apps/entry)) on Sports Day.

## What's here

| File | What it is |
| --- | --- |
| `MGS-Sports-Day-Prefect-Guide.pdf` | The visual, step-by-step guide to email to prefects (attach this). |
| `MGS-Sports-Day-Cheat-Sheet.pdf` | One-page quick reference — print and keep at each station. |
| `prefect-email.md` | Draft email to send to the prefects, with the two PDFs attached. |
| `prefect-guide.html` / `prefect-cheat-sheet.html` | Sources for the PDFs. |
| `screenshots/*.png` | Phone screenshots of each step (Year 7 · 100m demo data). |

## How the screenshots are made

The screenshots are rendered from [`tools/screenshots/entry-mock.html`](../../tools/screenshots/entry-mock.html),
a static page that **reuses the entry app's real stylesheets and exact on-screen copy** with clean
demo data — so they look identical to the live app without needing the Firebase stack. If the entry
app's UI changes, update that file from
[apps/entry/src/routes/+page.svelte](../../apps/entry/src/routes/+page.svelte) /
[apps/entry/src/app.css](../../apps/entry/src/app.css) and re-run the commands below.

## Regenerating (Windows, headless Chrome — no extra installs)

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
BASE="file:///C:/Users/Dan%20Millington/projects/MGSSportsDay"

# 1) screenshots (484px wide = the smallest width Chrome honours without clamping; full-bleed, no clip)
"$CHROME" --headless --hide-scrollbars --force-device-scale-factor=2 --window-size=484,940 \
  --screenshot="docs/prefect-guide/screenshots/06-order.png" \
  "$BASE/tools/screenshots/entry-mock.html?s=order"
#   …repeat per state: need-code need-name pick-year pick-event pick-string order confirm
#     saved-online saved-offline clarify sync  (heights tuned per screen)

# 2) guide + cheat-sheet PDFs (print-color-adjust:exact in the HTML makes backgrounds print)
"$CHROME" --headless --no-pdf-header-footer \
  --print-to-pdf="docs/prefect-guide/MGS-Sports-Day-Prefect-Guide.pdf" \
  "$BASE/docs/prefect-guide/prefect-guide.html"
"$CHROME" --headless --no-pdf-header-footer \
  --print-to-pdf="docs/prefect-guide/MGS-Sports-Day-Cheat-Sheet.pdf" \
  "$BASE/docs/prefect-guide/prefect-cheat-sheet.html"
```
