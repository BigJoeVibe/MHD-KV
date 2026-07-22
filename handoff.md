# Handoff — EXECUTOR spec (J3 časová vrstva — KROK C: datová/testovací vrstva)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-07-22).** Předchozí J2 je uzavřená — její
> archiv (VÝSLEDEK) je v gitu (commit `b2eba01`) a v `changelog.md`.
> **Rozhodnutý postup J3 (Joe, 2026-07-22): C → B.** Nejdřív samostatná datová/
> testovací časová vrstva (KROK C, tady), ověřit proti reálnému JŘ; teprve pak
> integrace do `search()` s reálnou návazností přestupů (KROK B, příště).
> **Tento handoff = jen KROK C.** Krok B je dole jen jako náhled (NEimplementovat).

> **Předávka pro nižší CC (executor).** Manager připravil zadání; executor
> implementuje kód dle bodů níže, **nedělá nic nad zadání**. Git děláš ty (executor).

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md` (vč. „Orchestrace v1" a Konvence — hlavně typy dne a linka 51),
   `TASK.md` (sekce TEĎ = J3), `docs/DATA_SOURCES.md`, `docs/DATA_FORMAT.md`, tento soubor.
3. **Před prvním commitem:** v repu leží necommitnuté manager úpravy dokumentace
   z 21.–22. 7. (`CLAUDE.md`, `TASK.md`, `handoff.md`, `.gitignore`). Commitni je
   spolu s prvním krokem J3 (`docs: manager dokumentace + spec J3`), ať je repo čisté.
4. Malé kroky, kód jako **diff**, jedna změna najednou. Po každém kroku commitni
   a dej Joeovi testovací příkaz.

---

## Datový model — časová část (POTVRZENO, neodvozovat znovu)

Ověřeno managerem 2026-07-22 přímo v `data/network.json`:

```
patterns = { "P0": { line, dir, headsign, stops:[...], off:[0,2,6,18,21,25] } }
            // off[i] = MINUT od startu spoje k zastávce na indexu i
trips    = { "P0": [ [startMin, "serviceId"], ... ] }
            // startMin = MINUT od půlnoci, kdy spoj vyjíždí z první zastávky patternu
services = { "CAL-...": { d:[po,út,st,čt,pá,so,ne 0/1], s:"YYYYMMDD",
                          e:"YYYYMMDD", add:["YYYYMMDD"], rem:["YYYYMMDD"] } }
```

- **Čas odjezdu ze zastávky** na indexu `i` v patternu `p` u spoje se `startMin`:
  `depMin = startMin + p.off[i]`. (Časy v minutách od půlnoci; formát HH:MM =
  `Math.floor(depMin/60) % 24` : `depMin % 60`.)
- **Aktivita služby** k datu už je hotová ve `verify_network.js`:
  `isServiceActive(service, dateStr)` — řeší `rem` (výjimka NEjede), `add`
  (výjimka jede), rozsah `s..e` a den v týdnu (`(getDay()+6)%7`, Po=0…Ne=6).
  **Přenes ji 1:1 do nového modulu a exportuj** (ať ji sdílí test i pozdější `search()`).
- **Linka 51 = noční, přesah přes půlnoc.** Spoj může mít `depMin` blízko 1440
  i těsně po půlnoci (ranní `depMin` ~ 10–360). Konvence z `CLAUDE.md`
  (`getUpcomingDepartures`): když `nowMin >= 1080` a odjezd spadá do noci,
  přičti k `depMin` 1440, aby řazení „nejbližší napřed" fungovalo přes půlnoc.

---

## KROK C1 — `scripts/timetable.js` (nový modul)

**Cíl:** čistý JS modul (bez závislostí, Node i prohlížeč), který nad `network.json`
umí říct „jede/nejede k datu" a „nejbližší odjezdy ze zastávky". **Zatím se NEintegruje
do `search()`** (to je krok B). Funkce dostávají `net` jako parametr.

### Funkce
- `isServiceActive(service, dateStr) → bool` — přenes 1:1 z `verify_network.js`.
- `activeServicesOn(net, dateStr) → Set<serviceId>` — množina služeb aktivních k datu.
- `patternDeparturesOn(net, patternId, dateStr) → number[]` — pole `startMin` spojů
  daného patternu aktivních k datu, vzestupně.
- `nextDepartures(net, stopId, dateStr, nowMin, opts = { limit: 5 }) → []`
  Pro **každý pattern**, který obsahuje `stopId` a **není to jeho poslední zastávka**
  (směrově — z koncové se neodjíždí dál), spočti odjezdy z té zastávky k datu
  (`startMin + off[indexStopId]`), vezmi ty **≥ nowMin** (s noční logikou 51, viz výše),
  slož dohromady, seřaď vzestupně podle času a vrať prvních `limit`:
  ```js
  { line, headsign, patternId, stopIndex, depMin }   // depMin = min od půlnoci
  ```
  - `stopId` projít přes `resolveStopId` (importuj z `routing.js` nebo duplikuj drobnou
    normalizaci — raději importuj, ať je jediný zdroj pravdy).
  - Pokud se `stopId` v patternu vyskytuje víc než 1× (okružní linky), použij první
    výskyt, kde **není poslední** (konzistentní se `stopsAfter`). Nebrat protisměr.

### Export
```js
module.exports = { isServiceActive, activeServicesOn, patternDeparturesOn, nextDepartures };
if (typeof window !== "undefined") window.MHDTimetable = { nextDepartures };
```

### Co NESAHAT
- **Neupravovat** `routing.js` `search()` (integrace času = krok B).
- **Neupravovat** `index_raw.html` / `index.html`. Žádná externí data, žádné závislosti.

---

## KROK C2 — `scripts/timetable.test.js` (Node test k C1)

Spustitelný `node scripts/timetable.test.js`. Načte `../data/network.json`, zavolá
`nextDepartures` a **čitelně vypíše** výsledky pro:
- **Krátká** (S77), **Tržnice** (S0), **Horní nádraží** (S15) —
  na **2 vzorová data**: 1 všední den a 1 sobota, každé s pevným `nowMin` (např. 8:00 a 20:00).
- Alespoň 1 vzorek u **linky 51** kolem půlnoci (nowMin ~ 23:50), ať se ověří přesah.

Formát řádku: `{HH:MM} linka {line} → {headsign}`.
**Executor namátkou ověří 2–3 odjezdy proti reálnému JŘ DPKV** (jen očima) a napíše
do VÝSLEDKU, jestli časy i den (všední/sobota) sedí.

---

## KROK C3 — rozšíření `scripts/verify_network.js` (2–3 kontroly)

Přidej na konec pár sanity kontrol času (PASS/FAIL do souhrnu), aby čísla dávala smysl:
- `nextDepartures` z Krátká na všední den vrátí **neprázdné** pole a časy jsou
  **rostoucí**.
- Počet odjezdů dané zastávky/linky ve všední den **> sobota** (stejný směr nálezu
  jako stávající kontrola „logika dne").
- (volitelně) žádný `depMin` po normalizaci není záporný.

---

## Otevřená témata pro KROK B (ZAPSAT, teď NEŘEŠIT)

Manager je vede i v `TASK.md` (tab nápady / mimo scope). U reálné návaznosti přestupů
(dojezd na uzel + čekání + odjezd druhého spoje) bude potřeba dořešit hraniční případy:

1. **Předěl typu dne přes půlnoc u přestupu** — první noha odjede pozdě večer
   (všední den), přestup/druhá noha padne po půlnoci → jiný kalendářní den, jiný
   typ dne (víkend / svátek / prázdniny). Aktivitu služby druhé nohy počítat
   k **jejímu** datu, ne k datu první nohy.
2. **Předěly svátek / školní prázdniny / víkend** — hlídat, že se typ dne pro
   každou nohu bere zvlášť (`services` to už umí přes `add`/`rem`/rozsah, jen to
   nesmí být „zafixované" na jeden den vyhledávání).
3. **Přechod letní/zimní čas** — 2× ročně (poslední ne v březnu / říjnu). GTFS časy
   jsou lokální; kolem přechodu může chybět/duplikovat hodina. Ověřit, jak se to
   projeví ve `startMin` a v „nejbližším odjezdu" kolem 02:00–03:00 daného dne.
4. **Minimální čas na přestup** — ✅ ROZHODNUTO (Joe, 2026-07-22): **3–5 min** rezervy
   na uzlu (pokryje i běžné zpoždění). V kroku B použít jako práh: 2. spoj musí
   odjíždět alespoň o 3–5 min později než dojezd 1. spoje. Přesnou hodnotu (3 vs 5)
   doladit při implementaci B.

---

## KROK B (PŘÍŠTĚ — jen náhled, NEimplementovat teď)

Integrace času do `search()`: ke každé variantě z routingu dopočítat reálné odjezdy/
příjezdy a **garantovanou návaznost** přestupu (druhý spoj odjíždí po příjezdu prvního
+ min. rezerva). Použije helpery z `timetable.js`. Řeší témata 1–4 výše. Spec připraví
manager po uzavření kroku C.
