# Handoff — EXECUTOR spec (J7-P2: "Tabule" tab + shared stop picker)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-12).** J7-P1 is done, pushed and **verified by Joe on Pages** —
> "Moje trasy" works including the `Jindy` mode. This is the second half of J7.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. Read `CLAUDE.md`, `scripts/timetable.js` (`nextDepartures`), `scripts/routing.js`
   (`resolveStopId`), `index_raw.html` (`renderSearch` ~1029 for the current `<datalist>`,
   `renderDepartureCards`, `showTab`, `render`, `tick`), and this file.

---

## Target state

A new **`Tabule`** tab: pick a stop, see everything departing from it, chronologically, like the
display at a real stop. Tab order becomes `Moje trasy · Tabule · Hledat · Nastavení`.

Two supporting pieces come with it, both of which fix existing problems:

- a **shared stop picker** replacing the native `<datalist>` (Joe: autocomplete does not work on
  mobile), used by **both** `Tabule` and `Hledat`;
- **merging stop IDs that share a name**, because one stop in the data is split in two.

---

## STEP 1 — the data bug: one name, two stop IDs

`resolveStopId(net, "Lázně I")` returns **S63** only. But the data has two stops with that exact
name at **identical coordinates (0 m apart)**:

| id | patterns | lines |
|---|---|---|
| `S63` | 24 | 2, 11, 52 |
| `S143` | 2 | **20** |

So a board for "Lázně I" would silently omit every line 20 departure. This is the only affected name
today (1 of 156 checked), but a stop board is exactly where it looks like a broken app.

### 1a) `resolveStopIds(net, stopIdOrName)` in `scripts/timetable.js`

Returns an **array**:
- if a stop id is passed → `[thatId]`
- if a name is passed → **all** ids whose `n` matches (same matching rules `resolveStopId` uses now)
- no match → `[]`

### 1b) `boardDepartures(net, stopIdOrName, dateStr, nowMin, opts)` in `scripts/timetable.js`

- Runs `nextDepartures` for **every** id from `resolveStopIds` (each with a generous internal limit,
  e.g. `limit * 4`), concatenates, sorts ascending by `depMin`, returns the first `limit`
  (default **10**).
- Each row keeps what `nextDepartures` already returns: `line`, `headsign`, `patternId`,
  `stopIndex`, `depMin`.
- The night crossing (`nowMin >= 1080 && depMin < 420 → +1440`) is already inside `nextDepartures` —
  do not reimplement it.
- Export both functions from `MHDTimetable`.

⚠️ **Do NOT change `resolveStopId` or `planJourney`.** Search has the same blind spot (typing
"Lázně I" as origin ignores line 20), but fixing it touches the routing core and belongs in its own
handoff. It is already written down in `TASK.md`.

### 1c) `matchStopNames(names, query, limit)` in `scripts/timetable.js`

Pure helper for the picker, so it is testable in Node (you have no browser):

- Normalise both sides: `s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()` —
  **diacritics- and case-insensitive**, so `lazne` matches `Lázně I` and `horni nad` matches
  `Horní nádraží`.
- Substring match, not just prefix.
- Rank matches that **start with** the query before the rest; otherwise keep alphabetical order
  (`localeCompare(…, "cs")`).
- Return at most `limit` (default 8).

Manager-verified expectations: `lazne` → `Lázně III`, `Lázně I` · `krat` → `Krátká` ·
`trznice` → `Tržnice` · `horni nad` → `Horní nádraží`.

---

## STEP 2 — shared stop picker in `index_raw.html`

**Why not `<datalist>`:** it is what the app uses today (`renderSearch`, `stopList`), it renders on
desktop, but iOS Safari effectively ignores it — so on a phone there is no autocomplete at all.

Build a small custom picker. No library, no new file — the stop list is 156 names, ~2 kB.

- A text `<input>` plus a suggestion `<div>` that the app renders itself from
  `matchStopNames(stopNames, value, 8)`.
- Behaviour: type → list appears · tap or click a suggestion → fills the input and closes ·
  `Enter` → takes the first suggestion · `Esc` → closes · blur closes, but **with a short delay**
  so a tap on a suggestion still registers (classic mobile trap).
- **Touch-sized rows** — reuse the sizing of an existing tappable element, no hover-only styling,
  nothing that depends on a mouse.
- Free text stays allowed; the final resolution is still `resolveStopId` / `resolveStopIds`.
- Use it in **`Hledat` for both fields** (replacing `list="stopList"` and the `<datalist>` element,
  which is then deleted) **and** in the new `Tabule` tab.
- Both `Hledat` fields must work independently on the same screen — key the picker state by field id.

No new visual language. Joe is the UX arbiter and will tune the look after seeing it.

---

## STEP 3 — the `Tabule` tab

- New tab button between `Moje trasy` and `Hledat`; internal id `board`. Add the `case 'board':`
  branch to `render()`, and include it in `tick()` the same way `departures` is handled (re-render
  once a minute when the tab is active and `useCustomTime` is false).
- Layout, top to bottom:
  1. the `Teď` / `Jindy` toggle, exactly as the other tabs use it (violet mode included);
  2. the stop picker (Czech label `Zastávka`, placeholder `Zastávka…`);
  3. the rows.
- **Row:** departure time · line badge · headsign (direction) with the `Karlovy Vary,` prefix
  stripped via the existing `stopDisplayName()` · countdown on the right via the existing
  `formatCountdown()` / `countdownClass()`.
- Rows are **chronological**, not grouped by line (Joe's decision — it should read like the display
  at a stop).
- Default stop on first open: `Krátká`. The chosen stop is remembered in a module variable for the
  session only — **no `localStorage`**, persistence comes later with the cloud storage decision.
- Empty state, Czech UI string: `Dnes už odsud nic nejede.`

**Manager-verified reference output** (`20260812`, 10:00) — the tab should produce this:

```
Tabule Tržnice                         Tabule Lázně I  (merged S63 + S143)
  10:00  13  → Stará Role sídliště       10:03   2  → OC Varyáda
  10:00   6  → Doubí                     10:05  20  → Parkoviště KOME     ← S143, invisible today
  10:05  12  → Dolní nádraží - terminál  10:09  11  → Divadelní náměstí
  10:06   3  → Stará Kysibelská          10:20  11  → Lanovka Imperial
  10:08   4  → Horní nádraží             10:20  20  → Parkoviště KOME
```

---

## STEP 4 — tests (`scripts/timetable.test.js`)

| scenario | expectation |
|---|---|
| `resolveStopIds` by name | `"Lázně I"` → **2 ids** (`S63`, `S143`), order irrelevant |
| `resolveStopIds` by id | `"S63"` → `["S63"]` |
| **merged board** | `boardDepartures(net, "Lázně I", "20260812", 600, {limit: 10})` contains **at least one line 20 row**, and the first row is `10:03` line 2 |
| chronological | rows are non-decreasing by `depMin`; `limit` respected |
| hub | `boardDepartures(net, "Tržnice", "20260812", 600, {limit: 8})` → first row `10:00` line 13 or 6 (both depart 10:00 — assert the time, not the line) |
| night | `boardDepartures(net, "Krátká", "20260812", 1430, {limit: 5})` → not empty, no `depMin < nowMin` |
| `matchStopNames` | the four queries from 1c return the listed names; unknown query → `[]` |

Existing `timetable.test.js` / `journey.test.js` / `routing.test.js` scenarios must stay green.

## PROOF / verification

1. `node scripts/timetable.test.js`, `node scripts/journey.test.js`, `node scripts/routing.test.js`
   → all PASS.
2. `node scripts/verify_network.js` → **20/20 PASS**, guard untouched.
3. Copy `index_raw.html` → `index.html`, commit both.
4. Into `RESULT`: confirmation that the merged board shows line 20 at Lázně I, plus anything the
   spec did not predict — especially around the picker's blur/tap timing, which is the part most
   likely to behave differently than described.

**Visual testing on GitHub Pages is done by Joe — you have no browser.** The picker is a touch
interaction, so his test is the only real one.

## DO NOT TOUCH

- `scripts/routing.js` (including `resolveStopId`), `scripts/journey.js`, `scripts/build_network.js`,
  `scripts/verify_network.js`, `scripts/update_data.js`, `.github/workflows/`, `data/`.
- `Moje trasy` (`ROUTE_GROUPS`, `planBoard`, its card rendering) — P1 is verified, leave it alone
  apart from the tab bar gaining one button.
- The `Teď` / `Jindy` mechanics and violet mode.
- `DATA.routes` and its dead helpers — they go away in a separate cleanup after Joe confirms
  nothing is missing.

## RESULT (filled in by the executor)

**Done, all four steps, committed.** Detail in `changelog.md` (2026-08-14 entry).

- **STEP 1** — `resolveStopIds`/`boardDepartures`/`matchStopNames` added to `scripts/timetable.js`,
  exported from `MHDTimetable`. `routing.js` and `journey.js` are untouched (confirmed via `git diff`
  before commit — only `scripts/timetable.js`, `scripts/timetable.test.js`, `index_raw.html`,
  `index.html` plus the docs files changed).
- **STEP 2** — shared picker lives in `index_raw.html` (search for `STOP PICKER (J7-P2)`). Both
  Hledat fields (`picker-searchFrom`/`picker-searchTo`) and the new Tabule field (`picker-board`) use
  it; `<datalist id="stopList">` and `onSearchFieldChange` are gone, `swapSearchStops`/`doSearch` now
  read `picker-searchFrom`/`picker-searchTo` by id.
- **STEP 3** — Tabule tab added between Moje trasy and Hledat (`showTab`'s index array, `render()`'s
  switch, `tick()`). Default stop `Krátká`, module-level `boardStop` var (session-only, confirmed no
  `localStorage` calls anywhere in the new code).
- **STEP 4** — new block in `scripts/timetable.test.js` covers every row of the spec's table plus the
  `matchStopNames` unknown-query case. All OK, no FAIL lines.

**Confirmed: merged board shows line 20 at Lázně I.** `boardDepartures(net, "Lázně I", "20260812",
600, {limit: 10})` returns a `line: 20` row (`10:05 → Parkoviště KOME`), and the first row is
`10:03` line 2 as predicted — output matches the manager's reference table exactly (also spot-checked
Tržnice: `10:00 13`, `10:00 6`, `10:05 12`, `10:06 3`, `10:08 4` — byte-for-byte the same lines as the
table in this file).

**Things the spec didn't fully predict:**

1. **Blur/tap timing (the part you flagged as riskiest):** implemented exactly as described — `onblur`
   starts a 150ms `setTimeout` before clearing the suggestion list, suggestion rows use `onclick` (not
   `onmousedown`), so a tap's click has 150ms to land before the list is torn down. I exercised this
   in a Node `vm` DOM shim (focus → type → simulated blur-with-immediate-timer → click) and it behaves
   as designed with no exceptions, but a shim can't reproduce real mobile event ordering (some iOS
   Safari versions fire `blur` differently around synthetic taps vs. real touches) — this genuinely
   needs your phone, not my Node harness.
2. **`KNOWN_LINE_CLASSES` is a `Set` of strings (`'3'`, `'9'`, ...) but `row.line`/`leg.line` coming
   out of `network.json`/`journey.js` is a **number** — so `.has(line)` never matches and the colored
   `.line-N` badge background never applies anywhere line data flows through this path (Hledat, Moje
   trasy, and now Tabule all show badges with the default `var(--bg4)` background, not per-line
   colors). This is **pre-existing**, not something I introduced — I checked, it's the same
   expression already shipped in `renderSearchResults`/`renderDepartureCards` and verified by you on
   Pages, so either it's not visually obvious against the badge's white text, or the color difference
   wasn't the thing you were checking. I left Tabule consistent with the existing (buggy-as-shipped)
   expression rather than silently diverging from it — flagging here since a one-line `String(line)`
   fix would touch all three tabs at once, which felt like more than this handoff asked for.
3. **`stopDisplayName` on the headsign only** — the merged Lázně I board's line-20 row prints
   `Parkoviště KOME` with no `Karlovy Vary,` prefix to strip (that stop's data just doesn't have the
   prefix, unlike most others), so nothing to fix, just noting the data isn't fully consistent about
   this.
4. Picker suggestion rows use inline `onclick="selectPickerStop('${fieldId}', this.dataset.name)"` —
   checked all 156 stop names for `'`/`"`/`<`/`>`/backslash, none present, so this is safe for the
   current dataset; the picker's own text `<input value="...">` is escaped (`escapeAttr`) since that
   one echoes whatever the user actually types.

**Verification run:** `node scripts/timetable.test.js` / `journey.test.js` / `routing.test.js` — all
exit 0, no FAIL lines. `node scripts/verify_network.js` — 20/20 PASS, guard untouched.
`index_raw.html` copied to `index.html`, `diff` confirms identical. Additionally loaded the real
inline script + 3 `<script src>` modules through a Node `vm` context with a minimal `document`/`fetch`
shim (ad hoc, not committed) and drove it through: tab switch to Tabule, typing into the picker,
clicking a suggestion, board re-render, Enter/Escape/blur on the picker, and independent typing in
both Hledat fields simultaneously — no exceptions, output matched expectations at every step. **Not a
substitute for your visual/touch pass on Pages** — I have no browser here.
