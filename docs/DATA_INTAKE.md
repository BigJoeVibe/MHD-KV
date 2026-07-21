# DATA_INTAKE — Co Joe dodá před začátkem F1

Tento dokument říká, jaké informace musí Joe dodat Claudovi, **než Claude začne programovat F1**.

Bez těchto dat Claude nemůže pokračovat — měl by STOP a vyžádat si je. Vymýšlení časů jízdního řádu je zakázané.

---

## Checklist (6 DPKV stránek + 2 doplňující info)

### 1. Linka 3 — víkend z Borové (bug fix)

- [ ] DPKV URL: `https://www.dpkv.cz/_data/d-3/3103.htm`
- [ ] Pokud URL nefunguje, Joe pošle alternativu nebo screenshot.
- Co potřebuju: kompletní víkendový sloupec („sobota, neděle, svátek") z té stránky.

### 2. Linka 51 — školní prázdniny (bug fix)

- [ ] DPKV URL pro noční linku 51 z Okružní: `https://www.dpkv.cz/_data/n-51/51103.htm`
- [ ] Joe potvrdí, jestli má linka 51 speciální prázdninový sloupec.
- Tři možnosti:
  - **A)** Speciální sloupec EXISTUJE a liší se → Joe pošle obsah toho sloupce.
  - **B)** Sloupec NEEXISTUJE (linka 51 jezdí stejně celý rok) → Joe to potvrdí, Claude jen přidá komentář do kódu.
  - **C)** Joe si není jistý → pošle screenshot, Claude posoudí.

### 3. Linka 3 — z Krátké

- [ ] DPKV URL: pravděpodobně `https://www.dpkv.cz/_data/d-3/...htm` (jiný kód zastávky než 3103)
- [ ] Cílová zastávka (`to`): Tržnice? Nebo jinam?
- [ ] Doba jízdy Krátká → cíl (z DPKV plánu nebo Joeova odhadu).

### 4. Linka 9 — z Krátké

- [ ] DPKV URL pro linku 9 ze zastávky Krátká.
- [ ] Cílová zastávka (`to`): kam Joe linkou 9 jezdí?
- [ ] Doba jízdy.
- [ ] **Barva linky 9** v UI (CSS `.line-9`): Joe vybere barvu, nebo přijme návrh `#c25e1a` (oranžová) z `DECISIONS.md`.

### 5. Linka 15 — z Krátké

- [ ] DPKV URL pro linku 15 ze zastávky Krátká.
- [ ] Cílová zastávka.
- [ ] Doba jízdy.

### 6. Linka 51 — z Krátké (noční)

- [ ] DPKV URL pro linku 51 ze zastávky Krátká.
- [ ] Cílová zastávka.
- [ ] Doba jízdy.

### + Bonus: kontrola UI labelu (úkol 4 z F1_SPEC)

- [ ] Joe rozhodne, jestli změnit label `"Prázdniny / svátky"` na `"Školní prázdniny"` (přesnější) nebo nechat jak je.

---

## Formát, jak Joe data může dodat

**Možnost A — URL na DPKV (nejlepší):**
Pošle 6 URL adres přímo v Claude session. Claude buď stránky otevře přes web_fetch, nebo Joe stránky uloží jako HTML do složky `MHD KV/dpkv_data/` a Claude je přečte z disku.

**POZOR:** Sandbox blokuje přímý fetch z `dpkv.cz` přes bash curl, ale `web_fetch` může fungovat. Pokud `web_fetch` selže, Joe stránku stáhne ručně (Ctrl+S → uložit jen HTML) do `MHD KV/dpkv_data/linka_3_borova.html` apod.

**Možnost B — Screenshoty:**
Pokud Joe nedokáže/nechce stránky stáhnout, pošle screenshoty tabulek. Claude z obrázku přečte (vision capability).

**Možnost C — Ručně přepsané časy:**
Pokud screenshoty/stránky nejsou možné, Joe přepíše časy do textu ve formátu:
```
Linka 3 z Borové, víkend:
6: 46
7: 24, 44
8: 26, 56
...
```

---

## Co Claude udělá s daty (v pořadí)

1. Ověří, že má všechna data z checklistu výše. **Pokud chybí → STOP a zeptá se Joea.**
2. Otevře stránky / screenshoty / texty a vyzvedne časy.
3. Zkontroluje, jestli na stránkách jsou nové **písmena poznámek** (S/š/P/D/L nebo nějaká nová). Nová písmena dodá Joe text vysvětlení.
4. Aplikuje data do `index_raw.html` podle `F1_SPEC.md`.

---

## Příklad správně dodaných dat (jak by to mělo vypadat)

> „Tady máš stránky pro F1:
> 1. Linka 3 víkend z Borové: https://www.dpkv.cz/_data/d-3/3103.htm
> 2. Linka 51 prázdniny: nemá speciální prázdninový sloupec, jezdí stejně.
> 3. Linka 3 z Krátké: https://www.dpkv.cz/_data/d-3/3107.htm, cíl Tržnice, jízda 8 min
> 4. Linka 9 z Krátké: https://www.dpkv.cz/_data/d-9/9105.htm, cíl Tržnice, jízda 14 min, barva ať je oranžová jak navrhuješ
> 5. Linka 15 z Krátké: https://www.dpkv.cz/_data/d-15/15107.htm, cíl Tržnice, jízda 9 min
> 6. Linka 51 z Krátké: https://www.dpkv.cz/_data/n-51/51107.htm, cíl Tržnice, jízda 9 min, taky bez speciálních prázdnin
> UI label změň na 'Školní prázdniny'."

S tímhle Claude může okamžitě začít.

---

## Příklad NEDOSTATEČNĚ dodaných dat

> „Začni s F1, časy si dohledej."

Claude → STOP. Bez konkrétních časů nemůže pokračovat. Joe musí poslat aspoň URL nebo screenshoty.
