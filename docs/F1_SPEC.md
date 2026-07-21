# F1_SPEC — Fáze 1: Opravit bugy + přidat zastávku Krátká

**Předpoklad:** přečetl jsi `CLAUDE.md`, `DATA_FORMAT.md` a `DECISIONS.md`.

**Pracuj v souboru:** `index_raw.html` (NE `index.html` — to je uložená GH viewer stránka).

**Před začátkem zkontroluj:** že máš v ruce data z `DATA_INTAKE.md` (6 DPKV stránek + cílové zastávky + volba barvy linky 9). Pokud nemáš, **STOP a zeptej se Joea**, nevymýšlej časy.

---

## Úkol 1: Bug — linka 51 `holiday` je kopie `workday`

### Lokace
`index_raw.html`, řádky 707–713:

```js
holiday: {
  22: ["46"],
  23: ["26"],
  1: ["16"],
  3: ["06"],
  4: ["06","46"]
},
```

To je doslova totéž jako `workday` o 7 řádků výš.

### Co udělat
1. Otevři DPKV stránku noční linky 51 dodanou Joeem (nebo URL `https://www.dpkv.cz/_data/n-51/51103.htm`).
2. Najdi sloupec pro **školní prázdniny** (typicky označený „prázdniny" nebo letní úprava).
3. Pokud sloupec existuje a liší se od pracovního dne → přepiš `holiday` reálnými časy.
4. Pokud na DPKV sloupec „prázdniny" NEEXISTUJE (= linka jezdí stejně jako pracovní den celý rok) → nech `holiday` jako kopii `workday`, ALE přidej komentář `// holiday = workday (nemá speciální prázdninový jízdní řád)` přímo nad `holiday: {`. To zabrání budoucímu zmatku.

### Akceptační kritérium
- V aplikaci přepneš čas na 15. července 13:00 (= `holiday`) → uvidíš odjezdy linky 51 podle DPKV pro tu dobu, NE podle pracovního dne (pokud se liší).
- Pokud se nelišily, komentář v kódu je viditelný.

---

## Úkol 2: Bug — linka 3 víkend (`weekend`)

### Lokace
`index_raw.html`, řádek 659:

```js
weekend: {6:["46"],7:["24","44"],8:["26","56"],9:["46"],10:["16"],11:["06","36"],12:["26","56"],13:["46"],14:["16"],15:["06","36"],16:["26","56"],17:["46"],18:["16"],19:["06","41"],20:["49"]}
```

### Co udělat
1. Otevři DPKV stránku dodanou Joeem (nebo URL `https://www.dpkv.cz/_data/d-3/3103.htm`).
2. Najdi sloupec **„sobota, neděle, svátek"** (typicky vpravo, někdy spojený s „prázdninový provoz").
3. Přepiš celý objekt `weekend` reálnými daty z DPKV.

### Pozor na poznámky (písmena za minutami)
DPKV někdy uvádí písmena u některých časů (např. „17²" nebo „17S"). Pokud písmeno **už je v `DATA.notes`** (S/š/P/D/L), použij ho v datech (např. `"17S"`). Pokud písmeno je nové, nejdřív **přidej do `DATA.notes`** s textovým vysvětlením (zeptej se Joea, pokud DPKV neuvádí legendu).

### Akceptační kritérium
- V aplikaci nastav sobotu 10:30 → uvidíš správné víkendové odjezdy linky 3 z Borové.
- V tabu „Jízdní řády" vyber linku 3 a typ dne „Víkend / svátek" → uvidíš celý správný rozpis.

---

## Úkol 3: Feature — přidat 4 nové `route` pro zastávku Krátká

Joe nastupuje i ze zastávky **Krátká**, ze které jezdí linky 3, 9, 15, 51 do centra. Linka 9 zatím v `DATA.routes` ani v CSS není.

### Lokace
`index_raw.html`, do pole `DATA.routes` (mezi řádky 647 a 725). Doporučuji vložit nové objekty **na konec pole** (před uzavírací `]` na řádku 725).

### Co udělat — pro každou ze 4 linek (3, 9, 15, 51) z Krátké

Zkopíruj šablonu níže a vyplň:

```js
{
  id: "lineX_kratka_CILOVAZASTAVKA",   // nahraď X číslem linky, malými písmeny
  line: "X",                            // číslo linky
  from: "Krátká",
  to: "...",                            // cílová zastávka dle DPKV (Joe potvrdí)
  travelMinutes: ...,                   // doba jízdy Krátká → cíl (z DPKV nebo Joeova odhadu)
  colorClass: "line-X",                 // CSS třída
  dpkvUrl: "https://www.dpkv.cz/_data/d-X/...",   // od Joea
  departures: {
    workday: { /* z DPKV */ },
    holiday: { /* z DPKV nebo komentář jako u Úkolu 1 */ },
    weekend: { /* z DPKV */ }
  }
}
```

### Speciální poznámky

**Linka 3 z Krátké** — stejná linka jako 3 z Borové (jen jiná zastávka na trase). `id` musí být odlišný (`line3_kratka_...`), `dpkvUrl` jiný (každá zastávka má vlastní stránku DPKV).

**Linka 9** — úplně nová. Vyžaduje navíc:
1. **Přidat CSS třídu `.line-9`** v sekci stylů (řádky ~350–358). Barva: dle dohody s Joeem (návrh `#c25e1a` oranžová — viz `DECISIONS.md`).
2. Pokud DPKV uvádí pro linku 9 nějaké poznámky s novými písmeny, **doplnit `DATA.notes` mapu** (řádek 729).

**Linka 51 z Krátké** — noční linka. Vyřeš stejnou kontrolu `holiday` jako v Úkolu 1 (možná i tady je kopie `workday`).

### Akceptační kritérium
- V tabu „Odjezdy" vidím 4 nové karty linek (3, 9, 15, 51) s prefixem „Krátká → ...".
- Každá karta má správnou barvu badge (linka 9 nesmí být transparentní).
- V tabu „Jízdní řády" je v selectu 4 nové položky pro Krátkou.
- Kliknutí na header karty otevře správnou DPKV stránku.

---

## Úkol 4 (volitelný cleanup, jen pokud máš čas)

UI label `"Prázdniny / svátky"` u typu dne `holiday` (řádek 766) je zavádějící — `holiday` reálně znamená jen školní prázdniny, ne svátky.

**Doporučená oprava:**
```js
case 'holiday': return 'Školní prázdniny';
```

**POZOR:** než to změníš, **zeptej se Joea**. Možná je to schválně, aby UI bylo lakonické. Pokud Joe souhlasí, oprav.

---

## Postup práce (doporučený)

1. **Snapshot:** zkopíruj `index_raw.html` do `archive/YYYY-MM-DD_pre-F1/index_raw.html` (záloha před editací).
2. **Úkol 1** — drobná oprava, otestuj.
3. **Úkol 2** — drobná oprava, otestuj.
4. **Úkol 3** — větší zásah, dělej po jedné lince (3 → 9 → 15 → 51), po každé otestuj.
5. **Úkol 4** — volitelně po dohodě s Joeem.
6. **Final test:** projdi všechny taby ve více čase (pracovní den ráno, víkend ráno, sobota v noci, prázdninové úterý odpoledne).
7. **Commit:** `feat: F1 - opraveny bugy linek 3 a 51, přidána zastávka Krátká`.
8. **Update `changelog.md`** — přidej záznam s dnešním datem.
9. **Update `CLAUDE.md`** sekce „Aktuální stav" — místo 4 linek je teď 8.

---

## Pokud na něco narazíš

- **Joe nedodal některá data** → STOP, zeptej se. Nevymýšlej časy.
- **DPKV stránka má jinou strukturu, než předpokládáme** → STOP, popiš Joeovi a zeptej se, jak to interpretovat.
- **Nesedí ti něco v existujícím kódu** → přečti si znovu `DATA_FORMAT.md` a `DECISIONS.md`. Pokud pořád ne, ptej se.
- **Chceš změnit něco mimo F1 scope** → NE. Napiš na konec své zprávy `📌 Mimo scope: ...` a pokračuj v F1.
