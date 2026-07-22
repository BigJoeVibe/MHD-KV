# Changelog — MHD KV „Jedeme MHD"

Zápis po každém uzavřeném celku (ne po každém řádku kódu).
Formát: datum + verze + 2–4 odrážky CO a PROČ. Nejnovější nahoře.
Verze dle SemVer; 0.x = vývojové/testovací verze (viz CLAUDE.md).
Backlog byl přesunut do `TASK.md`.

---

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
