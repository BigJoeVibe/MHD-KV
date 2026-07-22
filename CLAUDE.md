# CLAUDE.md — MHD KV „Jedeme MHD" (kódovací projekt)

Řídí se globálním CLAUDE.md a skillem **kod-jadro**; tady je jen specifikum
projektu. Backlog je v `TASK.md`, historie v `changelog.md`.

## Hlavička

- **Projekt / cíl:** osobní webová appka s odjezdy MHD autobusů v Karlových
  Varech — rychlý přehled „kdy mi to jede" z domových zastávek do centra.
- **Typ:** web app (statická, GitHub Pages)
- **Stack:** plain HTML + CSS + JavaScript v jednom souboru; Google Fonts
  (Nunito, JetBrains Mono) přes CDN. Žádný framework, žádný build step,
  žádné dependencies, žádný backend ani externí API.
- **Repo (GitHub):** `BigJoeVibe/MHD-KV`, branch `main`
- **Aktuální verze:** v0.1.0 (F1 komplet). Schéma: 0.x = vývojové/testovací
  verze; 1.0.0 přijde, až appka pokryje širší cíl (rozhodnuto 17. 7. 2026).
- **Stav:** F1 běží na GitHub Pages. Repo napojené na GitHub, git dělá Claude Code (executor).
  **Aktivní směr (od 19. 7. 2026): jádro vyhledávání A→B** nad síťovým modelem z KV GTFS.
  **J1 (síťový model) HOTOVO** — `data/network.json` + `scripts/build_network.js`.
  **J2 (routing A→B) HOTOVO 21.7.** — `scripts/routing.js` (+`routing.test.js`, `verify_network.js` 14/14). Zrevidováno, pushnuto.
  **J8 (auto-obnova dat) NAVRŽENO** (GitHub Actions) — viz `docs/DATA_SOURCES.md`.
  Další: **J3 — časová vrstva**. Viz `TASK.md` (sekce TEĎ); `handoff.md` je mezi úkoly uzavřená (spec J3 připraví manager po schválení).

## Dělba rolí

- **Uživatel (Joe):** idea, koncept, cíle a směr; testování a zpětná vazba —
  hlavně UI/UX, kde je finální arbitr vzhledu a použitelnosti; schvaluje kroky
  a commity. V kódu amatér.
- **Claude:** návrh řešení, kód, dokumentace, git podklady, vysvětlování —
  každý krok konkrétně (co spustit, kam kliknout, co má uživatel vidět).
  Manager udržuje CLAUDE.md, TASK.md, changelog.md.

## Orchestrace v1 — dva agenti (od 2026-07-21)

Práce běží přes dvě „Claude" plochy; sdílený kanál = **soubory v této složce**.

- **Cowork Claude = MANAGER** (mluví s Joem): plán, brief, píše `handoff.md`,
  `TASK.md`, `CLAUDE.md`, review, research. Git NEdělá.
- **Claude Code (VS Code) = EXECUTOR** (nižší CC): přečte `handoff.md` + tento
  soubor, napíše kód, otestuje, **provede git commit/push ve svém terminálu**,
  a výsledek zapíše zpět do `handoff.md` → sekce `VÝSLEDEK` a do `changelog.md`.
- **Joe = orchestr + arbitr:** spustí Claude Code, otestuje UI, schvaluje.

**Protokol předávky:**
1. Manager napíše zadání do `handoff.md` (co, jak, co neměnit, jak testovat).
2. Joe řekne Claude Code: „Přečti `handoff.md` a `CLAUDE.md` a proveď."
3. Executor udělá práci, commitne, vyplní `VÝSLEDEK` + `changelog.md`.
4. Manager to příště přečte, zreviduje, zadá další krok.

**Pravidla:** na souborech pracuje **jen jeden agent naráz** (mezi úkoly je
`handoff.md` „prázdná"). Executor nepřidává nic nad zadání; nápady → `TASK.md`.

## Jak pracovat

- **Na startu vlákna:** „Použij skill kod-jadro" + přečti tento soubor,
  `TASK.md` a poslední zápisy v `changelog.md`; shrň stav ve 3–5 řádcích
  a navrhni další krok.
- Workflow a checkpointy dle globálu; malé kroky, jedna změna najednou.
- Iterace: návrh → kód → **testovací instrukce pro uživatele** → feedback →
  fix → zápis do changelog + commit podklad.
- Kód předávej jako **diff**, ne full rewrite (full jen >30 % nebo na vyžádání).
- **Před editací dat linek si přečti `docs/DATA_FORMAT.md`** (matoucí pojmenování
  typů dne — viz Konvence).

## Jak spustit / build / test

- **Spuštění (lokálně):** otevřít `index.html` v prohlížeči
  (Chrome / Firefox / Safari mobil). Žádný build.
- **Nasazení:** commit do `main` → GitHub Pages se aktualizuje automaticky (~1 min).
- **Test (ručně v prohlížeči):** projít taby Odjezdy / Jízdní řády / Nastavení,
  v módu **Teď** i **Jindy**. Před commitem otestuj vždy.

## Git a verzování

- Conventional commits: `typ: popis` (feat/fix/docs/refactor/chore).
- Verze dle SemVer; vydání = tag na GitHubu.
- **Aktuální režim (od 2026-07-21):** git provádí **Claude Code (executor)**
  ve svém terminálu — commit i push po každém uzavřeném kroku. Cowork manager
  git nedělá (jen připraví commit message a spec). Detail: kod-jadro
  `references/git-a-verzovani.md`. Repo je přímo tato složka (žádný druhý klon).
- ⚠️ **Cowork manager NIKDY nespouští git** (ani `git status`) v sandboxu nad
  touto složkou — mount neumí smazat zámky a nechá stale `.git/index.lock`,
  který pak blokuje commit. Když lock vznikne, Claude Code ho smaže:
  `rm -f .git/index.lock` (Windows: `del .git\index.lock`) a pokračuje.
- **Nezacommitované manager úpravy dokumentace** (TASK/CLAUDE/handoff/.gitignore
  z 21.7. po J2) commitne příští běh executora spolu s J3.
- **Commit vždy oba HTML soubory:** `index.html` + `index_raw.html`
  (+ `favicon.svg`, pokud se měnil).
- Před větším zásahem záloha (kopie do `MHD_test/` nebo `_zalohy/`, obojí mimo repo).

## Struktura

```
MHDKV/
  CLAUDE.md          ← tento soubor (kontext, stav, konvence)
  TASK.md            ← backlog: teď / příště / odloženo / nápady / varianty
  changelog.md       ← historie změn (datum + verze + odrážky)
  README.md          ← co to je a jak spustit
  handoff.md         ← předávka manager ↔ executor (prázdná mezi úkoly)
  .gitignore
  favicon.svg        ← ikona autobusu (commitni spolu s HTML)
  index_raw.html     ← SKUTEČNÝ zdroják appky (edituj tento)
  index.html         ← deploy verze pro GitHub Pages (= kopie index_raw.html)
  Linka3.pdf         ← podklad jízdního řádu (zdrojová data)
  docs/
    ROADMAP.md             ← fáze F1–F6+ s odhady
    DATA_FORMAT.md         ← struktura DATA.routes[] (číst před editací dat!)
    DATA_INTAKE.md         ← checklist vstupních dat
    DECISIONS.md           ← architektonická rozhodnutí
    F1_SPEC.md             ← zadání fáze 1
    HANDOFF_2026-05-12.md  ← session report F1 (archiv)
    DATA_SOURCES.md        ← NOVÉ: zdroj dat (CIS/GTFS) + KV subset + rizika
  data/
    network.json         ← NOVÉ: kompaktní model appky (stops+patterns+trips+services), 62 KB gzip
  scripts/
    build_network.js     ← NOVÉ: GTFS → data/network.json (Node; obnova dat)
  data_raw/          ← JDF_merged_GTFS.zip + kv_gtfs/ (filtr MHD KV) + osm_kv.json (mimo repo!)
  MHD_test/          ← záloha stavu před přechodem na novou metodiku (mimo repo)
```

## Konvence projektu (non-obvious)

- **`index.html` = `index_raw.html`** — jsou identické. `index_raw.html` je
  pracovní soubor, `index.html` je deploy soubor pro GitHub Pages. Edituj
  `index_raw.html`, pak zkopíruj jako `index.html` a commitni oboje.
- **Mobile-first** — UI laděné na vertikální mobil ~380 px. Žádné hover efekty
  kritické pro funkci.
- **Tmavý theme jen** — žádný light mode, nepřidávej.
- **Typy dne jsou 5, ne 3** — `workday`, `workday_holiday`, `weekend`,
  `xmas_night`, `nye_night`. `workday_holiday` = pracovní den o školních
  prázdninách (ne státní svátek). Státní svátky = `weekend`. Viz `docs/DATA_FORMAT.md`.
- **Fallback logika typů dne** — `getEffectiveDayType()` řeší chybějící klíče:
  `xmas_night→weekend`, `nye_night→weekend`, `workday_holiday→workday`.
  Linka 9 nemá `workday_holiday` → používá `workday`.
- **Warnings systém** — `route.warnings: [{text, validUntil: "YYYY-MM-DD"}]`.
  `getActiveWarnings()` skryje warning po expiraci. Linka 9 má výluku do 30.6.2026.
- **Legenda zkratek** — každá `route` má vlastní `notes: {písmeno: text}`.
  V departure kartách se zobrazí jen písmena aktuálně viditelných spojů.
- **Linka 51 = noční** — odjezdy přes půlnoc (h=22–23, h=1–6).
  `getUpcomingDepartures()` řeší midnight crossing:
  `if (nowMin >= 1080 && h < 7) totalMin += 1440`.
- **Žádný backend, žádné externí API** — viz `docs/DECISIONS.md`.
- **Nový model (network.json): odjezdy/routing jsou SMĚROVÉ** — vždy „z A ke konečné/k B", ne „cokoli staví
  na zastávce" (jinak se mixují oba směry). Každý výsledek nese `headsign` (konečnou) = náhrada F1 legendy.
- **„Na znamení" GAP** — GTFS příznak `pickup/drop_off_type` je v KV jen u linky 8; reálné (5, 19…) chybí.
  NEspoléhat na GTFS pro „na znamení"; případný ruční overlay až v UI. Detail `docs/DATA_SOURCES.md`.

## Aktuální stav (F1 komplet, 13. 5. 2026)

- **5 linek:** 3 (Krátká→Tržnice), 9 (Krátká→Tržnice, výluka), 13 (Okružní→Tržnice),
  15 (Okružní→Tržnice), 51 (Okružní→Tržnice, noční)
- **5 typů dne:** workday, workday_holiday, weekend, xmas_night, nye_night
- **3 taby:** Odjezdy, Jízdní řády, Nastavení
- **Warnings** s automatickou expirací; **legenda zkratek** per karta (jen použitá písmena)
- Violet mód při „Jindy", animovaný dot v „Teď"; hlavička „úterý, 12. května · 20:00"
- Favicon (ikona autobusu, SVG)
- **Zbývá / nový směr (od 19. 7. 2026):** místo ruční F2 se staví **jádro A→B** nad KV GTFS
  (data hotová v `data_raw/kv_gtfs/`). Body 1–3 z toho budou „favourites". Viz `TASK.md`, `handoff.md`.

## Poznámky / známá omezení

- Data linek jsou ručně přepsaná z podkladů DPKV — při změně jízdních řádů nutná
  ruční aktualizace (dokud nebude F4 online builder).
- Bez backendu se čas bere z prohlížeče uživatele (lokální čas zařízení).

## Reference (read on demand)

- @TASK.md — backlog a otevřené varianty
- @changelog.md — historie změn
- @docs/ROADMAP.md — plán fází F1–F6+
- @docs/DATA_FORMAT.md — datová struktura (přečíst před editací dat!)
- @docs/DECISIONS.md — architektonická rozhodnutí
- @docs/HANDOFF_2026-05-12.md — detailní session report F1
