# Handoff — EXECUTOR spec (J3 časová vrstva — KROK B: časové plánování spojení A→B)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-07-23).** KROK C je HOTOVÝ a pushnutý
> (`timetable.js`, 18/18 PASS, ověřeno proti reálnému JŘ). Archiv C je v gitu
> a v `changelog.md`.
> **Teď KROK B:** nový modul `scripts/journey.js`, který nad topologickými trasami
> ze `search()` (routing.js) dopočítá **reálné časy** a **garantovanou návaznost
> přestupu**. Jádro je čistě výpočetní (bez UI). Zadávání polohy (mapa/GPS) a
> oblíbené řeší J5/J6 — **teď se jich netýkáme**.

> **Předávka pro nižší CC (executor).** Manager připravil zadání; executor
> implementuje kód dle bodů níže, **nedělá nic nad zadání**. Git děláš ty (executor).

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md` (Konvence — typy dne, linka 51), `TASK.md` (sekce TEĎ = J3),
   `scripts/routing.js`, `scripts/timetable.js`, `docs/DATA_FORMAT.md`, tento soubor.
3. **Před prvním commitem:** v repu leží necommitnuté manager úpravy dokumentace
   (`CLAUDE.md`, `TASK.md`, `handoff.md`). Commitni je spolu s prvním krokem B
   (`docs: manager dokumentace + spec kroku B`), ať je repo čisté.
4. Malé kroky, kód jako **diff**, jedna změna najednou. Po každém kroku commitni
   a dej Joeovi testovací příkaz.

---

## Klíčový předpoklad z KROKU C (NEZAPOMENOUT)

`net.trips[patternId]` je pole spojů, každý je `[startMin, serviceId]` **nebo**
`[startMin, serviceId, offs]`. **~45 % spojů má 3. prvek `offs`** = vlastní pole
mezičasů (špička/sedlo se liší od šablony patternu). **Čas na zastávce indexu `i`
u konkrétního spoje se počítá vždy:**

```js
const offs = trip[2] || pattern.off;   // trip[2] má přednost, fallback = šablona
const timeAtStop = trip[0] + offs[i];  // minut od půlnoci
```

Bez tohoto by časy seděly jen ~polovině spojů. `timetable.js` to už dělá správně —
v `journey.js` použij **stejnou** logiku (ideálně přes sdílený helper).

---

## KROK B1 — `scripts/journey.js` (nový modul)

**Cíl:** čistý JS modul (bez závislostí, Node i prohlížeč). Kombinuje topologii
(`routing.js` `search`) a časy (`timetable.js`). Importuj z obou modulů, nic needupluj.
**Jádro je deterministické:** dostane `date` + `nowMin` jako vstup, samo nečte
systémový čas (to je věc UI v J4 — „teď" = UI dosadí aktuální datum a čas).

### Hlavní funkce
```js
planJourney(net, A, B, opts) → Itinerary[]
```
- `A`, `B` = ID nebo jméno zastávky (přes `resolveStopId`). **Směrově** — opačný směr
  „ze stanice k mé pozici" = prostě prohodit `A` a `B` (jádro nic navíc neřeší).
- `opts = { date: "YYYYMMDD", nowMin, minTransfer = 3, limit = 5, maxTransfers = 1 }`.
  - `date` + `nowMin` (min od půlnoci) = okamžik, od kterého hledáme odjezdy.
    Režim „nejbližší teď" i „konkrétní datum+čas" jsou pro jádro **totéž** — jen jiný
    vstup (dosadí UI). Jádro je tím pádem plně testovatelné.
  - `minTransfer` = min. rezerva na přestup v minutách. **Rozhodnuto (Joe): 3–5.**
    Default **3**; nech jako parametr, ať jde zvednout na 5.

### Tvar výsledku (Itinerary)
```js
{
  transfers: 0 | 1,
  depMin,                 // odjezd 1. nohy (min od půlnoci; pro noční může být ≥1440)
  arrMin,                 // příjezd do cíle (absolutní; pro přesah přes půlnoc ≥1440)
  totalMin,               // arrMin − depMin = CELKOVÁ DÉLKA JÍZDY (vč. čekání na přestup)
  legs: [
    { line, headsign, patternId, from, to, depMin, arrMin, hops }
  ],
  transferStop,           // jen u transfers===1: ID uzlu přestupu
  waitMin                 // jen u transfers===1: čekání na uzlu (depMin nohy2 − arrMin nohy1)
}
```
Pro zobrazení: `HH:MM = Math.floor(m/60)%24 : m%60`. Pokud `arrMin ≥ 1440`
(cíl až po půlnoci), UI si to označí „+1 den" — jádro jen vrací absolutní minuty.

### Algoritmus
1. **Topologie:** `variants = search(net, A, B, { maxTransfers })` — hotové trasy
   (přímé + 1 přestup, směrové, s `headsign`). Indexy zastávek v patternu ber
   konzistentně se `stopsAfter` (první „dopředný" výskyt), ne slepým `indexOf`
   (okružní linky mají zastávku 2×).
2. **Přímé varianty (transfers 0):** pro leg `(patternId, from→to)` projdi aktivní
   spoje patternu k `date`; pro každý spoj s `depMin(from) ≥ nowMin` (viz noční
   logika níže) spočti `arrMin(to)` ze **stejného** spoje. → Itinerary s 1 nohou.
3. **Přestupní varianty (transfers 1):** leg1 `(p1, A→T)`, leg2 `(p2, T→B)`.
   Pro každý aktivní spoj p1 s `depMin1 ≥ nowMin`:
   - `arrT` = příjezd na uzel T (čas p1 na indexu T).
   - **Určení dne 2. nohy (řeší otevřené téma 1 — POVINNÉ):** když `arrT ≥ 1440`
     (dojezd až po půlnoci), 2. noha jede **následující kalendářní den** → aktivní
     spoje p2 počítej k `date+1` a čas srovnávej v rámu toho dne (`arrT − 1440`).
     Jinak stejný `date`.
   - Najdi **nejbližší** aktivní spoj p2 s `depMin2 ≥ arrT + minTransfer` (v rámu
     příslušného dne). Jeden nejbližší spoj na jeden odjezd p1 (ať se to nezvětví).
   - `arrB` = příjezd do cíle (čas p2 na indexu B; pokud noha2 = další den, přičti
     1440, ať `totalMin` sedí). `waitMin = depMin2 − arrT`. → Itinerary se 2 nohami.
4. **Sesbírej, dedup** (klíč = linky + časy odjezdů nohou), **seřaď podle `depMin`
   vzestupně** (= 2B: nejdřív nejbližší odjezd), při shodě podle `totalMin` (kratší
   jízda dřív), pak podle `transfers`. Vrať prvních `limit`.

### Noční logika (linka 51, přesah přes půlnoc) — stejná jako v `timetable.js`
Když `nowMin ≥ 1080` a odjezd spadá do noci (`depMin < 420`), počítej ho jako
`depMin + 1440` (aby „po půlnoci" bylo správně za „před půlnocí"). Stejné pravidlo
aplikuj i na `arrT`, `depMin2`, `arrB`.

### Export
```js
module.exports = { planJourney };
if (typeof window !== "undefined") window.MHDJourney = { planJourney };
```

### Co NESAHAT
- **Neupravovat** `index_raw.html` / `index.html`, `routing.js`, `timetable.js`
  (jen z nich importuj; když něco chybí jako export, přidej **jen** export, ne logiku).
- Žádné závislosti, žádný `npm install`, žádná externí data. Žádné UI.

---

## KROK B2 — `scripts/journey.test.js` (Node test k B1)

Spustitelný `node scripts/journey.test.js`. Načte `../data/network.json`, zavolá
`planJourney` a **čitelně vypíše** aspoň:
- **1 přímé + 1 přestupní spojení** ve všední den v běžnou dobu (např.
  `Krátká → Růžový vrch` — z routing testu víme, že je přes přestup;
  a nějaké přímé, např. `Krátká → Tržnice`).
- **1 scénář přes půlnoc** (linka 51, `nowMin` ~ 23:50) — ať se ověří přesah dne
  a případně přestup s dojezdem po půlnoci.

Formát řádku (návrh):
```
08:06 → 08:31 · 25 min · přímo linka 15 → Stará Kysibelská
08:06 → 08:41 · 35 min · 1 přestup (Tržnice, čekání 4 min): 15 → …  ⇒  3 → …
```
**Executor namátkou ověří 2–3 spojení proti reálnému JŘ DPKV** (raw HTML, ne AI
shrnutí stránky — u tabulek nespolehlivé), hlavně že: (a) časy odjezdu/příjezdu
sedí na minutu, (b) přestup má rezervu ≥ `minTransfer`, (c) přesah přes půlnoc je
správně. Výsledek napiš do VÝSLEDKU.

---

## KROK B3 — 2 kontroly do `scripts/verify_network.js`

Přidej do souhrnu (PASS/FAIL):
- U vzorového přestupního spojení platí `leg2.depMin ≥ leg1.arrMin + minTransfer`
  (návaznost drží).
- `totalMin === arrMin − depMin` a `totalMin > 0` u vráceného spojení.

---

## Otevřená témata — stav pro KROK B

1. **Předěl typu dne přes půlnoc u přestupu** — **ŘEŠIT v B** (viz algoritmus krok 3:
   2. noha se počítá k `date+1`, když dojezd padne po půlnoci).
2. **Předěly svátek / prázdniny / víkend** — pokryté tím, že aktivitu služby každé
   nohy počítáš k **jejímu** datu přes `isServiceActive` (ne zafixovaně na 1 den).
3. **Přechod letní/zimní čas** — **teď NEŘEŠIT** jako blokující. GTFS časy jsou lokální;
   kolem přechodu (2×/rok, ~02:00–03:00) může hodina chybět/se zdvojit. Pro v1
   přijatelné; zapiš do VÝSLEDKU jako známé omezení, ať se na to nezapomene v J4/J5.
4. **Min. čas na přestup** — ✅ 3–5 min (default 3, parametr `minTransfer`).

---

## Mimo scope kroku B (jen kontext, NEIMPLEMENTOVAT)
- **Poloha → zastávka** (mapa / GPS / paste souřadnic) = **J5**. Jádro `planJourney`
  dostává vždy zastávku; převod polohy na nejbližší zastávku přijde později.
- **Oblíbené / časté dotazy + odjezdové tabule à la F1** = **J6/J7** (uložené dvojice
  A→B, osud staré appky). `planJourney` je pro ně jen motor.
- **UI obrazovka „Hledat spojení"** = **J4**.
