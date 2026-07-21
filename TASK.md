# TASK.md — backlog projektu MHD KV „Jedeme MHD"

Živý dokument — Claude (manager) aktualizuje průběžně. Přeplánování zapiš s datem.
Detail v `docs/ROADMAP.md`, datová základna v `docs/DATA_SOURCES.md`.

## TEĎ (aktivní směr — od 19. 7. 2026): jádro A→B

| # | Úkol | Priorita | Stav | Pozn. |
|---|------|----------|------|-------|
| J1 | **Síťový model z KV GTFS** (stops + patterns + trips + services) | vysoká | ✅ HOTOVO 19.7. | `data/network.json` (62 KB gzip) + `scripts/build_network.js`. 23 linek, 157 zast./všechny GPS, 290 patternů |
| J2 | **Routing A→B** (přímé + 1 přestup) v JS | vysoká | ⭐ TEĎ | prototyp v `proto_routing.py`; přidat řazení (min přestupů → čas) + filtr dominovaných variant; **směrové** (headsign u výsledku) |
| J3 | **Časová vrstva** (nejbližší odjezd, čekání na přestup, půlnoc 51) | vysoká | čeká na J2 | aktivní dny přes `calendar`+`calendar_dates` (logika ověřena v buildu) |

**J2 — podúkoly (návrh 2026-07-21):**
- Modul routingu v JS nad `network.json`: helpery `stopsAfter(pattern, stop)`, `linesThrough(stop)`.
- Přímé spoje (B leží za A ve stejném patternu) + 1 přestup přes uzel (huby: U koníčka, Tržnice, Stadion ZM, Horní nádraží).
- Každý výsledek nese **konečnou (headsign)** každé nohy; **směrově** (ne protisměr).
- Dedup + řazení (min. přestupů → délka) + filtr dominovaných variant. **Zatím bez času** (topologie); čas = J3.
- **Test:** v Node proti `network.json` na hubech, namátkou proti JŘ DPKV.

**Test zpracování dat (viz `docs/DATA_SOURCES.md` → Test / QA):**
- `scripts/verify_network.js` = **jednorázový** sanity test po buildu (struktura, GPS, výluka Bohatice, směrovost). Doporučeno udělat spolu s J2.
- **opakovaný** regression guard v `update-data.yml` (prahy + pokles + validní JSON → jinak necommitovat). Součást J8.

## PŘÍŠTĚ (schválený směr)

| # | Úkol | Pozn. |
|---|------|-------|
| J4 | UI „Hledat spojení" (From/To) | nová obrazovka; **appka musí `network.json` fetchovat za běhu** (ne inline jako F1) |
| J5 | Poloha: klik do mapy / GPS / paste GPS → nejbližší zastávka | coords už v datech; mapa = zvážit Leaflet |
| J6 | Favourites = body 1–3 (domov↔centrum, ↔Západní, ↔nádraží) jako uložené dotazy | nahrazuje ruční F2 |
| J7 | Sloučení se starou appkou F1 / osud „odjezdové tabule" | rozhodnout |
| **J8** | **Automatizace obnovy dat** (GitHub Actions, bez lokálu) — návrh hotový, viz `docs/DATA_SOURCES.md` | staví se, až bude co aktualizovat (po J2–J4) |

**J8 — podúkoly (návrh 2026-07-21):**
- `scripts/update_data.js` — stáhnout JrUtil GTFS → filtr KV (stream `stop_times`) → `build_network.js`.
- `.github/workflows/update-data.yml` — denní cron + `Last-Modified` check + commit `network.json` + `workflow_dispatch`.
- **keepalive** proti 60dennímu auto-vypnutí (ověřeno).
- Zdroj: A=JrUtil GTFS (hlavní), B=CIS MHD JDF (záložní). GPS = statická, ne-prio.

## NEDOŘEŠENÉ / OTEVŘENÉ BODY (rizika)

| Téma | Co chybí / riziko | Stav |
|------|-------------------|------|
| **Licence dat** | ověřit podmínky užití + atribuci GTFS (JrUtil / CIS JŘ) před veřejným nasazením | [k dořešení] |
| **„Na znamení" GAP** | GTFS příznak nese jen linka 8; reálné (5, 19…) chybí → NEspoléhat na GTFS | rozhodnout v UI: ruční overlay / vynechat / jiný zdroj |
| **Náhlé výluky** | plánované (v CIS) data mají; „ode dneška" výluku ne → řeší periodicita obnovy | do J8 |
| ~~Neucelená data~~ | ~~7 zastávek bez GPS~~ — VYŘEŠENO 19.7. (všech 157 má GPS) | ✅ hotovo |
| Aktivní dny | počítat z `calendar`+`calendar_dates` (logika ověřena) | do J3 |
| ~~Varianty linek~~ | řešeno patterny+headsign (290 patternů) | ✅ v J1 |
| Směrovost odjezdů | odjezd/výsledek vždy „směrem ke konečné" (jinak mix směrů) | do J2/J4 |
| Přestup | čas na přestup / pěší dostupnost mezi označníky; huby: U koníčka, Tržnice, Stadion ZM, Horní nádraží | do J3/J5 |
| ~~.gitignore~~ | `data_raw/` NEcommitovat | ✅ přidáno 19.7. |
| Mapa v UI | Leaflet = 1. externí závislost (poruší „no-dep") → rozhodnout | do J5 |
| Stará appka | nechat F1 běžet, nebo přepsat na nový model? | do J7 |

**Testovací sada (huby od Joea, na ověření routingu J2):** U koníčka (Rozcestí u Koníčka), Tržnice, Stadion ZM, Horní nádraží.

## VARIANTY K ROZHODNUTÍ

| Otázka | Varianty | Doporučení | Rozhodnuto |
|--------|----------|------------|------------|
| Mapa v UI | Leaflet+OSM × zatím bez mapy (výběr/GPS/paste) | [ODHAD] v1 bez mapy, mapa v2 | ne |
| Osud staré appky | běží paralelně × sloučit do jádra | [ODHAD] sloučit, až jádro pojede | ne |

## Git automatizace (2026-07-21 — premisa opravena)

Cíl: zrušit ruční upload na GitHub, mít commit+push jedním krokem.
- **KOREKCE:** žádný lokální klon neexistuje. Pracovní složka `Documents\Claude\Projects\MHDKV` **není git repo** (chybí `.git`). F1 nahrán ručním web-uploadem. → „dvě složky" padá.
- **Reálná cesta:** udělat z TÉTO složky git repo (`git init` + remote na `BigJoeVibe/MHD-KV` + sladit s F1 na remote) → pak `scripts/deploy.ps1` (add/commit/push přímo tady). Předpoklad i pro J8 (Actions).
- **Jednorázový setup:** ověřit/nainstalovat Git for Windows, autentizace (Git Credential Manager / PAT), `git init`, `remote add`, `fetch` + sladit historii, `.gitignore` (data_raw/, MHD_test/ ven).
- **FINÁLNÍ ŘEŠENÍ (2026-07-21):** git dělá **Claude Code (executor) ve svém terminálu** — v rámci orchestrace v1 (dva agenti). Odpadá GitHub Desktop i ovládání přes obrazovku (Cowork computer-use nesmí psát do terminálu → proto tahle cesta).
- **Setup = KROK 0 v `handoff.md`:** `git init` v této složce → remote `MHD-KV` → `fetch` + `reset --soft origin/main` (adopce F1, bez konfliktu) → commit + push. Repo je přímo tato složka, žádný druhý klon.
- **Ongoing:** executor commitne po každém kroku; manager (Cowork) git nedělá.
- **Pozn.:** starý nedodělaný `.git` odstraněn; záloha v `_zalohy/2026-07-21_pre-git/`. Protokol dvou agentů v `CLAUDE.md` → „Orchestrace v1".

## HISTORIE / starší backlog

Původní fáze F2–F5 (zpáteční spoje, refaktor `data.json`, scraper, příměstské) jsou v `docs/ROADMAP.md`.
Původní F6 (vyhledávání A→B) je nově **předsazené jako jádro** (viz TEĎ). Rozhodnutí schéma verzí:
0.x = vývojové, 1.0.0 až appka pokryje širší cíl (17. 7. 2026).
Linka 9 v „Odjezdech" starého modelu — zvážit vyřazení (jezdí jinudy); v novém GTFS je celá síť tak jako tak.
