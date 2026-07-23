# Handoff — EXECUTOR spec (Zpevnění jádra — PŘEDÁVKA 1: H0 data-integrita + H1 routing + H2 řazení časem)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-07-23).** J3 (časová vrstva) je HOTOVÉ a pushnuté
> (`journey.js`, 20/20 PASS). Teď **zpevnění jádra před UI (J4)**. Archiv J3 je v gitu a `changelog.md`.
> **Rozsah této předávky:** H0 (oprava chybějících GPS + zpřísnění kontroly), H1 (robustnost
> routingu), H2 (řazení podle času, připravené pro UI filtry), H4 (testy).
> **NEŘEŠÍ se tu:** pěší přestup 30–200 m ani směrové pozice označníků — to je nový epic **J9**
> (viz `docs/ROADMAP.md`). Tady jen **propojení fakticky totožných zastávek (≤ 30 m)**.

> **Předávka pro nižší CC (executor).** Manager připravil zadání; executor implementuje dle bodů
> níže, **nedělá nic nad zadání**. Git děláš ty (executor). Malé kroky, kód jako **diff**,
> commit + testovací příkaz po každém Hx.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md` (Konvence), `TASK.md` (sekce TEĎ), `scripts/routing.js`, `scripts/journey.js`,
   `scripts/timetable.js`, `scripts/build_network.js`, `docs/DATA_SOURCES.md`, tento soubor.
3. **Před prvním commitem:** v repu leží necommitnuté manager úpravy dokumentace
   (`CLAUDE.md`, `TASK.md`, `handoff.md`, `docs/ROADMAP.md`). Commitni je s prvním krokem
   (`docs: spec zpevnění jádra + epic J9`).

---

## H0 — Data-integrita: chybějící GPS (proveď PRVNÍ, ostatní kroky na tom stojí)

**Problém:** 7 zastávek má ve zdroji i v `network.json` souřadnice `0, 0` (chybějící GPS, ne validní
poloha). `build_network.js` je bere jako `0` (protože `"0"` je truthy). `verify_network.js` to
neodhalil — kontroloval jen přítomnost klíčů, ne nulu.

### H0a — override souřadnic v `build_network.js`
Přidej **ruční override** klíčovaný **zdrojovým `stop_id`** (`JDFS-…`, stabilní přes rebuildy — `S…`
se přečíslovává!). Aplikuj ho při stavbě `stops[k]` (kolem řádku 90) — má přednost před `m.stop_lat/lon`.
Souřadnice dodal Joe (mapy.cz, 2026-07-23):

```js
// Ruční doplnění GPS pro zastávky, které zdroj (CIS/GTFS) nemá (0,0). Joe, 2026-07-23.
// PROVIZORNÍ single-point na uzel — přesné směrové pozice řeší epic J9.
const COORD_OVERRIDES = {
  'JDFS-10020': [50.225355, 12.839125],  // Kpt.Jaroše — střed 2 označníků (~90 m od sebe)
  'JDFS-14283': [50.239712, 12.889429],  // Mattoniho nábřeží — 2 MHD označníky (příměstský 3. bod → J9)
  'JDFS-16310': [50.255920, 12.885421],  // Nádraží Dalovice
  'JDFS-16311': [50.252510, 12.882424],  // Na Pasece
  'JDFS-18345': [50.217823, 12.806296],  // Globus
  'JDFS-32745': [50.226009, 12.823021],  // Tesco
  'JDFS-36827': [50.219270, 12.880980],  // Lázně I (S155) = poloha totožné zastávky S116 (JDFS-6580)
};
```
Po úpravě **rebuild** `data/network.json` (`node scripts/build_network.js`) a commitni nový `network.json`
+ `build_network.js`. V commitu zkontrola: žádná zastávka nesmí mít `lat===0 || lon===0`.

### H0b — zpřísnit `verify_network.js`
Kontrola GPS: `lat`/`lon` musí existovat **a nesmí být 0** (`lat===0||lon===0` → **FAIL**, vypiš které).
Cíl: 157/157 s validní GPS, jinak build neprojde.

**Commit H0**, testovací příkaz pro Joea: `node scripts/verify_network.js` (0 nul, vše PASS).

---

## H1 — Routing robustnost (`scripts/routing.js`)

### H1a — zrušit topologický Pareto filtr (o pořadí rozhoduje ČAS)
Dnes `search()` filtruje varianty přes `filterDominated` na `(transfers, totalHops)` → zahodí přestupní
variantu s víc zastávkami dřív, než se vůbec podívá na čas. To je špatně: **rychlejší spojení s přestupem
se pak neukáže vedle pomalejšího přímého.** (Joe: rozhoduje celkový čas, ne počet zastávek/přestupů.)
- **Odstraň krok `filterDominated`** ze `search()` (funkci můžeš nechat nevyužitou nebo smazat).
- **Ponech dedup.** Řazení podle hubů v `search()` můžeš nechat (je jen sekundární), autoritu nad
  pořadím přebírá `journey.js` (H2). Topologie teď vrací **všechny rozumné trasy**.
- Pozn.: víc variant = víc práce pro `journey`, ale síť je malá (290 patternů) — dedup + limit to unesou.

### H1b — podpora 2 přestupů
Rozšiř `search()` o `maxTransfers === 2` (řetěz A→T1→T2→B přes 2 různé uzly, každá noha jiná linka než
sousední). **Default zůstává `maxTransfers = 1`**; 2 se zapíná parametrem (UI si o víc řekne přes „další
možnosti"). Hlídej výkon a dedup.

### H1c — správné zacházení se smyčkami (2× výskyt zastávky)
Dnes se bere jen **první** výskyt zastávky v patternu (`stops.indexOf`). U okružních linek (zastávka 2×)
to může minout platný nástup/přestup z druhého výskytu. Zobecni: helper vracející **všechny „dopředné
úseky"** pro zastávku v patternu (jeden per výskyt) a použij je v přímém i přestupním hledání. Drž
konzistenci `hops` (index-based) s `journey.js` (`legStopIndices`). Dobře otestuj.

### H1d — propojení fakticky totožných zastávek (≤ 30 m, „same-place")
Některé fyzicky **stejné** zastávky jsou ve zdroji dvě ID (Lázně I: S116 pro linky 2/11/52 × S155 pro
linku 20; Andělská Hora horní/dolní obec = varianty názvu). Přestup mezi nimi se dnes nenajde (různé ID).
- Po H0 (opravené GPS!) spočti **skupiny co-located zastávek**: dvojice s haversine **≤ 30 m** *a*
  shodným normalizovaným názvem (strip `Karlovy Vary,`, trim, lower, toleruj drobný překlep — u shody
  názvu klidně povol i o něco víc než 30 m; u NEshodných názvů 30 m nepřekračuj).
- V přestupním hledání ber uzel `T` a jeho co-located sourozence `T'` jako **stejné místo**:
  leg1 dojede na `T`, leg2 může odjet z `T'`. Tohle je **jediná** forma „přestupu mezi jinými
  označníky" v této předávce — bezpečná, protože jde o týž bod (žádné „kam jít").
- **Pozor na pořadí:** skupiny počítej až nad opravenými daty (jinak by 7 nul u `0,0` bylo „všechno
  na jednom místě"). Guard z H0b to pojistí.
- Executor **vypíše seznam nalezených co-located skupin** do výstupu testu, ať to Joe očima zkontroluje
  (nesmí tam být dvě různá místa).

**Commit každý pod-krok H1a–H1d zvlášť** + testovací příkaz.

---

## H2 — `scripts/journey.js`: řazení podle času, připravené pro UI filtry

- **Přepínatelné řazení:** `opts.sort = 'departure' | 'arrival' | 'duration' | 'transfers'`,
  **default `'departure'`** (Joe: zatím prio odjezd). Uděláš mapu komparátorů; u každého sekundární
  klíče (např. departure → tie-break totalMin → transfers). Tím jsou budoucí UI filtry (příjezd /
  délka / přestupy) hotové bez zásahu do jádra.
- **Rychlejší spojení s přestupem se MUSÍ ukázat** i vedle pomalejšího přímého (plyne z H1a — journey
  teď dostane i tyhle varianty; jen je nezahazuj předčasně).
- **Co-located přestup (H1d):** když je přestup „same-place", výsledek nese `waitMin` normálně a
  `transferStop` = název místa; `walkMin: 0` (přidej pole, ať UI ví, že se nikam nejde).
- **Limit:** zvedni default na `limit = 8` (parametr zachovej), ať je z čeho v UI filtrovat.
- Zbytek (přesah přes půlnoc, `trip[2] || pattern.off`, předěl dne u přestupu) **beze změny** — funguje.

**Commit H2** + testovací příkaz.

---

## H4 — Testy (průběžně a na závěr)

- **`routing.test.js`:** uprav očekávání po zrušení Pareto (víc variant); přidej případ na **2 přestupy**
  a na **smyčku (2× výskyt)**.
- **`journey.test.js`:** přidej případ, kde se **rychlejší přestup ukáže vedle pomalejšího přímého**;
  ukázku `sort='arrival'` vs `'departure'`; **co-located přestup Lázně I** (linka 20 ⇄ 2/11/52) se najde.
- **`verify_network.js`:** 0,0 = FAIL (H0b); výpis co-located skupin je rozumný; kontrola, že známé
  časově-lepší spojení se ve výsledku objeví.
- **Namátkové ověření proti reálnému JŘ DPKV** (raw HTML, ne AI shrnutí) u 1–2 nových případů.
- Cílový souhrn: vše PASS; napiš do VÝSLEDKU počty a co se ověřilo.

---

## Mimo scope (NEIMPLEMENTOVAT — kontext)
- **Pěší přestup 30–200 m + směrové pozice označníků + navádění v uzlech + mapa** = epic **J9**
  (`docs/ROADMAP.md`). Datový lead: DPKV má na interaktivní mapě přesné puntíky označníků s popisem
  (Dvory 1/2/3 + linka + směr), ale bez GPS exportu → Joe zkusí oslovit DPKV.
- **Přechod letní/zimní čas** — stále odloženo (známé omezení).
- **UI „Hledat spojení"** = J4 (po zpevnění).
