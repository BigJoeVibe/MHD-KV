# Handoff — EXECUTOR spec (J4-sort: pravidla malého města ve výsledcích hledání)

> 🔴 **AKTIVNÍ ZADÁNÍ (manager, 2026-08-04).** Jádro počítá časy správně (J4-fix drží).
> Problém je **výhradně v pořadí, filtrování a slučování výsledků** — appka v malém městě
> nabízí spoje s dobou jízdy 200–900 min a přímý spoj tlačí pod přestupy.
> Rozhodnutí padla s Joem 4. 8. 2026, čísla jsou naměřená v datech (viz „Proč zrovna tahle čísla").

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů, **nic nad zadání**. Git děláš ty.
> Malé kroky, kód jako **diff**, commit + test.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md`, `scripts/journey.js` (celý — hlavně `planJourney`, `itineraryKey`, `SORTERS`),
   `scripts/journey.test.js`, `index_raw.html` (funkce `doSearch` ~ř. 1111 a `renderSearchResults` ~ř. 1135),
   tento soubor.
3. Zkontroluj, jestli nejsou necommitnuté manager docs — pokud ano, commitni je jako první.

---

## Rozhodnutí, které to celé řídí (Joe, 4. 8. 2026)

**Appka je pro Karlovy Vary, ne pro obecné město.** Motor dosud neměl žádné domain limity a hledal,
jako by šlo o Prahu. Nová pravidla, v tomto pořadí:

1. **Odjezdové okno 90 minut** — zobrazují se spoje, které odjíždějí do 90 min od času hledání.
   Pojmenování pro UI i dokumentaci: **„odjezdové okno"**.
2. **Uvnitř okna: nejdřív přímé spoje, pak přestupy.** Přestup je alternativa, ne rovnocenná varianta.
3. **Strop celkové doby jízdy 75 min** a **strop čekání na přestupu 40 min.**
4. **Sloučení identických jízd** do jedné karty s výčtem možných přestupních zastávek.
5. **Když v okně nic není** → okno se automaticky rozšíří a UI to řekne nahlas.

**Řazení podle příjezdu (`arrival`) se NEPOUŽIJE jako default** — bylo v úvahách 4. 8., ale s odjezdovým
oknem ztrácí smysl. `SORTERS.arrival` v kódu **zůstává** (budoucí přepínač řazení v UI).

### Proč zrovna tahle čísla (měření managera, 4. 8., 104 náhodných dvojic zastávek, po 8:00)

| | medián | p90 | maximum |
|---|---|---|---|
| přímý spoj | 10 min | 18 min | **22 min** |
| s přestupem | 26 min | 41 min | **52 min** |

Nejhorší reálná jízda po KV je 52 min → strop 75 min má rezervu na výluky a řídké víkendové jízdní řády
a neuřízne nic reálného. **Všechny tři limity jsou parametry, ne konstanty** — až přibudou příměstské
linky (Ostrov, Nejdek), zvedne se číslo, ne logika.

---

## KROK 1 — `scripts/journey.js`: nové volby a nové pořadí operací

### 1a) Nové `opts` v `planJourney` (s defaulty)

```js
const windowMin  = opts.windowMin  != null ? opts.windowMin  : 90;  // odjezdové okno
const maxTotal   = opts.maxTotal   != null ? opts.maxTotal   : 75;  // strop celkové doby jízdy
const maxWait    = opts.maxWait    != null ? opts.maxWait    : 40;  // strop čekání na přestupu
```
`minTransfer`, `limit`, `maxTransfers`, `sort` zůstávají jak jsou.

### 1b) Nový default řazení `smart`

Do `SORTERS` přidej klíč (**stávající klíče neměň, jsou v testech a v budoucím UI přepínači**):

```js
smart: (a, b) =>
  (a.transfers === 0) !== (b.transfers === 0)
    ? (a.transfers === 0 ? -1 : 1)                 // přímé napřed
    : a.depMin !== b.depMin ? a.depMin - b.depMin  // pak dřívější odjezd
    : a.arrMin !== b.arrMin ? a.arrMin - b.arrMin  // pak dřívější příjezd
    : a.transfers - b.transfers,
```
a změň výchozí hodnotu `sortKey` z `"departure"` na `"smart"`.

### 1c) Sloučení duplicit — nahrazuje stávající dedup přes `itineraryKey`

**Proč:** linky, které jedou kus trasy společně, generují N identických výsledků lišících se jen
přestupní zastávkou. Příklad z dat (Stará Role → Lázně I, neděle 14:26): tři výsledky `3→2`,
všechny `14:26 → 15:09`, liší se přestupem na Tržnici × Stadionu ZM × Nemocnici. Je to **jedna jízda**
(stejný autobus 3, stejný autobus 2), jen s volbou, kde přesednout.

⚠️ **Pozor na klíč** — manager na tom naletěl při přípravě ukázky: klíč **nesmí** obsahovat časy
jednotlivých nohou. Když přestoupíš na jiné zastávce, nastupuješ do druhého autobusu o jinou minutu,
takže per-leg klíč tři identické jízdy **nesloučí**. Správný klíč:

```js
function itineraryKey(it) {
  return `${it.depMin}|${it.arrMin}|${it.legs.map((l) => l.line).join(">")}`;
}
```

Slučování zachovej jako jeden průchod: první výskyt je reprezentant, z ostatních se sbírají jen
přestupní zastávky. Reprezentant dostane nové pole:

```js
it.viaStops = [ /* pole stop ID, pořadí = pořadí výskytu */ ];
```
`transferStop` **zachovej** (= `viaStops[0]`) kvůli zpětné kompatibilitě s testy a UI.
U přímých spojů `viaStops` nenastavuj (zůstane `undefined`).

### 1d) Tvrdé stropy

Po sloučení zahoď každý itinerář, kde `totalMin > maxTotal` nebo `waitMin > maxWait`
(u přímých je `waitMin == null` → strop čekání se neaplikuje).

### 1e) Odjezdové okno s automatickým rozšířením

Na výsledek po stropech aplikuj `depMin <= nowMin + windowMin`. **Když je výsledek prázdný**,
zkus žebřík dalších oken a vezmi první, které něco vrátí:

```
windowMin (90)  →  240  →  bez omezení
```

Žebřík řeší i noc: hledání ve 23:44 z Krátké má nejbližší přímý spoj 51 až v 01:15, což je
91 minut — o minutu mimo základní okno. Bez rozšíření by appka v noci nenašla nic.

Ladění pro večer/víkend (Joe: „ještě doladíme") se pak dělá **jen změnou těch tří čísel**,
ne zásahem do logiky.

### 1f) Pořadí operací v `planJourney` — závazné

```
1. sestavení itinerářů (beze změny)
2. invariant FIX-B: zahoď arrMin <= depMin, waitMin < 0   (beze změny)
3. sloučení duplicit  (1c)
4. tvrdé stropy       (1d)
5. odjezdové okno + žebřík rozšíření (1e)
6. řazení SORTERS[sortKey]  (default 'smart')
7. slice(0, limit)
```
**Limit až úplně na konci** — jinak se filtruje už useknutý seznam (přesně tahle chyba je
za dnešním chováním).

---

## KROK 2 — `index_raw.html`: volání a zobrazení

### 2a) `doSearch` (~ř. 1130)

```diff
-  searchResults = window.MHDJourney.planJourney(NET, from, to, { date, nowMin, sort: 'departure', limit: 8 });
+  searchResults = window.MHDJourney.planJourney(NET, from, to, { date, nowMin, limit: 8 });
```
(Bez `sort` → použije se nový default `smart`. Limity ber z defaultů jádra, do UI je zatím nepiš —
ať je na ně jedno místo.)

### 2b) Hláška „mimo okno"

Když výsledky jsou, ale první odjíždí až za okamžikem hledání + 90 min, ukaž nad kartami řádek:

```
Nejbližší spoj až v 09:44.
```
Detekce v UI, bez změny API jádra: `searchResults[0].depMin > nowMin + 90`.
Konstantu `90` dej do jedné proměnné nahoře v UI (`const SEARCH_WINDOW_MIN = 90;`), ať se to nerozejde
s jádrem. Styl řádku vezmi ze stávajícího `.search-empty` nebo obdobného — **nový CSS nevymýšlej**,
Joe je arbitr vzhledu a doladí si to.

Reálný případ, na kterém to otestuj: Globus → Nádraží Dalovice, pondělí 8:00 → první spoj 09:44.
Není to chyba, tam prostě dřív nic nejede — ale appka to musí říct, jinak vypadá rozbitě.

### 2c) Přestupní zastávky v kartě (~ř. 1158–1163)

Místo jedné zastávky vypiš všechny z `viaStops`, oddělené ` / `:

```
Přestup: Tržnice / Stadion ZM / Nemocnice · čekání 43 min (stejné místo)
```
Použij stávající `stopDisplayName()`. Když `viaStops` chybí (starší data / přímý spoj), chovej se
jako dnes (fallback na `transferStop`).

### 2d) `index.html`

Po dokončení zkopíruj `index_raw.html` → `index.html` (jsou identické) a **commitni oba**.

---

## KROK 3 — testy (`scripts/journey.test.js`)

Přidej scénáře; formát a tolerantní výpis drž jako u stávajících testů (tenhle soubor **není** guard,
takže smí být přísnější než `verify_network.js`).

| scénář | vstup | očekávání |
|---|---|---|
| den ráno | Tržnice→Okružní, `20260804` 8:00 | 1. výsledek **přímo linka 13, 08:06 → 08:18** |
| den odpoledne | Tržnice→Okružní, `20260804` 15:30 | 1. výsledek **přímo linka 13, 15:30 → 15:42** |
| noc (žebřík oken) | Krátká→Tržnice, `20260803` 23:44 | 1. výsledek **přímo linka 51, 01:15 → 01:30** |
| sloučení duplicit | Stará Role→Lázně I, `20260809` (ne) 14:00 | existuje výsledek `14:26 → 15:09` s **`viaStops.length === 3`**; žádné dva výsledky nemají shodnou trojici (depMin, arrMin, linky) |
| hluché období | Globus→Nádraží Dalovice, `20260804` 8:00 | výsledky nejsou prázdné, 1. odjezd **09:44** (test podmínky pro hlášku) |
| **invarianty globálně** | všechny scénáře výše | každý výsledek: `arrMin > depMin`, `totalMin > 0`, `totalMin <= 75`, `waitMin == null \|\| (waitMin >= 0 && waitMin <= 40)` |

Noční invariant z J4-fix ponech, ať nezmizí regresní pojistka.

---

## DŮKAZ / ověření

1. `node scripts/journey.test.js` → všechny scénáře PASS (staré i nové).
2. `node scripts/routing.test.js` a `node scripts/timetable.test.js` → beze změny (sanity check).
3. `node scripts/verify_network.js` → **dál 26/26 PASS**. Guard se nemění a měnit nesmí.
4. Ruční kontrola v Node, výpis vlož do `VÝSLEDEK`:
   ```
   node -e "const {planJourney}=require('./scripts/journey.js');const net=require('./data/network.json');
   console.log(planJourney(net,'Tržnice','Okružní',{date:'20260804',nowMin:480}))"
   ```
   První karta musí být přímá linka 13 v 08:06, v celém výstupu žádný `totalMin > 75`.
5. Commit: `scripts/journey.js`, `scripts/journey.test.js`, `index_raw.html`, `index.html`.
6. Do `VÝSLEDEK`: co se změnilo v `planJourney`, jestli žebřík oken někde zafungoval jinak,
   než spec předpokládá, a případné nálezy.

**Vizuální test na GitHub Pages dělá manager / Joe — ty prohlížeč nemáš.**

## Co NESAHAT

- `scripts/routing.js`, `scripts/timetable.js`, `scripts/build_network.js`, `scripts/verify_network.js`,
  `scripts/update_data.js`, `.github/workflows/update-data.yml`, `data/`.
- Stávající klíče v `SORTERS` (`departure`, `arrival`, `duration`, `transfers`) — jen přidáváš `smart`.
- Logiku `transferItineraries` / `directItineraries` z J4-fix (monotónní časová osa). Filtrování
  a řazení je až nad nimi.
- Vzhled karet nad rámec bodů 2b a 2c — Joe je arbitr UX a doladí si to sám.

## Ověřeno managerem předem (4. 8. 2026) — takhle to má vypadat

Manager si celý spec (pořadí operací 1f včetně žebříku oken a `smart` řazení) nasimuloval nad
`data/network.json` **bez zásahu do kódu**. Tohle jsou reálné výstupy — testy v KROKU 3 na ně sedí:

```
### den ráno   Tržnice→Okružní   okno=90
   08:06 → 08:18 | 12m | PŘÍMO 13
   08:29 → 08:39 | 10m | PŘÍMO 15
   08:40 → 08:52 | 12m | PŘÍMO 13
   …
   08:06 → 08:39 | 33m | přestup 13→15 @Rozcestí u Koníčka/Pivovar/Keramická škola (čekání 21)

### noc 23:44   Krátká→Tržnice   okno=240  (základní 90 min bylo prázdné → žebřík zafungoval)
   01:15 → 01:30 | 15m | PŘÍMO 51
   03:05 → 03:20 | 15m | PŘÍMO 51
   03:05 → 03:54 | 49m | přestup 51→6 @Prašná/Drahomíra (čekání 20)

### neděle 14:00   Stará Role→Lázně I   okno=90   (kontrola slučování)
   14:26 → 15:09 | 43m | přestup 3→2 @Tržnice/Stadion ZM/Nemocnice (čekání 15)   ← viaStops.length === 3

### hluché období   Globus→Nádraží Dalovice   okno=240
   09:44 → 10:31 | 47m | přestup 1→19 @Tržnice (čekání 3)   ← spouští hlášku „Nejbližší spoj až v 09:44"
```

Ve všech pěti scénářích prošly invarianty (`arrMin > depMin`, `totalMin ∈ (0; 75]`,
`waitMin ∈ [0; 40]`). **Když ti něco z tohohle nevyjde, je chyba v implementaci, ne v datech** —
napiš to do `VÝSLEDEK` a nedolaďuj čísla limitů na vlastní pěst.

## VÝSLEDEK (vyplní executor)

_(zatím prázdné)_
