# Handoff — EXECUTOR spec (STEP C: diacritics-tolerant stop resolution + honest empty state)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-14).** Step **D is done, pushed and reviewed** — `search()` now
> expands an id to its same-name siblings (`buildSameNameMap`), Hledat finds the line-20 shuttle.
> This file is **C only**. Step **B** stays untouched and comes next.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. Read `CLAUDE.md`, `scripts/routing.js` (`normalizeName`, `resolveStopId`, `buildSameNameMap`),
   `scripts/timetable.js` (`normalizeName`, `resolveStopIds`, `matchStopNames`, `boardDepartures`),
   `index_raw.html` (the `STOP PICKER (J7-P2)` block ~1045, `renderBoardRows` ~1182, `doSearch` ~1274),
   and this file.

---

## The bug, in one line

The picker's **suggestion** matching ignores diacritics, but the **resolution** that follows demands
them — so text that autocompletes fine resolves to nothing.

**Reproduce it before you touch anything:**

```js
const T = require("./scripts/timetable.js");
const net = require("./data/network.json");
T.boardDepartures(net, "Krátká", "20260814", 600, { limit: 3 }).length  // → 3
T.boardDepartures(net, "Kratka", "20260814", 600, { limit: 3 }).length  // → 0   ← today
T.matchStopNames([...], "kratka", 8)                                    // → ["Krátká"]  (finds it!)
```

On a phone most people type without diacritics. Today that path ends with the Tabule board printing
**`Dnes už odsud nic nejede.`** — which is not true, it is the app failing to recognise the stop and
blaming the timetable. Joe's decision (14. 8.): fix **both halves** — make resolution tolerant *and*
make the empty state stop lying.

**Manager-measured, this is why the tolerant half is safe:** across all stop names in today's data
there are **155 distinct names** after `normalizeName`, and still **155** after additionally
stripping diacritics — **zero collisions**. No two different stops differ only by diacritics, so the
fallback cannot silently pick the wrong stop. Step C3 adds a test that keeps this true.

---

## STEP C1 — tolerant resolution (two-pass, exact wins)

Both resolvers get a **second pass**, never a changed first pass:

| file | function | today | after |
|---|---|---|---|
| `scripts/routing.js` | `resolveStopId` | id → itself · exact `normalizeName` match → first id · else `null` | same, but **if the exact pass finds nothing**, retry with diacritics stripped |
| `scripts/timetable.js` | `resolveStopIds` | id → `[id]` · exact matches → all ids · else `[]` | same, but **if the exact pass returns empty**, retry with diacritics stripped |

- Add a `normalizeLoose(name)` helper next to each module's existing `normalizeName`:
  `normalizeName(name).normalize("NFD").replace(/[̀-ͯ]/g, "")`. Both modules already keep
  their own copy of `normalizeName` (they are separate IIFEs) — follow that existing convention,
  do not try to share code between them.
- ⚠️ **Do NOT modify `normalizeName` itself.** In `routing.js` it also drives `coLocatedGroups`
  (it picks the 60 m vs 30 m threshold) and `buildSameNameMap` (step D). Making it lenient would
  silently move both. The whole point of two passes is that **nothing about exact input changes**.
- Exact-first also means `matchStopNames` needs no change at all — leave it alone.

## STEP C2 — the UI half in `index_raw.html`

### 2a) Snap free text to the real stop name on commit

This is what keeps the tolerant half honest: if the app resolved `kratka` to `Krátká`, the user must
**see** that it did, so a wrong guess is visible instead of silent.

- In the picker's blur commit (the existing 150 ms `pickerBlurTimers` callback, `onPickerBlur`):
  after closing the suggestion list, resolve whatever the user typed. If it resolves, **write the
  canonical stop name back into the input and the field's state** (via `PICKER_FIELDS[fieldId].set`)
  and call `onCommit()`. If it does not resolve, leave the text exactly as typed — 2b handles it.
- Canonical name = `stopDisplayName(NET.stops[id].n)` for the resolved id, so it matches what the
  suggestion list shows.
- Enter and suggestion-tap already commit a canonical name, so they need no snapping — but
  **`selectPickerStop` must clear that field's pending blur timer** (`pickerBlurTimers[fieldId]`),
  otherwise the delayed blur callback still fires afterwards and now does real work, not just a
  harmless list close. This is a real ordering bug the snap introduces; do not skip it.

### 2b) Empty state that tells the truth (Tabule)

`renderBoardRows` currently prints one message for two different situations. Split it:

| situation | Czech UI string |
|---|---|
| the stop **does not resolve** (`resolveStopIds(...).length === 0`) | `Zastávku neznám. Vyber ji ze seznamu.` |
| the stop resolves but has **no more departures** | `Dnes už odsud nic nejede.` (unchanged) |

Hledat already distinguishes these two (`doSearch` → `Zastávku nenašel.` × `Žádné spojení v daném
čase.`), so **Hledat needs no message change** — it only inherits the tolerant resolution from C1
for free. Verify that it does; do not restyle or reword anything there.

No new visual language, no new CSS class if an existing one fits. Joe is the UX arbiter.

## STEP C3 — tests

`scripts/timetable.test.js`:

| scenario | expectation |
|---|---|
| tolerant, by name | `resolveStopIds(net, "Kratka")` returns the **same ids** as `resolveStopIds(net, "Krátká")` |
| tolerant board | `boardDepartures(net, "lazne i", …)` returns the same rows as `boardDepartures(net, "Lázně I", …)`, line 20 included |
| still strict about nonsense | `resolveStopIds(net, "zzz-neexistuje")` → `[]` |
| exact unchanged | every existing J7-P2 scenario still passes untouched |

`scripts/routing.test.js`:

| scenario | expectation |
|---|---|
| tolerant | `resolveStopId(net, "kratka")` === `resolveStopId(net, "Krátká")`, both non-null |
| tolerant search | `search(net, "kratka", "trznice", {maxTransfers: 1})` returns the **same counts** as the exact-name call — **1296 variants, 7 direct** |
| **data guard** ⭐ | no two distinct `normalizeName` stop names collapse to the same `normalizeLoose` string (today: 155 → 155). If a future data refresh breaks this, the fallback becomes ambiguous and we want the suite to say so, loudly, rather than have the app quietly pick one |

## PROOF / verification

1. `node scripts/routing.test.js`, `journey.test.js`, `timetable.test.js` → all PASS, no FAIL lines.
2. `node scripts/verify_network.js` → **20/20 PASS**, guard untouched. (It calls `resolveStopId` with
   exact names — the exact-first pass means its behaviour must not move at all.)
3. Copy `index_raw.html` → `index.html`, commit both.
4. Into `RESULT`: before/after for `Kratka` and `lazne`, confirmation that exact-name resolution is
   byte-identical, the 155 → 155 guard number as measured on your data, and anything the spec did
   not predict — **especially around 2a's ordering** (blur timer × suggestion tap), which is the part
   most likely to behave differently than described.

**Visual and touch testing on GitHub Pages is done by Joe — you have no browser.** The snap in 2a is
a touch interaction; his test is the only real one.

## DO NOT TOUCH

- `normalizeName` in either module (see C1), `matchStopNames`, `buildSameNameMap` / `search()` /
  `coLocatedGroups` / `transferPoints`, `planJourney` / `planBoard`.
- `scripts/build_network.js`, `scripts/verify_network.js`, `scripts/update_data.js`,
  `.github/workflows/`, `data/`.
- `Moje trasy` and its cards, the `Teď` / `Jindy` mechanics and violet mode, the tab bar.
- Hledat's wording and layout (see 2b).
- **Step B** — `KNOWN_LINE_CLASSES` is a `Set` of strings while `line` is a number, so the coloured
  line badges never apply in any tab. Approved, written up in `TASK.md`, comes **after** this one.
  Do not fold it in. If you spot more, write it into `TASK.md`, do not implement it.
- ⚠️ **Never hardcode `S#`/`P#` ids** in code or tests — the daily J8 refresh reshuffles them. Look
  ids up by name from `net.stops`, the way `verify_network.js` and the existing tests do.

## RESULT (filled in by the executor)

**STEP C done.** Both halves per spec: tolerant resolution (C1) + honest UI (C2) + tests (C3).

**C1 — `scripts/routing.js`:** `normalizeLoose(name)` added next to `normalizeName` (unchanged).
`resolveStopId` keeps the exact pass byte-identical and, only when it finds nothing, retries with
every stop name diacritics-stripped. `normalizeName`/`normalizeLoose` now exported (needed by
`routing.test.js`'s data guard). **`scripts/timetable.js`:** same pattern, own `normalizeLoose`
copy (per spec, no cross-module sharing), `resolveStopIds`' second pass only runs when the exact
pass returns `[]`. Both modules' loose pass is a straight linear rescan — cheap, and dwarfed by
`search()`'s own cost, no measurable timing change (STEP D's `Krátká → Tržnice` timing: 3.47ms,
in line with the ~3.8–5.6ms baseline noted after STEP D).

**Before/after, as specified:**
```
boardDepartures(net, "Krátká", "20260814", 600, {limit:3}).length  → 3  (unchanged)
boardDepartures(net, "Kratka", "20260814", 600, {limit:3}).length  → 3  (was 0)
boardDepartures(net, "lazne i", DAY, 600, {limit:10})               → 10 rows, line 20 included,
                                                                        identical to "Lázně I"
resolveStopId(net, "Krátká") → S127 ; resolveStopId(net, "kratka") → S127  (same id)
resolveStopId(net, "zzz-neexistuje") → null  (loose pass does not invent a match)
```
**Exact-name resolution is byte-identical** — `verify_network.js` (calls `resolveStopId` with exact
names throughout) is still **20/20 PASS**, and the STEP D `Krátká → Tržnice` no-regression check
(1296 variants / 7 direct) still holds after adding the loose fallback on top.

**Data guard (C3, measured on today's `network.json`):** **155 exact names → 155 after stripping
diacritics, 0 collisions** — matches the number in the spec exactly. Guard lives in
`routing.test.js`, walks every exact `normalizeName` and asserts no two different ones share a
`normalizeLoose` string; would print a `FAIL` with both colliding names if a future data refresh
ever broke this.

**C2a — snap on blur (`index_raw.html`):** the delayed blur callback (still 150ms, unchanged) now
resolves the typed text via `window.MHDRouting.resolveStopId` after closing the suggestion list. On
a hit it writes the canonical name (`stopDisplayName(NET.stops[id].n)`) into both the field's JS
state and the `<input>` DOM value; on a miss it leaves the text untouched for 2b to describe.
**Deviation from a literal reading of the spec, flagged for review:** the spec's phrasing ("if it
resolves... call `onCommit()`. If it does not resolve, leave the text as typed") could be read as
skipping `onCommit()` entirely on a miss. I call it unconditionally instead — without it,
`boardStop`'s state does update on every keystroke (via `onPickerInput`), but `renderBoardRows()`
never re-runs after blur, so Tabule would keep showing whatever it last rendered instead of the new
"Zastávku neznám." message from 2b. Since 2b's whole point is that the empty state must react to an
unresolved stop, I judged unconditional `onCommit()` to be what the spec intended, not an
alternative reading. Flagging this in case that judgment call is wrong — cheap to revert (guard the
call with `if (id)`) if Joe's test shows it misbehaving.
**2a ordering (`selectPickerStop`):** now clears `pickerBlurTimers[fieldId]` first thing, exactly as
specced — verified by hand-tracing the tap sequence (blur fires → 150ms timer starts → click fires
before the timer → `selectPickerStop` clears it → timer never fires) since there's no browser here
to actually tap. This is the piece most likely to surprise on a real device; Joe's touch test is the
real check.

**2b — honest empty state:** `renderBoardRows` now calls `resolveStopIds(NET, boardStop).length` to
tell "unknown stop" from "no more departures today" apart, per the spec's table. Verified in Node
(not just read) that `boardStop = 'Krátká'` (the default) still resolves, so the normal empty-board
case (late night, nothing left) keeps saying "Dnes už odsud nic nejede." — only a genuinely unknown
name now says "Zastávku neznám. Vyber ji ze seznamu."
**Hledat verified unchanged:** `doSearch` still calls `window.MHDRouting.resolveStopId` directly and
was not touched — it inherits C1's tolerance for free, exactly as the spec predicted. No wording or
layout edit made there.

**C3 — tests, all PASS, no FAIL lines:**
- `routing.test.js`: new "STEP C" block — `resolveStopId(net,"kratka") === resolveStopId(net,"Krátká")`
  (both `S127`), `search(net,"kratka","trznice")` returns the same 1296/7 as the exact call, plus the
  155→155/0-collision data guard.
- `timetable.test.js`: new "STEP C" block — `resolveStopIds("Kratka")` = `resolveStopIds("Krátká")`,
  `boardDepartures("lazne i", ...)` is `JSON.stringify`-identical to `boardDepartures("Lázně I", ...)`
  and includes a line-20 row, `resolveStopIds("zzz-neexistuje")` stays `[]` (loose pass doesn't
  invent a fuzzy match for genuine nonsense).
- All prior STEP D / J7-P2 / J4 / J3 scenarios re-ran untouched and still pass — confirms C1's exact
  pass really is unchanged, not just claimed to be.

**Verification, in order:** `node scripts/routing.test.js` / `journey.test.js` / `timetable.test.js`
→ all exit 0, zero "fail" occurrences (case-insensitive) in any output. `node
scripts/verify_network.js` → **20/20 PASS**, guard untouched, exact-name path confirmed unmoved.
`index.html` re-copied from `index_raw.html` after every edit, `diff -q` clean at the end.

**Not testable from here (no browser):** the actual touch timing of 2a — whether 150ms is still
enough margin now that the callback does more work (a lookup + two DOM/state writes) before firing,
and whether the snap visibly flashes/jumps on a real phone keyboard closing. Per spec, Joe's test on
Pages is the real check for this.

## DO NOT TOUCH — confirmed respected

`normalizeName` unchanged in both modules; `matchStopNames`, `buildSameNameMap`, `search()`,
`coLocatedGroups`, `transferPoints`, `planJourney`, `planBoard` — no edits (`git diff` on
`journey.js` is empty). `build_network.js`, `verify_network.js`, `update_data.js`, `.github/workflows/`,
`data/` untouched. Moje trasy, Teď/Jindy/violet, tab bar, Hledat wording/layout — untouched. Step B
(`KNOWN_LINE_CLASSES`) not folded in. No new `S#`/`P#` literals anywhere in the new test code.
