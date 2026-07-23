# Handoff — EXECUTOR spec (J8a: ruční `update_data.js` + regression guard)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-07-23).** Jádro A→B je HOTOVÉ (J1–J3 + JH zpevnění,
> `verify_network.js` 26/26 PASS). Teď **J8 — automatická obnova dat**, ve dvou předávkách:
> **J8a (TADY) = ruční skript + guard, otestovat lokálně.** J8b (příště) = GitHub Actions
> workflow (cron, Last-Modified, keepalive). Rozhodnutí Joe (23.7.): staged + denní kontrola.
> Archiv JH je v gitu a `changelog.md`.

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů níže, **nedělej nic nad zadání**
> (žádný `.github/workflows/…` — to je J8b). Git děláš ty. Malé kroky, kód jako **diff**,
> commit + testovací příkaz po každém dílčím kroku.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md`, `TASK.md` (sekce TEĎ), `docs/DATA_SOURCES.md` (celé — zdroj, filtr, guard),
   `scripts/build_network.js`, tento soubor.
3. **Před prvním commitem** commitni případné necommitnuté manager docs (`handoff.md`, `TASK.md`).

---

## Kontext dat (POTVRZENO v `docs/DATA_SOURCES.md`, neodvozovat znovu)

- **Zdroj:** `https://data.jr.ggu.cz/results/latest/JDF_merged_GTFS.zip` (~123 MB, GTFS celé ČR autobusy+MHD).
- **Filtr na MHD KV:**
  - dopravce DPKV = IČO 48364282 → `agency_id` začíná `JDFA-48364282`;
  - městská MHD = `route_short_name` ve tvaru `425xxx` (regex `^425\d{3}$`); veřejné číslo linky = číslo − 425000;
  - navázat `routes → trips → stop_times → stops` + `calendar` + `calendar_dates`.
- **`stop_times.txt` je ~1,38 GB → STREAMOVAT** (`unzip -p … stop_times.txt | filtr po řádcích`), NEnačítat celé do paměti.
- **Build:** `scripts/build_network.js` čte `data_raw/kv_gtfs/*.txt` → `data/network.json`. `COORD_OVERRIDES`
  (7 zastávek, JH) se aplikuje v buildu → chybějící GPS ve zdroji se automaticky opraví i po obnově.
- `data_raw/` je v `.gitignore` (do repa se commitne jen `data/network.json` + stavový soubor).

---

## KROK J8a-1 — `scripts/update_data.js` (nový skript, spustitelný ručně)

**Cíl:** `node scripts/update_data.js` stáhne aktuální GTFS, vyfiltruje MHD KV do `data_raw/kv_gtfs/`,
přestaví `data/network.json` a **před „schválením" ho prožene guardem**. Bez závislostí navíc (Node stdlib
+ systémový `unzip`/`curl`, které jsou na runneru i u tebe). Idempotentní, opakovaně spustitelný.

### Kroky skriptu
1. **Stáhnout** ZIP do dočasného adresáře (`data_raw/_tmp/` nebo `os.tmpdir()`), zapsat i zdrojový
   `Last-Modified`/velikost do stavového souboru (příprava pro J8b).
2. **Filtr (pořadí kvůli závislostem):**
   - `agency.txt` → `agency_id` začínající `JDFA-48364282` (množina).
   - `routes.txt` → routes s tímto `agency_id` **a** `route_short_name` matchujícím `^425\d{3}$` → `routeIds`.
   - `trips.txt` → trips s `route_id ∈ routeIds` → `tripIds` (+ posbírat `service_id`).
   - `stop_times.txt` → **STREAM**, nech jen řádky s `trip_id ∈ tripIds`; posbírej `stop_id`.
   - `stops.txt` → jen `stop_id ∈` posbíraných.
   - `calendar.txt` + `calendar_dates.txt` → jen posbírané `service_id`.
   - Zapiš vyfiltrované soubory do `data_raw/kv_gtfs/` (přepiš staré).
3. **Build:** zavolej `build_network.js` (spawn `node` nebo require) → `data/network.json`.
4. **Guard (KROK J8a-2)** — viz níže. Když PROJDE, nech nový `network.json`; když SELŽE, **vrať zpět**
   předchozí `network.json` (zálohu udělej před buildem) a skonči nenulovým exit kódem s důvodem.
5. Ukliď `_tmp/`.

**Pozn.:** ať filtr **nezahodí** 7 override zastávek (v filtrovaných datech budou dál `0,0`, správně —
opraví je až `COORD_OVERRIDES` v buildu; guard pak kontroluje výsledný `network.json`, kde nuly nejsou).

---

## KROK J8a-2 — regression guard (funkce v `update_data.js`, běží PŘED „schválením")

Postupně (z `docs/DATA_SOURCES.md` → Test/QA B):
- **Validní JSON:** `network.json` se naparsuje.
- **Absolutní prahy zdravé sady:** linek ≥ 20, zastávek ≥ 140, spojů ≥ 9 000 (jinak feed nejspíš ořezaný).
- **Relativní pokles:** oproti PŘEDCHOZÍ verzi `network.json` nesmí spadnout o **> 20 %** (linky/zastávky/spoje) —
  ochrana proti vadnému upstreamu. (Práh 20 % nech jako konstantu.)
- **`verify_network.js` musí projít celý** (spusť ho na nový `network.json`, vyžaduj „FAIL: 0"; jeho
  součástí je i `lat===0||lon===0` → FAIL z JH). Guard = zelené jen když projde i tohle.
- Výsledek guardu čitelně vypiš (co prošlo/spadlo). Při FAIL → rollback + nenulový exit.

---

## KROK J8a-3 — stavový soubor + drobný docs fix

- **Stavový soubor** (např. `data/data_source_state.json`): `{ lastModified, size, updatedAt, counts:{lines,stops,trips} }`.
  Commituje se do repa (J8b z něj čte „levný check", jestli se zdroj změnil). Teď ho jen vytvoř a plň.
- **Docs fix v `docs/DATA_SOURCES.md`:** řádky, co tvrdí „všech 157 má GPS / 7 bez GPS VYŘEŠENO" (ř. ~29, 48, 129),
  uveď na pravou míru: **zdroj 7 zastávek nemá (`0,0`), doplňuje je `COORD_OVERRIDES` v buildu (JH, 23.7.).**

---

## KROK J8a-4 — test (ruční, u tebe / na runneru s reálnou sítí)

- Spusť `node scripts/update_data.js`. Ověř: doběhne, `data/network.json` se přestaví, **guard projde**,
  `verify_network.js` je 26/26 PASS, a **7 override souřadnic je pořád správně** (ne `0,0`).
- Zkus i **negativní scénář guardu**: dočasně sniž práh nebo podstrč ořezaná data → ověř, že guard
  **NEcommitne** a udělá rollback (pak vrať zpět).
- Do `VÝSLEDEK` napiš: velikost staženého ZIP, počty po filtru (linky/zastávky/spoje), čas běhu,
  a že guard chytá rozbití.

**Commituj po dílčích krocích.** `data_raw/` se necommituje (gitignore); commituje se `update_data.js`,
`data/network.json` (jen když se reálně změnil), stavový soubor, docs fix.

---

## Mimo scope J8a (→ J8b, NEIMPLEMENTOVAT teď)
- `.github/workflows/update-data.yml` (cron `0 3 * * *`, `workflow_dispatch`, `GITHUB_TOKEN` contents:write).
- Levný `Last-Modified` check (přeskočit stahování, když se zdroj nezměnil) — J8a jen připraví stavový soubor.
- **Keepalive** proti 60dennímu auto-vypnutí scheduled workflow.
- Front-end fetch `network.json` za běhu = J4.

---

## VÝSLEDEK (vyplní executor)
_(sem executor po dokončení: co hotové, počty, čas běhu, jak testováno, problémy, nápady pro managera)_
