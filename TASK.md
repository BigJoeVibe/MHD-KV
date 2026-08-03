# TASK.md — backlog projektu MHD KV „Jedeme MHD"

Živý dokument — Claude (manager) aktualizuje průběžně. Přeplánování zapiš s datem.
Detail v `docs/ROADMAP.md`, datová základna v `docs/DATA_SOURCES.md`.

## TEĎ (aktivní směr — od 19. 7. 2026): jádro A→B

| # | Úkol | Priorita | Stav | Pozn. |
|---|------|----------|------|-------|
| J1 | **Síťový model z KV GTFS** (stops + patterns + trips + services) | vysoká | ✅ HOTOVO 19.7. | `data/network.json` (62 KB gzip) + `scripts/build_network.js`. 23 linek, 157 zast./všechny GPS, 290 patternů |
| J2 | **Routing A→B** (přímé + 1 přestup) v JS | vysoká | ✅ HOTOVO 21.7. | `scripts/routing.js` (+`routing.test.js`, `verify_network.js` 14/14 PASS). Směrové + headsign, dedup, Pareto filtr, huby v řazení. Zrevidováno managerem, pushnuto. |
| J3 | **Časová vrstva** (nejbližší odjezd, čekání na přestup, půlnoc 51) | vysoká | ✅ HOTOVO 23.7. | C `timetable.js` + B `journey.js` (`planJourney`), 20/20 PASS, ověřeno proti JŘ |
| JH | **Zpevnění jádra před UI** (data-integrita + robustnost routingu + řazení časem) | vysoká | ✅ HOTOVO 23.7. (Předávka 1) | H0+H1a-d+H2+H4 hotové, `verify_network.js` 26/26 PASS. Detail + otevřené TODO v `handoff.md` → VÝSLEDEK |

**J3 — postup (rozhodnuto 2026-07-22, C→B):**
- **KROK C — ✅ HOTOVO 23.7.:** `scripts/timetable.js` (`nextDepartures` ze zastávky k datu/času, směrově, noční 51) + `timetable.test.js` + 4 časové kontroly ve `verify_network.js` (18/18 PASS). Ověřeno proti reálnému JŘ DPKV (linka 3 08:27; linka 51 přes půlnoc 22:46/23:26/01:16/03:06). **Nález:** ~45 % spojů má vlastní `offs` (`trips[…][2]`) → čas počítat `trip[2] || pattern.off`.
- **KROK B — ⭐ TEĎ (spec v `handoff.md`):** nový `scripts/journey.js` — `planJourney(net, A, B, opts)` nad `search()` + `timetable.js`: reálné časy, garantovaná návaznost přestupu (≥ minTransfer), přesah dne. Výstup = konkrétní časová spojení (**1A**), řazení podle odjezdu + celková délka jízdy (**2B**).
- **Varianty zadávání (motor staví B, UI/pozici řeší později):** čas **nejbližší teď × konkrétní datum+čas** = pro jádro jen jiný `date`+`nowMin` (dosadí UI, J4). Směr **z mé pozice → cíl × opačně** = prohození A↔B (jádro směrové, zadarmo). Poloha = zastávka/mapa/GPS → **J5**. Oblíbené/časté + tabule à la F1 → **J6/J7**.
- **Otevřená témata u B:** (1) předěl typu dne přes půlnoc = ŘEŠÍ B (2. noha k `date+1`); (2) svátky/prázdniny/víkend = aktivita každé nohy k jejímu datu; (3) letní/zimní čas = teď NEřešit, zapsat jako známé omezení; (4) min. přestup = ✅ **3–5 min** (default 3).

**JH — Zpevnění jádra (rozhodnuto 2026-07-23, pořadí B→J8→A přehodnoceno na: zpevnit → J8 → J4):**
- **Předávka 1 (⭐ TEĎ, spec v `handoff.md`):** H0 data-integrita (7 zastávek mělo GPS `0,0` — override v `build_network.js` + zpřísnění `verify_network.js`), H1 routing (zrušit topologický Pareto → o pořadí rozhoduje čas; 2 přestupy; smyčky; propojení totožných zastávek ≤ 30 m), H2 řazení podle času s přepínatelnými klíči pro budoucí UI filtry, H4 testy.
- **Rozhodnutí (Joe):** rozhoduje **celkový čas** (nejdřív odjezd, nejdřív příjezd), přestupy nízká priorita; default řazení podle odjezdu, ostatní klíče připravit pro UI; stavět robustně kvůli budoucím příměstským linkám.
- **GPS override (Joe 23.7., mapy.cz)** — klíč = zdrojové `JDFS-` id, provizorní single-point (přesné směrové pozice → epic J9):
  Kpt.Jaroše `JDFS-10020` 50.225355,12.839125 (střed 2 označníků ~90 m) · Mattoniho nábřeží `JDFS-14283` 50.239712,12.889429 (2 MHD; příměstský 3. bod → J9) · Nádraží Dalovice `JDFS-16310` 50.255920,12.885421 · Na Pasece `JDFS-16311` 50.252510,12.882424 · Globus `JDFS-18345` 50.217823,12.806296 · Tesco `JDFS-32745` 50.226009,12.823021 · Lázně I `JDFS-36827` 50.219270,12.880980 (= poloha S116).
- **ODLOŽENO do epicu J9** (`docs/ROADMAP.md`): pěší přestup 30–200 m + směrové pozice označníků + navádění „kam jít" + mapa. Datový lead: **DPKV interaktivní mapa** má puntíky označníků s popisem (Dvory 1/2/3 + linka + směr) bez GPS exportu → Joe zkusí oslovit DPKV.
- **Předávka 1 — HOTOVO 23.7.:** 8 commitů (H0, H1a, H1b, H1c, H1d, H2, H4 + docs). `verify_network.js` 26/26 PASS (bylo 20/20). Detail v `handoff.md` → VÝSLEDEK.
- **Otevřené TODO z Předávky 1 (k naplánování, priorita na manageru):**
  1. Časová vrstva pro `transfers: 2` v `journey.js` chybí — `routing.js` `search()` umí topologický řetěz o 2 přestupech (H1b), ale `journey.js` ho zatím explicitně přeskakuje (nekombinuje s časy). Mimo rozsah H2.
  2. `maxTransfers: 2` je na dotaz mezi dvěma hustými huby pomalé (~700 ms, ~294 tis. topologických variant) — v pořádku jako opt-in „další možnosti" v UI, ne jako výchozí/eager dotaz.

**J2 — HOTOVO (2026-07-21):** `scripts/routing.js` (search + helpery, browser-safe), `routing.test.js`, `verify_network.js` (14/14 PASS). Nález+oprava: okružní patterny mají zastávku 2× → `indexOf` dával záporné `hops`, opraveno přes `stopsAfter`. Ověřeno proti JŘ DPKV (linka 3, 13). Detail v `handoff.md` → VÝSLEDEK.

**Test zpracování dat (viz `docs/DATA_SOURCES.md` → Test / QA):**
- `scripts/verify_network.js` = **jednorázový** sanity test po buildu (struktura, GPS, výluka Bohatice, směrovost). Doporučeno udělat spolu s J2.
- **opakovaný** regression guard v `update-data.yml` (prahy + pokles + validní JSON → jinak necommitovat). Součást J8.

## PŘÍŠTĚ (schválený směr)

| # | Úkol | Pozn. |
|---|------|-------|
| J4 | UI „Hledat spojení" (From/To) | **⭐ TEĎ — Předávka 1** (spec v `handoff.md`): 4. tab „Hledat" do F1 appky, UMD moduly v prohlížeči + `fetch('data/network.json')`, formulář Odkud/Kam (datalist) + Teď/Jindy + karty spojení z `planJourney`. Mockup schválen. **Poloha (GPS) + doladění = Předávka 2.** |
| J5 | Poloha: klik do mapy / GPS / paste GPS → nejbližší zastávka | coords už v datech; mapa = zvážit Leaflet |
| J6 | Favourites = body 1–3 (domov↔centrum, ↔Západní, ↔nádraží) jako uložené dotazy | nahrazuje ruční F2 |
| J7 | Sloučení se starou appkou F1 / osud „odjezdové tabule" | rozhodnout |
| **J8** | **Automatizace obnovy dat** (GitHub Actions, bez lokálu) — viz `docs/DATA_SOURCES.md` | J8a + J8-fix + J8b nasazené; **⭐ J8-hotfix TEĎ** (první ostrý běh selhal — brittle kontroly v guardu, viz níže) |

**🔴 J8-hotfix (2026-08-02) — první ostrý scheduled běh SELHAL (guard zablokoval zdravá data):** příčina není v datech (25/26 PASS), ale v `verify_network.js` — sekce „Robustnost routingu (H1)" testuje **chování kódu** navázané na konkrétní snímek. Spadlo `H1c` (smyčka linky 12 Pivovar→Trznice: nový build tu trasu jako smyčku nemá → `FAIL`). Kód (`forwardSegments`) je správně. Druhá časovaná bomba: kontrola výluky Bohatice s natvrdo daty `20260901`/`20260915` (spadne po 12.9.). **Web běží dál na starých datech (rollback OK).** Fix (spec v `handoff.md`): guard = jen build-invariantní kontroly; H1a–d přesunout do `routing.test.js` (tolerantně, smyčku hledat dynamicky), nahradit 1 tolerantním smoke testem `planJourney(Krátká→Tržnice)`, odhardcodovat výluku na obecný invariant, audit zbytku. Princip zapsat do `docs/DATA_SOURCES.md`.

**J8a — HOTOVO 23.7.:** `scripts/update_data.js` — stáhne aktuální GTFS, vyfiltruje MHD KV, streamuje
`stop_times.txt` (~1,38 GB), zavolá `build_network.js`, prožene guardem (validní JSON + prahy
linky≥20/zast≥140/spoje≥9000 + pokles ≤20 % + `verify_network.js` celý PASS → jinak rollback +
nenulový exit). Otestováno end-to-end na reálném čerstvém stažení (22.7. data) — viz `handoff.md` → VÝSLEDEK.

**✅ VYŘEŠENO 23.7. (J8-fix) — NÁLEZ z reálného testu J8a — GTFS interní id nejsou stabilní mezi
obnovami:** čerstvé stažení (22.7.) proti staršímu (17.–18.7.) ukázalo, že `stop_id` (`JDFS-xxxxx`)
téže fyzické zastávky se mezi obnovami **mění**. Důsledky:
1. `COORD_OVERRIDES` v `build_network.js` (klíč = `JDFS-` id, JH/H0 23.7.) se rozbije při každé další
   obnově → 7 zastávek spadne zpět na `0,0` → guard to správně zachytí a odmítne commit, ale
   **automatický běh (J8b) tak nikdy neprojde bez zásahu**. Návrh opravy: rekeyovat override na
   `stop_name` (stabilnější) — potřebuje rozhodnutí, protože „Lázně I" má ve zdroji 2 různě
   pojmenované záznamy (`Karlovy Vary,Lázně I` × `Lázně I` bez prefixu) a je nutné to vyřešit korektně,
   ne overridovat obě.
2. Interní zkrácená id v `network.json` (`S#` zastávky, `P#` patterny) jsou přiřazována pořadím
   výskytu při buildu → nejsou stabilní mezi obnovami. `verify_network.js` má natvrdo `P50` (dřív
   linka 3), `P5` (dřív linka 12 smyčka) — po čerstvém stažení odpovídaly jiným linkám (9, resp. 1) a
   testy proto spadly (FAIL 3×). **Není to regrese dat**, je to křehkost testu vůči přeindexaci.
   Návrh opravy: resolvovat testovací pattern přes (linka, headsign, zastávky), ne přes natvrdo `P#`.
**ROZHODNUTO (Joe 23.7.): varianta (a) — opravit.** → **J8-fix HOTOVO 23.7.** (`handoff.md` → VÝSLEDEK):
`COORD_OVERRIDES` překlíčován na normalizovaný název (aplikuje se jen když GPS chybí, „Lázně I" se
2 záznamy vyřešeno korektně — validní se nepřepíše); `verify_network.js` odhardcodován přes
`findPattern`/`findLoopPattern` (linka + název); trvalé pravidlo v `docs/DATA_SOURCES.md`; **důkaz
proveden:** `update_data.js` na živé čerstvé stažení prošel end-to-end (guard 26/26 PASS, 57,9 s),
patterny se reálně přečíslovaly a dohledání je i tak správně našlo — commitnut i přestavěný
`network.json` (23 linek/157 zast./290 patternů/10 151 spojů).

**📌 BUDOUCÍ — Vlastní stabilní id zastávek (registr / mini-DB), váže se na J4/J6 (zapsáno 23.7.):**
- **Kontext:** zdrojové `JDFS-` i interní `S#`/`P#` jsou per-build volatilní (viz J8-fix). Pro jádro/obnovu
  to vyřešeno name-keyingem. **Ale** až budeme persistovat uživatelská data — **oblíbené (J6)**, sdílené
  odkazy / deep-linky na spojení (**J4**) — nesmí viset na volatilních id ani čistě na názvu (přejmenování,
  normalizované kolize typu „Lázně I").
- **Nápad:** vlastní registr / mini-DB v repu `stabilní klíč → náš pevný KV-id`, mapovaný při buildu; appka
  i uložené dotazy pak drží náš KV-id, ne zdrojové/interní.
- **Kotva = GPS poloha, ne text** (rozhodnutí směru, Joe 23.7.): poloha je jazykově nezávislá a stabilnější
  než název. Pozor na: zastávky bez GPS (`0,0` → řešeno override), 2 označníky/uzly (→ epic **J9** směrové
  pozice), drobné posuny souřadnic mezi obnovami (párovat s tolerancí).
- **Rozhodnout až u J4/J6.** Teď netřeba — name-keying pro J8 stačí. „Uvidíme, jak to bude fungovat" (Joe).

**✅ J8b HOTOVO 23.7.** (rozhodnuto Joe 23.7.: **auto-commit rovnou do `main`**, guard = ventil místo
člověka, + **denní cron `0 3 * * *` UTC**): J8b-1 Last-Modified pre-check + `--force` v `update_data.js`
(otestováno 3× lokálně — skip/force/skip); J8b-2 `.github/workflows/update-data.yml` (cron +
`workflow_dispatch` s FORCE, `permissions: contents:write`, commit jen při změně); J8b-3 keepalive
proti 60dennímu vypnutí (spouští se jen když datový krok nic necommitnul a poslední commit je
≥50 dní starý); **J8b-4 ověřeno na reálném GH Actions runneru** (Joe spustil ručně, Success 42 s,
commit `b43ad7f` proběhl — jen bump `data_source_state.json`, `network.json` beze změny, protože
zdroj se nezměnil od dřívějšího lokálního běhu téhož dne). Detail v `handoff.md` → VÝSLEDEK.
📌 **Nedořešeno:** licence GTFS (atribuce) = must-do před veřejným/ostrým během (viz níže „NEDOŘEŠENÉ").
📌 **Drobný nápad (kosmetický, nezablokoval běh):** `update-data.yml` používá `node-version: '20'`,
GitHub log hlásí deprecation warning (runner vynuceně použil Node 24) — zvážit bump na `'22'`/`'24'`.

**J8 — podúkoly (návrh 2026-07-21):**
- `scripts/update_data.js` — stáhnout JrUtil GTFS → filtr KV (stream `stop_times`) → `build_network.js`.
- `.github/workflows/update-data.yml` — denní cron + `Last-Modified` check + commit `network.json` + `workflow_dispatch`.
- **keepalive** proti 60dennímu auto-vypnutí (ověřeno).
- Zdroj: A=JrUtil GTFS (hlavní), B=CIS MHD JDF (záložní). GPS = statická, ne-prio.

## NEDOŘEŠENÉ / OTEVŘENÉ BODY (rizika)

| Téma | Co chybí / riziko | Stav |
|------|-------------------|------|
| **Licence dat** | ověřit podmínky užití + atribuci GTFS (JrUtil / CIS JŘ) před veřejným nasazením | [k dořešení] |
| **„Na znamení" GAP** | GTFS příznak nese jen linka 8; reálné (5, 19…) chybí → NEspoléhat na GTFS | rozhodnout v UI: ruční overlay / vynechat / jiný zdroj |
| **Náhlé výluky** | plánované (v CIS) data mají; „ode dneška" výluku ne → řeší periodicita obnovy | do J8 |
| ~~Neucelená data~~ | ~~7 zastávek bez GPS~~ — VYŘEŠENO 19.7. (všech 157 má GPS) | ✅ hotovo |
| Aktivní dny | počítat z `calendar`+`calendar_dates` (logika ověřena) | do J3 |
| ~~Varianty linek~~ | řešeno patterny+headsign (290 patternů) | ✅ v J1 |
| Směrovost odjezdů | odjezd/výsledek vždy „směrem ke konečné" (jinak mix směrů) | do J2/J4 |
| Přestup | čas na přestup / pěší dostupnost mezi označníky; huby: U koníčka, Tržnice, Stadion ZM, Horní nádraží | do J3/J5 |
| Předěl typu dne u přestupu | přestup přes půlnoc → 2. noha jiný kalendářní den/typ dne (svátek/prázdniny/víkend); počítat aktivitu k datu každé nohy | do J3-B |
| Letní/zimní čas | 2×/rok předěl (ne v III/X); kolem 02–03:00 chybějící/dvojitá hodina — ověřit dopad na `startMin` a nejbližší odjezd | do J3-B |
| ~~.gitignore~~ | `data_raw/` NEcommitovat | ✅ přidáno 19.7. |
| Mapa v UI | Leaflet = 1. externí závislost (poruší „no-dep") → rozhodnout | do J5 |
| Stará appka | nechat F1 běžet, nebo přepsat na nový model? | do J7 |

**Testovací sada (huby od Joea, na ověření routingu J2):** U koníčka (Rozcestí u Koníčka), Tržnice, Stadion ZM, Horní nádraží.

## VARIANTY K ROZHODNUTÍ

| Otázka | Varianty | Doporučení | Rozhodnuto |
|--------|----------|------------|------------|
| Mapa v UI | Leaflet+OSM × zatím bez mapy (výběr/GPS/paste) | [ODHAD] v1 bez mapy, mapa v2 | ne |
| Osud staré appky | běží paralelně × sloučit do jádra | [ODHAD] sloučit, až jádro pojede | ne |

## Git automatizace (2026-07-21 — premisa opravena)

Cíl: zrušit ruční upload na GitHub, mít commit+push jedním krokem.
- **KOREKCE:** žádný lokální klon neexistuje. Pracovní složka `Documents\Claude\Projects\MHDKV` **není git repo** (chybí `.git`). F1 nahrán ručním web-uploadem. → „dvě složky" padá.
- **Reálná cesta:** udělat z TÉTO složky git repo (`git init` + remote na `BigJoeVibe/MHD-KV` + sladit s F1 na remote) → pak `scripts/deploy.ps1` (add/commit/push přímo tady). Předpoklad i pro J8 (Actions).
- **Jednorázový setup:** ověřit/nainstalovat Git for Windows, autentizace (Git Credential Manager / PAT), `git init`, `remote add`, `fetch` + sladit historii, `.gitignore` (data_raw/, MHD_test/ ven).
- **FINÁLNÍ ŘEŠENÍ (2026-07-21):** git dělá **Claude Code (executor) ve svém terminálu** — v rámci orchestrace v1 (dva agenti). Odpadá GitHub Desktop i ovládání přes obrazovku (Cowork computer-use nesmí psát do terminálu → proto tahle cesta).
- **Setup = KROK 0 v `handoff.md`:** `git init` v této složce → remote `MHD-KV` → `fetch` + `reset --soft origin/main` (adopce F1, bez konfliktu) → commit + push. Repo je přímo tato složka, žádný druhý klon.
- **Ongoing:** executor commitne po každém kroku; manager (Cowork) git nedělá.
- **Pozn.:** starý nedodělaný `.git` odstraněn; záloha v `_zalohy/2026-07-21_pre-git/`. Protokol dvou agentů v `CLAUDE.md` → „Orchestrace v1".

## HISTORIE / starší backlog

Původní fáze F2–F5 (zpáteční spoje, refaktor `data.json`, scraper, příměstské) jsou v `docs/ROADMAP.md`.
Původní F6 (vyhledávání A→B) je nově **předsazené jako jádro** (viz TEĎ). Rozhodnutí schéma verzí:
0.x = vývojové, 1.0.0 až appka pokryje širší cíl (17. 7. 2026).
Linka 9 v „Odjezdech" starého modelu — zvážit vyřazení (jezdí jinudy); v novém GTFS je celá síť tak jako tak.
