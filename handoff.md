# Handoff — EXECUTOR spec (J4-fix: přestup přes půlnoc v noci → záporná doba jízdy)

> 🔴 **AKTIVNÍ ZADÁNÍ (manager, 2026-08-03) — bugfix v jádře, priorita před P2.** J4 Předávka 1 je hotová
> a funguje (tab Hledat, formulář, výsledky — manager ověřil vizuálně na GitHub Pages). **Ale vizuální test
> odhalil chybu v `journey.js`:** noční přestup (leg1 pozdě večer → leg2 až ráno) vrací **zápornou dobu jízdy**
> a řadí se úplně nahoru. UI to jen věrně zobrazuje — oprava je v jádře, ne v HTML.

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů, **nic nad zadání**. Git děláš ty.
> Malé kroky, kód jako **diff**, commit + test.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md`, `scripts/journey.js` (funkce `transferItineraries`, `directItineraries`,
   `nightAdjust`, `addDays`), `scripts/journey.test.js`, tento soubor.
3. **Před prvním commitem** commitni necommitnuté manager docs.

---

## Repro (potvrzeno v Node, hledání ve 23:22)
```
node -e "const {planJourney}=require('./scripts/journey.js');const net=require('./data/network.json');
console.log(planJourney(net,'Krátká','Tržnice',{date:'20260803',nowMin:1402,limit:5}))"
```
První výsledek: `depMin 1405 (23:25) → arrMin 430 (07:10) | totalMin -975 | wait 430 | 51→19`.
Správné výsledky (přímý 51, i přestup 51→52 s `+1d`) se vrací taky — chyba je jen u varianty, kde 2. noha
naváže **až ráno druhý den**.

## Příčina
`transferItineraries` řeší den 2. nohy jen přes `arrT >= DAY_MIN` a `nightAdjust` s prahem „ráno < 420 min".
Když leg1 (noční 51) dojede na uzel **před půlnocí** (`arrT ~1415 < 1440`) a jediná navazující leg2 jede
**ráno** (dep2 ~430), tak se dep2 ani arrB **nepřesune o +1 den** → `arrMin (430) < depMin (1405)` →
`totalMin` záporné. A protože řadíme podle odjezdu a při shodě podle nejmenší doby, ta záporná varianta
vyskočí **první**.

---

## FIX-A — monotónní časová osa v `transferItineraries` (jádro opravy)

Přepiš určení časů nohou tak, aby platilo **dep1 ≤ arr1 ≤ dep2 ≤ arr2** vždy (časy jako absolutní minuty na
ose od okamžiku hledání, s přetečením +1440 podle potřeby):
- **leg1:** `dep1` je první odjezd `≥ nowMin` (posuň o +1440, dokud není ≥ nowMin). `arr1 = dep1 + (offs[idxT]−offs[idxFrom])` (rozdíl offsetů → vždy ≥ 0, arr1 ≥ dep1 z konstrukce).
- **leg2:** hledáš **nejbližší** odjezd `dep2 ≥ arr1 + minTransfer` na téže ose — když kandidát v „základním"
  dni tuto podmínku nesplní (odjezd už byl), **posuň ho o +1440** (další den) a zkus znovu. `arr2 = dep2 + (offs[idxB]−offs[idxT])`.
- **Aktivní služby 2. nohy** posuzuj pro **kalendářní den, na který `dep2` reálně padne** = `addDays(date, Math.floor(dep2 / 1440))`. (Nahrazuje dosavadní `dateStr2`/`dayOffset2` patchwork i `nightAdjust` v této funkci.)
- Výsledek: `depMin=dep1`, `arrMin=arr2`, `totalMin=arr2−dep1` (vždy > 0), `waitMin=dep2−arr1` (vždy ≥ 0),
  `transferStop`, `coLocated`, `walkMin` zachovej jak jsou.

**Pozn.:** `directItineraries` (přímé) funguje správně (přímý 23:25→23:40 sedí) — ale projdi ji a ujisti se,
že používá **stejný** monotónní princip (dep ≤ arr), ať se logika nerozchází. Pokud je OK, nesahej.

## FIX-B — pojistka v `planJourney` (invariant)

Po sestavení a před řazením **zahoď** každý itinerář, kde `arrMin <= depMin` nebo `waitMin < 0` — takový
výsledek je vždy chyba, nikdy ho neukazuj. (Levná záchranná síť, i kdyby něco proklouzlo.)

## FIX-C — test na noční přestup (aby to bylo pokryté)

Do `journey.test.js` přidej scénář **noční hledání** (`nowMin ≈ 1402`, `date` = všední den):
- Vypiš výsledky Krátká→Tržnice.
- **Assert (tolerantní print + jasně označený FAIL, pokud padne):** každý vrácený itinerář má
  `arrMin > depMin`, `totalMin > 0`, `waitMin >= 0`. Tenhle invariant by chybu chytil.
- (Tenhle test zůstává v `journey.test.js` = neblokuje guard, ale hlídá regresi při vývoji.)

## Volitelné (rozhodne se, ne nutné teď)
- 📌 **Strop čekání na přestup** — noční varianty s čekáním 240 min jsou platné, ale málo užitečné. Po FIX-A
  se řadí až za rozumné (přímý 15 min, přestup 75 min), takže neškodí. Případný `maxWait` (~120 min) můžeme
  přidat později jako filtr v UI — teď NEřešit.

---

## DŮKAZ / ověření
1. Repro výše po fixu: **žádný záporný `totalMin`**, první výsledek je rozumný (přímý 51 za 15 min).
2. `node scripts/journey.test.js` → nový noční test PASS, ostatní beze změny.
3. `node scripts/verify_network.js` → dál 20/20 (smoke test Krátká→Tržnice pořád OK).
4. Commit `scripts/journey.js` + `journey.test.js`. **HTML se nemění.**
5. Do `VÝSLEDEK`: co přesně se v `transferItineraries` změnilo + potvrzení, že noční přestup je teď kladný.

---

## Co NESAHAT
- `index_raw.html`/`index.html` (UI je správně), `routing.js`, `timetable.js`, `build_network.js`, guard.
- Řazení (`SORTERS`) neměnit — po FIX-A už záporná varianta nevznikne, takže se nahoru neprotlačí.

## VÝSLEDEK (vyplní executor)

**FIX-A (`transferItineraries`, `scripts/journey.js`):** přepsáno na monotónní časovou osu
přesně dle zadání. `dep1` = první odjezd leg1 `>= nowMin` (cyklus `while (dep1 < nowMin) dep1 += 1440`
místo jednorázového `nightAdjust`), `arr1 = dep1 + (arr1Raw − dep1Raw)` (rozdíl offsetů, ne
samostatně dopočítávaný `nightAdjust(arrTRaw)` jako dřív — to byl přesně zdroj nekonzistence).
`dep2` obdobně: nejbližší odjezd leg2 `>= arr1 + minTransfer` (`while (dep2 < arr1+minTransfer) dep2 += 1440`),
`arr2 = dep2 + (arr2Raw − dep2Raw)`. Aktivní služby 2. nohy se teď posuzují **per-trip** pro
kalendářní den `addDays(date, Math.floor(dep2/1440))` — nahrazuje starý `dateStr2`/`dayOffset2`
patchwork počítaný jednou před vnitřní smyčkou (chyba: různé spoje leg2 mohou potřebovat různý
posun dne, proto se aktivní služby teď cachují do `Map` per kalendářní den a kontrolují uvnitř
smyčky přes trip2). `directItineraries` beze změny (ověřeno, že už drží `dep <= arr`, sahat netřeba).

**FIX-B (`planJourney`):** před dedup/řazením zahazuje itineráře s `arrMin <= depMin` nebo
`waitMin < 0` (levná pojistka, po FIX-A se v testech nikdy neuplatnila — invariant držel čistě).

**FIX-C (`journey.test.js`):** nový scénář „noční hledání" (Krátká→Tržnice, `nowMin=23:22`,
`date=20260202` všední den), assert `arrMin > depMin && totalMin > 0 && (waitMin==null || waitMin>=0)`
pro každý vrácený itinerář. **Nález při psaní testu:** první verze testu chybně počítala
`undefined >= 0` jako `false` u přímého spoje (nemá `waitMin`) → falešný FAIL; opraveno na
`it.waitMin == null || it.waitMin >= 0`.

**Repro z handoffu po fixu:**
```
node -e "...planJourney(net,'Krátká','Tržnice',{date:'20260803',nowMin:1402,limit:5})"
```
První výsledek: `depMin 1405 (23:25) → arrMin 1420 (23:40) | totalMin 15` (přímo linka 51) —
žádná záporná hodnota, přímý spoj správně první. Noční přestupová varianta (51→52, čekání 53 min)
teď vrací `totalMin 75` místo `-975`.

**Testy:** `node scripts/journey.test.js` → nový noční test **OK** (8/8 itinerářů splňuje invariant),
ostatní scénáře beze změny v chování (jen kosmeticky jiná pořadí u přestupů kvůli přesnějšímu
`dep2`, čísla sedí). `node scripts/verify_network.js` → **20/20 PASS** (smoke test Krátká→Tržnice
beze změny). `routing.test.js` a `timetable.test.js` (netýkají se fixu) proběhly bez chyby jako
sanity check.

**Commitnuto:** `scripts/journey.js`, `scripts/journey.test.js` (+ manager docs `TASK.md`,
`handoff.md` dle instrukce „před prvním commitem commitni necommitnuté manager docs"). HTML se
neměnilo.
