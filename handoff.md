# Handoff — EXECUTOR spec (J2 routing A→B + verify_network.js)

> Stav k **2026-07-21:** J1 (datový model) HOTOVO, J8 (auto-obnova dat) NAVRŽENO.
> **Tato předávka je pro nižší CC (executor).** Manager (vyšší model) připravil zadání,
> executor pouze implementuje kód dle bodů níže. **Nedělá git, instalace, mazání ani nic nad zadání.**
> Rozhodnutý přístup (manager + Joe, 2026-07-21): **1B** (přestup přes libovolnou sdílenou zastávku,
> huby jen jako priorita řazení) + **2A** (nejdřív jen routing modul + Node test; verify_network.js jako druhý krok).

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md` (vč. „Orchestrace v1"), `TASK.md` (sekce TEĎ + podúkoly J2), `docs/DATA_SOURCES.md`, tento soubor.
3. **Nejdřív KROK 0** (jednorázový git setup — odblokuje commitování). Pak **KROK 1** (routing modul), **KROK 2** (Node test), **KROK 3** (verify). Malé kroky, kód jako **diff**, jedna změna najednou. **Po každém kroku commitni** (jsi executor — git děláš ty) a dej Joeovi testovací instrukce.

---

## KROK 0 — jednorázový git setup (proveď jako první)

Složka teď NENÍ git repo (`.git` byl odstraněn). Remote `BigJoeVibe/MHD-KV` (branch `main`) obsahuje jen F1 (`index.html`, `favicon.svg`, shodné s lokálem). Cíl: napojit tuto složku na remote **bez konfliktu historií** (adoptovat F1 commit, naše novinky přidat navrch) a pushnout.

Spusť ve svém terminálu (jsi ve složce projektu):
```bash
git init -b main
git remote add origin https://github.com/BigJoeVibe/MHD-KV.git
git fetch origin
git reset --soft origin/main        # adoptuje F1 historii, soubory zůstanou
git add -A
git status                          # KONTROLA: NESMÍ tam být data_raw/ ani MHD_test/
```
- **Guard:** pokud `git status` ukáže `data_raw/` nebo `MHD_test/`, ZASTAV a oprav `.gitignore` (mají tam být vyloučené), teprve pak dál.
- Až je status čistý (jen zdroják, `data/network.json`, `scripts/`, `docs/`, `.md`):
```bash
git commit -m "feat: síťový model J1 (network.json), skripty a dokumentace kod-jadro"
git push origin main
```
- Ověř, že push prošel (`git status` = „up to date"). GitHub Pages běží dál (index.html se nemění).
- Volitelně smaž nepotřebný `_setup_git.bat` (byl jen pomůcka; je v `.gitignore`).
- Zapiš do `changelog.md` řádek „git: repo napojeno na GitHub, první commit nové základny".

---

## Datový model `data/network.json` (POTVRZENO — neodvozovat znovu)

Top-level klíče: `meta`, `stops`, `patterns`, `trips`, `services`. Vše jsou **objekty** (mapy `id → záznam`), NE pole.

```
meta      = { generated, source, lines:[čísla linek] }               // 23 linek
stops     = { "S0": { n:"Tržnice", lat:50.231, lon:12.870 }, ... }   // 157 zastávek, VŠECHNY mají lat/lon
patterns  = { "P0": { line:23, dir:1, headsign:"Loket",
                      stops:["S0","S1",...], off:[0,2,6,...] }, ... } // 290 patternů; off = min od startu
trips     = { "P0": [[startMin, "serviceId"], ...], ... }            // JEN pro J3 (čas) — v J2 IGNOROVAT
services  = { "CAL-...": { d:[po..ne 0/1], s:"YYYYMMDD",
                           e:"YYYYMMDD", add:[], rem:[] }, ... }       // JEN pro J3 — v J2 IGNOROVAT
```

- **`pattern` = linka × směr × varianta trasy.** `stops` je uspořádaný seznam ID zastávek ve směru jízdy.
  `headsign` = konečná té varianty (to, co F1 řešila legendou). Různé konečné jedné linky = různé patterny.
- **Směrovost:** pořadí ve `stops` = směr jízdy. „Za zastávkou A" = prvky `stops` po indexu A. Nikdy nebrat protisměr.
- Jména zastávek jsou někdy prefixovaná `Karlovy Vary,` (např. `Karlovy Vary,Krátká`), jindy holá (`Tržnice`, `Okružní`, `Krátká`). **Matchuj tolerantně** (normalizuj: odstranit prefix `Karlovy Vary,`, trim, case-insensitive).
- Potvrzená ID: `Tržnice=S0`, `Horní nádraží=S15`, `Okružní=S22`, `Krátká=S77`.

---

## KROK 1 — `scripts/routing.js` (nový soubor)

**Cíl:** čistý JS modul (bez závislostí) pro hledání spojení A→B **topologicky** (zatím BEZ času). Musí jít použít v **Node** (test teď) i později v **prohlížeči** (J4) → funkce dostávají `net` (naparsovaný network.json) jako parametr, modul si data sám nenačítá.

### Export
```js
// Node: module.exports = {...};  navíc bezpečně pro browser (viz níže).
module.exports = { search, stopsAfter, patternsThrough, resolveStopId, HUBS };
```
Na konci souboru přidat browser-safe export bez pádu v Node:
```js
if (typeof window !== "undefined") window.MHDRouting = { search, resolveStopId };
```

### Helpery
- `stopsAfter(net, patternId, stopId) → string[]` — ID zastávek po `stopId` v `net.patterns[patternId].stops` (prázdné, když stopId není v patternu). Směrově.
- `patternsThrough(net, stopId) → string[]` — ID patternů, jejichž `stops` obsahují `stopId`.
- `resolveStopId(net, nameOrId) → string|null` — když dostane existující ID (`S…`), vrátí ho; jinak najde ID podle jména (normalizace: strip `Karlovy Vary,`, trim, lower). Když víc shod, vrať první a nevaď.
- `lineOf(net, patternId) → number` = `net.patterns[patternId].line`.

### `search(net, A, B, opts = { maxTransfers: 1 })`
A, B jsou ID nebo jména (projít přes `resolveStopId`). Vrací **pole výsledků**:
```js
{
  transfers: 0|1,
  legs: [ { line, headsign, patternId, from, to, hops } ],  // hops = index(to)-index(from)
  totalHops: <součet hops přes nohy>
}
```
**Algoritmus:**
1. **Přímé (transfers 0):** pro každý pattern `p`, pokud `B ∈ stopsAfter(net, p, A)` → výsledek s 1 nohou A→B (hops = rozdíl indexů; headsign = `p.headsign`).
2. **1 přestup (transfers 1):** pro každý pattern `p1` a každý přestupní uzel `T ∈ stopsAfter(net, p1, A)` (T ≠ B, T ≠ A): pro každý pattern `p2 ∈ patternsThrough(net, T)`, pokud `lineOf(p2) ≠ lineOf(p1)` a `B ∈ stopsAfter(net, p2, T)` → výsledek se 2 nohami (p1: A→T, p2: T→B). Přestup přes **libovolnou** sdílenou zastávku (varianta 1B), ne jen huby.
3. **Dedup:** klíč = řetězec `linky + hraniční zastávky` každé nohy (`p1.line:A>T|p2.line:T>B`). Stejný klíč zahodit.
4. **Filtr dominovaných (Pareto na osách `transfers`, `totalHops`):** výsledek R1 zahoď, pokud existuje R2 (stejné A,B) s `transfers ≤` a `totalHops ≤`, a aspoň v jedné ostře lepší. Dvě různé varianty se stejnými hodnotami obě nech.
5. **Řazení:** `transfers` vzestupně → **přestup přes hub napřed** (viz `HUBS`) → `totalHops` vzestupně.

### `HUBS`
Pole jmen: `["Rozcestí u Koníčka", "Tržnice", "Stadion ZM", "Horní nádraží"]`.
Executor při startu testu ověří, že se každé jméno v `net.stops` najde přes `resolveStopId` — pokud ne, vypíše varování s nejbližšími názvy (aby manager doladil jména). **Huby ovlivňují jen řazení, nic nefiltrují** (varianta 1B).

### Co NESAHAT / NEDĚLAT
- **Neměnit** `index_raw.html` / `index.html` (F1 appka). Žádná data z DPKV DIC/IDOS. Žádný `trips`/čas (to je J3).
- Plain JS, **žádné závislosti** (žádný `npm install`). Bez frameworku.

---

## KROK 2 — `scripts/routing.test.js` (Node test k Kroku 1)

Malý skript spustitelný `node scripts/routing.test.js`. Načte `../data/network.json` (přes `fs`/`require`), zavolá `search` a **vypíše čitelně** výsledky pro testovací sadu:

- `Krátká → Horní nádraží`
- `Okružní → Růžový vrch`
- `Krátká → Tržnice`, `Okružní → Horní nádraží`, `Krátká → Růžový vrch`
- 1× přes každý hub (Rozcestí u Koníčka, Tržnice, Stadion ZM, Horní nádraží) jako A nebo T.

Formát výpisu na řádek: `přímo linkou {line} → {headsign}: A → B ({hops} zast.)` nebo `1 přestup: linka {l1}→{hs1} (A→T) ⇒ linka {l2}→{hs2} (T→B)`.
Executor u výsledků **namátkou ověří 2–3 spoje proti reálnému JŘ DPKV** (jen očima, ne tažení dat) a napíše do VÝSLEDKU, jestli sedí.

---

## KROK 3 (po OK Kroku 1–2) — `scripts/verify_network.js`

Jednorázový sanity test dat dle `docs/DATA_SOURCES.md` → „Test / QA, sekce A". Spustitelný `node scripts/verify_network.js`, vypíše PASS/FAIL po řádcích a na konci souhrn. Kontroly:
- **Struktura:** existují `stops`/`patterns`/`trips`/`services`; `meta.lines` má 23 linek.
- **Úplnost:** každá zastávka má `n`; kolik má `lat`&`lon` (očekáváno 157/157).
- **Integrita:** každý pattern má ≥2 zastávky a `off.length === stops.length`; každý pattern má klíč i v `trips`; každý `serviceId` v `trips` existuje v `services`.
- **Logika dne (J3-lite, jen kontrola dat):** pro vzorové datum spočti aktivní služby z `services` (`d`+`s`/`e`+`add`/`rem`); linka 3 Krátká→Tržnice má všední den hustěji než sobota.
- **Výluka:** `Bohatice,náměstí` = 0 spojů do 11. 9. 2026, ≥1 od 12. 9. 2026.
- **Směrovost:** odjezdy z `Krátká` směr `Tržnice` neobsahují protisměr.

---

## VÝSLEDEK (vyplnil executor, 2026-07-21)

**Co je hotové:** KROK 0 (git setup), KROK 1 (routing.js), KROK 2 (routing.test.js), KROK 3 (verify_network.js) — vše hotovo a pushnuto na `origin/main`.

**Změněné/nové soubory:**
- `scripts/routing.js` — modul `search/stopsAfter/patternsThrough/resolveStopId/lineOf/HUBS`, browser-safe export.
- `scripts/routing.test.js` — Node test nad testovací sadou z handoff.
- `scripts/verify_network.js` — sanity test dat (14 kontrol).
- `changelog.md` — záznam o git setupu.
- smazán `_setup_git.bat` (jednorázová pomůcka, už nepotřeba).

**Jak otestovat (přesné příkazy):**
```
node scripts/routing.test.js
node scripts/verify_network.js
```

**Nález a oprava (za zmínku):** `makeLeg()` v `routing.js` původně počítal `hops` přes `pattern.stops.indexOf(to) - indexOf(from)`. Některé patterny (okružní linky, např. P5 linka 12) obsahují **stejné ID zastávky dvakrát** (smyčka) — `indexOf` pak našel špatný výskyt a vracel záporný počet zastávek. Opraveno: `hops` se teď počítá z `stopsAfter(net, patternId, from).indexOf(to) + 1` — stejný „dopředný" úsek, jaký se používá i pro detekci, že B leží za A. Ověřeno na `Krátká → Tržnice` (dřív spadl 1 přestup s hops=-10, teď hops=2/2).

**verify_network.js výsledek:** PASS 14, FAIL 0 (struktura, úplnost 157/157 GPS, integrita patternů/trips/services, logika dne — všední 25 > sobota 10 spojů na P50, výluka Bohatice,náměstí 0→54 spojů kolem 12.9.2026, směrovost bez protisměru).

**Namátkové ověření proti reálnému JŘ DPKV (2–3 spoje):** ✅ sedí.
- Linka 3 (`d-3/3102.htm`): DPKV pořadí Krátká→Borová→Rozcestí u Koníčka→Stadion ZM→Západní→Dolní nádraží→Tržnice (6 zastávek) = přesně odpovídá `routing.js` výstupu (hops=6, patternId P50).
- Linka 13 (`d-13/13004.htm`): DPKV pořadí Okružní→Rozcestí u Koníčka→Keramická škola→Pivovar→Horní nádraží (4 zastávky) = přesně odpovídá výstupu `Okružní → Horní nádraží` (hops=4).
- Poměr spojů všední/sobota u linky 3 (DPKV ~13–14 vs ~8–9) odpovídá směru nálezu ve `verify_network.js` (25 vs 10 v datovém vzorku).

**Problémy / co se nepovedlo:** žádné blokující. Linka 9 nemá v novém GTFS žádný pattern přes Krátká (jede jinudy, na Čankov) — souhlasí s poznámkou v `TASK.md`/`CLAUDE.md` o změně trasy linky 9, není to bug.

**Nápady pro managera:**
- `HUBS`-based řazení funguje, ale u malých výsledkových sad (do 5 variant) se řazení skoro neprojeví — až J4/J5 ukážou, jestli je potřeba doladit.
- Pro J3 (čas) bude `search()` potřeba rozšířit o filtr podle aktivních `services` k danému datu — logika `isServiceActive()` už existuje ve `verify_network.js`, jde přímo přenést/sdílet.

---

## GIT — vyřešeno (2026-07-21)
Git dělá **executor (Claude Code) ve svém terminálu** — viz **KROK 0** (jednorázový setup) a pak commit po každém kroku. Cowork manager git nedělá. Detail v `CLAUDE.md` → „Orchestrace v1" a „Git a verzování".
