# Matt Demo — Recurring Tasks for Stress and Trauma Clinic

**Client:** Matt, Stress and Trauma Clinic (Kids4Good / Temporary Housing)
**Pattern:** Sheet-as-brain + Doc-as-face, copy the model into our workspace and demo before deploying to Matt's account.
**v1 status:** Working — sheet, doc, script, intake all wired. Ready to demo to Rye.

---

## The Three Layers (the design)

| Layer | What | Where | Who touches it |
|-------|------|-------|----------------|
| 1. Static reference | Crew assignments, "Prepare to Act Fast," "Keep Moving," Nechola schedule | **Reference Doc** (the original, untouched) | Matt edits directly when procedures change |
| 2. Recurring expectations | Daily + Tuesday Temporary Housing checklists | **Active Doc** (the new dynamic doc) | Crew leaders open it, tick boxes, do the work |
| 3. Ad-hoc + recurring facility tasks | "Change smoke detector battery" etc. | **Intake tab** of Tasks Brain sheet → Active Doc | Anyone with sheet access submits a row, Matt approves, daily script promotes it |

**The Doc stays in the crews' hands. The Sheet is invisible to them. The script is invisible to everyone.**

---

## Demo artifacts (all in `Matt Demo - Recurring Tasks` folder in our Google Drive)

| Artifact | Type | ID | URL |
|----------|------|-----|-----|
| Demo folder | Drive folder | `1QMPWfgQtqE7w6vuNLRACkSmUJRqqXu6R` | [open](https://drive.google.com/drive/folders/1QMPWfgQtqE7w6vuNLRACkSmUJRqqXu6R) |
| Reference Doc (static) | Google Doc | `1ZOhZmTwJWaUn_qJ81_dd6DW7WWlHvVMqaU_CS5eC4ks` | [open](https://docs.google.com/document/d/1ZOhZmTwJWaUn_qJ81_dd6DW7WWlHvVMqaU_CS5eC4ks/edit) |
| Active Tasks (Daily) | Google Doc | `1LLqfO5177fee9bwMzUIphPeS_mKHLqfNLZCHmDJixcM` | [open](https://docs.google.com/document/d/1LLqfO5177fee9bwMzUIphPeS_mKHLqfNLZCHmDJixcM/edit) |
| Tasks Brain (Sheet) | Google Sheet | `1PNzArRG78BRIVj_gRhiCzIgFnMeV3BHRlAST3D8uVSk` | [open](https://docs.google.com/spreadsheets/d/1PNzArRG78BRIVj_gRhiCzIgFnMeV3BHRlAST3D8uVSk/edit) |
| Daily Tasks Runner (Apps Script) | `.gs` file | local: `~/.hermes/work/matt_demo/daily_tasks_runner.gs` | (paste into script editor — see below) |

---

## Sheet schema (Tasks tab)

| Column | Name | Type | Example |
|--------|------|------|---------|
| A | TaskID | text | `TH-D1` |
| B | TaskName | text | `Rooms are vacated and doors are Locked at 9AM` |
| C | Section | text | `Daily Expectations` (must match one of the 9 SECTIONS constants) |
| D | Cadence | text | `Daily` / `Weekly` / `Monthly` / `Quarterly` / `One-off` |
| E | AnchorDay | number | For Weekly: JS getDay() (Sun=0..Sat=6). For Monthly/Quarterly: day-of-month (1-31). Blank for Daily. |
| F | NextDue | date | The script advances this on each fire |
| G | Active | text | `TRUE` / `FALSE` — script only fires on `TRUE` |
| H | LastRun | date | Set by the script on each fire |
| I | LastDone | date | Reserved for v2 (manual "I marked this done" tracking) |
| J | Notes | text | Free text |

**Anchor mapping for Weekly:**
- Sunday = 0
- Monday = 1
- **Tuesday = 2**  ← Matt's deep clean lives here
- Wednesday = 3
- Thursday = 4
- Friday = 5
- Saturday = 6

---

## Seeded data (Tasks tab, rows 2-22)

**Daily compliance (10 items, rows 2-11):**
- TH-D1 through TH-D10 — all of the Temporary Housing 9AM daily checklist items
- Cadence: Daily | AnchorDay: 1 (irrelevant for Daily) | NextDue: 2026-06-05 (tomorrow)
- These will appear in the Active Doc under "DAILY COMPLIANCE — TEMPORARY HOUSING" on every run

**Tuesday deep clean (9 items, rows 12-20):**
- TH-T1 through TH-T9 — the 9 sub-procedures of the Tuesday deep clean (residents out, laundry, walls/baseboards, bathroom, kitchen block A, kitchen block B, food return at 2PM, common hallway)
- Cadence: Weekly | AnchorDay: **2** (Tuesday) | NextDue: 2026-06-09 (next Tuesday)
- These will appear under "TUESDAY COMPLIANCE — TEMPORARY HOUSING DEEP CLEAN" only on Tuesdays

**Sample facility tasks (2 items, rows 21-22):**
- FAC-001: Change smoke detector batteries in Eldorado family center — Quarterly, day 15
- FAC-002: Test smoke detectors all locations — Monthly, day 1
- These are the example Matt gave in his request

---

## Intake tab — how Matt/crew leaders add new tasks

Anyone with edit access on the Tasks Brain sheet can:
1. Open the Intake tab
2. Add a new row at the bottom (skip the example rows and the instructions)
3. Fill in: TaskName, Location, Cadence, Anchor, Notes
4. Set Approved = `TRUE`
5. The next daily run will promote the row to the Tasks tab (and stamp it `PROMOTED INT-...` in the Intake Approved column so it doesn't double-fire)

---

## Apps Script — install steps

1. Open the Tasks Brain Sheet
2. Extensions → Apps Script
3. Delete any existing code in the editor
4. Paste the entire contents of `daily_tasks_runner.gs`
5. Save (Cmd+S)
6. **First run:** select `dryRun` from the function dropdown, click Run. Authorize the permissions dialog. Watch the Execution Log — it will show exactly what WOULD be written today without touching anything.
7. **Real run:** select `runNow` from the dropdown, click Run. Open the Active Doc — today's tasks should be there.
8. **Schedule it:** click the clock icon (Triggers) → Add Trigger → choose `runDailyTasks` → time-driven → daily → 5:00-6:00am → Save.

---

## What this v1 does NOT do (v2 candidates)

- ❌ Push notifications ("Daily checklist still incomplete at 9:30am")
- ❌ Photos on completed items
- ❌ Per-crew filtering
- ❌ Mobile-friendly interactive checklist (it's still a Doc with checkboxes)
- ❌ Form-based intake (deferred — our OAuth scope doesn't have Forms API; Sheet-direct is simpler anyway)
- ❌ LastDone tracking (column I is reserved but unused in v1)
- ❌ Chatbot that can answer "what do I do at Eldorado on Fridays" (see below)

---

## The chatbot question (Rye's side note)

**"How hard would it be to have a chatbot that reads the doc and sheet and helps workers?"**

Honest read:

**Easy to build, hard to use well.**

Easy parts:
- A small webhook → OpenAI/DeepSeek call with the doc + sheet as context, returning a chat answer. We have the OpenAI-compatible API pattern already (from the ZeroWork build). 30 minutes of work.
- Could live as a Telegram bot, a Google Chat bot, or a tiny web page.

Hard parts:
- **Data freshness.** Every chat answer needs fresh sheet data. The doc updates daily; the sheet changes whenever someone adds a task. Either the bot re-reads on every message (slow, costly) or we cache + invalidate (engineering time).
- **Audience mismatch.** The crews doing the cleaning are *not* the people who'd ask a chatbot. They're looking at a paper checklist, or the Doc on a phone. The chatbot would serve Matt and his admins, not the crews. That's a different problem with a different user.
- **The doc is already the chatbot.** When the Temp Housing Tuesday checklist is in the Active Doc, the crew lead can just *read it*. The chatbot only helps if the answer isn't in the doc. Most of the time, it is.

**Where a chatbot WOULD add value without much extra work:**
- Matt asks: "When was the last time we changed the Eldorado smoke detector batteries?" → reads Sheet, answers.
- A new crew member asks: "What does 'wipe down all surfaces' actually mean in the Tuesday deep clean?" → reads doc, summarizes.
- Matt asks: "What tasks are overdue today?" → reads Sheet, answers.

**Recommendation:** Don't build it for v1. Build it for v2 **only if** Matt or his admins actually start asking these questions in the first 30 days. If they do, a Telegram bot reading from the Sheet is a 2-3 hour build on top of the v1 we have. If they don't, it's a feature looking for a user.

---

## What to tell Matt

(See the client-facing draft in the chat — that's the version to send him.)
