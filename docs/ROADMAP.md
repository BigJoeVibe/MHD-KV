# ROADMAP — MHD KV

Plán postupného rozvoje appky. Doporučená varianta: **C** (Hybrid: malé kroky, refaktor až bude bolet).

> Závazné je jen pořadí fází. Odhady jsou orientační (předchozí session) — překontroluj na konkrétní práci.

---

## ⚠️ REVIZE 2026-07-19 — nové těžiště

Po nálezu autoritativních dat (CIS JŘ → GTFS) se **předsazuje původní F6 (síť + vyhledávání A→B)** jako nové jádro.
Data řeší GTFS import (nahrazuje scraping F4). Priorita je teď:

1. **Jádro:** síťový model z KV GTFS + routing (přímé + 1 přestup) → časová vrstva. Viz `handoff.md`, `docs/DATA_SOURCES.md`.
2. UI „Hledat spojení" + poloha (klik/GPS) + favourites (= body 1–3).
3. Sloučení se starou appkou F1 / rozhodnout osud „odjezdové tabule".

Detailní backlog v `TASK.md`. Fáze F1–F6 níže = historický plán (obsah stále platný jako inspirace).

---

## J9 — Směrové pozice zastávek + navigace v uzlech (EPIC, založeno 2026-07-23)

**Proč:** GTFS zdroj má jen 1 bod na zastávku (a 7 zastávek dokonce `0,0` — dořešeno provizorně v H0).
Reálně ale řada uzlů má víc označníků fyzicky oddělených (Kpt. Jaroše ~90 m, KV aréna 3 body v trojúhelníku
~100 m). Bez **přesné pozice označníku podle směru/linky** nejde spolehlivě poradit „kam jít" ani nabídnout
pěší přestup mezi blízkými (ale ne totožnými) označníky. To je klíč k cíli „náhrada zastaralých oficiálních
nástrojů" (PID v Praze má schémata uzlů + přesné pozice + vykreslení trasy v mapě).

**Co epic zahrne (návrh, upřesní se vlastním briefem):**
- **Datový formát směrových pozic:** zastávka → {označník → poloha, linky, směr}. Ruční sběr (jako Joe
  udělal u Kpt. Jaroše 2 body / Mattoni 3 body dne 23.7. — uloženo jako první vstup).
- **Pěší přestup 30–200 m** (haversine + navádění), který teď v jádru VĚDOMĚ chybí (Předávka 1 řeší jen
  totožné body ≤ 30 m).
- **Vykreslení v mapě / schéma uzlu** (J5 souvislost) — puntíky označníků, trasa spoje.
- **Nejbližší označník k mé poloze** podle konkrétního směru (J5).

**Datové leady:**
- **DPKV interaktivní mapa** má přesné puntíky označníků s popisem (Dvory 1/2/3 + linka + směr), ale
  bez GPS exportu → **Joe zkusí oslovit DPKV** o data; když nepůjde, řešíme jinak (ruční / OSM / odečet z mapy).

**První krok epicu:** brief + návrh datového formátu + sběrový plán. **Neotvírat, dokud neběží J4 UI** (ať
je epic řízený reálnou potřebou, ne dopředu).

**Riziko:** vysoké na přípravu dat (ruční, hodně uzlů), nízké technicky. **Odhad:** dny (hlavně sběr dat).

---

## F1 — Opravit bugy + přidat zastávku Krátká

**Cíl:** Dostat aktuální data do správného stavu a rozšířit o třetí výchozí zastávku.

**Co se dělá:**
- Bug 1: linka 51 `holiday` (řádky 707–713 v `index_raw.html`) je doslova kopie `workday`. Nahradit reálnými daty z DPKV.
- Bug 2: linka 3 `weekend` (řádek 659) — opravit dle DPKV.
- Feature: přidat 4 nové `route` objekty pro odjezdy z Krátké (linky 3, 9, 15, 51).
- Feature: přidat CSS třídu `line-9` (barva pro novou linku).

**Detailní spec:** `F1_SPEC.md`
**Co Joe musí dodat:** `DATA_INTAKE.md`
**Odhad:** 30–60 min (po obdržení dat)
**Závislosti:** žádné
**Riziko:** nízké — jen úprava JS objektů a 1 CSS třídy

---

## F2 — Zpáteční zrcadlové spoje

**Cíl:** Přidat zpáteční směr (centrum → domů) pro všechny linky, které jdou z domu do centra.

**Co se dělá:**
- Pro každou ze 4+ existujících linek (po F1 bude až 8 routes) přidat zrcadlovou variantu z centra-zastávek (Tržnice, H. Nádraží, Lázně I západní) na výchozí (Borová, Okružní, Krátká).
- Vyřešit specialitu **linka 11 ↔ 13 na Horním Nádraží** — tyto linky se v zastávce H. Nádraží vzájemně „přejmenovávají" (jedna pokračuje jako druhá). V datech to reprezentovat jako dvě samostatné `route` se zmínkou v popisu nebo poznámce.
- Po F2 bude celkem ~16 routes.

**Co bude Joe muset dodat:** DPKV URL pro každý zpětný spoj (jiná stránka pro každý směr linky/zastávky).

**Otevřené otázky:**
- Z H. Nádraží — sedím na lince 11 nebo 13? Která linka odjíždí, která přijíždí?
- Z Lázně I západní — kterými linkami se vrátím domů?

**Odhad:** 1–2 h
**Závislosti:** F1 hotové
**Riziko:** střední — počet routes se zdvojnásobí, struktura se nafoukne, větší šance na překlep

---

## F3 — Refaktor `DATA.routes` z `index.html` do `data.json`

**Cíl:** Oddělit data od kódu — snazší údržba, příprava na F4 (automatizovaný builder).

**Co se dělá:**
- Vyjmout objekt `DATA` (řádky ~646–736 v `index_raw.html`) do nového souboru `data.json`.
- V `index.html` načítat data přes `fetch('./data.json')` na začátku skriptu, vše ostatní zachovat stejné.
- Notes mapu (`DATA.notes`) buď ponechat v JS, nebo přesunout do JSON (rozhodne se na místě).
- Otestovat na GitHub Pages (fetch ze stejné domény funguje, žádný CORS).

**Kdy:** Až bude `index.html` po F2 nepřehledný (~16 routes je hranice). Pokud bude pohoda, lze odložit.

**Odhad:** 30 min
**Závislosti:** F2 hotové (volitelně)
**Riziko:** nízké — refaktor bez funkční změny. Po commitu otestovat, že appka pořád funguje (cache busting?).

---

## F4 — Online builder (GitHub Actions cron + DPKV scraper)

**Cíl:** Automatizovat update dat z DPKV, žádný ruční copy-paste.

**Co se dělá:**
- Nový adresář `scripts/` v repu — Node.js skript (např. `update-data.js`):
  - Načte současný `data.json`
  - Pro každou `route` fetchne `dpkvUrl` (HTML stránku DPKV)
  - Parsuje HTML (tabulka hodin × minut + sloupce pracovní den / víkend / speciální) přes `cheerio`
  - Mapuje sloupce DPKV na naše typy dne (`workday` / `holiday` / `weekend`) — pozor na mapování
  - Zapíše nový `data.json`, commitne změny pokud se liší
- Workflow `.github/workflows/update-data.yml`:
  - Cron 1× týdně (např. neděle 04:00 UTC)
  - Spustí skript v Node.js Docker imagu
  - Commit a push zpět do `main` přes `GITHUB_TOKEN`
  - Pages se automaticky přerenderuje
- Fallback: pokud scraper selže (DPKV změnilo HTML), workflow shodí error notifikaci, data zůstanou stará. NIKDY nemazat existující data.

**Co je třeba zkontrolovat na začátku:**
- Strukturu DPKV HTML stránky (jak vypadá tabulka, jak se rozlišují typy dne, kde jsou poznámky S/š/P/D/L).
- DPKV mapping sloupců (jejich „pracovní den" vs. naše `workday`, atd.).

**Odhad:** 2–3 h (převážně psaní parseru)
**Závislosti:** F3 hotové (refaktor do `data.json`)
**Riziko:** střední — DPKV HTML může být inkonzistentní napříč linkami. Plánovat na test po jedné lince a postupně rozšiřovat.

**Free service:** GitHub Actions pro public repo má neomezené minuty. Žádný další účet ani API klíč.

---

## F5 — Příměstské linky (IDOK)

**Cíl:** Přidat příměstské autobusové linky (Karlovarský kraj) — ne MHD KV.

**Co se dělá:**
- Joe definuje seznam konkrétních linek (čísla + odkud/kam).
- Pro každou linku najít zdroj jízdního řádu na `idok.cz` (PDF nebo HTML).
- Ručně přepsat časy do `data.json` (PDF nelze automaticky parsovat spolehlivě).
- V UI rozlišit MHD vs. příměstské (např. nový `category: "regional"` v `route` objektu, vlastní barva nebo ikona).

**Odhad:** závisí na počtu linek (cca 15 min/linka při ruční práci)
**Závislosti:** F4 hotové (kvůli struktuře `data.json`)
**Riziko:** nízké — jen víc ruční práce. Pozor na aktualizaci 2× ročně (jaro/podzim platnost).

---

## F6+ — Kompletní MHD všechny linky + vyhledávání A→B

**Cíl:** Plnohodnotný jízdní řád celé MHD KV + vyhledávání spojení A→B napříč městem.

**Co se dělá (vysoká úroveň):**
- Datový model: každá linka má seznam zastávek na trase + časy na každé zastávce (ne jen výchozí).
- Nebo: stáhnout reálný GTFS, pokud do té doby Karlovarský kraj začne publikovat (zkontrolovat na `data.gov.cz`).
- UI: nová obrazovka „Hledat spojení" — From / To selector + výsledky.
- Algoritmus: jednoduché BFS přes graf zastávek + časů. Pro KV-rozsah (cca 100 zastávek) dostatečné.

**Pozn.:** Tohle je velký refaktor — možná stojí za to zvážit framework (např. Svelte / Preact) místo plain JS. Rozhodnutí až bude na řadě.

**Odhad:** dny
**Závislosti:** F4, případně F5
**Riziko:** vysoké — největší skok ve složitosti. Před zahájením udělat nový brief + varianty + plan.

---

## Co NEDĚLAT (záměrně mimo scope)

- **IDOS / Mapy.com scraping** — viz `DECISIONS.md`. Licenční problém a SPA s AJAXem (technicky obtížné).
- **Real-time data (zpoždění, poloha)** — DPKV nepublikuje a obejít to nelze.
- **Light theme / přepínač témat** — uživatel nechce.
- **Push notifikace** — mimo scope projektu.
- **Lokální Node.js builder** — uživatel nechce nic běžet lokálně (proto F4 přes GitHub Actions).
