# Handoff — EXECUTOR spec (J4-sort-2: Pareto ordering + through-running services)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-04, evening).** J4-sort is done, pushed and works as specified —
> good job. Joe then tested it live and found two things the previous spec got wrong. This is the
> follow-up. **Both fixes sit above the core; the J4-fix time logic stays untouched.**

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. Read `CLAUDE.md`, `scripts/journey.js`, `scripts/journey.test.js`,
   `index_raw.html` (`renderSearchResults` ~line 1135), and this file.

---

## What Joe found (Tue 2026-08-04, 11:21, Okružní → Tržnice)

The Departures tab shows a bus at 11:42 (line 13) that reaches Tržnice at 11:55 — 13 minutes.
The search did not offer it at all. In the data it exists as:

```
11:42 → 11:55 | 13 min | 13→11 @Horní nádraží | wait 0 min
```

Line 13 **terminates** at Horní nádraží, line 11 **starts** there, and the wait is 0 minutes — the
bus effectively continues under a different number. Two problems came out of this:

**Problem A — `minTransfer: 3` throws it away.** The connection has a 0-minute wait, so it never
survives. What is left are far worse variants (13→15 via Rozcestí u Koníčka, 24 min).

**Problem B — "direct first" is the wrong primary rule.** Even if the journey survived, `SORTERS.smart`
would push it below every direct connection — although it **departs earlier (11:42 vs 11:54) and
arrives earlier (11:55 vs 12:06)** than the first direct one. Category must not beat time.

### Data check done by the manager (do not redo it)

- GTFS `block_id` — the standard "this vehicle continues" field — is **empty for all 10 151 trips**,
  so through-running cannot be read from the data.
- Across 280 queries (4 times of day × 70 random stop pairs) there are **89 transfers with a 0–2 min
  wait**; only **8 (9 %)** are terminus-to-origin like 13→11, the other **81 (91 %)** are mid-route
  (e.g. `6→12 @Tržnice wait 0`, `19→22 @Elite wait 1`).
- **Joe's decision (2026-08-04), aware of that number: lower `minTransfer` to 0 across the board.**
  Rationale: it is his personal app, the parameter is one line to revert, and the tight cases will be
  re-evaluated once GPS and walking distances land (J5 / J9). **Do not implement a heuristic filter
  instead — the decision is deliberate.** The terminus-to-origin detection below is used **only for
  the UI label**, never for filtering.

---

## STEP 1 — `scripts/journey.js`

### 1a) Default `minTransfer` 3 → 0

```js
const minTransfer = opts.minTransfer != null ? opts.minTransfer : 0;
```
Stays a parameter. Nothing else about transfers changes.

### 1b) `throughService` flag (label only, no filtering)

When building a transfer itinerary, mark whether the transfer stop is the **last** stop of leg 1's
pattern and the **first** stop of leg 2's pattern:

```js
const p1 = net.patterns[leg1.patternId];
const p2 = net.patterns[leg2.patternId];
it.throughService = p1.stops[p1.stops.length - 1] === leg1.to && p2.stops[0] === leg2.from;
```
Note this is inherently limited to a literally identical stop ID, so a co-located sibling (H1d, ≤30 m)
never counts as through-running. Direct journeys do not get the field.

⚠️ The flag means **"a bus is standing at that stop and leaving now"**, NOT "same vehicle" — that
cannot be proven from the data. Keep the wording of the UI string (2b) exactly as specified.

### 1c) Pareto filter over (departure, arrival) — NEW step

Drop every itinerary for which another one exists that **departs no earlier and arrives no later**.
Such an itinerary is worse in both dimensions and must never be shown.

Implement as a single sweep, not O(n²):

```
1. sort descending by depMin, ascending by arrMin as tie-break
2. minArr = Infinity
3. walk the list in groups of equal depMin:
     gMin = smallest arrMin in the group
     if (gMin < minArr):
         keep every member of the group whose arrMin === gMin
         minArr = gMin
     else:
         drop the whole group
```

Two itineraries with the **same** departure and the **same** arrival but different lines are genuine
alternatives and both stay (e.g. line 13 and line 15 leaving and arriving at the same minute).
Within one departure minute, later arrivals are dropped — same departure, worse arrival.

### 1d) `SORTERS.smart` — time decides, direct is only a tie-break

```js
smart: (a, b) =>
  a.depMin !== b.depMin ? a.depMin - b.depMin      // earlier departure
    : a.arrMin !== b.arrMin ? a.arrMin - b.arrMin  // then earlier arrival
    : a.transfers !== b.transfers ? a.transfers - b.transfers  // then direct wins
    : a.totalMin - b.totalMin,
```
The "all direct journeys first" block is **removed**. Other `SORTERS` keys stay untouched.

### 1e) Order of operations in `planJourney` — updated, binding

```
1. build itineraries                       (unchanged)
2. FIX-B invariant                         (unchanged)
3. merge duplicates → viaStops             (unchanged)
4. hard caps (maxTotal / maxWait)          (unchanged)
5. departure window + widening ladder      (unchanged)
6. PARETO filter                           (NEW, 1c)
7. sort via SORTERS[sortKey]               (1d)
8. slice(0, limit)                         (unchanged)
```
**Pareto runs after the window**, never before — an itinerary outside the window must not delete a
visible one.

---

## STEP 2 — `index_raw.html` + `index.html`

### 2a) No change to `doSearch`

The call stays as it is; the new behaviour comes from the core defaults.

### 2b) Transfer line in the card — distinguish the wait

Extend the existing transfer info line (~lines 1158–1163). **Czech UI strings, keep verbatim:**

| condition | string |
|---|---|
| `throughService === true` | `Přestup: Horní nádraží · bus navazuje okamžitě` |
| `waitMin <= 2` and not through | `Přestup: Tržnice · čekání 0 min — velmi těsné` |
| otherwise | `Přestup: Tržnice / Nemocnice · čekání 12 min (stejné místo)` (today's format) |

Stop names still come from `viaStops` via `stopDisplayName()`, joined by ` / `.
No new CSS — reuse what the card already uses. Joe is the UX arbiter and will tune the look himself.

### 2c) `index.html`

Copy `index_raw.html` → `index.html` and **commit both**.

---

## STEP 3 — tests (`scripts/journey.test.js`)

Extend the J4-sort block. Keep the existing scenarios; they must still pass except where noted.

| scenario | input | expectation |
|---|---|---|
| **Joe's case** | Okružní→Tržnice, `20260804` 11:21 | 1st result **11:42 → 11:55, 13 min, lines 13→11, `throughService === true`, `waitMin === 0`** |
| morning (regression) | Tržnice→Okružní, `20260804` 08:00 | 1st result direct line 13, 08:06 → 08:18 |
| night (regression) | Krátká→Tržnice, `20260803` 23:44 | 1st result direct line 51, 01:15 → 01:30 |
| dead period (regression) | Globus→Nádraží Dalovice, `20260804` 08:00 | 1st departure 09:44 |
| **Pareto invariant** | all scenarios | for no result does another result exist with `depMin >= mine && arrMin < mine` |
| invariants (keep) | all scenarios | `arrMin > depMin`, `totalMin ∈ (0; 75]`, `waitMin == null \|\| (0 ≤ waitMin ≤ 40)` |

⚠️ **The "duplicate merging" scenario (Stará Role→Lázně I, Sunday 14:00) changes** — with
`minTransfer: 0` and Pareto the previous `14:26 → 15:09 / viaStops.length === 3` result is dominated
and disappears. Rewrite that assertion: check merging on whatever result the new pipeline returns
(any itinerary with `viaStops.length > 1`), or move the check to a scenario where merging still
occurs. **Do not weaken the merging logic to keep the old test green.**

---

## PROOF / verification

1. `node scripts/journey.test.js` → all scenarios PASS.
2. `node scripts/routing.test.js`, `node scripts/timetable.test.js` → unchanged.
3. `node scripts/verify_network.js` → **20/20 PASS** (this is the correct baseline after J8-hotfix;
   the previous spec said 26/26, that was the manager's error).
4. Manual check, paste into `RESULT`:
   ```
   node -e "const {planJourney}=require('./scripts/journey.js');const net=require('./data/network.json');
   console.log(planJourney(net,'Okružní','Tržnice',{date:'20260804',nowMin:681}))"
   ```
5. Commit: `scripts/journey.js`, `scripts/journey.test.js`, `index_raw.html`, `index.html`.
6. Into `RESULT`: what changed, and whether the Pareto sweep removed anything you did not expect.

**Visual testing on GitHub Pages is done by the manager / Joe — you have no browser.**

## DO NOT TOUCH

- `scripts/routing.js`, `scripts/timetable.js`, `scripts/build_network.js`, `scripts/verify_network.js`,
  `scripts/update_data.js`, `.github/workflows/update-data.yml`, `data/`.
- `transferItineraries` / `directItineraries` time logic from J4-fix (monotonic time axis).
- The window ladder, the caps and the merging from J4-sort — they work, only the two steps above change.
- `SORTERS` keys `departure`, `arrival`, `duration`, `transfers`.

## Verified by the manager in advance (2026-08-04) — this is what it should look like

Simulated against `data/network.json` with the exact pipeline from 1e, **without touching the code**:

```
### Joe's case   Okružní→Tržnice, Tue 11:21
   11:42 → 11:55 | 13m | THROUGH 13→11 @Horní nádraží (wait 0)   ← was missing entirely
   11:54 → 12:06 | 12m | DIRECT 15
   12:14 → 12:26 | 12m | DIRECT 15
   12:14 → 12:26 | 12m | transfer 15→12 @Pivovar (wait 0)
   12:22 → 12:35 | 13m | DIRECT 13
   12:34 → 12:46 | 12m | DIRECT 15

### morning      Tržnice→Okružní, 08:00      1st: 08:06 → 08:18 DIRECT 13
### night        Krátká→Tržnice, 23:44       1st: 01:15 → 01:30 DIRECT 51 (window ladder → 240)
### dead period  Globus→Nádraží Dalovice     1st: 09:44 → 10:31 transfer 1→19 @Tržnice
### Sunday       Stará Role→Lázně I, 14:00   1st: 14:01 → 14:29 transfer 15→2 @Tržnice (wait 0)
```

Pareto invariant held in all five. The `wait 0` entries at Pivovar and Tržnice are the expected
consequence of `minTransfer: 0` — Joe accepted that trade-off knowingly, do not filter them out.

## RESULT (filled in by the executor)

**Done, all steps per spec.**

- **`scripts/journey.js`:**
  - `minTransfer` default `3 → 0` (1a), one-line change, stays a parameter.
  - `throughService` flag added to transfer itineraries (1b) — literal last-stop-of-leg1 /
    first-stop-of-leg2 comparison, label only, never used for filtering.
  - New `paretoFilter()` (1c) — single sweep as specified (sort desc by `depMin`/asc `arrMin`,
    walk equal-`depMin` groups, keep while `arrMin` strictly improves). Verified against the
    manual invariant check in tests (no result dominated by another with `depMin >= mine && arrMin
    < mine`).
  - `SORTERS.smart` rewritten (1d) — `depMin → arrMin → transfers → totalMin`. The old "all direct
    first" block is gone; `transfers` is now only the tie-break, exactly at the position the spec
    describes.
  - `planJourney` order of operations updated (1e): merge → caps → window ladder → **Pareto** →
    sort → `slice(limit)`. Pareto runs after the window, as required.
- **`index_raw.html` / `index.html`:** transfer line now branches on `throughService` /
  `waitMin <= 2` / default, exact Czech strings from the spec table. Copied and diffed identical.
- **`scripts/journey.test.js`:** added the "Joe's case" scenario (Okružní→Tržnice, 11:21) asserting
  the exact through-service result; added `checkParetoInvariant()` and ran it on every J4-sort
  scenario; rewrote the duplicate-merging assertion per the spec's warning — the old `viaStops.length
  === 3` result at 14:26→15:09 is now dominated and gone (expected, not a regression), the check now
  asserts any result with `viaStops.length > 1` exists (currently 14:01→14:29, length 2) and keeps
  the existing "no duplicate (depMin,arrMin,lines) keys" and invariant checks.

**Pareto sweep — what it actually removed:** exactly what the spec predicted, nothing more. Manually
diffed the Okružní→Tržnice 11:21 case against the manager's pre-verified simulation table — the six
survivors match it exactly, including the transfer-via-Pivovar entry merged to `viaStops.length ===
2`. In the duplicate-merge scenario (Stará Role→Lázně I, Sun 14:00) Pareto removed the slower/later
`14:26→15:09` triple-merge in favor of the earlier-and-faster `14:01→14:29` pair — the "vedlejší
efekt" TASK.md already flagged as expected fallout of `minTransfer: 0`, now made visible by Pareto
too. No other scenario lost a result that looked like it belonged.

**PROOF:**
1. `node scripts/journey.test.js` → all scenarios OK (`OK: J4-sort — všechny scénáře a invarianty
   prošly`), including the new Joe's-case and Pareto-invariant checks.
2. `node scripts/routing.test.js`, `node scripts/timetable.test.js` → unchanged, no FAIL.
3. `node scripts/verify_network.js` → **20/20 PASS** (confirmed baseline, matches spec).
4. Manual check (`planJourney(net,'Okružní','Tržnice',{date:'20260804',nowMin:681})`) — first result:
   `depMin:702 (11:42), arrMin:715 (11:55), totalMin:13, transfers:1, legs 13→11, transferStop:'S12',
   waitMin:0, throughService:true`. Matches the manager's simulated table exactly, entry for entry
   (through-13→11 first, then direct 15, direct 15, transfer 15→12 @Pivovar, direct 13, direct 15).
5. Commit: `scripts/journey.js`, `scripts/journey.test.js`, `index_raw.html`, `index.html`, plus the
   manager's already-pending `CLAUDE.md`/`TASK.md` doc updates and this `handoff.md` (bundled per the
   usual "next executor run commits pending docs" pattern), and `changelog.md`.

Not touched: `scripts/routing.js`, `scripts/timetable.js`, `scripts/build_network.js`,
`scripts/verify_network.js`, `scripts/update_data.js`, workflow, `data/`, the J4-fix time logic, the
window ladder / caps / merging, or `SORTERS.departure/arrival/duration/transfers`.

Visual testing on GitHub Pages not done (no browser here) — over to manager/Joe.
