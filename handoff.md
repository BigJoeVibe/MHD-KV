# Handoff — EXECUTOR spec (STEP UI-2: "show the whole stop list" button)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-21).** UI-1 is done, pushed and verified by Joe on Pages —
> desktop **and** phone, both fine. This is **UI-2**, the feature Joe deferred while UI-1 shipped.
> `index_raw.html` only. It is a **mobile-first** change: everything hard about it happens on a
> phone.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. `git pull --rebase` — the J8 data refresh commits daily.
3. Read `CLAUDE.md`, and in `index_raw.html` the picker block (~1085–1180) plus its CSS
   (`.stop-picker*`, ~421–446).

---

## What Joe asked for, in his words

- A button **on the right inside the field** ("místo tam je") that opens the **complete** stop list.
- It opens **only on the button** — *not* when the field is focused or clicked. Reason he gave: on a
  phone the list would jump over the departures every time he touches the field.
- It must work on **mobile**: scrolling inside the list, no "endless" list, rows that stay tappable
  while scrolling, and **a way back to typing**.
- **All three fields** (Joe's decision, variant A, 21. 8.): `Odkud`, `Kam` in Hledat **and** the
  stop field in Tabule. One shared picker → one implementation, identical behaviour everywhere.

## UI-2a — the button

- Add a `<button type="button">` inside `.stop-picker` (it is already `position: relative`), absolutely
  positioned at the right edge of the input, vertically centred. Give the input `padding-right`
  so a long stop name never runs underneath it.
- Label: a chevron (`▾`) plus `aria-label="Zobrazit všechny zastávky"` and `title` with the same
  text. No image assets, no icon font.
- **Tap target at least 40 × 40 px**, even though the input is ~42 px tall — the visible chevron may
  be smaller, the hit area may not.
- ⚠️ **The button must not steal focus.** Put `onmousedown="event.preventDefault()"` on it, exactly
  like the suggestion rows in UI-1a. Without it, clicking the button while the input has focus
  fires `blur`, which schedules the 150 ms timer, which closes the list **right after** the button
  opened it — the feature would look broken at random.
- The chevron flips (`▾` / `▴`) or gets a state class while the full list is open — the user must be
  able to see that the button is a toggle.

## UI-2b — opening, closing, and the way back to typing

Add a per-field flag, e.g. `pickerShowAll[fieldId]`, meaning "the list currently shows everything,
not a filtered match".

- **Button click → toggle.** Open: set the flag, render **all** of `getStopNames()` (already unique,
  already sorted `cs`), open the list. Closed → open, open → closed.
- **Do NOT focus the input when opening.** On a phone that would raise the keyboard and eat half the
  space the list needs. This is the deliberate choice; say in `RESULT` if something forces otherwise.
- **The way back to typing:** tapping into the input must work as it always has — the field takes
  focus, the keyboard appears, and as soon as the user types, `onPickerInput` **clears the flag** and
  the list goes back to normal filtered mode. Never leave the full list showing over typed text.
- **`onPickerFocus` must respect the flag.** It currently calls `showPickerSuggestions(value)`, which
  would silently replace the full list with a filtered one (or with nothing, when the field is
  empty). If the flag is set, leave the list as it is.
- **Closing, all paths:** the button again · `Escape` · picking a row · **a click or tap anywhere
  outside the picker**. That last one needs a document-level listener, because the input may not
  have focus, so there is no `blur` to lean on. Register it **once** (not per render), ignore events
  whose target is inside a `.stop-picker`, and clear the flag when it fires.
- Leave the existing blur timer, the snap-to-canonical-name and `onCommit` logic **untouched** —
  they still own the "user typed free text and clicked away" path.

## UI-2c — the list itself on a phone

- `.stop-picker-suggestions` today is `overflow: hidden` with **no height limit**. 155 rows would run
  off the screen — this is Joe's "nekonečný seznam". Add `max-height` (something like
  `min(50vh, 320px)`) and `overflow-y: auto`. It must apply in both modes; the filtered list is ≤ 8
  rows and will not notice.
- **Rows must stay tappable while the list scrolls.** This is why UI-1a deliberately kept selection
  on `click` and only called `preventDefault()` on `mousedown` — `mousedown` is synthesized *after*
  a touch gesture, so it does not block scrolling. **Do not** move selection to `pointerdown` /
  `touchstart` "to make it snappier"; that is exactly the bug this design avoids.
- ⚠️ **Check the stacking order.** `.stop-picker-suggestions` is `z-index: 20`, the sticky header is
  100 and the tab bar 99. With a short filtered list this never showed; a 50vh list very well may
  slide **under** the tab bar. If it does, raise the list's `z-index` above them — and only that,
  no other layout changes. Report in `RESULT` whether it was actually needed.
- Rendering 155 rows at once is fine (plain string join, one `innerHTML` write) — do **not** add
  virtual scrolling, lazy chunks or a library.

## DO NOT TOUCH

- `scripts/*` — all of it. This handoff is `index_raw.html` + `index.html`.
- Matching/snapping/`resolveStopId` (STEP C), line colours (STEP B), the `timeToggleHtml()` work from
  UI-1b, `DATA.routes`, tab bar, violet mode, card layout.
- No new dependency, no new file, no build step.
- ⚠️ **Never hardcode `S#`/`P#` ids** — the daily J8 refresh reshuffles them.

## Checks (manual — there is no UI test harness)

| check | expectation |
|---|---|
| all three fields | the button is in `Odkud`, `Kam` **and** the Tabule stop field, and behaves identically |
| opens only on the button | focusing or clicking the field alone never opens the full list |
| toggle | second click on the button closes it; chevron state matches what is on screen |
| pick a row | selects the stop, closes the list, Tabule refreshes immediately |
| back to typing | tap the field, type one letter → list switches to filtered matches, full-list flag gone |
| outside click | tapping the departures or another field closes the list |
| long name | the longest stop name does not run under the button |
| scrolling | the list scrolls inside itself, the page behind it does not; a row tapped after scrolling still selects |
| stacking | the open list is not covered by the sticky header or the tab bar |
| data not ready | pressing the button before `network.json` has loaded does nothing and throws nothing |

## PROOF / verification

1. `node scripts/routing.test.js`, `journey.test.js`, `timetable.test.js` → all PASS, no FAIL lines.
2. `node scripts/verify_network.js` → **20/20 PASS**.
3. Copy `index_raw.html` → `index.html`, `diff -q` clean, commit both.
4. Into `RESULT`: whether the `z-index` had to be raised, how the outside-click listener is
   registered and torn down across re-renders, and anything the "do not focus the input" decision
   made awkward.

**Visual and device testing is Joe's** — desktop and phone. You have no browser.

## RESULT (filled in by the executor)

**Done, `index_raw.html` only, all three fields (`searchFrom`, `searchTo`, `board`) share the one
implementation via `PICKER_FIELDS`/`stopPickerHtml`.**

- **UI-2a (button):** `<button type="button" class="stop-picker-toggle">` added inside `.stop-picker`,
  absolute-positioned at the right edge (`top:50%; right:2px; transform:translateY(-50%)`), 40×40 px
  hit area, `onmousedown="event.preventDefault()"` so it never steals focus (same pattern as UI-1a's
  suggestion rows). `.stop-picker .stop-picker-input { padding-right: 44px }` keeps long names clear
  of it — needed a `.stop-picker .stop-picker-input` selector, not just `.stop-picker-input`, because
  the existing `.search-field input` rule has equal-or-higher specificity and would otherwise win.
  Glyph flips `▾`/`▴` via `updatePickerToggleIcon()`, plus an `.open` class for a colour change
  (`--blue2`, or `--violet` in violet mode).
- **UI-2b (state machine):** new `pickerShowAll[fieldId]` flag. `togglePickerShowAll()` flips it and
  either renders `getStopNames()` (via new `renderPickerItems()`, factored out of
  `showPickerSuggestions()` so both the filtered and full-list paths share one renderer) or closes the
  list. `onPickerFocus` returns early when the flag is set — tapping the field never replaces the full
  list. `onPickerInput` clears the flag on the first keystroke, handing control back to the filtered
  path, per spec. The input is deliberately never focused programmatically when the button opens the
  list.
- **Outside click:** one `document.addEventListener('click', onDocumentClickForPicker)` registered
  once, at the very end of the script next to `updateModeClasses()`/`render()` — not inside any render
  function, so it survives every tab switch and re-render untouched (nothing to tear down). The
  handler loops `PICKER_FIELDS`, and for each field with `pickerShowAll` set, checks whether the click
  landed inside *that field's own* `.stop-picker` (via `closest`) before closing it — a per-field check,
  not "close everything on any outside click", because opening field B's full list while field A's is
  still open must close A without touching B. Traced the tab-switch case by hand: a tab-bar click fires
  the tab's own `onclick` (which re-renders `#content`, possibly removing the picker's DOM entirely)
  *before* the event bubbles to `document`; the handler's `getElementById` lookups then just return
  `null` and every function involved already null-checks, so nothing throws even when the field the
  flag belongs to no longer exists in the DOM.
- **z-index:** raised `.stop-picker-suggestions` from 20 to 101 (above the sticky header's 100 and the
  tab bar's 99) unconditionally, not just "if needed" — a `min(50vh, 320px)` list is large enough that
  it will reach under the header on the shorter Tabule layout in ordinary use, not just as an edge
  case, so I didn't see a reason to leave it as a maybe. No other stacking-context changes.
- **One thing not explicitly in the spec, added for consistency:** `onPickerBlur`'s existing 150 ms
  timer now also clears `pickerShowAll`/updates the icon before it closes the list. Without it, a
  found-by-hand-tracing edge case: focus a field while its full list is open (spec says this must
  *not* replace the list), then blur via Tab or clicking a non-interactive area *without typing and
  without the document click landing outside the picker in time* — the timer would still close the
  list but leave the flag `true`, so the toggle button's icon would show "open" while the list was
  actually closed, and the next click on it would toggle the (stale) flag to `false` and appear to do
  nothing instead of reopening. This is a one-line addition to code already scheduled for that path,
  not new logic — the snap-to-canonical-name and `onCommit` calls after it are untouched.
- **Awkwardness from "never focus the input":** none of substance — the existing focus/blur wiring
  already assumed focus could arrive or leave independently of the list's contents, so a picker that's
  open-but-unfocused fit without restructuring anything. The one real consequence is exactly what the
  outside-click listener exists to solve (no `blur` to hang a close on), which the spec had already
  anticipated.
- **`renderPickerItems(fieldId, [])`** (network not loaded, or — theoretically — an empty stop list)
  clears and closes the list the same way the old empty-match branch did; `togglePickerShowAll` also
  short-circuits on `!NET` so pressing the button before data loads does nothing and cannot throw.

**Verified:** `routing.test.js` / `journey.test.js` / `timetable.test.js` all exit clean, no `FAIL`
lines; `verify_network.js` **20/20 PASS** (guard untouched, `scripts/*` untouched — confirmed via
`git status`). `index.html` re-synced from `index_raw.html`, `diff -q` clean. Extracted the real inline
`<script>` block and ran `node --check` on it — no syntax errors. **Not tested in a browser** — no
DOM/touch simulation was attempted this time (previous handoffs built one-off `vm` DOM shims for this
kind of interaction work; given the size of the state machine here I instead traced every path in the
spec's Checks table by hand against the code rather than half-simulating it). All of it — the toggle,
the focus/blur interplay, real scrolling, the stacking fix, touch timing — is Joe's to confirm on
desktop and phone per the Checks table above.
