# Handoff — EXECUTOR spec (J4 UI „Hledat spojení" — PŘEDÁVKA 1: jádro vyhledávání v appce)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-08-02).** J8 (automat + guard) je HOTOVÉ a robustní. Teď **J4 — UI.**
> Rozhodnutí Joe: **4. tab „Hledat" do stávající F1 appky** (ne samostatná appka), první verze s hledáním A→B.
> Mockup schválen (tmavý theme, časy v JetBrains Mono, karty jako Odjezdy, Teď/Jindy).
> **Předávka 1 (TADY):** zprovoznit jádro v prohlížeči + nový tab + hledání A→B + výsledky (výběr zastávek
> ručně). **Předávka 2 (potom):** „moje poloha" (GPS→nejbližší zastávka) + doladění.

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů, **nic nad zadání**. Git děláš ty.
> Malé kroky, kód jako **diff**, commit + testovací instrukce po každém kroku. **Edituj `index_raw.html`,
> pak zkopíruj do `index.html` a commitni OBA** (konvence projektu).

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md` (Konvence — `index_raw.html`=`index.html`, mobile-first ~380px, tmavý theme),
   `scripts/routing.js`, `scripts/journey.js`, `scripts/timetable.js`, `index_raw.html` (systém tabů
   `showTab`/`render`, režim `useCustomTime`/`getNow`/`setTimeMode`), tento soubor.
3. **Před prvním commitem** commitni necommitnuté manager docs.

---

## Kontext appky (POTVRZENO, neodvozovat znovu)
- Taby: `showTab(tab)` přepíná `currentTab`, aktivní tab podle pole `['departures','timetable','settings']`,
  pak `render()` → `renderDepartures/Timetable/Settings` píše do `#content`. Data F1 = inline `const DATA`
  (5 linek) — **NEsahat**, staré taby jedou dál na inline datech.
- **Čas:** appka má režim Teď/Jindy: `useCustomTime`, `getNow()` (vrací aktuální/simulovaný `Date`),
  `setTimeMode('now'|'custom')`, `customDate`/`customTime`. **Hledání ho využije** (z `getNow()` spočti
  `date`+`nowMin`).
- **Theme (CSS proměnné v `<style>`):** `--bg #0a0e1a`, `--bg2 #111628`, `--bg3 #1a2040`, `--bg4 #232a4a`,
  `--blue1 #4d7df7`, `--blue2 #6e9bfa`, `--violet #8f70f3`, `--text #e8ecf4`, `--text2 #8892b0`,
  `--text3 #5a6380`, `--green #34d399`, `--radius 14px`. Fonty: Nunito (text), JetBrains Mono (časy).
- Moduly `scripts/*.js` jsou pro Node (`require`/`module.exports`) — v prohlížeči zatím NEfungují (viz J4-1).

---

## J4-1 — Zprovoznit jádro v prohlížeči (UMD moduly, bez build stepu)

Cíl: `routing.js`, `timetable.js`, `journey.js` musí jít načíst i přes `<script src>` v prohlížeči, BEZ
duplikace kódu a BEZ build stepu. Uděláš z nich **UMD**:
- **`module.exports` i `require` obal do `typeof` guardů**, ať v prohlížeči nespadnou:
  - Konec každého modulu: `if (typeof module !== "undefined" && module.exports) module.exports = {...}`
    **a zároveň** `if (typeof window !== "undefined") window.MHDRouting = {...}` — v obou expozicích uveď
    **CELÉ API**, které downstream potřebuje (dnes `window.*` vystavuje jen část → journey by v prohlížeči
    nenašel `activeServicesOn`).
    - `routing.js` → `window.MHDRouting = { search, resolveStopId, lineOf, forwardSegments, HUBS, coLocatedGroups, stopsAfter, patternsThrough }`
    - `timetable.js` → `window.MHDTimetable = { isServiceActive, activeServicesOn, patternDeparturesOn, nextDepartures }`
    - `journey.js` → `window.MHDJourney = { planJourney }`
  - Nahoře v `journey.js` (a kdekoli se importuje): deps ber **z require NEBO z window**:
    ```js
    const routing = (typeof require !== "undefined" && typeof module !== "undefined") ? require("./routing.js") : window.MHDRouting;
    const timetable = (typeof require !== "undefined" && typeof module !== "undefined") ? require("./timetable.js") : window.MHDTimetable;
    const { search, resolveStopId } = routing;
    const { activeServicesOn } = timetable;
    ```
- **Nic v logice neměnit** — jen obal exportů/importů. Node testy musí dál běžet beze změny.

**Ověření J4-1:** `node scripts/journey.test.js` a `verify_network.js` dál PASS (Node cesta). Browser cestu
ověří J4-2.

**Commit J4-1.**

---

## J4-2 — Načíst `network.json` za běhu + připojit moduly

V `index_raw.html`:
- Před hlavní `<script>` přidej `<script src="scripts/routing.js"></script>`, `…/timetable.js`, `…/journey.js`
  (v tomto pořadí — journey závisí na obou).
- Na startu appky **fetchni síť**: `fetch('data/network.json').then(r=>r.json()).then(net => { NET = net; … })`.
  Ulož do globální proměnné (např. `let NET = null`). Dokud se nenačte, tab Hledat ukáže „Načítám síť…";
  po načtení překresli. Ošetři chybu fetch (offline) hláškou „Data se nepodařilo načíst.".
- **Nezdržuj start** ostatních tabů — Odjezdy/Jízdní řády jedou na inline `DATA` bez `NET`.

**Ověření J4-2:** appka se načte, v konzoli `window.MHDJourney.planJourney(NET,'Krátká','Tržnice',{date:'20260202',nowMin:480})`
vrátí pole spojení. **Commit J4-2.**

---

## J4-3 — 4. tab „Hledat"

- Do `.tabs` přidej `<button class="tab" onclick="showTab('search')">Hledat</button>` (pořadí: Odjezdy,
  Jízdní řády, **Hledat**, Nastavení — ať sedí s mockupem; případně Hledat jako 3. dle mockupu, doladíš s Joem).
- V `showTab` uprav pole aktivních tabů (`['departures','timetable','search','settings']` — musí odpovídat
  pořadí tlačítek).
- V `render()` přidej `case 'search': renderSearch(); break;`.

**Commit J4-3.**

---

## J4-4 — `renderSearch()` — formulář (bez polohy, ta je P2)

Do `#content` vykresli (ve stylu appky, reuse tříd kde to jde):
- **Odkud / Kam:** dvě pole s **našeptávačem** — `<input list="stopList">` + jeden `<datalist id="stopList">`
  naplněný **názvy zastávek z `NET.stops`** (zobraz bez prefixu `Karlovy Vary,`; drž si mapu zobrazený→plný
  název, nebo matchuj přes `resolveStopId`, který normalizaci umí). Mobilní a jednoduché.
- **Swap** (prohodit Odkud/Kam) — malé kolečko mezi poli (jako mockup); jen prohodí hodnoty.
- **Čas:** reuse Teď/Jindy — buď stejný `time-toggle` jako v Odjezdech (`setTimeMode`), nebo tlačítka, která
  nastaví `useCustomTime`. Hledání pak čte `getNow()`.
- **Tlačítko „Hledat spojení"** → `doSearch()`.
- Placeholder „Moje poloha" tlačítko můžeš vykreslit **disabled** s poznámkou „brzy" (plná funkce = P2), ať
  layout sedí s mockupem — ale NEimplementuj GPS.

**Commit J4-4.**

---

## J4-5 — `doSearch()` + výsledky

- Z `getNow()` spočti `date` (`YYYYMMDD`) a `nowMin` (`h*60+m`).
- `resolveStopId(NET, odkud)` a `…(kam)`; když se nenajde → hláška „Zastávku nenašel".
- `const res = window.MHDJourney.planJourney(NET, odkud, kam, { date, nowMin, sort:'departure', limit:8 })`.
- Vykresli **karty** (dle mockupu): řádek `HH:MM → HH:MM` (mono) + celková doba (`totalMin`), pod tím
  odznaky linek (`.line-badge` styl) + info o přestupu (`transferStop`, `waitMin`; u co-located `walkMin:0`
  ukaž „bez přestupu/stejné místo"). Pro `arrMin ≥ 1440` zobraz „+1 d". Formát času reuse `formatTime`.
- Prázdný výsledek → „Žádné spojení v daném čase." Respektuj violet nádech při „Jindy" (jako ostatní taby).

**Commit J4-5.**

---

## Test (Joe) + závěr
- Otestuj na mobilní šířce (~380 px): tab Hledat, pár reálných dvojic (Krátká→Tržnice = přímý;
  Krátká→Růžový vrch = přestup), režim Teď i Jindy. Porovnej 1–2 spoje s tabem Odjezdy / reálným JŘ.
- **Commitni `index_raw.html` + `index.html` (kopie)** po každém kroku. Ostatní taby musí fungovat beze změny.
- Do `VÝSLEDEK` napiš stav, co ověřeno, a otevřené UX drobnosti pro Joea.

## Mimo scope P1 (→ Předávka 2)
- **„Moje poloha"** (GPS `navigator.geolocation` → haversine → nejbližší zastávka do pole Odkud).
- Doladění vzhledu karet, řazení/filtry (příjezd/délka/přestupy — `planJourney` už umí přes `opts.sort`),
  detail spoje. Mapa (Leaflet) = J5.

---

## VÝSLEDEK (vyplní executor)

**Předávka 1 HOTOVÁ, 5 commitů (J4-1 až J4-5) + 1 bugfix commit, vše pushnuto.**

- **J4-1 (UMD obal):** `routing.js`/`timetable.js`/`journey.js` teď fungují i jako `<script src>`
  v prohlížeči (`window.MHDRouting`/`window.MHDTimetable`/`window.MHDJourney`), beze změny logiky.
  Node testy (`journey.test.js`, `verify_network.js`) dál 20/20 PASS.
- **🔴 Nález + oprava (mimo psaní spec, ale nutná pro funkčnost):** UMD kód přesně dle zadání
  (`const routing = require(...) || window.MHDRouting; const { resolveStopId } = routing;`) v
  prohlížeči **koliduje** — 3 `<script src>` tagy bez `type="module"` sdílejí jeden top-level scope,
  takže `const resolveStopId` v `timetable.js`/`journey.js` naráží na `function resolveStopId` už
  deklarovanou v `routing.js` → `SyntaxError: Identifier 'resolveStopId' has already been declared`,
  celý modul by se v prohlížeči vůbec nenačetl. Opraveno obalením obsahu všech 3 souborů do IIFE
  (`(function () { ... })();`) — izoluje scope, ven uniká jen `window.MHD*`, Node cesta (`module.exports`)
  beze změny. Zapsán samostatný commit `fix: J4-1 dodatek`.
- **Jak ověřeno (bez GUI prohlížeče v tomto prostředí — chromium-cli/Playwright tu nejsou nainstalované):**
  napsán jednorázový DOM shim (`vm.runInThisContext`, ne jsdom — žádná nová dependency, jen ve
  scratchpadu, necommitnuto), který věrně napodobuje sdílený top-level scope víc `<script>` tagů tak,
  jak to dělá skutečný prohlížeč. Nad ním spuštěno: načtení sítě (fake `fetch` čte `network.json` ze
  souboru), `showTab('search')` → formulář, `doSearch()` pro Krátká→Tržnice (Teď, reálný čas) i
  Krátká→Růžový vrch (Jindy 2.2.2026 08:00, přestup) → karty s liniovými odznaky, časy, přestupem a
  violet módem sedí; test neexistující zastávky → „Zastávku nenašel."; `swapSearchStops()` funguje.
  Diffnuto i to, že žádný řádek v `renderDepartures`/`renderTimetable`/`renderSettings` nebyl změněn
  (jen `showTab` tabs-pole rozšířeno o `'search'`) — staré taby by měly být nedotčené.
  **NEOVĚŘENO vizuálně v reálném prohlížeči** (chybí nástroj v tomto prostředí) — **Joe prosím
  otestuj vizuálně na mobilní šířce dle sekce „Test (Joe)" výše**, hlavně: rozložení `search-form`
  (Odkud/Kam/swap kolečko) na ~380 px, čitelnost datalist našeptávače na mobilu (nativní chování
  prohlížeče, nelze plně ověřit mimo něj), a že 4 taby v `.tabs` (teď `flex:1` × 4) nejsou moc
  natěsno na malém displeji.
- **Otevřené UX drobnosti pro Joea:**
  1. Pořadí tabů: Odjezdy, Jízdní řády, **Hledat**, Nastavení — pokud mockup chtěl jiné pořadí, dej vědět.
  2. Badge neznámé linky (mimo 3/9/13/15/51) nemá barvu z `.line-X` (ta existuje jen pro těch 5) —
     padá na neutrální `var(--bg4)` fallback. Pokud to bude rušit, můžeme příště domalovat paletu.
  3. Časový toggle Teď/Jindy je **sdílený globální stav** (stejně jako v Odjezdech) — přepnutí v
     tabu Hledat ovlivní i tab Odjezdy a naopak. Odpovídá existující konvenci appky, ne nový bug.
  4. Staré výsledky hledání zůstanou zobrazené i po změně Teď/Jindy nebo přepnutí pryč a zpět na tab
     — nepřepočítávají se automaticky, dokud uživatel neklikne znovu „Hledat spojení". Záměr (minimální
     scope), ne bug.
  5. „Moje poloha" je vykreslené jako disabled tlačítko s textem „(brzy)" — GPS logika viz Předávka 2.

**Poznámka k push (2026-08-03):** `git push` zprvu odmítnut — `origin/main` mezitím dostal 1 nový
automatický commit (`chore(data): automaticka obnova jizdnich radu 2026-08-03`). `git pull --rebase
origin main` proběhl bez konfliktů (žádný z 8 mých commitů se datového souboru nedotýkal). Po
rebase znovu `node scripts/verify_network.js` → PASS 20/20, `node scripts/journey.test.js` OK →
pushnuto (`cf74e7f` na `4db2c9f`).
