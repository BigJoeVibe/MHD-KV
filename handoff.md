# Handoff — EXECUTOR spec (STEP D: same-name stop ids in the routing core)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-14).** J7-P2 is done, pushed and **reviewed by the manager** —
> tests re-run, board output verified row-by-row against the reference table. Joe approved the order
> **D → C → B**; this file is **D only**. C and B are written up in `TASK.md`, do not start them.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. Read `CLAUDE.md`, `scripts/routing.js` (all of `search`, plus `resolveStopId`, `normalizeName`,
   `buildCoLocatedMap`, `forwardSegments`), `scripts/journey.js` (`planJourney` ~274), and this file.

---

## The bug, in one line

`search()` resolves the origin and the destination to **one** stop id each, but one stop in the data
is split across **two** ids sharing the same name — so every line that only serves the *other* id is
invisible to Hledat.

**Reproduce it before you touch anything** (this is your before/after proof):

```js
const { search } = require("./scripts/routing.js");
const net = require("./data/network.json");
search(net, "Lázně I", "Parkoviště KOME", { maxTransfers: 1 }).length
// → 0     ← today
```

Zero. Line 20 is a two-stop shuttle `Lázně I ↔ Parkoviště KOME` (patterns with `line: 20`,
one per direction) and Hledat cannot find it at all, because `resolveStopId(net, "Lázně I")` returns
the id carrying lines 2/11/52 and never the id carrying line 20.

J7-P2 already fixed this **for the Tabule board only**, via `resolveStopIds` + `boardDepartures` in
`scripts/timetable.js`. This step fixes the routing core, so Hledat sees it too.

> ⚠️ **Do not hardcode stop ids in code or tests.** The daily J8 refresh reshuffles `S#`/`P#` on every
> data update — the ids in the previous handoff (`S63`/`S143`) are already stale, they are `S1`/`S154`
> today, and they will be something else next week. Look ids up **by name** from `net.stops`, the way
> `verify_network.js` and the J7-P2 tests already do.

---

## STEP D1 — `sameNameIds` index in `scripts/routing.js`

Expansion must go **from an id to its same-name siblings**, not from a name to ids. Reason:
`planJourney` (`journey.js` ~287) already calls `resolveStopId` and passes an **id** into `search`,
so a name-based expansion inside `search` would never fire on the real call path. An id-based one
fires on both paths and needs **no change in `journey.js` at all**.

Add, next to `buildCoLocatedMap`:

```
buildSameNameMap(net) -> Map<stopId, string[]>
```

- Group all ids by `normalizeName(net.stops[id].n)` — **reuse the existing `normalizeName`, do not
  modify it.** (It is also used by `coLocatedGroups` to pick the 60 m vs 30 m threshold; changing it
  would silently move that boundary. Diacritics leniency is step **C**, not this one.)
- Map every id to the **full** group **including itself**, so the caller gets one array to iterate.
- Build it **once per `search()` call**, same as `buildCoLocatedMap` — not per pattern, not per loop.

## STEP D2 — use it for origin and destination in `search()`

Inside `search()`, after `stopA` / `stopB` are resolved and the `!stopA || !stopB` guard has run:

- `originIds` = `Set` of `sameNameMap.get(stopA)`
- `destIds` = `Set` of `sameNameMap.get(stopB)`

Then replace the scalar comparisons. This is mechanical — **the shape of the loops does not change**:

| today | after |
|---|---|
| `forwardSegments(net, patternId, stopA)` | one loop level more: `for (const a of originIds)` → `forwardSegments(net, patternId, a)` |
| `seg.after.indexOf(stopB)` | index of the **first** element that is in `destIds` (small local helper, e.g. `firstIndexIn(arr, set)`) |
| `if (T === stopB \|\| T === stopA)` | `if (destIds.has(T) \|\| originIds.has(T))` |
| `if (Tp === stopA \|\| Tp === stopB)` | `if (originIds.has(Tp) \|\| destIds.has(Tp))` |
| `seg2.after.indexOf(stopB)` | same `firstIndexIn(..., destIds)` |
| `seg2.after.includes(stopB)` (the `maxTransfers >= 2` skip) | `seg2.after.some((x) => destIds.has(x))` |
| the `T2` / `T2p` guards against `stopA` / `stopB` | the same set checks |

Apply it consistently to **all three** blocks (`transfers: 0`, `1` and `2`). The existing dedup by
`resultKey` already collapses anything the wider origin set produces twice — do not add a second one.

**Leave alone:** `resolveStopId` itself (`verify_network.js` and `index_raw.html`'s `doSearch` both
call it and both must keep working exactly as now), `transferPoints` / the co-located logic
(different concern: *nearby* stops, not *same-name* ones — do not merge the two mechanisms), the
sorting block at the end of `search`, `journey.js`, `timetable.js`.

## STEP D3 — tests (`scripts/routing.test.js`)

| scenario | expectation |
|---|---|
| **the fix** | `search(net, "Lázně I", "Parkoviště KOME", {maxTransfers: 1})` returns **≥ 1 variant with `transfers: 0` on line 20** (today: 0 variants total) |
| reverse direction | `search(net, "Parkoviště KOME", "Lázně I", …)` likewise finds the line-20 direct |
| **no-regression invariant** ⭐ | for a name with a **single** id, the result is **unchanged** — assert `search(net, "Krátká", "Tržnice", {maxTransfers: 1})` still returns **1296** variants, **7** of them direct (measured by the manager on today's data; if the number moved, the data refresh moved it — re-measure on `main` **before** your change and say so in `RESULT`, do not just update the literal) |
| ids resolved by name | wherever a test needs an id, look it up from `net.stops` by name — no `S#` literals |

Add a **timed** check to `RESULT` (not necessarily to the suite): `search(net, "Krátká", "Tržnice")`
runs in ~7 ms today. Only 1 name of 156 has two ids, so the extra loop level should be free —
if it is not, say so, that changes whether this ships as is.

## PROOF / verification

1. `node scripts/routing.test.js`, `journey.test.js`, `timetable.test.js` → all PASS, no FAIL lines.
2. `node scripts/verify_network.js` → **20/20 PASS**, guard untouched.
3. `index_raw.html` and `index.html` should not need to change at all in this step. If you find you
   must touch them, stop and write why in `RESULT` instead — that would mean the fix leaked into UI.
4. Into `RESULT`: the before/after numbers for `Lázně I → Parkoviště KOME`, the Krátká→Tržnice
   regression counts, the timing, and anything the spec did not predict.

**Visual testing on GitHub Pages is done by Joe — you have no browser.**

## DO NOT TOUCH

- `scripts/timetable.js`, `scripts/build_network.js`, `scripts/verify_network.js`,
  `scripts/update_data.js`, `.github/workflows/`, `data/`.
- `normalizeName` (see D1), `resolveStopId`, `coLocatedGroups` / `buildCoLocatedMap` /
  `transferPoints`, the final sort in `search`.
- `index_raw.html` / `index.html` (see PROOF 3).
- **Step C** (free text / diacritics: `Kratka` and `lazne` resolve to nothing today, so the board
  lies with `Dnes už odsud nic nejede.`) and **step B** (`KNOWN_LINE_CLASSES` is a `Set` of strings
  while `line` is a number, so the coloured line badges never apply) — both are approved and written
  up in `TASK.md`, both come **after** this one. Do not fold them in, even though C touches nearby
  code. If you spot more, write it into `TASK.md`, do not implement it.

## RESULT (filled in by the executor)

**STEP D done, 2026-08-14.** `buildSameNameMap(net)` added next to `buildCoLocatedMap` in
`scripts/routing.js`; `search()` resolves `stopA`/`stopB` to `originIds`/`destIds` sets right after
the `!stopA || !stopB` guard and uses them everywhere the spec's mapping table said to, across all
three blocks (`transfers: 0`, `1`, `2`). No changes outside `scripts/routing.js` and
`scripts/routing.test.js` — `journey.js`, `timetable.js`, `index_raw.html`/`index.html` untouched
(confirmed via `git status`: only the two `scripts/routing*` files are modified beyond the manager's
pending doc edits).

**Before/after — `Lázně I ↔ Parkoviště KOME`** (ids looked up by name at run time, not hardcoded):
- Before (reproduced on `main` prior to the change, per spec's repro snippet): `search(net, "Lázně I",
  "Parkoviště KOME", {maxTransfers: 1}).length` → **0**.
- After: **1** variant, `transfers: 0`, `legs[0].line === 20` — both directions
  (`Lázně I → Parkoviště KOME` and the reverse) find the direct line-20 shuttle.

**No-regression invariant (single-id name):** `search(net, "Krátká", "Tržnice", {maxTransfers: 1})`
→ **1296** variants, **7** direct — matches the manager's pre-measured numbers exactly, no re-measure
needed.

**Timing:** `search(net, "Krátká", "Tržnice")` (default `maxTransfers: 1`) → **~3.8–5.6 ms** across
several runs, in line with the ~7 ms baseline the spec expected. The extra `for (const a of
originIds)` loop level is free in practice since only 1 of 156 names has more than one id.

**Tests added** (`scripts/routing.test.js`, new "STEP D" block at the end): the fix (line-20 direct
found), reverse direction, no-regression count, and a timing line — all via `console.log`
OK/FAIL in the same style as the rest of the file, ids resolved by name through `search()`/
`resolveStopId`, no `S#`/`P#` literals anywhere.

**Verification:**
1. `node scripts/routing.test.js` → all OK, no FAIL lines (full output reviewed, including STEP D
   block and the pre-existing H1a–d tolerant checks, all still OK/INFO as before).
2. `node scripts/journey.test.js` → exit 0, no FAIL lines.
3. `node scripts/timetable.test.js` → exit 0, no FAIL lines.
4. `node scripts/verify_network.js` → **PASS: 20, FAIL: 0**.
5. `index_raw.html`/`index.html` not touched (`git status` confirms; `diff -q index.html
   index_raw.html` still reports them identical).

**Nothing beyond spec was found or needed.** Steps C and B were not started, per the handoff.
