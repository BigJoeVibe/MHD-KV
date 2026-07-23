# Changelog — MHD KV „Jedeme MHD"

Zápis po každém uzavřeném celku (ne po každém řádku kódu).
Formát: datum + verze + 2–4 odrážky CO a PROČ. Nejnovější nahoře.
Verze dle SemVer; 0.x = vývojové/testovací verze (viz CLAUDE.md).
Backlog byl přesunut do `TASK.md`.

---

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
