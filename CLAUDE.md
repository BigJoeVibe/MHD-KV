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
- **Stav (k 14. 8. 2026):** appka běží na GitHub Pages, git dělá Claude Code (executor).
  **J7-P2 (Tabule) hotová a zrevidovaná; běží krok D** — viz předávka níže.
  **Jádro vyhledávání A→B je hotové a ověřené:** **J1** síťový model (`data/network.json`),
  **J2** routing (`routing.js`), **J3** časová vrstva (`timetable.js` + `journey.js`/`planJourney`),
  **JH** zpevnění jádra (bez Pareto, 2 přestupy, smyčky, co-located ≤30 m).
  **J8** automatická denní obnova dat (GitHub Actions + guard) **BĚŽÍ** — lekce: neklíčovat na
  volatilní `JDFS-`/`S#`/`P#` (J8-fix), guard testuje jen build-invarianty, ne snímek (J8-hotfix).
  **J4 (UI „Hledat spojení") — Předávka 1 HOTOVÁ** (4. tab, formulář Odkud/Kam, karty z `planJourney`;
  moduly v prohlížeči přes IIFE). **J4-fix HOTOVÝ** (noční přestup přes půlnoc vracel zápornou dobu)
  **a ověřený na Pages 4. 8.** — invariant drží v noci i ve dne, regrese žádná.
  **J4-sort + J4-sort-2 HOTOVÉ** (pravidla malého města ve výsledcích hledání) a **J7-P1 HOTOVÁ**
  (tab „Moje trasy" na `network.json`, Jízdní řády zrušeny) — vše 12. 8., ověřeno Joem na Pages.
  **Další: J7-P2 (tab „Tabule").** Detail: `TASK.md` (sekce TEĎ), `changelog.md`, `handoff.md` → RESULT.

## Předávka dalšímu manažerovi (2026-08-14) — J7-P2 zrevidována, běží D → C → B

- **J7-P2 (Tabule + sdílený našeptávač + sloučení stejnojmenných zastávek) HOTOVÁ a zrevidovaná**
  managerem 14. 8.: testy přeběhnuty (3 suity exit 0, `verify_network.js` 20/20), `boardDepartures`
  ověřeno proti reálným datům řádek po řádku, `index.html` = `index_raw.html`. **Joe testuje na
  mobilu** — dotykové chování našeptávače (blur/tap 150 ms) se z Node ověřit nedá.
- **Joe schválil pořadí `D → C → B` (14. 8.). ⭐ D je ZADANÉ, spec v `handoff.md`.**
  **D** = slepá skvrna stejnojmenných zastávek v routing jádře (Hledat dnes nenajde
  `Lázně I → Parkoviště KOME` **vůbec** — 0 variant, linka 20 je neviditelná) ·
  **C** = volný text a diakritika (`Kratka` i `lazne` vrátí 0 spojů a tabule tvrdí „Dnes už odsud nic
  nejede.") · **B** = `KNOWN_LINE_CLASSES` je Set stringů × `line` je number → barevné odznaky linek
  nefungují nikde. Detail, nálezy a čísla v `TASK.md` → sekce „J7-P2 — REVIZE MANAGERA".
- **Klíčové pro D:** expanze musí jít **z id na stejnojmenná id**, ne z názvu — `planJourney` si A/B
  předrozliší na id dřív, než je předá do `search()`, takže expanze podle názvu by se nechytila.
  Díky tomu `journey.js` **nepotřebuje žádnou změnu**.
- ⚠️ **`S#`/`P#` id se mění při každé denní obnově dat** (J8). „Lázně I" byly 12. 8. `S63`+`S143`,
  14. 8. jsou `S1`+`S154`. V kódu ani testech je nikdy nedrž natvrdo — dohledávej podle názvu.
- 📌 **Kořenová příčina k rozhodnutí:** „Lázně I" má ve zdroji dva různě pojmenované záznamy
  (`Karlovy Vary,Lázně I` × `Lázně I`) — viz `TASK.md` ř. ~236. D i C léčí symptom v appce; čistší by
  bylo sjednotit už v `build_network.js`. Rozhodnout dřív, než na `resolveStopIds` naroste další logika.

## Předávka dalšímu manažerovi (2026-08-12)

- **J4-sort i J4-sort-2 HOTOVÉ a pushnuté** (executor, 12. 8., commit `aee8ea3`). Hledání teď jede na
  pravidlech malého města: odjezdové okno 90 min, stropy 75/40, Pareto, `minTransfer 0`, průjezdné spoje.
- **J7-P1 HOTOVÁ a pushnutá** (executor, 12. 8.) — **J7 předsazeno před J5/J6**. Tab `Odjezdy` →
  `Moje trasy` nad `network.json` (`ROUTE_GROUPS` + `planBoard`), `Jízdní řády` a „Sledované linky"
  zrušeny. Spouštěč: tabule ukazovala příjezd 1:28 místo 1:30, protože stará F1 data mají jednu
  konstantu `travelMinutes` na linku. **Součástí byl i výkonový fix jádra** — ořez okna při stavbě
  itinerářů, 2541 → 690 ms pro 6 karet, výstup byte-identický. Manager ověřil testy, `index.html`
  = `index_raw.html`. **✅ Joe ověřil na Pages 12. 8. — funguje včetně režimu „Jindy".**
- **Tři věci k Joeovu posouzení** (executor je označil v `handoff.md` → RESULT): umístění přepínače
  `Tam`/`Zpět` vlevo od názvu skupiny, sdílený text podřádku přestupu mezi Hledat a kartami
  (včetně `(stejné místo)`), a nevyužité CSS `.timetable-*` / `.dpkv-link` ponechané v souboru.
- **Otevřené:** `DATA.routes` zůstává jako mrtvý kód do konce J7-P2 (bezpečný návrat).
  Detail a všechna rozhodnutí v `TASK.md` → „J7 PŘEDSAZENO".
- **Baseline `verify_network.js` je 20/20, ne 26/26** — J8-hotfix přesunul H1a–d do `routing.test.js`.
  (V předchozím zadání jsem měl 26/26 chybně, executor to udělal správně.)
- **Rozhodnutí J4-sort (Joe, 12. 8.) — „pravidla malého města":** odjezdové okno 90 min (žebřík
  rozšíření 90 → 240 → bez omezení), uvnitř okna **nejdřív přímé spoje, pak přestupy**, strop jízdy
  75 min a čekání 40 min (vše jako parametry), sloučení identických jízd do jedné karty.
  Řazení podle `arrival` se **nepoužije** — s oknem ztrácí smysl.
- **Podklad:** naměřeno na 104 dvojicích zastávek — přímý spoj max 22 min, s přestupem max 52 min.
  Nic legitimního v KV nepřesáhne ~55 min, strop 75 je rezerva.
- **Rozpor v zadání (`TASK.md` ř. 17 × ř. 23), který chybu způsobil, je SJEDNOCENÝ** — platí jediná
  formulace v „J4-sort — ROZHODNUTO".
- **Nová TODO z téhle session** (v `TASK.md`, tabulka NEDOŘEŠENÉ): docházka do celkové doby (až bude
  GPS), asymetrie přímé × přestupy v `journey.js`, večerní/víkendová tolerance okna, stránkování.
- **Pak:** **J4 Předávka 2** = GPS „Moje poloha" (→ nejbližší zastávka) + doladění vzhledu karet
  (řazení/filtry `planJourney` už umí přes `opts.sort`). Rozhodnutí a mockup jsou v historii `TASK.md`
  (řádek J4) a v gitu.
- **Pozor (procesní):** Cowork manager **NIKDY nespouští git** (viz sekce Git a verzování). **Vizuální
  test UI** dělá manager sám v prohlížeči přes GitHub Pages (`bigjoevibe.github.io/MHD-KV`) — executor
  prohlížeč nemá. Joe je finální arbitr UX.

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

## Jazyková dělba (od 2026-08-12)

Čeština stojí [ODHAD] 1,8–2,5× víc tokenů než stejný obsah anglicky a executor si při každém
běhu načítá desítky kB dokumentace. Proto:

| Anglicky | Česky |
|---|---|
| `handoff.md` (zadání i sekce `RESULT`) | komunikace Joe ↔ manager |
| komentáře v kódu, commit messages | `CLAUDE.md`, `TASK.md`, `docs/*.md` |
| zápisy executora do `changelog.md` | zápisy managera do `changelog.md` |
| interní práce executora | **všechny stringy v UI a názvy zastávek** |

- **Nikdy nepřekládej:** texty, které vidí uživatel v appce (`Nejbližší spoj až v 09:44`,
  `Přestup: …`, názvy tabů), názvy zastávek a linek z dat, a pojmy, na kterých se Joe dohodl
  česky („odjezdové okno").
- V `handoff.md` má hlavičku pravidlo o jazyce hned nahoře, ať to executor nepřehlédne.
- Manager (Cowork) mluví s Joem **vždy česky**, interní práci vede anglicky.

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
- **Test (ručně v prohlížeči):** projít taby Moje trasy / Hledat / Nastavení,
  v módu **Teď** i **Jindy**. Před commitem otestuj vždy.
  ⚠️ **Appka bere čas z prohlížeče** — když má zařízení posunuté datum, tabule i hledání počítají
  k jinému dni (a jinému typu dne). Při divných výsledcích zkontroluj nejdřív hodiny zařízení.

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
