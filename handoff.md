# Handoff — EXECUTOR spec (J8-fix: refresh-stabilita — klíčovat podle názvů, ne volatilních id)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-07-23).** J8a (`update_data.js` + guard) je HOTOVÉ a odhalilo
> **blocker:** JrUtil přečísluje `JDFS-` id při každém buildu (ověřeno: Kpt.Jaroše JDFS-10020→JDFS-3526,
> Globus JDFS-18345→JDFS-2780 atd.). Interní `S#`/`P#` se přečíslují taky. Proto `COORD_OVERRIDES`
> (klíč `JDFS-`) i natvrdo zadaná `P50`/`P5`/`S#` po obnově přestanou sedět → guard správně FAILuje →
> J8b by nikdy neprošel. **Názvy zastávek a čísla linek jsou naopak stabilní.**
> **Cíl této předávky:** překlíčovat vše trvanlivé na **název/linku** a dokázat, že obnova na čerstvá
> data teď **projde** (guard 26/26). Až potom J8b (workflow).

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů, **nic nad zadání**. Git děláš ty.
> Malé kroky, kód jako **diff**, commit + testovací příkaz po každém dílčím kroku.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md`, `TASK.md` (sekce TEĎ), `scripts/build_network.js`, `scripts/verify_network.js`,
   `scripts/routing.js` (`normalizeName`, `resolveStopId`), tento soubor.
3. **Před prvním commitem** commitni necommitnuté manager docs (`handoff.md`, `TASK.md`).

---

## Princip (zapiš i jako trvalé pravidlo, viz FIX-4)

**Volatilní (NIKDY na tom neklíčovat nic, co má přežít obnovu dat):** `JDFS-…` (zdrojové stop_id),
`S#` (interní stop id), `P#` (interní pattern id). Přečíslují se při každém buildu ze zdroje.
**Stabilní (klíčuj na to):** **název zastávky** (normalizovaný) a **číslo linky** (`route_short_name − 425000`),
`headsign`/pořadí zastávek pro rozlišení patternu.

Normalizace názvu = jako `normalizeName` v `routing.js` (strip `Karlovy Vary,`, `trim`, `toLowerCase`).
Používej **stejnou** funkci, ať se chování nerozejde.

---

## FIX-1 — `COORD_OVERRIDES` v `build_network.js`: klíč = NÁZEV, aplikovat jen když chybí GPS

- Překlíčuj tabulku ze `JDFS-` id na **normalizovaný název**:
```js
// Ruční GPS pro zastávky, které zdroj (CIS/GTFS) nemá (0,0). Klíč = normalizovaný název
// (JDFS-/S# id jsou per-build volatilní!). Aplikuje se JEN když zdroj GPS nemá → nepřepíše validní data.
const COORD_OVERRIDES = {
  'kpt.jaroše':        [50.225355, 12.839125],  // střed 2 označníků (~90 m) — přesné směr. pozice → J9
  'mattoniho nábřeží': [50.239712, 12.889429],  // 2 MHD označníky; příměstský 3. bod → J9
  'nádraží dalovice':  [50.255920, 12.885421],
  'na pasece':         [50.252510, 12.882424],
  'globus':            [50.217823, 12.806296],
  'tesco':             [50.226009, 12.823021],
  'lázně i':           [50.219270, 12.880980],  // sedí i pro totožnou zastávku s validní GPS (nepřepíše ji)
};
```
- Při stavbě `stops[k]`: souřadnice ber ze zdroje; **pokud chybí** (`lat`/`lon` je `0`/prázdné/`null`)
  **a** existuje override pro `normalizeName(stop_name)` → dosaď override. Jinak zdroj.
  (Tím se nikdy nepřepíšou validní data a je to self-healing, kdyby zdroj GPS časem doplnil.)
- **Kontrola konzistence:** po zpracování všech zastávek projdi klíče `COORD_OVERRIDES`; pokud se některý
  název v datech vůbec nevyskytl, vypiš **WARN** (upozorní, když se zastávka přejmenuje/zmizí). Nezastavuj.

---

## FIX-2 — `verify_network.js`: odhardcodovat `P50`/`P5`/`S#`

Nahraď natvrdo zadaná id **dynamickým dohledáním** (dle linky + názvů zastávek, přes `resolveStopId`):
- Kde je potřeba „pattern linky 3 z Krátké do Tržnice" (dřív `P50`): najdi pattern tak, že `pattern.line === 3`
  a jeho `stops` obsahují `resolveStopId('Krátká')` i `resolveStopId('Tržnice')` ve správném pořadí. Uděláš
  malý helper `findPattern(net, line, fromName, toName)`.
- Kde je potřeba smyčková linka (dřív `P5`): dohledej dle linky + toho, že se `stopId` v `stops` opakuje.
- Kontrola výluky Bohatice, směrovosti, co-located atd.: kde je `S#`, nahraď `resolveStopId('Název')`.
- **Cíl:** `verify_network.js` neobsahuje žádné `S#`/`P#`/`JDFS-` literály; funguje na jakémkoli buildu.

---

## FIX-3 — testy (`routing.test.js`, `journey.test.js`, `timetable.test.js`): odhardcodovat `S#`

- Nahraď natvrdo zadaná `S77`/`S0`/`S22`/… voláním `resolveStopId(net, 'Krátká'|'Tržnice'|'Okružní'|…)`.
- Testy pak přežijí přečíslování. (Nejsou v guardu, ale ať jsou konzistentní a použitelné po obnově.)

---

## FIX-4 — `docs/DATA_SOURCES.md`: trvalé pravidlo

Přidej sekci: **„Stabilní vs. volatilní identifikátory"** — `JDFS-`/`S#`/`P#` jsou per-build volatilní
(JrUtil je regeneruje), klíčovat výhradně na **název zastávky + číslo linky**. Uveď příklad přečíslování
(Kpt.Jaroše JDFS-10020→JDFS-3526), ať je jasné proč.

---

## FIX-5 — DŮKAZ refresh-stability (klíčové ověření)

1. Spusť `node scripts/update_data.js` na **čerstvá data** (ta, co dřív FAILovala 3/26).
   → guard teď musí **PROJÍT** (`verify_network.js` FAIL: 0), 7 override zastávek má správnou GPS
   (ne `0,0`) i po přečíslování.
2. Spusť všechny testy (`routing.test.js`, `journey.test.js`, `timetable.test.js`) na novém `network.json`
   → projdou (žádné natvrdo `S#`).
3. Když vše zelené, **commitni i přestavěný `data/network.json`** (data se tím zaktualizují na 22.7.) +
   stavový soubor + kódové fixy. To je zároveň důkaz, že obnova funguje end-to-end.
4. Do `VÝSLEDEK` napiš: guard po fixu prošel (počty), které soubory odhardcodovány, a potvrzení, že
   `update_data.js` je teď refresh-stabilní.

---

## Mimo scope (→ J8b, NEIMPLEMENTOVAT)
- `.github/workflows/update-data.yml` (cron, `workflow_dispatch`, `GITHUB_TOKEN`), Last-Modified check,
  keepalive. Až po tomto fixu — teprve teď má J8b smysl (guard bude reálně procházet).

---

## VÝSLEDEK (vyplní executor)

**Hotovo 2026-07-23, commit `d8c7456` (push proveden, `main` u remote sladěn).**

- **FIX-1** (`scripts/build_network.js`): `COORD_OVERRIDES` překlíčován ze 7× `JDFS-…` na
  normalizovaný název (`kpt.jaroše`, `mattoniho nábřeží`, `nádraží dalovice`, `na pasece`,
  `globus`, `tesco`, `lázně i`). Aplikuje se jen když `rawLat`/`rawLon` chybí/je `0`
  (opravena i latentní chybu: string `"0"` bylo dřív vyhodnoceno jako pravdivé, takže by
  se validace „chybí GPS" nechovala správně bez override existence). Nepoužitý klíč hlásí
  `console.warn`. Ověřeno: build proběhl bez jediného WARN (všech 7 názvů se v datech našlo).
- **FIX-2** (`scripts/verify_network.js`): přidány `findPattern(net, line, fromName, toName)`
  a `findLoopPattern(net, line)`; nahrazují natvrdo `"P50"` (linka 3, Krátká→Tržnice) a
  `"P5"` (smyčka linky 12, Pivovar↔Tržnice). Žádné `S#`/`P#`/`JDFS-` literály nezůstaly.
- **FIX-3**: `routing.test.js`, `journey.test.js`, `timetable.test.js` už odjakživa pracují
  přes názvy zastávek (`resolveStopId`), ne přes `S#` — grep potvrdil, žádná změna nebyla
  potřeba. Všechny tři proběhly bez chyby (exit 0) na novém `network.json`.
- **FIX-4** (`docs/DATA_SOURCES.md`): nová sekce „⚠️ Stabilní vs. volatilní identifikátory"
  (co neklíčovat, na co klíčovat, proč, jak to řeší kód); starší nález o nestabilitě id
  označen jako ✅ VYŘEŠENO s odkazem na důkaz.
- **FIX-5 — DŮKAZ refresh-stability:** `node scripts/update_data.js` spuštěn na živá čerstvá
  data (reálné stažení z `data.jr.ggu.cz`, ne cache). Proběhl celý pipeline (stažení → filtr
  → `build_network.js` → guard) za 57,9 s. **Guard: `verify_network.js` 26/26 PASS.**
  Zajímavé potvrzení bugu i fixu najednou: patterny se v tomto běhu skutečně přečíslovaly
  přesně jako v nálezu z 23.7. (`P50` linka 3→9, `P5`→jiná linka) — `findPattern`/
  `findLoopPattern` je i tak správně dohledaly (nově `P206` linka 3, `P120` smyčka linky 12)
  a všechny testy prošly. To je přímý důkaz, že J8-fix řeší přesně to, co měl.
  Data po tomto běhu: 23 linek, 157 zastávek (všech 157 s validní GPS), 290 patternů,
  10 151 spojů — commitnuto `data/network.json` + nově vzniklý `data/data_source_state.json`.
- **Potvrzení:** `update_data.js` je teď refresh-stabilní — J8b (GitHub Actions workflow)
  dává smysl stavět, guard bude reálně procházet i bez lidského zásahu.
- **Problémy/nápady:** žádné nové. `data_raw/kv_gtfs/` už z předchozího (neúspěšného) J8a
  testu obsahoval čerstvá data z 22.7. — proto se přečíslování reprodukovalo hned i při
  lokálním rebuildu před spuštěním celého `update_data.js`; nic to nemění na tom, že finální
  důkaz (FIX-5) proběhl přes skutečné nové stažení, ne jen přes starý cache soubor.
