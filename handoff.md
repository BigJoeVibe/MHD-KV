# Handoff — EXECUTOR spec (STEP B: real DPKV line colours on the badges)

> **LANGUAGE:** this file, your code comments, commit messages and the `RESULT` section below are
> **English**. Czech stays only in: stop names (they come from the data), UI strings shown to the
> user, and the project docs `CLAUDE.md` / `TASK.md` / `docs/*.md` (those are the owner's, do not
> translate them). Work internally in English.

> 🔴 **ACTIVE SPEC (manager, 2026-08-14).** Steps **D and C are done, pushed and reviewed**. This is
> **B**, the last of the three. It is the only one that changes what Joe actually sees, in **three
> tabs at once** — so keep it surgical.

> **Handoff for the lower CC (executor).** Implement per the bullets, **nothing beyond the spec**.
> You do the git. Small steps, code as a **diff**, commit + test.

## How to start
1. "Use skill **kod-jadro**."
2. Read `CLAUDE.md`, **`docs/DPKV_BARVY.md`** (the palette, where it came from and why the numeral
   colour is computed — read this before you touch anything), and `index_raw.html`: the
   `.line-badge` CSS ~241, `KNOWN_LINE_CLASSES` ~1287, and the three render sites at ~1023
   (`Moje trasy`), ~1222 (`Tabule`), ~1342 (`Hledat`).

---

## The bug, in one line

`KNOWN_LINE_CLASSES` is a `Set` of **strings** (`'3'`, `'9'`, …) but `leg.line` / `row.line` coming
out of `network.json` is a **number** — so `.has(line)` never matches and the coloured badge never
applies. In any tab. It has been shipped like this the whole time.

```js
new Set(['3','9','13','15','51']).has(3)   // → false
```

Fixing only the type would be a poor outcome, though: the old palette covers **5** lines (leftovers
from the F1 app) while the data has **23**. Joe's decision (14. 8.): replace it with the **real DPKV
palette** from the official line schema.

## STEP B1 — the palette

Take the values from **`docs/DPKV_BARVY.md`** — do not retype them from this file, that doc is the
source of truth and carries the provenance. Put them in `index_raw.html` as a plain object keyed by
**number** (the same type the data uses), replacing `KNOWN_LINE_CLASSES`:

```js
const LINE_COLORS = { 1: '#2f2a84', 2: '#5196cd', /* … see docs/DPKV_BARVY.md … */ };
```

- 21 lines are covered (19 day + 2 night). **Lines 20 and 44 are deliberately absent** — DPKV runs
  them outside the main schema, we have no official colour. They must fall back to the current
  neutral badge (`var(--bg4)` background, white numeral) and must not break anything.
- Do not invent colours for them. Do not interpolate, hash, or generate.

## STEP B2 — computed numeral colour

The app is dark-theme with a white numeral. On this palette that fails badly: **16 of 21 colours are
below 4.5 : 1 with white text, 10 below even 3 : 1** (line 9 `#f2cb5c` sits at 1.56 : 1). So the
background stays exactly DPKV's, and the **numeral colour is chosen per line**:

- Compute WCAG relative luminance of the background, then the contrast ratio against `#ffffff` and
  against `#0a0c0f`, and use whichever is higher.
- `#0a0c0f` is not arbitrary — it is the lightest dark that keeps **every** line at AA. The
  measurements are in `docs/DPKV_BARVY.md`; do not substitute a different dark without redoing them.
- Write it as one small helper (e.g. `lineBadgeStyle(line) -> {bg, fg}`) used by **all three** render
  sites, so they cannot drift apart. Unknown line → return `null` / a neutral marker and let the
  existing default styling stand.
- Apply via inline `style` on the existing `.line-badge` element. The numeral is inside
  `<span>`, and `.line-badge span { color: #fff }` currently forces white — that rule has to stop
  winning over the computed colour. Set the colour where it actually applies; do not add
  `!important` anywhere.

## STEP B3 — clean up what this replaces

- Delete the `.line-3` / `.line-9` / `.line-13` / `.line-15` / `.line-51` CSS rules and the
  `.line-51 span { color: #f0728a }` override. They are the old F1 palette and nothing else uses them.
- Delete `KNOWN_LINE_CLASSES` and the three `const cls = …` expressions that read it.
- ⚠️ `DATA.routes` (the dead F1 data block) still has `colorClass: "line-3"` etc. on ~5 entries.
  **Leave those alone** — `DATA.routes` is scheduled for its own cleanup and touching it here would
  mix two changes in one diff. The CSS classes going away does not break it; nothing renders it.

## STEP B4 — check, since there are no UI tests

There is no test harness for `index_raw.html`, so do this by hand and report the numbers:

| check | expectation |
|---|---|
| every line in the data | for each of the 23 lines in `data/network.json`, `lineBadgeStyle` returns either a `{bg, fg}` pair or the neutral fallback — **never `undefined`, never a crash** |
| contrast | for all 21 palette lines, the chosen `fg` is at **≥ 4.5 : 1** against its `bg` (worst case should land at 4.58, line 13) |
| type safety ⭐ | the lookup works with a **number** key, the actual type in the data — the bug being fixed is precisely a string/number mismatch, so assert it with `typeof` rather than assuming |
| fallback | lines **20** and **44** render the neutral badge, no console error |

A tiny throwaway Node snippet that requires nothing from the DOM is fine for the contrast and
coverage maths — say in `RESULT` what you ran and what it printed. Do not add a new test file to the
repo for this.

## PROOF / verification

1. `node scripts/routing.test.js`, `journey.test.js`, `timetable.test.js` → all PASS, no FAIL lines.
   (None of them touch the UI — this is a regression check that you did not stray out of
   `index_raw.html`.)
2. `node scripts/verify_network.js` → **20/20 PASS**.
3. Copy `index_raw.html` → `index.html`, commit both.
4. Into `RESULT`: the coverage/contrast numbers from B4, confirmation that lines 20 and 44 fall back
   cleanly, and anything the spec did not predict — **especially the CSS specificity of
   `.line-badge span`**, which is the part most likely to behave differently than described.

**Visual testing on GitHub Pages is done by Joe — you have no browser, and this step is *entirely*
visual.** Your job is to make it correct and consistent; whether it looks right is his call.

## DO NOT TOUCH

- `scripts/*` — all of it. This step is `index_raw.html` + `index.html` only. If you believe you need
  a script change, stop and write why in `RESULT` instead.
- `DATA.routes` and its `colorClass` fields (see B3).
- The `Teď` / `Jindy` mechanics and violet mode, the stop picker, the tab bar, the empty-state
  strings from step C, any layout or sizing. Only the badge's colours change.
- The palette values themselves — if a colour looks wrong to you, say so in `RESULT`; do not adjust
  it. They are a reconstruction from the official schema and Joe knows their error bars.
- ⚠️ **Never hardcode `S#`/`P#` ids** in code or tests — the daily J8 refresh reshuffles them.

## RESULT (filled in by the executor)

**Done.** `index_raw.html` + `index.html` only, `scripts/*` untouched.

- **B1 — palette:** `LINE_COLORS` (plain object, number keys) replaces `KNOWN_LINE_CLASSES`, values
  copied verbatim from `docs/DPKV_BARVY.md` (21 lines). Placed at the same spot `KNOWN_LINE_CLASSES`
  used to live (~line 1287, before all three render sites run for the first time — same pattern the
  original code already relied on).
- **B2 — computed numeral colour:** new `lineBadgeStyle(line)` (+ `relativeLuminance`/`contrastRatio`/
  `srgbChannelToLinear` helpers, standard WCAG relative-luminance formula) used by all three render
  sites (`renderBoard` legs, Tabule rows, Hledat legs). Background goes inline on the `.line-badge`
  div (`background:${bs.bg}`); the numeral colour goes inline **on the `<span>` itself**
  (`style="color:${bs.fg}"`), not on the div — see the CSS-specificity note below, this is the part
  the spec flagged as most likely to surprise. Unknown line → `lineBadgeStyle` returns `null`, both
  inline styles are omitted, and the pre-existing `.line-badge` (bg `var(--bg4)`) / `.line-badge span`
  (`color:#fff`) CSS rules apply unchanged — that's the neutral fallback.
- **B3 — cleanup:** deleted `.line-3`/`.line-9`/`.line-13`/`.line-15`/`.line-51`/`.line-51 span` CSS
  rules and `KNOWN_LINE_CLASSES` plus its three `const cls = …` call sites. `.line-badge span { color:
  #fff }` was **kept** — it's now doing real work as the fallback text colour for lines 20/44, not
  dead weight. `DATA.routes` and its `colorClass` fields left untouched, confirmed via grep — nothing
  else references the deleted classes.

### B4 — numbers (throwaway Node snippet, not committed, ran against the live `data/network.json`)

Re-implemented `LINE_COLORS`/`contrastRatio`/`lineBadgeStyle` verbatim in a `node -e` one-liner and
ran it over the 23 line numbers actually present in `data/network.json` (collected from
`net.patterns[*].line`):

| check | result |
|---|---|
| every line in the data | all 23 lines → `lineBadgeStyle` returned either `{bg, fg}` or `null`, **never `undefined`** |
| contrast | worst case across all 21 palette lines: **4.58, line 13** — matches `docs/DPKV_BARVY.md` exactly, all ≥ 4.5:1 |
| type safety | `typeof lineBadgeStyle(13)` → `object` (not `undefined`), confirmed with a **number** literal, the actual type `net.patterns[*].line` uses |
| fallback | line 20 → `null`, line 44 → `null`, both present in the 23-line data set — no crash, no console error (pure string templating, no DOM) |

**Unpredicted finding, worth flagging:** the type-safety bug being fixed doesn't actually reproduce
the same way on a plain object as it did on `Set`. `Set.has()` does strict equality with no
coercion, so `new Set(['13']).has(13)` really is `false` — that was the original bug. But **plain
JS object keys are always coerced to strings on both write and read** (`LINE_COLORS[13]` and
`LINE_COLORS['13']` address the identical property), so `lineBadgeStyle(13)` and
`lineBadgeStyle('13')` return the same result — checked this directly, both non-null with the same
`{bg, fg}`. The number-keyed object is still the right, honest choice (matches the data's actual
type, self-documents you're keying on `line`), but the fix works *even if* something upstream ever
passed a stringified line number — not because of any explicit coercion I added, just how object
property access works. Flagging since the spec asked me not to assume this.

**CSS specificity, as requested:** `.line-badge span { color: #fff }` is a class-descendant selector
(specificity 0,2,0). An inline `style="color:…"` **on the div** would not have beaten it — `color` is
inherited, and an inherited value always loses to *any* explicit rule on the element itself,
regardless of specificity math, so setting the colour on the outer div would have silently done
nothing. Inline `style` **on the `<span>` element directly** wins over any external stylesheet rule
unconditionally (barring `!important`, which neither side uses) — that's the mechanism actually
relied on here, not specificity at all.

### PROOF

1. `node scripts/routing.test.js` / `journey.test.js` / `timetable.test.js` → all exit clean, zero
   `FAIL` lines (includes the STEP C/STEP D/J7-P1 blocks from prior steps — confirms nothing outside
   `index_raw.html` was touched).
2. `node scripts/verify_network.js` → **20/20 PASS**.
3. `index.html` re-copied from `index_raw.html`, `diff -q` clean.

**Visual check on GitHub Pages is Joe's, per spec** — no browser available here. This closes the
D → C → B sequence from the manager's 14. 8. plan; all three are now implemented, tested and
pushed.
