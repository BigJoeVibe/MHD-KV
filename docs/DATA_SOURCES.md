# DATA_SOURCES — odkud bereme data (nová datová základna)

Vzniklo 2026-07-19. Popisuje zdroj a zpracování dat pro **síťový model + vyhledávání A→B**.
Starý model (ruční `DATA.routes` v `index.html`) tím není zrušen — appka F1 na něm dál běží;
tohle je základ pro nové jádro. Viz `DECISIONS.md`.

## Autoritativní zdroj: CIS JŘ → GTFS (přes JrUtil)

- Ze zákona všechny české JŘ (včetně DPKV) putují do **CIS JŘ** (Celostátní informační systém o jízdních řádech).
- Projekt **JrUtil** (`data.jr.ggu.cz/results/latest/`) denně převádí CIS JŘ do GTFS.
- Stahujeme: **`JDF_merged_GTFS.zip`** (~123 MB, autobusy + MHD celé ČR). Vlaky jsou zvlášť (`CZPTT_GTFS.zip`) — teď netřeba.
- Spojenka (`spojenka.cz/jrdata`) byla jen **rozcestník** k JrUtil, ne zdroj našich dat.

## Jak vznikl KV subset (`data_raw/kv_gtfs/`)

Filtr z celostátního GTFS jen na městskou MHD Karlovy Vary:

1. **Dopravce DPKV** = IČO 48364282 → `agency_id` začíná `JDFA-48364282`.
   (Pozor: DPKV provozuje i regionální/příměstské linky a MHD jiných měst — ty vynecháváme.)
2. **Městská MHD KV** = `route_short_name` ve skupině **`425xxx`**.
   **Veřejné číslo linky = číslo − 425000** (např. `425003` → linka 3, `425051` → linka 51).
3. Navázat `routes → trips → stop_times → stops` a `calendar`/`calendar_dates`.

Recept je v `data_raw/` (skripty se spouštěly ad-hoc; při obnově dat zopakovat).

## Co subset obsahuje (ověřeno 2026-07-19)

- **23 linek**: 1–9, 11, 12, 13, 15–17, 19–23, 44, 51, 52.
- **157 zastávek**, z toho **150 se souřadnicemi ve zdroji** — 7 zdroj nemá (`0,0`), doplňuje
  `COORD_OVERRIDES` v `build_network.js` (JH, 23.7.). Viz rizika níže — klíč override **není
  stabilní přes obnovy dat**.
- **10 151 spojů**, **144 775 stop_times**, ~9,7 MB.
- Platnost `calendar` do **31. 12. 2026** (aktuální). Reálně jedoucí dny řídí `calendar_dates`.
- Klíčové zastávky sedí: `Karlovy Vary,Okružní` a `…,Krátká` jsou vedle sebe (linky 15, 51) = domovské.
  Názvy jsou prefixované `Karlovy Vary,` — při zobrazení v UI zkracovat.

## Obnova dat (když se změní JŘ)

1. Stáhnout nový `JDF_merged_GTFS.zip` z `data.jr.ggu.cz/results/latest/` do `data_raw/`.
2. Znovu spustit filtr (agency 48364282 + `425xxx`) → přepsat `data_raw/kv_gtfs/`.
3. Znovu vygenerovat datový soubor appky a otestovat.
   (Cíl: později zautomatizovat — obdoba původní F4, ale nad GTFS, ne scraping DPKV.)

## Zjištění z buildu network.json (2026-07-19)

Skript `scripts/build_network.js` převádí `kv_gtfs/` → `data/network.json` (kompaktní model appky).
Ověřeno na reálných datech:

- **Rozsah:** 23 linek, **157 zastávek** (150 se souřadnicemi ve zdroji + 7 doplněných `COORD_OVERRIDES`
  = výsledných 157 s GPS **jen když override správně sedí** — viz rizika níže), 290 patternů
  (linka×směr×varianta trasy), 10 151 spojů.
- **Velikost:** `network.json` ~592 KB, **~62 KB přes síť (gzip)** → pro mobil v pohodě.
- **Varianty linek = patterny.** To, co F1 řešila legendou (písmenko „jede jen do X / jinudy / jiná konečná"),
  je tu strukturálně: každá varianta trasy = vlastní pattern se skutečným pořadím zastávek + `headsign` (konečná).
  Př. linka 3 má 5 konečných (Stará Role, Stará Kysibelská, Lidická, Tržnice, Dalovice); P51 je zkrácená do Lidické.
- **Směrovost (důležité pro UI/routing):** odjezd je vždy „z A *směrem k* B", ne „cokoli staví na zastávce".
  Krátká leží uprostřed trasy → bez směru se mixují oba směry a vypadnou falešné odjezdy. Každý výsledek musí nést konečnou.

### Výluky, svátky, prázdniny — SILNÁ STRÁNKA

- **Plánované výluky nahlášené do CIS JŘ jsou v datech s přesnými daty.** Ověřeno: výluka „Bohatice,náměstí"
  na lince 5 — zastávka se teď neobsluhuje, první den zpět **12. 9. 2026**. Appka to dostane zadarmo tím,
  že pro daný den počítá aktivní služby (`calendar` + `calendar_dates`). Lepší než ruční `warnings` ve F1.
- **Omezení:** zachyceny jen PLÁNOVANÉ výluky v CIS; **náhlou „ode dneška" výluku data zachytit nemusí** → viz periodicita J8.

### GAP: zastávky „na znamení" — NESPOLEHLIVÉ v datech

- GTFS příznak `pickup_type`/`drop_off_type` != 0 je v celém KV subsetu **jen u linky 8** (2 zastávky).
- Reálné zastávky na znamení (např. linka 5, linka 19) v datech **chybí** → z GTFS je appka spolehlivě NEURČÍ.
- **Nespoléhat na GTFS pro „na znamení".** Neblokuje routing (spoj tam zastaví tak jako tak), je to jen info pro cestujícího.
- Řešení (rozhodnout ve fázi UI): (a) ruční overlay jako F1 legenda, (b) zatím vynechat, (c) jiný zdroj. Viz `TASK.md`.

## Aktualizace dat — architektura (plán J8)

Cíl: obnova spojů/výluk **bez ručního spouštění a bez lokálu**. Navrženo 2026-07-21.

### Kde to běží
- **GitHub Actions** — na serverech GitHubu (zdarma pro public repo `BigJoeVibe/MHD-KV`). Uživatelův počítač u toho být nemusí.
- Běh probíhá na **runneru** = dočasná Linux VM, kterou GitHub vytvoří jen pro daný běh a po doběhnutí zahodí.
  ZIP (122 MB) i rozbalená data (~1,5 GB) žijí jen na runneru; do repa se commitne **jen výsledek** (`data/network.json` ~600 KB + stavový soubor).

### Trigger + samodetekce změny
1. **Denní cron** (např. `0 3 * * *`).
2. **Levný check:** HTTP `Last-Modified`/velikost zdroje na `data.jr.ggu.cz` vs. hodnota uložená v repu → když stejné, konec (nestahuje se nic).
3. **Jen při změně:** stáhnout → filtr KV → `build_network.js` → commit `network.json` → GitHub Pages se sám nasadí (~1 min).
4. `workflow_dispatch` = ruční tlačítko „spustit teď" jako záloha.

### Soubory (až se J8 staví)
- `.github/workflows/update-data.yml` — cron + kroky + `GITHUB_TOKEN` (contents:write).
- `scripts/update_data.js` — stáhnout + filtr KV + zavolat build. Filtr streamuje `stop_times.txt` (1,38 GB), neukládá ho (`unzip -p … | filtr`).
- stavový soubor s posledním `Last-Modified`.

### Rizika (číst!)
- ⚠️ **60denní auto-vypnutí (ověřeno):** GitHub scheduled workflow sám vypne po 60 dnech BEZ commitu (jen commit resetuje časovač; vypnutí je tiché, jen e-mail). U appky s řídkými změnami JŘ hrozí. **Řešení: keepalive** (workflow občas commitne značku).
- Cron není přesný na minutu (u denního běhu nevadí).

### Zdroj dat — hlavní × záložní
- **Hlavní (varianta A):** JrUtil GTFS `…/latest/JDF_merged_GTFS.zip` — už GTFS (bez konverze), má GPS. Jednodušší kód (jen filtr), těžší data (1,5 GB streamovat).
- **Záložní (varianta B):** CIS MHD JDF `portal.cisjr.cz/pub/draha/mestske/JDF.zip` — čistě spoje, malý, primární/nezávislý, ale bez GPS a nutná konverze JDF→GTFS. Použít, kdyby JrUtil zmizel.

### GPS = statická reference (ne-prio)
GPS zastávek se mění výjimečně (nová/přesunutá zastávka) → obnova spojů/výluk ji řešit nemusí.
Pozn.: data nerozlišují 2 označníky jedné zastávky (Keramická škola = 1 bod) a některé provizorní/výlukové polohy mohou být nepřesné. Pro funkci spojů nevadí.

### Předpoklad pro appku
Front-end (J4) musí `data/network.json` **načítat za běhu** (fetch), ne mít data napevno v HTML jako F1 — jinak by automatická obnova neměla smysl.

## Test / QA zpracování dat (jednorázový × opakovaný)

Aby se dalo věřit, že `network.json` je správně — teď i po každé automatické obnově.

### A) Jednorázový test po buildu — `scripts/verify_network.js`
Kontroly (spustit po `build_network.js`), **od 2026-08-02 jen invarianty zdravého KV feedu** (viz
princip níže):
- **Struktura:** existují `stops`/`patterns`/`trips`/`services`; `meta.lines` obsahuje 23 linek.
- **Úplnost:** každá zastávka má jméno; kolik má GPS (očekáváno 157/157).
- **Integrita:** každý pattern má ≥2 zastávky a `off` stejné délky jako `stops`; každý trip odkazuje na `service_id`, který v `services` existuje.
- **Logika dne:** zkusí několik páteřních linek/směrů (3, 9, 13, 15) a ověří, že aspoň jedna má všední den hustší než sobotu — odolné vůči přetrasování jedné konkrétní linky.
- **Kalendářní výjimky:** existuje ≥1 služba s neprázdným `rem`/`add` (mechanismus `calendar_dates` se do modelu promítá) — bez vazby na konkrétní zastávku/termín/výluku.
- **Směrovost:** odjezdy z Krátké směr Tržnice neobsahují protisměr (ne 05:30/05:54).
- **Smoke test (data×engine):** `planJourney(Krátká→Tržnice)` vrátí ≥1 spojení s konzistentními časy (`arrMin>depMin`, `totalMin===arrMin−depMin`).

### B) Opakovaný test v obnově (J8) — regression guard PŘED commitem
Ve `update-data.yml`/`update_data.js` po buildu, ještě před commitem (spouští `verify_network.js`):
- **Prahy zdravé sady:** linky ≥ 20, zastávky ≥ 140, spoje ≥ 9 000 (jinak feed nejspíš ořezaný/rozbitý).
- **Nesmí spadnout o >X %** oproti předchozí verzi `network.json` (ochrana proti vadnému upstreamu).
- **`network.json` je validní JSON** a naparsuje se.
- Když guard selže → **NEcommituj** nová data a pošli upozornění (e-mail z Actions). Radši stará platná data než rozbitá nová.

### ⚠️ Princip guardu: invarianty, ne snímek (trvalé pravidlo, zavedeno 2026-08-02 po J8-hotfix)

**`verify_network.js` běží PŘÍMO v auto-guardu (`update_data.js`), takže smí obsahovat jen kontroly,
které platí v každém zdravém KV buildu.** Nikdy ne:
- konkrétní data/termíny (výluky, platnosti — ty jednou skončí a test spadne),
- konkrétní topologii jedné linky/patternu (že zrovna linka X má na daném úseku smyčku),
- přesné počty variant vázané na snímek,
- konkrétní OD dvojice/zastávky, které se mohou mezi obnovami přetrasovat nebo přejmenovat.

**Nález (2026-08-02):** první ostrý scheduled běh J8b selhal, protože sekce „Robustnost routingu (H1)"
testovala konkrétní snímek (natvrdo linka 12 měla mít smyčku na `Pivovar→Tržnice` — v novém buildu ji
neměla, jiná linka smyčku měla) a kontrola výluky Bohatice měla natvrdo zadaná data
`20260901`/`20260915` (časovaná bomba — spadne po skončení výluky 12. 9. 2026). Kód (`forwardSegments`
atd.) byl v pořádku, brittle byly jen kontroly.

**Oprava (J8-hotfix, HF-1 až HF-4):**
- Testy **chování kódu** (že routing umí smyčky/2 přestupy/co-located přestup) patří do
  `routing.test.js`/`journey.test.js` — ty běží jen ručně při vývoji a **nikdy nenastavují
  `process.exitCode`**, takže nemůžou zablokovat automat. Tam smí být klidně snímkově specifické,
  ale musí být **tolerantní** (dynamicky si dohledat vhodná data v aktuálním buildu — např.
  `findAnyLoopPattern()` v `routing.test.js` projde síť a najde JAKÝKOLI smyčkový pattern, místo
  natvrdo očekávat linku 12; když žádný není, vypíše INFO, nepadá).
- `verify_network.js` smí mít max. **jeden tolerantní smoke test** integrace dat×enginu (Krátká→Tržnice
  jako páteřní spoj s jistým přímým spojením) — to je jediné místo, kde je legitimní nechat build
  spadnout, protože znamená opravdu rozbitá data.
- Stejné ponaučení jako u ID (sekce výše): guard testuje **invarianty**, ne **specifika snímku**.

## ⚠️ Stabilní vs. volatilní identifikátory (trvalé pravidlo, zavedeno 2026-07-23 po J8-fix)

**Nikdy neklíčuj nic, co má přežít obnovu dat, na:**
- `JDFS-…` — zdrojové GTFS `stop_id`. Příklad přečíslování (ověřeno na reálném datu): Kpt.Jaroše
  `JDFS-10020` (17.–18. 7.) → `JDFS-3526` (22. 7.); Globus `JDFS-18345` → `JDFS-2780`.
- `S#` / `P#` — interní zkrácená id v `network.json` (zastávky/patterny). Přiřazují se pořadím
  výskytu při běhu `build_network.js` → mezi obnovami se přeskládají, i když se GTFS obsahově
  skoro nezměnilo (ověřeno: `P50` = linka 3 v jednom buildu, linka 9 v dalším).

**Klíčuj výhradně na:**
- **normalizovaný název zastávky** (`normalizeName()` v `routing.js`/`build_network.js`: strip
  `Karlovy Vary,`, `trim`, `toLowerCase`) + **veřejné číslo linky** (`route_short_name − 425000`).
- Pro rozlišení konkrétního patternu/varianty trasy: `headsign` + pořadí zastávek, ne pattern id.

**Proč:** JrUtil GTFS generuje `stop_id`/interní pořadí znovu při každém buildu ze zdroje — nejde
o regresi dat, ale o vlastnost zdroje. Kód, testy i guard, které na tato id spoléhají natvrdo,
selžou po každé další obnově, i když jsou data jinak v pořádku (viz `J8a` nález 23. 7. 2026 níže).

**Dopad na kód (řešeno J8-fix, 2026-07-23):**
- `build_network.js`: `COORD_OVERRIDES` klíčovaný normalizovaným názvem, aplikuje se JEN když
  zdroj GPS nemá (nikdy nepřepíše validní data).
- `verify_network.js`: pattern se dohledává přes `findPattern(net, line, fromName, toName)` /
  `findLoopPattern(net, line)`, žádné natvrdo `P50`/`P5`.
- `routing.test.js`/`journey.test.js`/`timetable.test.js`: odjakživa pracují přes názvy zastávek
  (`resolveStopId`), ne přes `S#` — nebylo potřeba měnit.

## Rizika a otevřené body (číst!)

- **Licence [k dořešení]** — před ostrým/veřejným nasazením ověřit podmínky užití GTFS z JrUtil / CIS JŘ
  (nejspíš open data, ale je třeba **potvrdit a uvést atribuci**). Spojenka svá data omezuje na nekomerční užití — nás se netýká (bereme JrUtil).
- **Data nejsou 100% ucelená** — 7 zastávek nemá ve zdroji souřadnice (`0,0`); doplňuje je
  `COORD_OVERRIDES` v `build_network.js` (klíč = normalizovaný název, ne `JDFS-` id — viz sekce
  „Stabilní vs. volatilní identifikátory" výše). Platnost `calendar` je široká, „co jede tento
  týden" se musí počítat z `calendar_dates`. Zbývá gap „na znamení" (viz výše).
- ✅ **VYŘEŠENO 2026-07-23 (J8-fix)** — dřívější nález (J8a test 23.7.): GTFS `stop_id` (`JDFS-xxxxx`)
  ani interní `S#`/`P#` nejsou stabilní mezi obnovami (ověřeno: Kpt.Jaroše `JDFS-10020`→`JDFS-3526`,
  `P50` linka 3→linka 9 po přečíslování). `COORD_OVERRIDES` překlíčován na název (viz sekce výše),
  `verify_network.js` odhardcodován přes `findPattern`/`findLoopPattern`. **Důkaz:** `update_data.js`
  spuštěný na živá čerstvá data proběhl end-to-end, guard 26/26 PASS, patterny se skutečně přečíslovaly
  (`P50`→`P206`, `P5`→`P120`) a testy i tak našly správné linky/spoje. J8b (auto workflow) teď dává smysl.
- **Varianty linek** — každá linka má víc směrů a odbočkových variant (např. linka 13 má větev na Lanovku Imperial
  i na Starou Roli-sídliště). Model musí umět víc „patternů" na linku, ne jeden.
- **Závislost na zprostředkovateli** — JrUtil je třetí strana (byť věrný převod CIS). Pojistka: přímo CIS JŘ / oslovit DPKV.
- **Zdroje jen na ruční kontrolu, NE jako data**: DPKV DIC portál (`dopravniportal.dpkv.cz`, interní API, ToS/CEDA licence),
  IDOS/Mapy (licence). Slouží k ověření „ukazuje appka totéž?", ne k tažení dat.
