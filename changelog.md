# Changelog — MHD KV „Jedeme MHD"

Zápis po každém uzavřeném celku (ne po každém řádku kódu).
Formát: datum + verze + 2–4 odrážky CO a PROČ. Nejnovější nahoře.
Verze dle SemVer; 0.x = vývojové/testovací verze (viz CLAUDE.md).
Backlog byl přesunut do `TASK.md`.

---

## 2026-08-12 — v0.1.0 (J7-P1: "Moje trasy" tab on network.json)

- **`scripts/journey.js` — STEP 1a perf fix:** the departure window is now pushed down into the
  build itself instead of filtering a whole-day itinerary list afterwards. `directItineraries`/
  `transferItineraries` take a `maxDep` cutoff; a new `buildItineraries(net, variants, date, nowMin,
  minTransfer, maxDep)` runs one window-ladder step (90 → 240 → unbounded), re-running the build
  (not re-filtering) when a step comes back empty. Measured on 6 stop pairs (`20260805` 10:00):
  **689.9 ms pruned vs 2541.2 ms unpruned**, output `JSON.stringify`-identical for all 6 — matches
  the manager's own pre-check (681 / 2509 ms). `buildItineraries`/`mergeDuplicates`/`applyCaps`/
  `paretoFilter`/`SORTERS` are now also exported (test-only use, same convention as `routing.js`'s
  internals export) so the perf test can reconstruct the old pipeline for an apples-to-apples diff
  instead of duplicating the logic inline.
- **`scripts/journey.js` — new `planBoard(net, A, B, opts)`:** favourites-board rules on top of
  `planJourney({limit: 40, maxTransfers: 1})` — rows sharing `(depMin, arrMin)` collapse to the
  fewest-transfer one (kills the "same ride, pointless option to change buses" duplicate), transfer
  rows detouring more than `maxDetour` (default 10) past the best direct ride are dropped unless no
  direct exists at all, sorted by `depMin`, `limit: 6` by default.
- **`index_raw.html`/`index.html` — `Odjezdy` tab replaced by `Moje trasy`** (internal id
  `departures` kept unchanged): renders a hardcoded `ROUTE_GROUPS` ("Domov–Centrum": Krátká↔Tržnice,
  Okružní↔Tržnice) as one card per pair via `planBoard`, replacing the old `DATA.routes` /
  `travelMinutes` loop that caused the wrong-arrival-time bug (board said 1:28, reality 1:30). Each
  group gets a `Tam`/`Zpět` toggle (reuses the Teď/Jindy toggle markup) that swaps every pair in the
  group and re-renders. Rows are cached per render minute, keyed
  `groupIndex|reversed|from|to|date|nowMin`. `Jízdní řády` tab removed (button, `case 'timetable'`,
  `renderTimetable`); "Sledované linky" removed from Nastavení. `DATA.routes` and its helpers
  (`getUpcomingDepartures`, `getActiveWarnings`, `getEffectiveDayType`, `getNoteLetters`) are left in
  the file, now fully dead — confirmed via grep, no remaining call sites — kept for a safe rollback
  until J7-P2 per spec.
- **Extracted `transferInfoLine(it)`** (shared by the Hledat search-results card and the new board
  cards) out of `renderSearchResults`'s previously inline three-branch transfer-label logic — pure
  refactor, identical output, avoids the board and search cards drifting apart on the same fields.
- **`scripts/journey.test.js`** — new "J7-P1 STEP 1a" block (pruned-vs-unpruned byte-identical check
  + timing) and "J7-P1 STEP 1b" block (board-midday all-direct/5–6 rows/first-row check, board-morning
  first-row, no-direct-exists returns non-empty all-transfer rows for Krátká→Horní nádraží, no two
  rows share `(depMin, arrMin)`, no transfer row breaches the detour cap — checked across every
  scenario). All existing scenarios unchanged and still passing.
- **Verified:** `journey.test.js`/`routing.test.js`/`timetable.test.js` all exit 0,
  `verify_network.js` 20/20 PASS (guard untouched). Additionally ran the real `index_raw.html` inline
  script plus the three `<script src>` modules together through a Node `vm` context with a minimal
  `document`/`fetch` shim (ad hoc, not committed) — confirms the new render path executes without
  throwing, produces the expected group/card/toggle markup in both directions, and that Nastavení/
  Hledat still render correctly. **Not a substitute for the manager's visual pass on Pages** — no
  layout/CSS assessment was possible from here. Detail and open flags (toggle placement guess, kept
  the walk-note in the board's transfer sub-line) in `handoff.md` → RESULT.

## 2026-08-05 — v0.1.0 (J4-sort-2: Pareto ordering + through-running services)

- **`scripts/journey.js`:** `minTransfer` default `3 → 0` (Joe's decision 2026-08-04 — tight
  terminus-to-origin transfers like line 13→11 @Horní nádraží no longer get thrown away). New
  `throughService` flag on transfer itineraries (last stop of leg1's pattern === first stop of
  leg2's pattern) — label only, never a filter, since GTFS `block_id` is empty for all trips and
  can't prove same-vehicle. New `paretoFilter()`: drops any itinerary dominated by another that
  departs no earlier and arrives no later; single sweep, not O(n²). `SORTERS.smart` rewritten —
  time decides first (`depMin`, then `arrMin`), direct-vs-transfer is now only the tie-break
  instead of the primary rule. `planJourney` pipeline order: merge → caps → window ladder →
  **Pareto** (new) → sort → limit; Pareto runs after the window so an out-of-window itinerary can
  never delete a visible one.
- **`index_raw.html` / `index.html`:** transfer card label now distinguishes `throughService`
  ("bus navazuje okamžitě"), a tight `waitMin <= 2` wait ("velmi těsné"), and the normal case.
- **`scripts/journey.test.js`:** added Joe's live-test scenario (Okružní→Tržnice, Tue 11:21) —
  asserts the 13→11 through-transfer is now first, with `throughService === true` and `waitMin ===
  0`. Added a Pareto-invariant check (no result dominated by another) run across every J4-sort
  scenario. Rewrote the duplicate-merge assertion — with `minTransfer: 0` the old
  14:26→15:09/`viaStops.length===3` result is now itself dominated and gone (expected, not a
  regression); the check now asserts merging still happens on whatever the pipeline returns.
- **Verified:** `journey.test.js` all scenarios OK; `routing.test.js`/`timetable.test.js` unchanged;
  `verify_network.js` 20/20 PASS. Manual check against the manager's pre-verified simulation table
  for Okružní→Tržnice 11:21 matches exactly, all six results in the same order. Detail in
  `handoff.md` → RESULT.

## 2026-08-04 — v0.1.0 (J4-sort: pravidla malého města ve výsledcích hledání)

- **`scripts/journey.js` — nové domain limity a přepracované pořadí operací v `planJourney`**
  (spec `handoff.md`, rozhodnutí Joe 4. 8.): nové `opts.windowMin` (90), `opts.maxTotal` (75),
  `opts.maxWait` (40); nový výchozí `SORTERS.smart` (přímé spoje napřed, pak chronologicky podle
  odjezdu/příjezdu/počtu přestupů) nahrazuje `departure` jako default. Staré klíče řazení beze změny.
- **Sloučení identických jízd** — `itineraryKey` přepsán na `depMin|arrMin|linky` (bez per-leg časů,
  jinak by se tři jízdy lišící se jen přestupní zastávkou nesloučily); nová `mergeDuplicates()`
  sbírá přestupní zastávky duplicit do `it.viaStops`, `transferStop` zůstává pro zpětnou kompatibilitu.
- **Tvrdé stropy** (`applyCaps`) a **odjezdové okno se žebříkem rozšíření** 90 → 240 → bez omezení
  (`applyWindowLadder`) — řeší noc (přímý spoj 91 min daleko, mimo základní okno) i hluchá období
  (Globus→Nádraží Dalovice, první spoj až za 104 min). **Limit `slice(0, limit)` přesunut na úplný
  konec** pořadí operací — byla to přímá příčina původní chyby (limitovalo se, než se stihlo filtrovat
  podle času).
- **`index_raw.html`/`index.html`** — `doSearch` už neposílá `sort:'departure'` (bere nový default);
  nová hláška „Nejbližší spoj až v HH:MM." nad kartami, když první výsledek odjíždí až za oknem
  (recyklováno `.search-empty`, žádné nové CSS); karta přestupu vypisuje všechny `viaStops` místo
  jedné zastávky.
- **`scripts/journey.test.js`** — nový blok scénářů „J4-sort" (den ráno/odpoledne, noc s žebříkem
  oken, sloučení duplicit, hluché období) + globální invarianty (`totalMin<=75`, `waitMin<=40`).
  Všechny sedí přesně na čísla, která si manager předem nasimuloval nad daty bez zásahu do kódu.
- **Ověřeno:** `journey.test.js` 0 FAIL, `routing.test.js`/`timetable.test.js` beze změny PASS,
  `verify_network.js` 20/20 PASS (guard nedotčen; 20/20 je současný baseline od J8-hotfixu, ne
  regrese — `handoff.md` čekal zastaralé „26/26"). Ruční kontrola Tržnice→Okružní 8:00: 1. karta
  přímo linka 13 08:06→08:18, žádná z 8 karet nemá `totalMin > 75`. Detail v `handoff.md` → VÝSLEDEK.
- **Neověřeno vizuálně na Pages** (executor prohlížeč nemá) — dělá manager/Joe.

## 2026-08-03 (2) — v0.1.0 (J4-fix: noční přestup přes půlnoc — zápor v `journey.js`)

- **Nález (manager, vizuální test J4 na Pages):** noční hledání (pozdní odjezd leg1, přestup na
  leg2 až ráno druhý den) vracelo **záporné `totalMin`** a řadilo se úplně nahoru — `transferItineraries`
  počítala časy nohou nezávisle přes `nightAdjust` s pevným prahem místo jednotné osy.
- **`scripts/journey.js` — `transferItineraries` přepsána na monotónní osu** (`dep1 ≤ arr1 ≤ dep2 ≤ arr2`
  vždy): `dep1`/`dep2` = nejbližší odjezd na sdílené ose (cyklus `+= 1440`, dokud není `>=` prahu),
  `arr1`/`arr2` dopočteny z rozdílu offsetů (ne samostatný `nightAdjust`). Aktivní služby 2. nohy se
  teď posuzují **per-trip** pro kalendářní den `addDays(date, ⌊dep2/1440⌋)` — nahrazuje starý
  jednorázový `dateStr2`/`dayOffset2` patchwork, který nezvládal různé posuny dne pro různé spoje.
  `planJourney` má navíc pojistku, co zahodí `arrMin<=depMin`/`waitMin<0` (nikdy se v testech
  neuplatnila, ale je levná).
- **`scripts/journey.test.js`** — nový scénář „noční hledání" (23:22, přestup až ráno), assert že
  každý vrácený itinerář má `arrMin>depMin`, `totalMin>0`, `waitMin>=0`.
- **Ověřeno:** repro z `handoff.md` po fixu vrací `totalMin 15` (přímo linka 51) místo `-975`;
  `journey.test.js` (nový noční test PASS) i `verify_network.js` (20/20 PASS, smoke test
  Krátká→Tržnice beze změny) v pořádku. HTML se neměnilo.

## 2026-08-03 — v0.1.0 (J4 Předávka 1: UI „Hledat spojení" — 4. tab v appce)

- **UMD obal jádra (J4-1):** `scripts/routing.js`/`timetable.js`/`journey.js` teď fungují i jako
  `<script src>` v prohlížeči (`window.MHDRouting`/`MHDTimetable`/`MHDJourney`), beze změny logiky.
  **Nález + oprava:** UMD kód dle spec (`const routing = require(...) || window.MHDRouting`) v
  prohlížeči kolidoval — 3 `<script src>` tagy sdílejí top-level scope, `const resolveStopId`
  narážel na `function resolveStopId` z `routing.js` → `SyntaxError`, modul by se v prohlížeči
  vůbec nenačetl. Opraveno obalením obsahu všech 3 souborů do IIFE (izoluje scope, ven jen
  `window.MHD*`). Ověřeno DOM shimem (`vm.runInThisContext`, věrně napodobuje sdílený scope
  `<script>` tagů) — před opravou SyntaxError, po ní funkční end-to-end.
- **Síť za běhu (J4-2):** appka na startu fetchne `data/network.json` (`let NET`), neblokuje
  ostatní taby (Odjezdy/Jízdní řády jedou dál na inline `DATA`).
- **4. tab „Hledat" (J4-3–J4-5):** pořadí Odjezdy/Jízdní řády/Hledat/Nastavení. Formulář
  Odkud/Kam s datalist našeptávačem (názvy zastávek z `NET.stops`), swap tlačítko, sdílený
  Teď/Jindy toggle (`useCustomTime`), „Moje poloha" jako disabled placeholder (GPS = Předávka 2).
  `doSearch()` volá `planJourney(NET, from, to, {date, nowMin, sort:'departure', limit:8})`,
  karty výsledků: čas odjezd→příjezd (mono), celková doba, liniové odznaky, info o přestupu
  (zastávka, čekání, „stejné místo" pro co-located), „+1 d" pro přesah půlnoci.
- **Diffnuto, že staré taby (Odjezdy/Jízdní řády/Nastavení) zůstaly beze změny** — jediná úprava
  mimo nový kód je rozšíření pole tabů v `showTab` o `'search'`.
- **Neověřeno vizuálně v reálném prohlížeči** (chromium-cli/Playwright v tomto prostředí chybí) —
  logika ověřena DOM shimem nad reálnými daty (Krátká→Tržnice přímo, Krátká→Růžový vrch s
  přestupem, neexistující zastávka, swap). Joe otestuje vizuálně na mobilu dle `handoff.md`.

## 2026-07-23 (6) — v0.1.0 (J8b-4: ověřeno na reálném GH Actions runneru — J8 kompletní)

- Joe spustil `workflow_dispatch` ručně (Actions tab, `main`, `FORCE=1`). **Výsledek: Success, 42 s**
  (krok `update` 38 s). Guard prošel, commit `b43ad7f` proběhl — obsahuje jen bump `updatedAt` v
  `data/data_source_state.json` (`network.json` beze změny, protože zdroj se od dřívějšího lokálního
  `--force` běhu ze stejného dne nezměnil — build je deterministický). Přesně očekávané chování:
  `workflow_dispatch` vždy stáhne+rebuilduje (FORCE obchází Last-Modified pre-check) → timestamp se
  liší → guard OK → commit. **Ostrý denní cron (bez FORCE) takhle zbytečně nekomituje** — při
  nezměněném zdroji skončí už v levném pre-checku, žádné stažení ani commit.
- `data_raw/` se v repu neobjevilo (zůstává gitignored) — potvrzeno v obsahu commitu.
- **Drobný neblokující nález:** GH Actions log hlásí Node 20 deprecation warning (`setup-node@v4` s
  `node-version: '20'`, runner vynuceně použil Node 24). Funkčně bez dopadu, zapsáno jako nápad do
  `TASK.md` (bump na `'22'`/`'24'` příště).
- **J8 (celý epic: J8a + J8-fix + J8b) je tímto HOTOVÝ end-to-end** — automatická denní obnova dat
  běží bez lidského zásahu, guard chrání `main` před špatnými daty, keepalive chrání workflow před
  tichým 60denním vypnutím GitHubem.

## 2026-07-23 (5) — v0.1.0 (J8b: GitHub Actions — auto-obnova dat bez lidí, kroky 1–3)

- **`scripts/update_data.js` (J8b-1):** levný pre-check přes HTTP HEAD na zdrojovou URL — porovná
  `Last-Modified` s `data/data_source_state.json`, při shodě skončí hned (exit 0, nestahuje 123 MB
  zbytečně). Přepínač `--force`/env `FORCE=1` pre-check obchází (pro `workflow_dispatch` a testy).
  Fallback na plné stažení, když HEAD selže nebo hlavička chybí. Otestováno 3× lokálně: beze změny
  (0,2 s), `--force` (plný běh, guard 26/26 PASS, 51,4 s), znovu bez force (opět přeskočeno).
- **`.github/workflows/update-data.yml` (J8b-2):** denní cron `0 3 * * *` UTC + `workflow_dispatch`
  (ruční tlačítko, posílá `FORCE=1`). Commit `data/network.json` + `data_source_state.json` jen když
  se liší; guard uvnitř `update_data.js` — při FAIL skript skončí nenulově, job zčervená (e-mail),
  žádný commit se nestane (auto-commit do `main` je bezpečný přesně proto).
- **Keepalive (J8b-3):** další krok ve stejném workflow, spustí se jen když datový krok nic
  necommitnul; spočítá stáří posledního commitu a při `>=50` dnech bumpne `lastChecked` v
  `data_source_state.json` (proti tichému 60dennímu vypnutí scheduled workflow GitHubem). Idempotentní,
  běžný den beze změny = žádný šum v historii.
- **Otevřeno:** J8b-4 (ověření na reálném runneru přes `workflow_dispatch`) čeká na Joeovu ruční akci
  v Actions tabu — executor nemá k dispozici `gh` CLI ani token pro spuštění. Detail a instrukce v
  `handoff.md` → VÝSLEDEK.

---

## 2026-07-23 (4) — v0.1.0 (J8-fix: refresh-stabilita — klíčování na název/linku, ne volatilní id)

- **`scripts/build_network.js`** — `COORD_OVERRIDES` překlíčován ze 7× `JDFS-…` (volatilní GTFS
  stop_id) na normalizovaný název zastávky; aplikuje se JEN když zdroj GPS chybí/je `0`, jinak
  nikdy nepřepíše validní data. Oprava i latentní chyby (string `"0"` bylo dřív vyhodnoceno jako
  pravdivé). Nepoužitý override klíč hlásí `console.warn` (self-check proti přejmenování/zániku
  zastávky).
- **`scripts/verify_network.js`** — natvrdo zadané `P50`/`P5` nahrazeny dohledáním přes nové
  helpery `findPattern(net, line, fromName, toName)` a `findLoopPattern(net, line)` (linka +
  názvy zastávek). Žádné `S#`/`P#`/`JDFS-` literály. `routing.test.js`/`journey.test.js`/
  `timetable.test.js` už na id nespoléhaly, beze změny.
- **`docs/DATA_SOURCES.md`** — nová trvalá sekce „Stabilní vs. volatilní identifikátory" +
  starší nález o nestabilitě id označen jako vyřešený.
- **Důkaz refresh-stability (klíčové ověření):** `update_data.js` spuštěn na živé čerstvé stažení
  (ne cache) — celý pipeline (stažení → filtr → build → guard) proběhl za 57,9 s, **guard
  `verify_network.js` 26/26 PASS**. Patterny se v běhu skutečně přečíslovaly přesně jako v
  původním nálezu (`P50` linka 3→9, `P5`→jiná linka), ale dynamické dohledání (`findPattern`/
  `findLoopPattern`) je i tak správně našlo (nově `P206`/`P120`) — přímý důkaz, že fix řeší
  přesně popsaný problém. Commitnut i přestavěný `data/network.json` (23 linek, 157 zastávek
  vše s validní GPS, 290 patternů, 10 151 spojů) + nový `data/data_source_state.json`.
- **Výsledek:** J8b (GitHub Actions workflow pro automatickou obnovu) je teď odblokován —
  guard bude reálně procházet i bez lidského zásahu. Detail v `handoff.md` → VÝSLEDEK.

## 2026-07-23 (3) — v0.1.0 (J8a: update_data.js — ruční obnova dat + regression guard)

- **`scripts/update_data.js`** — stáhne aktuální `JDF_merged_GTFS.zip`, vyfiltruje MHD KV (agency
  48364282 + `route_short_name` `425xxx`), **streamuje** `stop_times.txt` (~1,38 GB, readline řádek
  po řádku, nikdy celé v paměti) → `data_raw/kv_gtfs/`, zavolá `build_network.js`, prožene výsledek
  regresním guardem (validní JSON, prahy linky≥20/zast≥140/spoje≥9000, pokles ≤20 % oproti předchozí
  verzi, celý `verify_network.js` musí PASS) → při FAIL rollback `data/network.json` + nenulový exit,
  při OK zapíše `data/data_source_state.json`. Extraktor ZIPu: `unzip` s fallbackem na `tar` (Windows
  bsdtar) — funguje bez node_modules navíc.
- **Otestováno end-to-end na reálném čerstvém stažení** (22.7. data, ~55 s běh): 16 749 428 řádků
  `stop_times.txt` celé ČR → 144 766 po filtru, build 23 linek/157 zastávek/10 151 spojů. Guard
  ověřen oběma cestami — reálný FAIL z `verify_network.js` i uměle vynucený FAIL z prahu — v obou
  případech správný rollback (`data/network.json` beze změny, čisté `git status`).
- **Nález (zapsáno do `TASK.md`/`docs/DATA_SOURCES.md`, blokuje J8b):** GTFS `stop_id` (`JDFS-xxxxx`)
  ani interní `network.json` id (`S#`/`P#`) **nejsou stabilní mezi obnovami dat** — čerstvé stažení
  přečíslovalo zastávky i patterny. Proto `COORD_OVERRIDES` (klíč = `JDFS-` id, JH 23.7.) po obnově
  přestane sedět a natvrdo zadané `P50`/`P5` ve `verify_network.js` už neodpovídají původním linkám.
  Guard fungoval přesně jak má (odmítl commit), ale J8b (auto-commit bez lidí) v tomto stavu neprojde
  — návrh oprav u manažera před stavbou J8b.
- **Docs fix:** `docs/DATA_SOURCES.md` — uvedena na pravou míru tvrzení o GPS (zdroj 7 zastávek nemá,
  řeší `COORD_OVERRIDES` v buildu, ne trvale).

## 2026-07-23 (2) — v0.1.0 (JH Předávka 1: zpevnění jádra — GPS, routing, řazení)

- **H0 (data-integrita):** 7 zastávek mělo v GTFS zdroji `(0,0)` misto GPS (`build_network.js`
  bralo string `"0"` jako pravdivé) — ruční override klíčovaný `JDFS-` stop_id (Kpt.Jaroše,
  Mattoniho nábřeží, Nádraží Dalovice, Na Pasece, Globus, Tesco, Lázně I), rebuild `network.json`.
  `verify_network.js` nově hlásí `lat===0||lon===0` jako FAIL.
- **H1a (routing.js):** zrušen topologický Pareto filtr (`filterDominated` na transfers×totalHops) —
  zahazoval přestupové varianty dřív, než se vůbec podívalo na čas. `search()` teď vrací všechny
  rozumné (dedup) varianty, o pořadí rozhoduje až `journey.js` podle skutečného času.
- **H1b:** `search()` umí řetěz o 2 přestupech (`opts.maxTransfers: 2`, opt-in, default zůstává 1).
  Přidán index zastávka→patterny pro výkon (O(1) místo O(patternů) při opakovaném dotazu).
- **H1c:** okružní patterny (2× výskyt stejné zastávky, např. P5/linka 12) — nový `forwardSegments()`
  vrací dopředný úsek pro každý výskyt, ne jen první přes `indexOf`. Legy nesou explicitní
  `fromIdx`/`toIdx`, `journey.js` je používá přímo (oprava latentní chyby u smyček).
- **H1d:** propojení fakticky totožných zastávek s různým ID (`coLocatedGroups`, haversine ≤30 m
  + shoda názvu) — nalezeny 4 skupiny (Lázně I S116↔S155, Andělská Hora horní/dolní obec,
  Shopland↔Tesco). Přestup mezi nimi teď funguje (dřív se nenašel — jiné ID = jiný uzel grafu).
- **H2 (journey.js):** přepínatelné řazení `opts.sort` = departure (default) / arrival / duration /
  transfers, připravené pro budoucí UI filtry. Default `limit` zvednut z 5 na 8. Přestupní itineráře
  nově nesou `walkMin: 0` (všechny přestupy v této předávce jsou "same-place" — reálný pěší přestup
  30–200 m řeší až epic J9).
- **H4:** `verify_network.js` rozšířen o kontroly H0–H1d (26/26 PASS, bylo 20/20), `routing.test.js`
  a `journey.test.js` doplněny o ukázky 2 přestupů, smyčky, co-located přestupu a srovnání řazení.
- **Otevřeno pro příště:** časová vrstva pro `transfers: 2` v `journey.js` zatím chybí (topologie
  hotová, časové skládání řetězu přes 2 uzly ne — `journey.js` je explicitně přeskakuje).
  `maxTransfers: 2` je pomalé na hub↔hub dotazy (~700 ms) — vhodné jen jako opt-in, ne default v UI.

## 2026-07-23 — v0.1.0 (J3 KROK B: journey.js — časové plánování spojení A→B)

- **`scripts/journey.js`** — `planJourney(net, A, B, opts)`: kombinuje topologii
  (`routing.js` `search()`) s časy (`net.trips`/`net.services`, stejné pravidlo
  `trip[2] || pattern.off` jako v KROKU C) do konkrétních itinerářů (přímo / 1
  přestup), řazeno podle odjezdu. Řeší předěl typu dne přes půlnoc u přestupu
  (2. noha k `date+1`, když dojezd na uzel padne po půlnoci) a noční přesah linky
  51 (`nightAdjust`, stejné pravidlo jako `timetable.js`). `minTransfer` (default 3)
  jako parametr. Beze změny v `routing.js`/`timetable.js` (jen import).
- **`scripts/journey.test.js`** — čitelný výpis 3 scénářů (přímo Krátká→Tržnice,
  přestup Krátká→Růžový vrch, přes půlnoc Okružní→Garáže MHD linkou 51).
  **`verify_network.js`** rozšířen o 2 kontroly (návaznost přestupu, konzistence
  `totalMin`) — souhrn 20/20 PASS.
- **Ověřeno proti reálnému JŘ DPKV (raw HTML, ne AI shrnutí):** linka 15 Krátká
  hodina 13 = `18S 42` → odjezd 13:18 sedí na minutu; linka 19 Elite (směr Garáže
  MHD) hodina 13 = `18 48K` → odjezd 13:48 sedí na minutu. Přestup 21 min ≥
  minTransfer. Přesný příjezd do Růžového vrchu nešlo jednoznačně dohledat (linka
  19 je smyčka, stejná zastávka 2× v datech DPKV) — bráno jako odvozené z ověřené
  GTFS logiky.
- **Známé omezení (zapsáno, neřešeno):** přechod letní/zimní čas (2×/rok) — `planJourney`
  ho neošetřuje, viz `handoff.md` → VÝSLEDEK.

## 2026-07-22 — v0.1.0 (J3 KROK C: časová vrstva timetable.js)

- **`scripts/timetable.js`** — `isServiceActive`/`activeServicesOn`/`patternDeparturesOn`/`nextDepartures`. Zatím **neintegrováno** do `routing.js` search() (to je KROK B).
- **Nález:** ~45 % spojů má vlastní `off` (odchylné mezičasy špička/sedlo) jako 3. prvek v `trips[patternId]` — `nextDepartures` to musí použít místo šablony patternu, jinak by čas sedl jen pro ~55 % spojů. Ošetřeno.
- **`scripts/timetable.test.js`** — čitelný výpis odjezdů (Krátká/Tržnice/Horní nádraží, všední/sobota, + linka 51 kolem půlnoci). **`verify_network.js`** rozšířen o 4 časové kontroly (neprázdné pole, rostoucí časy, všední > sobota, žádný záporný čas) — souhrn 18/18 PASS.
- **Namátkově ověřeno proti reálnému JŘ DPKV (stažen raw HTML, ne jen shrnutí):** linka 3 Krátká 08:27 → Stará Kysibelská (přesná shoda); linka 51 Okružní 22:46/23:26/01:16/03:06 → Garáže MHD (přesná shoda ve všech 4 časech, včetně přechodu přes půlnoc).

## 2026-07-21 (4) — v0.1.0 (J2: routing modul A→B + verify_network.js)

- **`scripts/routing.js`** — topologický routing (bez času): `search()` najde přímé spoje + 1 přestup přes libovolnou sdílenou zastávku (varianta 1B), dedup, Pareto filtr dominovaných variant, řazení (přestupy → hub → délka). Bez závislostí, funguje v Node i prohlížeči.
- **Nález a oprava:** okružní patterny (linka 12, P5) obsahují stejné ID zastávky 2×; `indexOf` počítal `hops` ze špatného výskytu (záporná hodnota). Opraveno výpočtem z `stopsAfter()` slice.
- **`scripts/routing.test.js`** — Node test nad testovací sadou (huby + domovské zastávky). **`scripts/verify_network.js`** — 14 sanity kontrol dat, vše PASS.
- Namátkově ověřeno proti reálnému JŘ DPKV (linka 3, linka 13) — pořadí zastávek i počty hopů sedí přesně.

## 2026-07-21 (3) — v0.1.0 (git: repo napojeno na GitHub)

- git: repo napojeno na GitHub, první commit nové základny (adoptována F1 historie přes `reset --soft origin/main`, push na `BigJoeVibe/MHD-KV` main).

## 2026-07-21 — v0.1.0 (návrh J8: automatická obnova dat)

- Rešerše zdrojů (dadof.ggu.cz, JrUtil): potvrzen JrUtil GTFS (má GPS, denně) jako hlavní; CIS MHD JDF (`portal.cisjr.cz/pub/draha/mestske/`) jako záložní/primární bez GPS.
- Navržena architektura obnovy: **GitHub Actions** (runner, bez lokálu) + denní cron + `Last-Modified` check → build jen při změně → commit `network.json` → Pages. Ověřen zdroj (122 MiB, denní Modified) i objem (`stop_times` 1,38 GB → streamovat).
- Zdokumentováno riziko **60denního auto-vypnutí** scheduled workflow (→ keepalive) a předpoklad, že appka musí `network.json` fetchovat za běhu. Detail `docs/DATA_SOURCES.md` + `DECISIONS.md`, podúkoly v `TASK.md`.

## 2026-07-19 (2) — v0.1.0 (J1: síťový model network.json)

- **`data/network.json`** vygenerován z `kv_gtfs/` skriptem **`scripts/build_network.js`** (Node): 23 linek, 157 zast. (všechny s GPS), 290 patternů, 10 151 spojů. ~62 KB gzip.
- Model: `stops` + `patterns` (linka×směr×varianta + `headsign`) + `trips` (start+service, odchylné mezičasy 45 % plně) + `services` (kalendář+výjimky). Ověřena logika typů dne (všední×sobota) proti realitě.
- **Nálezy:** legenda F1 (zkrácené/jiné konečné) = řešeno patterny+headsign; **výluky/svátky/prázdniny = přes aktivní služby** (ověřeno výlukou Bohatice do 11.9.2026); odjezdy musí být **směrové**.
- **GAP zdokumentován:** „na znamení" GTFS nese nespolehlivě (v KV jen linka 8) → nespoléhat. Korekce: 0 zastávek bez GPS.
- `.gitignore` += `data_raw/` (syrová data mimo repo). Docs: `DATA_SOURCES.md`, `DECISIONS.md`, `TASK.md`.

## 2026-07-19 — v0.1.0 (datová základna pro vyhledávání A→B)

- Rešerše zdrojů: OSM (Overpass) má jen část linek KV → nestačí; DPKV DIC portál = interní API (ToS) → jen ruční kontrola.
- Nalezen autoritativní zdroj: **CIS JŘ → GTFS přes JrUtil** (`data.jr.ggu.cz`), denně. Ruší dřívější „GTFS neexistuje".
- Stažen `JDF_merged_GTFS.zip`, vyfiltrována **MHD KV** (agency DPKV 48364282, `route_short_name` 425xxx; linka = číslo−425000) → `data_raw/kv_gtfs/` (23 linek, 157 zast./150 s GPS, časy). Ověřeno.
- Ověřen prototyp logiky A→B (přímé + 1 přestup) na reálné síti; vyjasněny zastávky Okružní/Krátká (domovské, linky 15/51).
- Nové/aktualizované docs: `DATA_SOURCES.md`, `DECISIONS.md`, `TASK.md`, `ROADMAP.md`, `handoff.md`. Rizika: licence, neucelená data, varianty linek.

## 2026-07-17 — v0.1.0 (dokumentace: přechod na metodiku kod-jadro)

- Dokumentace sladěna se šablonami `_sablony-kod/` a skillem kod-jadro.
- `CLAUDE.md` přepsán do struktury šablony (hlavička, dělba rolí, git režim);
  zachovány všechny non-obvious konvence a reálný stav F1.
- Nově založeny `TASK.md` (backlog F2–F6+), `README.md`, `.gitignore`, `handoff.md`.
- Před zásahem záloha celého projektu do `MHD_test/` (mimo repo).
- Rozhodnuto schéma verzí (0.x = testovací) a scope linky 9 (viz TASK.md).

## 2026-05-13 — v0.1.0 (F1 komplet)

- Přepis appky: nový zdroják `index_raw.html` + deploy jako `index.html`.
- 5 linek: 3 (Krátká), 9 (Krátká, výluka), 13 (Okružní), 15 (Okružní), 51 (Okružní, noční).
- 5 typů dne: workday, workday_holiday, weekend, xmas_night, nye_night + fallback logika.
- Systém výluk: `warnings: [{text, validUntil}]`, automatické skrytí po datu expirace.
- Legenda zkratek per karta — jen písmena přítomná v aktuálních odjezdech.
- Design: Nunito + JetBrains Mono, indigo paleta, animovaný dot, violet mód při „Jindy".
- Hlavička „úterý, 12. května · 20:00"; přidán `favicon.svg` (ikona autobusu).

## 2026-05-11 — v0.0.1 (inicializace handoff packu)

- Založen `CLAUDE.md` (projektový kontext) a `changelog.md`.
- Vytvořen adresář `docs/`: `ROADMAP.md`, `DATA_FORMAT.md`, `DECISIONS.md`,
  `F1_SPEC.md`, `DATA_INTAKE.md`.
- Identifikovány bugy v `index_raw.html` (linka 51 `holiday` = kopie `workday`;
  linka 3 `weekend` špatná data) a fakt, že `index.html` byl uložená viewer
  stránka, ne zdroják (skutečný zdroják = `index_raw.html`).
