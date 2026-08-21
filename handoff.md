# Handoff — EXECUTOR spec (STEP UI-1: suggestion click + time/date input)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-21).** D, C and B are done, pushed and verified — B was checked
> visually by Joe on Pages on 21. 8. and accepted. This is **UI-1: two bugs Joe hit on desktop**.
> Both live in `index_raw.html` only. Joe explicitly chose to ship these two **before** the new
> "show the whole stop list" button, so that button is **not** part of this handoff.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test. **Two separate commits**, one per
> bug — they have different mechanisms and Joe tests them separately.

## How to start
1. "Use skill **kod-jadro**."
2. `git pull --rebase` first — the J8 data refresh commits daily and you are probably behind.
3. Read `CLAUDE.md` and, in `index_raw.html`: the picker block (~1055–1155), and the three
   `time-toggle` blocks in `renderDepartures` (~931), `renderBoard` (~1170), `renderSearch` (~1252).

---

## BUG 1 — clicking a suggestion does nothing (desktop, mouse)

Reported by Joe on PC: the suggestion list appears, but clicking an entry does nothing and he has to
type the full stop name anyway.

**Mechanism — verified in the code, not a guess:**

- `.stop-picker-item` selects via `onclick="selectPickerStop(...)"`.
- `onPickerBlur` schedules a **150 ms** timer whose callback runs `closePickerSuggestions()`, i.e.
  `list.innerHTML = ''`.
- Mouse order is: `mousedown` → `blur` (timer starts) → *user releases* → `mouseup` → `click`.
  A hold longer than 150 ms — completely normal on a desktop — removes the item node between
  `mousedown` and `mouseup`. The browser then dispatches **no `click` at all**, because `click`
  requires the same target for press and release. Hence "nothing happens".
- A touch tap is usually shorter than 150 ms, which is why this looked fine on mobile and why
  STEP C's own reasoning ("150 ms is long enough for that click to land") held only for taps.

**Fix:**

- Add `onmousedown="event.preventDefault()"` to each `.stop-picker-item`. Preventing the default on
  `mousedown` suppresses the focus change, so the input **never blurs**, no timer is scheduled, and
  the list is still in the DOM when `click` arrives.
- **Keep `onclick="selectPickerStop(...)"` as the handler that actually selects.** Do **not** move
  the selection itself onto `mousedown` / `pointerdown`: the very next step makes this list
  scrollable (full stop list behind a button) and a drag-to-scroll would then select whatever the
  finger or cursor started on.
- Leave the blur timer, the snap-to-canonical-name logic and `onCommit` **untouched** — they still
  have to run when the user clicks somewhere else entirely.
- Keep the `clearTimeout` inside `selectPickerStop` as a safety net. iOS dispatches `mousedown` late
  in the tap sequence; if a `blur` ever slips through first, that timer must not fire afterwards.

**Checks (manual, no UI test harness):**

| check | expectation |
|---|---|
| slow desktop click | press on a suggestion, hold **> 1 s**, release → the stop is selected |
| fast desktop click | still selected, no double-commit, list closes once |
| keyboard | `Enter` still picks the first suggestion, `Escape` still closes the list |
| click outside | clicking anywhere else still closes the list, still snaps free text (`kratka` → `Krátká`) and still refreshes Tabule |
| Tabule | picking a stop in Tabule still refreshes the rows immediately |

## BUG 2 — the time / date field drops digits

Reported by Joe on PC: typing several digits into the `Jindy` date or time field is unreliable; typed
quickly, the second digit is not taken.

**Mechanism — verified in the code:**

- `onCustomDateChange(v)` and `onCustomTimeChange(v)` both end in `render()`, which rebuilds the
  **entire tab's HTML** — including the `<input>` currently being typed into. The browser destroys
  that element and builds a new one, so focus and the segment position are gone.
- `setTimeMode('custom')` prefills both fields with the current date and time, so the value is
  already complete. In Chrome, typing the first hour digit into a complete `<input type="time">`
  yields a valid value immediately (`14:05` → `01:05`), which fires `change` **after one digit**.
  The re-render follows, the field dies, the second digit lands nowhere. That is exactly the
  reported symptom, and the date field has the same shape of the problem.

**Fix — stop re-rendering the block that contains the inputs:**

- Give the info line a stable id (e.g. `id="custom-time-info"`) and render the element
  **unconditionally**, empty when `useCustomTime && customDate && customTime` is false, so it can be
  refreshed on its own. Add a small `updateCustomTimeInfo()` that only writes its `innerHTML`.
- `onCustomDateChange` / `onCustomTimeChange`: set the value, then call `updateClockForMode()`,
  `updateCustomTimeInfo()`, and refresh **only the results of the current tab** —
  `departures → renderDepartureCards()`, `board → renderBoardRows()`,
  `search → renderSearchResults()`. No `render()`.
- ⚠️ **Search tab, decide and report:** check what `renderSearchResults()` does before any search has
  been submitted. If it would wipe the form state or render an empty/false result, do **not** call it
  on a time change — Hledat only runs on its submit button, so leaving its results alone is
  acceptable and probably correct. State in `RESULT` which branch you took and why.
- Leave `setTimeMode()` on the full `render()`. Switching `Teď` / `Jindy` has to rebuild the block
  and nobody is mid-typing at that moment.

**The three copies:** the `time-toggle` block is **byte-identical** in `renderDepartures` (~931),
`renderBoard` (~1170) and `renderSearch` (~1252) — I diffed them. Extract it into a single
`timeToggleHtml()` helper used by all three, so this fix cannot end up applied to two of the three.
This small refactor is explicitly allowed here, for the same drift-prevention reason as
`lineBadgeStyle` in STEP B. The rendered markup must be identical to today's apart from the new
stable info-line element.

**Checks:**

| check | expectation |
|---|---|
| slow typing | type the time digit by digit with pauses → every digit lands, value ends up as typed |
| fast typing | type `1430` as fast as you can → value is `14:30`, nothing dropped |
| date | same for the date field, including changing only the month |
| results follow | after the value settles, `Moje trasy` cards and `Tabule` rows reflect the new time |
| info line | the day-type badge and the Czech date under the fields update with the new value |
| Teď / Jindy | switching modes still works, violet mode still applies, no leftover state |

## DO NOT TOUCH

- `scripts/*` — all of it. This handoff is `index_raw.html` + `index.html`. If you believe a script
  change is required, stop and write why in `RESULT` instead.
- The picker's matching / snapping / `resolveStopId` behaviour from STEP C, the line colours from
  STEP B, `DATA.routes`, the tab bar, violet mode, any layout or sizing.
- ⛔ **The "show the whole stop list" button is NOT in this handoff.** Joe deferred it deliberately.
  Do not add it and do not build hooks for it — the only thing you owe it is the `onclick`-not-
  `mousedown` note in BUG 1, so a scrollable list stays possible later.
- ⚠️ **Never hardcode `S#`/`P#` ids** in code or tests — the daily J8 refresh reshuffles them.

## PROOF / verification

1. `node scripts/routing.test.js`, `journey.test.js`, `timetable.test.js` → all PASS, no FAIL lines.
   (They do not touch the UI — this is a regression check that you stayed inside `index_raw.html`.)
2. `node scripts/verify_network.js` → **20/20 PASS**.
3. Copy `index_raw.html` → `index.html`, `diff -q` clean, commit both.
4. Two commits, one per bug.
5. Into `RESULT`: the search-tab decision from BUG 2, whether `onmousedown` needed anything extra for
   touch, and any event-order or focus behaviour that differed from what this spec predicts.

**Visual and device testing is Joe's** — desktop and phone, both bugs. You have no browser.

## RESULT (filled in by the executor)

**Both bugs fixed, two commits, `index.html` = `index_raw.html`.**

- **BUG 1 (`fdcd384`):** added `onmousedown="event.preventDefault()"` to `.stop-picker-item` in
  `showPickerSuggestions`. Selection stayed on `onclick`, nothing else touched.
- **BUG 2 (`9196ae1`):** extracted the three byte-identical `time-toggle` blocks into
  `timeToggleHtml()`; the info line now has a stable `id="custom-time-info"` and its own
  `customTimeInfoHtml()`/`updateCustomTimeInfo()`. `onCustomDateChange`/`onCustomTimeChange` now
  call a shared `onCustomTimeValueChanged()` that runs `updateClockForMode()` +
  `updateCustomTimeInfo()` + refreshes only the current tab's results
  (`renderDepartureCards()` for Moje trasy, `renderBoardRows()` for Tabule) — no `render()`.

**Search-tab decision (per the spec's request to state it):** `renderSearchResults()` is **not**
called from the date/time change path. Checked `renderSearchResults()` first: when
`searchResults === null` (nothing submitted yet) it just clears `#search-results`'s innerHTML —
harmless either way — but when a search **was** already submitted, calling it again would
re-render the *same* `searchResults` array (it doesn't recompute), so the cards would keep
showing times computed for the old `customDate`/`customTime` while looking freshly rendered.
Leaving it alone means the stale cards stay visibly stale until the user hits "Hledat spojení"
again, which is the honest state — matches the spec's own suggested branch.

**`onmousedown` and touch:** did not need anything extra. `mousedown` fires on touch too (before
`touchend`/`click`), so `preventDefault()` there suppresses focus/blur on touch exactly the same
way — the tap-then-click path STEP C already relied on is untouched; this only removes a race that
was specific to a slow *mouse* press. Nothing to add for touch, but Joe's phone test is still the
real check.

**Event-order / focus notes vs. spec's prediction:** matched exactly — no surprises. Verified with
an ad hoc Node `vm` sandbox (real inline script + the three `<script src>` modules, minimal
`document`/`fetch` shim, not committed): after `setTimeMode('custom')` then
`onCustomDateChange('2026-08-25')` + `onCustomTimeChange('14:31')`, the `content` element's
`innerHTML` write-count did **not** increase (proving no full re-render), `custom-time-info`'s
did (twice, once per change) and showed the new date/day-type, `dayType`'s status text updated,
and on the Tabule tab `renderBoardRows()` fired without touching `content`. Also confirmed the
generated suggestion markup carries both `onmousedown="event.preventDefault()"` and
`onclick="selectPickerStop(...)"`.

**Verification:** `routing.test.js` / `journey.test.js` / `timetable.test.js` all exit clean, zero
`FAIL` lines; `verify_network.js` **20/20 PASS**. No `scripts/*` files touched (confirmed via
`git status` — only `index_raw.html`/`index.html` in both commits).

**Not tested visually** — no browser here. The touch-timing and real focus/typing behaviour are
Joe's to check on desktop and phone, per the spec.
