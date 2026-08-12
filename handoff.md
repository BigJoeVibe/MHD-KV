# Handoff — EXECUTOR spec (J7-P1: "Moje trasy" tab on network.json)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-05).** J4-sort-2 is done and pushed — verified, no follow-up needed.
> This is J7, brought forward: the Departures tab still runs on the old hand-typed `DATA.routes`, which
> caused a wrong arrival time (board said 1:28, reality 1:30 — old model uses one fixed
> `travelMinutes` per route). Two data models side by side must end.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. Read `CLAUDE.md`, `scripts/journey.js`, `scripts/timetable.js`,
   `index_raw.html` (`renderDepartures` ~896, `renderDepartureCards` ~918, `renderTimetable` ~967,
   `renderSettings` ~1189, `render` ~883, `tick` ~1233), and this file.

---

## Target state

The `Odjezdy` tab becomes **`Moje trasy`** — a favourites board computed from `network.json`, so it
shares all the search logic (window, caps, Pareto, through-services) instead of duplicating it.

**Data model (hardcoded for now, Joe's decision — cloud storage comes later):**

```js
const ROUTE_GROUPS = [
  {
    name: "Domov–Centrum",
    pairs: [["Krátká", "Tržnice"], ["Okružní", "Tržnice"]],
  },
];
```

- A **group** has a name and any number of **stop pairs**.
- **One card per pair**, header `Okružní → Tržnice` (same visual style as today's departure cards).
- Cards are ordered by origin stop, in the order given in `pairs`.
- Each group has a **reverse toggle at its top left** — it swaps every pair (`A → B` becomes `B → A`)
  and re-renders. Nothing clever: the engine is directional, so a swap is all that is needed.
  Czech UI label: `Tam` / `Zpět`.
- The `Jízdní řády` tab is **removed** (Joe's decision). `Nastavení` loses the "Sledované linky"
  section.

---

## STEP 1 — `scripts/journey.js`: performance (do this first, it is the risky part)

**Measured by the manager:** one `planJourney` call costs ~495 ms; six cards ~2510 ms. Almost all of
it is the time layer (`search()` topology is only 6–12 ms). Unusable for a board that re-renders
every minute on a phone.

**Cause:** itineraries are built for the whole service day and only then filtered by the departure
window. Most of the work is thrown away.

### 1a) Prune by departure time while building

Pass the window boundary down into the builders and skip trips departing after it:

- `planJourney` computes `maxDep = nowMin + windowMin` and hands it to
  `directItineraries(net, leg, dateStr, nowMin, maxDep)` and
  `transferItineraries(net, variant, dateStr, nowMin, minTransfer, maxDep)`.
- In `directItineraries`, right after `if (depMin < nowMin) continue;` add
  `if (maxDep != null && depMin > maxDep) continue;`
- In `transferItineraries`, right after the `while (dep1 < nowMin) dep1 += DAY_MIN;` loop add
  `if (maxDep != null && dep1 > maxDep) continue;` — this skips the whole inner trip2 loop, which is
  where the cost is.
- **The widening ladder must re-run the build with the wider boundary**, not filter an already built
  list — otherwise the night case breaks. So the ladder becomes: build with `maxDep = nowMin + 90`;
  if the result is empty, build again with `+240`; if still empty, build with `maxDep = null`.

**Manager verified this exact change** on a patched copy: **2509 ms → 681 ms** for six cards, and the
returned itineraries were **byte-identical** (`JSON.stringify` comparison) to the current output.
Reproduce that comparison before committing — if anything differs, stop and write it into `RESULT`.

### 1b) `planBoard(net, A, B, opts)` — new exported function

The board rules live in the core (not in the HTML) so they are testable in Node.

```
1. rows = planJourney(net, A, B, { date, nowMin, limit: 40, maxTransfers: 1 })
2. for rows sharing the same (depMin, arrMin): keep the one with the FEWEST transfers, drop the rest
3. bestDirect = smallest totalMin among rows with transfers === 0 (may not exist)
   if bestDirect exists: drop every row with transfers > 0 and totalMin > bestDirect + maxDetour
   if bestDirect does NOT exist: keep transfer rows as they are
4. sort ascending by depMin
5. return the first `limit` rows (default 6)
```

- `maxDetour` default **10** (Joe, 2026-08-05), a parameter.
- Rule 2 kills a real nuisance: `15` and `15→12 @Pivovar` both run `10:14 → 10:26` — you either stay
  on the bus or change and arrive at the same minute. The transfer row is pointless.
- Rule 3's "no direct" branch matters: **Krátká → Horní nádraží has no direct connection at all**,
  and without the branch that card would render empty.

Export it next to `planJourney` (`module.exports` and `window.MHDJourney`).

---

## STEP 2 — `index_raw.html`

### 2a) Tab bar (~lines 536–539)

- Label `Odjezdy` → **`Moje trasy`**. **Keep the internal id `departures`** — `showTab`, `render` and
  `tick` reference it and there is no reason to churn them.
- Remove the `Jízdní řády` button, the `case 'timetable':` branch in `render()`, and
  `renderTimetable()` together with any state used only by it.

### 2b) `renderDepartures` / `renderDepartureCards`

Keep the existing `Teď` / `Jindy` toggle and the violet mode exactly as they are. Replace the card
loop over `DATA.routes` with a loop over `ROUTE_GROUPS`:

```
for each group:
  group header: name + reverse toggle (Tam / Zpět)
  for each pair (swapped when the toggle is on):
    card header: "Okružní → Tržnice"
    rows = planBoard(NET, from, to, { date, nowMin, limit: 6 })
    if rows is empty: Czech UI string `Dnes už nic nejede.`
    for each row:
      line badge(s) — reuse the badge markup from the search results card
      "10:14 → 10:26"   and   "12 min"
      countdown on the right via the existing formatCountdown() / countdownClass()
      when row.transfers > 0, a sub-line using the same three variants as the search card:
        throughService  → `Přestup: Horní nádraží · bus navazuje okamžitě`
        waitMin <= 2    → `Přestup: Pivovar · čekání 0 min — velmi těsné`
        otherwise       → `Přestup: Rozcestí u Koníčka · čekání 8 min`
```

Reuse existing CSS classes. **Do not invent new styling** — Joe is the UX arbiter and will tune it.
Line badges: `KNOWN_LINE_CLASSES` only covers 3/9/13/15/51; every other line renders with the default
badge look. That is expected for now, do not add colours.

### 2c) Recompute at most once per minute

`planBoard` is cheap after 1a but not free. Cache the rendered rows keyed by
`groupIndex|reversed|from|to|date|nowMin` and reuse them within the same minute. `tick()` already
re-renders only when the tab is active and `useCustomTime` is false — keep that behaviour.

### 2d) `renderSettings` (~1189)

Delete the whole "Sledované linky" section (it reads `DATA.routes`, `getActiveWarnings`, `dpkvUrl`).
Keep the "Verze dat" section.

### 2e) Dead code — leave it alone for now

`DATA.routes` and its helpers (`getUpcomingDepartures`, `getActiveWarnings`, `getEffectiveDayType`,
`getNoteLetters`) stay in the file even though nothing calls them any more. They get deleted after
J7-P2, once Joe has confirmed nothing is missing. ~130 lines of dead weight is an acceptable price
for a safe rollback.

### 2f) `index.html`

Copy `index_raw.html` → `index.html` and **commit both**.

---

## STEP 3 — tests (`scripts/journey.test.js`)

| scenario | input | expectation |
|---|---|---|
| **perf, identical output** | the six pairs below, `20260805` 10:00 | results before/after 1a are `JSON.stringify`-identical; report both timings in `RESULT` |
| board, midday | `planBoard` Okružní→Tržnice, `20260805` 10:00 | 5–6 rows, **all direct**, 1st = line 15, 10:14 → 10:26, 12 min |
| board, morning | `planBoard` Krátká→Tržnice, `20260805` 06:00 | 1st = line 3, 06:06 → 06:19, 13 min |
| **no direct exists** | `planBoard` Krátká→Horní nádraží, `20260805` 10:00 | **not empty**, rows have `transfers === 1` |
| dedupe rule 2 | any board result | no two rows share the same `(depMin, arrMin)` |
| detour rule 3 | any board result with a direct | no row with `transfers > 0` and `totalMin > bestDirect + 10` |
| regression | existing `planJourney` scenarios | unchanged, all still PASS |

Pairs for the perf test: Krátká→Tržnice, Okružní→Tržnice, Tržnice→Krátká, Tržnice→Okružní,
Krátká→Horní nádraží, Okružní→Horní nádraží.

## PROOF / verification

1. `node scripts/journey.test.js` → all PASS.
2. `node scripts/routing.test.js`, `node scripts/timetable.test.js` → unchanged.
3. `node scripts/verify_network.js` → **20/20 PASS**, guard untouched.
4. Into `RESULT`: the two timings from the perf test, confirmation that the pruned build returns
   identical itineraries, and anything the spec did not predict.

**Visual testing on GitHub Pages is done by the manager / Joe — you have no browser.**

## DO NOT TOUCH

- `scripts/routing.js`, `scripts/timetable.js`, `scripts/build_network.js`, `scripts/verify_network.js`,
  `scripts/update_data.js`, `.github/workflows/update-data.yml`, `data/`.
- The J4-fix time logic, the Pareto filter, the caps, the merging, the `SORTERS` keys.
- The `Hledat` tab and `doSearch` — J7-P1 does not touch search.
- `DATA.routes` and its helpers (dead code, deleted later — see 2e).

## RESULT (filled in by the executor)

**Done, committed and pushed.** All steps implemented per spec; nothing skipped.

### STEP 1 — journey.js perf pruning + planBoard

- 1a implemented exactly as specified: `maxDep` threaded into `directItineraries`/
  `transferItineraries`, window ladder now re-runs the build (`buildItineraries` helper) instead of
  filtering a finished list.
- **Perf test result (6 pairs, `20260805` 10:00, this machine):** pruned **689.9 ms** total vs
  unpruned **2541.2 ms** total — matches the manager's own measurement (681 / 2509 ms) closely.
  Output is **byte-identical** (`JSON.stringify` comparison) for all 6 pairs — see `journey.test.js`
  "J7-P1 STEP 1a" block, which reconstructs the pre-1a pipeline from exported internals rather than
  duplicating the logic (see note below).
- `planBoard` implemented per the 5-rule spec (dedupe by `(depMin, arrMin)` keeping fewest transfers,
  detour cap `+10` relative to best direct, no-direct fallback, sort by `depMin`, `limit: 6`).

### STEP 2 — index_raw.html

- Tab bar: `Odjezdy` → `Moje trasy` (id `departures` unchanged), `Jízdní řády` removed along with
  `renderTimetable`, the `case 'timetable'` branch, and the tab-index array entry.
- `renderDepartureCards` rewritten to loop `ROUTE_GROUPS` → pairs → `planBoard(NET, from, to, {date,
  nowMin})`, with a `Tam`/`Zpět` toggle per group (reuses `.time-toggle-header`/`.time-toggle-btn`,
  same visual language as the existing Teď/Jindy toggle) and a per-minute cache keyed exactly as
  specified.
- `renderSettings`: "Sledované linky" section removed, "Verze dat" kept.
- `DATA.routes` and its helpers left in place, now fully dead (nothing calls them) — confirmed via
  grep, no leftover call sites.
- Copied to `index.html`, byte-identical (`diff` confirms).

### STEP 3 — tests

- `node scripts/journey.test.js`: all PASS (existing scenarios unchanged + new "J7-P1 STEP 1a" perf
  block + "J7-P1 STEP 1b" planBoard block: board-midday all-direct/5-6-rows/first-row, board-morning
  first-row, no-direct-exists (Krátká→Horní nádraží, 4 rows, all `transfers===1`), no-duplicate-time-
  keys, detour-cap invariant on every scenario).
- `node scripts/routing.test.js`, `node scripts/timetable.test.js`: unchanged, exit 0.
- `node scripts/verify_network.js`: **20/20 PASS**, guard untouched.

### Things the spec didn't spell out (flagging, not asking permission — went with the option closest to existing convention)

1. **Exported more journey.js internals for testing.** To prove pruned-vs-unpruned equivalence without
   duplicating the merge/caps/Pareto/sort logic inside the test file, `journey.js` now also exports
   `buildItineraries`, `mergeDuplicates`, `applyCaps`, `paretoFilter`, `SORTERS` alongside
   `planJourney`/`planBoard`. This mirrors `routing.js`, which already over-exports internals
   (`forwardSegments`, `stopsAfter`, etc.) for the same reason. Nothing in the public behavior changed.
2. **Extracted the transfer sub-line into a shared `transferInfoLine(it)` helper**, used by both
   `renderSearchResults` (Hledat) and the new board cards. It's byte-for-byte the same three-branch
   text the search card already produced (including the `(stejné místo)`/`(N min pěšky)` walk note) —
   the spec's inline example text for the board (`čekání 8 min` with no parenthetical) reads like
   shorthand, not a deliberate divergence from "the same three variants as the search card", so I kept
   them identical rather than forking the text. Flag this for Joe's visual pass — trivial one-line
   change if he wants the board sub-line shorter than the search one.
3. **Reverse-toggle placement:** "top left" was interpreted as the `Tam`/`Zpět` two-button toggle
   sitting to the *left* of the group name on the same row (not above it, not a single flip-button).
   Pure layout guess, cheap to change — Joe is the arbiter here as always.
4. **Extra verification not in the spec's PROOF list:** before calling this done, I ran the actual
   `index_raw.html` inline `<script>` plus the three `<script src>` modules together through a Node
   `vm` context with a minimal hand-rolled `document`/`fetch` shim (same technique used for the J4 P1
   handoff per the changelog), to catch wiring bugs (undefined functions, wrong element ids, thrown
   exceptions) that `journey.test.js` alone can't see. It renders both directions of both pairs, the
   Settings tab (confirms "Sledované linky" gone, "Verze dat" present), and confirms the Hledat tab
   still renders. This is *not* a substitute for the real visual pass on Pages — no CSS/layout
   assessment happened, no clicking. Ad-hoc script, not committed to the repo.
5. `.timetable-*` and `.dpkv-link` CSS rules are now unused (nothing outside `renderTimetable`
   referenced them) — left in place since 2e only asked to leave the JS dead code, and touching CSS
   wasn't in scope.

### What to test visually on Pages

- **Moje trasy** tab (default on load): two cards (Krátká→Tržnice, Okružní→Tržnice) under one
  "Domov–Centrum" group header with a Tam/Zpět toggle; toggling flips both pairs to Tržnice→Krátká /
  Tržnice→Okružní. Teď/Jindy + violet mode still work exactly as before. Countdown colors update live
  every minute.
- **Nastavení**: no "Sledované linky" section, "Verze dat" still there.
- **Hledat**: unchanged, still works (confirmed both by the shim and by not having touched `doSearch`/
  `renderSearch`/`renderSearchResults` beyond the `transferInfoLine` extraction, which is a pure
  no-op refactor of identical text).
- First load with a slow connection: "Moje trasy" should show "Načítám síť…" briefly (network.json
  fetch), same as Hledat already did.
