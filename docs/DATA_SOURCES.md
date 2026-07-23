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

### A) Jednorázový test po buildu — `scripts/verify_network.js` [k dořešení, doporučeno k J1/J2]
Kontroly (spustit po `build_network.js`):
- **Struktura:** existují `stops`/`patterns`/`trips`/`services`; `meta.lines` obsahuje 23 linek.
- **Úplnost:** každá zastávka má jméno; kolik má GPS (očekáváno 157/157).
- **Integrita:** každý pattern má ≥2 zastávky a `off` stejné délky jako `stops`; každý trip odkazuje na `service_id`, který v `services` existuje.
- **Logika dne:** pro vzorové datum vrátí aktivní služby; známý spoj (linka 3 Krátká→Tržnice) má očekávaný řád odjezdů (všední hustě × sobota řídce).
- **Výluka:** `Bohatice,náměstí` = 0 spojů do 11. 9. 2026, ≥1 od 12. 9. 2026.
- **Směrovost:** odjezdy z Krátké směr Tržnice neobsahují protisměr (ne 05:30/05:54).

### B) Opakovaný test v obnově (J8) — regression guard PŘED commitem
Ve `update-data.yml` po buildu, ještě před commitem:
- **Prahy zdravé sady:** linky ≥ 20, zastávky ≥ 140, spoje ≥ 9 000 (jinak feed nejspíš ořezaný/rozbitý).
- **Nesmí spadnout o >X %** oproti předchozí verzi `network.json` (ochrana proti vadnému upstreamu).
- **`network.json` je validní JSON** a naparsuje se.
- Když guard selže → **NEcommituj** nová data a pošli upozornění (e-mail z Actions). Radši stará platná data než rozbitá nová.

## Rizika a otevřené body (číst!)

- **Licence [k dořešení]** — před ostrým/veřejným nasazením ověřit podmínky užití GTFS z JrUtil / CIS JŘ
  (nejspíš open data, ale je třeba **potvrdit a uvést atribuci**). Spojenka svá data omezuje na nekomerční užití — nás se netýká (bereme JrUtil).
- **Data nejsou 100% ucelená** — 7 zastávek nemá ve zdroji souřadnice (`0,0`); doplňuje je
  `COORD_OVERRIDES` v `build_network.js`, ale klíč **není stabilní** — viz níže.
  Platnost `calendar` je široká, „co jede tento týden" se musí počítat z `calendar_dates`.
  Zbývá gap „na znamení" (viz výše).
- ⚠️ **NOVÉ (zjištěno 2026-07-23, J8a test na reálném čerstvém stažení): interní GTFS `stop_id`
  (`JDFS-xxxxx`) NEJSOU stabilní mezi obnovami dat.** Test s daty z 22. 7. (proti dřívějším z 17.–18. 7.)
  ukázal, že stejná fyzická zastávka („Kpt.Jaroše", „Lázně I", …) dostala **jiné** `JDFS-` id.
  Důsledky:
  1. `COORD_OVERRIDES` klíčovaný `JDFS-` idčkem (H0/JH, 23.7.) se **rozbije při každé další obnově**
     — GPS override přestane sedět a `verify_network.js` nahlásí 7 zastávek s `0,0`. Ověřeno reálně:
     `update_data.js` guard toto správně zachytil a odmítl commit (funguje jak má), ale dokud se
     override nepřeklíčuje na něco stabilnějšího (např. `stop_name`), **automatická obnova (J8b) nikdy
     neprojde guardem**.
  2. Interní zkrácená id v `network.json` (`S0,S1,…` zastávky, `P0,P1,…` patterny) jsou přiřazována
     pořadím výskytu při buildu → **taky se mění mezi obnovami**. `verify_network.js` má natvrdo
     `P50` (linka 3) a `P5` (linka 12, smyčka) — po čerstvém stažení `P50`/`P5` odpovídaly úplně
     jiným linkám (9, resp. 1) a testy proto spadly. Není to regrese dat, je to křehkost testu.
  **Stav:** guard funguje správně (odmítl commitnout), ale J8b (auto-commit bez lidské kontroly) je
  blokované, dokud se toto nevyřeší — návrh a rozhodnutí u manažera. Detail v `TASK.md`.
- **Varianty linek** — každá linka má víc směrů a odbočkových variant (např. linka 13 má větev na Lanovku Imperial
  i na Starou Roli-sídliště). Model musí umět víc „patternů" na linku, ne jeden.
- **Závislost na zprostředkovateli** — JrUtil je třetí strana (byť věrný převod CIS). Pojistka: přímo CIS JŘ / oslovit DPKV.
- **Zdroje jen na ruční kontrolu, NE jako data**: DPKV DIC portál (`dopravniportal.dpkv.cz`, interní API, ToS/CEDA licence),
  IDOS/Mapy (licence). Slouží k ověření „ukazuje appka totéž?", ne k tažení dat.
