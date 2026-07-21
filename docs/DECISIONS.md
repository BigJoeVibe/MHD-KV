# DECISIONS — architektonická rozhodnutí

Co bylo rozhodnuto, proč, a co bylo zamítnuto. Tento dokument je pro to, aby další Claude nepřišel s návrhem, který už byl projednán a zamítnut.

---

## 🆕 Revize 2026-07-19 — přechod na síťový model + A→B vyhledávání

- **Nové jádro = síťový model (GTFS-like):** `stops` + `patterns` (linka × varianta × pořadí zastávek) + `stop_times`.
  Nahrazuje plochý „odjezdový" model pro funkci vyhledávání. Stará appka F1 běží dál na starém modelu, dokud se nesloučí.
- **Data:** CIS JŘ → GTFS (JrUtil), filtr na MHD KV. Viz `docs/DATA_SOURCES.md`. Souřadnice z GTFS (OSM jen záloha na díry).
- **Routing:** nejdřív přímé + 1 přestup (topologie), pak časová vrstva (nejbližší odjezd, čekání, půlnoc u 51).
  Rozsah KV je malý → stačí jednoduchý algoritmus, **plain JS zůstává**.
- **Zamítnuto jako zdroj (jen ruční kontrola):** DPKV DIC portál (interní API, ToS/CEDA), IDOS/Mapy (licence), realtime (není veřejné API).
- **Otevřená rizika:** licence GTFS, aktivní dny z `calendar_dates`, varianty linek. Detail `TASK.md` + `DATA_SOURCES.md`.

**Doplněno 2026-07-19 (po buildu `data/network.json`):**
- **Datový model finalizován** = `stops` + `patterns` (linka×směr×varianta, s `headsign`) + `trips` (start+service, odchylné mezičasy plně) + `services` (kalendář+výjimky). Skript `scripts/build_network.js`. Velikost 62 KB gzip.
- **Odjezdy/routing jsou SMĚROVÉ** (z A k B, ne „cokoli na zastávce") — jinak se mixují oba směry. Výsledek vždy nese konečnou.
- **Legenda F1 (zkrácené spoje, jiná konečná/trasa) = řešeno patterny + headsign**, ne písmenky.
- **Výluky/svátky/prázdniny = přes aktivní služby** (ověřeno na výluce Bohatice do 11. 9. 2026). Ruční `warnings` už netřeba pro plánované výluky.
- **GAP „na znamení":** GTFS ho nese nespolehlivě (v KV jen linka 8) → NEspoléhat; případný ruční overlay řešit až v UI. Detail `DATA_SOURCES.md`.
- **Korekce:** všech 157 zastávek MÁ GPS (dřívější „7 bez GPS" neplatí).

**Aktualizace dat 2026-07-21 (plán J8) — rozhodnuto:**
- **Běh na GitHub Actions** (runner = dočasná VM na serverech GitHubu, ne lokál). Potvrzuje starší volbu z F4. Zamítnuto (znovu): lokální běh, Cloudflare/Vercel cron (další účet navíc).
- **Trigger:** denní cron + porovnání `Last-Modified` zdroje → build jen při změně → commit `network.json` → Pages se nasadí. Detekce změny na konci i přes `git diff`.
- **Zdroj:** varianta A (JrUtil GTFS filtr) = hlavní; varianta B (CIS MHD JDF + konverze) = záložní pro nezávislost.
- **GPS = statická reference**, obnova ji neřeší (ne-prio).
- **60denní auto-vypnutí** scheduled workflow (ověřeno) → přidat **keepalive**.
- **Appka musí `network.json` fetchovat za běhu** (ne inline jako F1) — předpoklad J4. Detail `docs/DATA_SOURCES.md`.

---

## ✅ Co používáme

### Hosting: GitHub Pages
- **Důvod:** zdarma, automatické nasazení po commitu do `main`, žádný setup.
- **Doména:** `BigJoeVibe.github.io/MHD-KV` (default GH Pages doména).
- **Build:** žádný — pure HTML/CSS/JS, GH Pages servíruje rovnou.

### Single-file `index.html` (zatím)
- **Důvod:** příprava na drobné iterace, žádný build step, žádné dependencies. Příjemné pro amatérského autora.
- **Limit:** po F2 (~16 routes) se to stane nepřehledným. Pak refaktor do `data.json` v F3.

### Plain JS, žádný framework
- **Důvod:** appka je malá, nepotřebuje state management ani komponenty. Plain JS je čitelnější pro autora i pro budoucí editace.
- **Re-evaluace:** v F6 (vyhledávání A→B) zvážit lehký framework (Svelte / Preact), pokud bude UI složitější.

### Mobile-first, dark theme jen
- **Důvod:** Joe používá appku primárně na mobilu na zastávce. Tmavý theme šetří baterii na OLED a je čitelný v noci.
- **Zamítnuto:** light theme + přepínač — Joe explicitně nechce.

### Online builder (F4): GitHub Actions cron
- **Důvod:** Joe nechce nic běžet lokálně. GitHub Actions je free pro public repo, integrovaný do toho samého GitHubu, žádný další účet ani API klíč.
- **Plán:** Node.js skript v `scripts/`, parser DPKV HTML (cheerio), commit `data.json` zpět do repa.
- **Alternativy zamítnuté:**
  - **Cloudflare Workers Cron** — fungovalo by, ale vyžaduje další účet a komplikuje setup. GH Actions je jednodušší.
  - **Vercel Cron** — totéž, nový účet, navíc Vercel je primárně pro hostování (zbytečné, máme GH Pages).
  - **Lokální Node.js skript** — Joe nechce.

---

## ❌ Co bylo zamítnuto a proč

### IDOS.cz jako datový zdroj
- **Technický důvod:** IDOS je SPA. Pure HTML fetch vrátí jen UI šablonu, data se dotahují AJAXem z interního API. Bez headless browseru (Selenium/Playwright) data nedostaneš. To by znamenalo backend.
- **Licenční důvod:** IDOS provozuje CHAPS spol. s r.o., data jsou licencovaná. Scraping je proti smluvním podmínkám. CHAPS aktivně blokuje neoficiální klienty (rate-limit, captcha, IP banning).
- **Závěr:** IDOS lze používat manuálně pro lidskou kontrolu („ukazuje appka totéž jako IDOS?"), ale NE jako datový zdroj.

### Mapy.com jako datový zdroj
- **Technický důvod:** URL pro konkrétní spojení/zastávku je extrémně dlouhá. Data jsou taky AJAX.
- **Licenční důvod:** Seznam (Mapy.com) má smlouvy s dopravci, data nelze redistribuovat.
- **Závěr:** stejné jako IDOS — manuální kontrola ano, datový zdroj ne.

### GTFS feed — REVIDOVÁNO 2026-07-19 (dřív „neexistuje")
- **Původně (2026-05):** mělo se za to, že KV/DPKV/IDOK GTFS nepublikují.
- **Nově zjištěno:** DPKV data jsou (ze zákona) v **CIS JŘ** a dostupná jako GTFS přes projekt **JrUtil**
  (`data.jr.ggu.cz`, denní aktualizace). → **Přijato jako datová páteř** nového jádra. Detail: `docs/DATA_SOURCES.md`.
- **Důsledek:** původní F4 (scraping DPKV HTML) se nahrazuje importem/filtrem GTFS.
- **Riziko [k dořešení]:** před veřejným nasazením ověřit licenci a atribuci GTFS (JrUtil / CIS JŘ).

### Real-time data (zpoždění, poloha vozidla)
- **Důvod:** DPKV neprovozuje veřejné API. Žádný oficiální endpoint.
- **Závěr:** všechny odjezdy jsou plánové. Hotovo.

### Backend (server, databáze)
- **Důvod:** appka má jen 4–20 linek, pár desítek odjezdů na linku. Vše se vejde do JSON pod 100 KB. Backend = zbytečná komplikace, náklad, údržba.
- **Závěr:** static-only navždy. Update dat řeší GH Actions builder v F4.

---

## 🎨 Designová rozhodnutí

### Barvy linek (CSS `.line-X`)
- Stávající: linka 3 = tmavě modrá (`#1e4080`), linka 13 = vínová (`#8b2d42`), linka 15 = zelená (`#1a7a5a`), linka 51 = noční černá s růžovým textem.
- **Konvence pro nové linky:** tmavá barva s bílým textem, dobrá kontrast na pozadí `#0a0e1a` (--bg). Pro tematicky podobné linky podobný odstín (např. všechny noční = tmavé/fialové).
- **Konkrétní barvy pro nové linky (F1):**
  - **linka 9** — Joe zatím nezvolil. Návrh: oranžová `#c25e1a` (vizuální oddělení od stávajících), nebo nechat na Joeovi.
  - **linka 11** (F2) — návrh: tyrkysová `#1a7a8b` (komplementární k 13/15).

### Status koloráží (countdown)
- Méně než 15 min → růžovo-červená (`--urgent`)
- 15–30 min → oranžová (`--warning`)
- 30+ min → zelená (`--green`)
- Toto je pevné, neměnit.

### Mód „Teď" vs. „Jindy"
- „Teď" má modrý header, „Jindy" má fialový. Vizuálně rozliší, že příští odjezdy jsou simulované, ne real-time.
- Pulsing dot na status baru je jen v „Teď" módu (signalizace „živý čas").

---

## 🧩 Konvence kódu

### Žádné externí JS dependencies
- Pouze Google Fonts (Nunito + JetBrains Mono) přes CDN.
- Pokud potřebuješ knihovnu, projednej s Joeem **PŘED** přidáním. Příklad: `cheerio` v F4 builderu je OK (běží jen v Actions, ne v prohlížeči).

### Conventional commits
- `feat: přidána linka 9 z Krátké`
- `fix: oprava víkendových časů linky 3`
- `docs: doplněn DATA_FORMAT.md o pojmenování typů dne`
- `refactor: extrakce DATA do data.json`
- `chore: úprava GH Actions workflow`

### Před commitem
1. Otevři `index_raw.html` v prohlížeči (lokálně, double-click stačí).
2. Klikni přes všechny taby (Odjezdy / Jízdní řády / Nastavení).
3. V tabu Odjezdy přepni „Teď" / „Jindy" a zkus nastavit pár různých datumů (pracovní den, sobota, prázdninový den).
4. Pokud něco nesedí, OPRAV PŘED COMMITEM. Joe je amatér a hardcore debug Joea neukousne.

### Pojmenování souborů (mimo Git)
- Snapshoty před velkou změnou: `archive/YYYY-MM-DD_pre-{popis}/`
- Aktuální zdrojový soubor v repu: `index.html` (přepíše se při commitu)
- Lokální „skutečný zdroj" (Joeova kopie pro Clauda): `index_raw.html`
  - **POZOR:** `index.html` lokálně ve složce JE uložená GitHub viewer stránka (~900 KB), NE skutečný kód. Při editaci pracuj s `index_raw.html`.
