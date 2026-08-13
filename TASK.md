# TASK.md — backlog projektu MHD KV „Jedeme MHD"

Živý dokument — Claude (manager) aktualizuje průběžně. Přeplánování zapiš s datem.
Detail v `docs/ROADMAP.md`, datová základna v `docs/DATA_SOURCES.md`.

## TEĎ (aktivní směr — od 19. 7. 2026): jádro A→B

| # | Úkol | Priorita | Stav | Pozn. |
|---|------|----------|------|-------|
| J1 | **Síťový model z KV GTFS** (stops + patterns + trips + services) | vysoká | ✅ HOTOVO 19.7. | `data/network.json` (62 KB gzip) + `scripts/build_network.js`. 23 linek, 157 zast./všechny GPS, 290 patternů |
| J2 | **Routing A→B** (přímé + 1 přestup) v JS | vysoká | ✅ HOTOVO 21.7. | `scripts/routing.js` (+`routing.test.js`, `verify_network.js` 14/14 PASS). Směrové + headsign, dedup, Pareto filtr, huby v řazení. Zrevidováno managerem, pushnuto. |
| J3 | **Časová vrstva** (nejbližší odjezd, čekání na přestup, půlnoc 51) | vysoká | ✅ HOTOVO 23.7. | C `timetable.js` + B `journey.js` (`planJourney`), 20/20 PASS, ověřeno proti JŘ |
| JH | **Zpevnění jádra před UI** (data-integrita + robustnost routingu + řazení časem) | vysoká | ✅ HOTOVO 23.7. (Předávka 1) | H0+H1a-d+H2+H4 hotové, `verify_network.js` 26/26 PASS. Detail + otevřené TODO v `handoff.md` → VÝSLEDEK |

**J3 — postup (rozhodnuto 2026-07-22, C→B):**
- **KROK C — ✅ HOTOVO 23.7.:** `scripts/timetable.js` (`nextDepartures` ze zastávky k datu/času, směrově, noční 51) + `timetable.test.js` + 4 časové kontroly ve `verify_network.js` (18/18 PASS). Ověřeno proti reálnému JŘ DPKV (linka 3 08:27; linka 51 přes půlnoc 22:46/23:26/01:16/03:06). **Nález:** ~45 % spojů má vlastní `offs` (`trips[…][2]`) → čas počítat `trip[2] || pattern.off`.
- **KROK B — ✅ HOTOVO:** nový `scripts/journey.js` — `planJourney(net, A, B, opts)` nad `search()` + `timetable.js`: reálné časy, garantovaná návaznost přestupu (≥ minTransfer), přesah dne. Výstup = konkrétní časová spojení (**1A**).
  ⚠️ **Řazení tady původně stálo „podle odjezdu + celková délka jízdy (2B)", což si odporovalo s ř. 23 („rozhoduje celkový čas"). Rozpor způsobil chybu J4-sort. SJEDNOCENO 12. 8. 2026 — platí jediná věta:** *výsledky se filtrují odjezdovým oknem 90 min a stropy 75/40 min, uvnitř okna jdou nejdřív přímé spoje, pak přestupy, obojí chronologicky podle odjezdu.* Viz „J4-sort — ROZHODNUTO".
- **Varianty zadávání (motor staví B, UI/pozici řeší později):** čas **nejbližší teď × konkrétní datum+čas** = pro jádro jen jiný `date`+`nowMin` (dosadí UI, J4). Směr **z mé pozice → cíl × opačně** = prohození A↔B (jádro směrové, zadarmo). Poloha = zastávka/mapa/GPS → **J5**. Oblíbené/časté + tabule à la F1 → **J6/J7**.
- **Otevřená témata u B:** (1) předěl typu dne přes půlnoc = ŘEŠÍ B (2. noha k `date+1`); (2) svátky/prázdniny/víkend = aktivita každé nohy k jejímu datu; (3) letní/zimní čas = teď NEřešit, zapsat jako známé omezení; (4) min. přestup = ✅ **3–5 min** (default 3).

**JH — Zpevnění jádra (rozhodnuto 2026-07-23, pořadí B→J8→A přehodnoceno na: zpevnit → J8 → J4):**
- **Předávka 1 (⭐ TEĎ, spec v `handoff.md`):** H0 data-integrita (7 zastávek mělo GPS `0,0` — override v `build_network.js` + zpřísnění `verify_network.js`), H1 routing (zrušit topologický Pareto → o pořadí rozhoduje čas; 2 přestupy; smyčky; propojení totožných zastávek ≤ 30 m), H2 řazení podle času s přepínatelnými klíči pro budoucí UI filtry, H4 testy.
- **Rozhodnutí (Joe):** rozhoduje **celkový čas** (nejdřív odjezd, nejdřív příjezd), přestupy nízká priorita; default řazení podle odjezdu, ostatní klíče připravit pro UI; stavět robustně kvůli budoucím příměstským linkám.
  ⚠️ **PŘEKONÁNO 12. 8. 2026 (J4-sort).** „Robustně kvůli příměstským linkám" znamenalo, že motor neměl žádné domain limity a hledal, jako by KV byly Praha — odtud spoje za 200–900 min. Nově: limity **ano**, ale jako **parametry** (`windowMin` / `maxTotal` / `maxWait`), takže příměstské linky se vyřeší změnou čísel, ne logiky. Platná formulace řazení je v „J4-sort — ROZHODNUTO".
- **GPS override (Joe 23.7., mapy.cz)** — klíč = zdrojové `JDFS-` id, provizorní single-point (přesné směrové pozice → epic J9):
  Kpt.Jaroše `JDFS-10020` 50.225355,12.839125 (střed 2 označníků ~90 m) · Mattoniho nábřeží `JDFS-14283` 50.239712,12.889429 (2 MHD; příměstský 3. bod → J9) · Nádraží Dalovice `JDFS-16310` 50.255920,12.885421 · Na Pasece `JDFS-16311` 50.252510,12.882424 · Globus `JDFS-18345` 50.217823,12.806296 · Tesco `JDFS-32745` 50.226009,12.823021 · Lázně I `JDFS-36827` 50.219270,12.880980 (= poloha S116).
- **ODLOŽENO do epicu J9** (`docs/ROADMAP.md`): pěší přestup 30–200 m + směrové pozice označníků + navádění „kam jít" + mapa. Datový lead: **DPKV interaktivní mapa** má puntíky označníků s popisem (Dvory 1/2/3 + linka + směr) bez GPS exportu → Joe zkusí oslovit DPKV.
- **Předávka 1 — HOTOVO 23.7.:** 8 commitů (H0, H1a, H1b, H1c, H1d, H2, H4 + docs). `verify_network.js` 26/26 PASS (bylo 20/20). Detail v `handoff.md` → VÝSLEDEK.
- **Otevřené TODO z Předávky 1 (k naplánování, priorita na manageru):**
  1. Časová vrstva pro `transfers: 2` v `journey.js` chybí — `routing.js` `search()` umí topologický řetěz o 2 přestupech (H1b), ale `journey.js` ho zatím explicitně přeskakuje (nekombinuje s časy). Mimo rozsah H2.
  2. `maxTransfers: 2` je na dotaz mezi dvěma hustými huby pomalé (~700 ms, ~294 tis. topologických variant) — v pořádku jako opt-in „další možnosti" v UI, ne jako výchozí/eager dotaz.

**J2 — HOTOVO (2026-07-21):** `scripts/routing.js` (search + helpery, browser-safe), `routing.test.js`, `verify_network.js` (14/14 PASS). Nález+oprava: okružní patterny mají zastávku 2× → `indexOf` dával záporné `hops`, opraveno přes `stopsAfter`. Ověřeno proti JŘ DPKV (linka 3, 13). Detail v `handoff.md` → VÝSLEDEK.

**Test zpracování dat (viz `docs/DATA_SOURCES.md` → Test / QA):**
- `scripts/verify_network.js` = **jednorázový** sanity test po buildu (struktura, GPS, výluka Bohatice, směrovost). Doporučeno udělat spolu s J2.
- **opakovaný** regression guard v `update-data.yml` (prahy + pokles + validní JSON → jinak necommitovat). Součást J8.

## PŘÍŠTĚ (schválený směr)

| # | Úkol | Pozn. |
|---|------|-------|
| J4 | UI „Hledat spojení" (From/To) | **P1 ✅ HOTOVO** (tab Hledat, formulář, karty; moduly v prohlížeči přes IIFE — shared-scope kolize `resolveStopId`). Manager ověřil vizuálně na Pages. **J4-fix ✅ HOTOVO 3.8.**, ověřeno na Pages 4.8. (viz níže). **J4-sort ✅ + J4-sort-2 ✅ HOTOVÉ 12.8.** (viz níže). Zbývá **Předávka 2** (GPS poloha + doladění) — odsunuta za J7. |
| J5 | Poloha: klik do mapy / GPS / paste GPS → nejbližší zastávka | coords už v datech; mapa = zvážit Leaflet |
| J6 | Favourites = body 1–3 (domov↔centrum, ↔Západní, ↔nádraží) jako uložené dotazy | **splynulo s J7-P1** — `ROUTE_GROUPS` jsou uložené dotazy; zbývá jen ukládání mimo soubor (cloud) |
| J7 | Sloučení se starou appkou F1 / osud „odjezdové tabule" | **PŘEDSAZENO 12.8.** — P1 (Moje trasy) ✅ hotová, P2 (Tabule) nezadaná. Viz „J7 PŘEDSAZENO" níže |
| **J8** | **Automatizace obnovy dat** (GitHub Actions, bez lokálu) — viz `docs/DATA_SOURCES.md` | J8a + J8-fix + J8b nasazené; **⭐ J8-hotfix TEĎ** (první ostrý běh selhal — brittle kontroly v guardu, viz níže) |

**✅ J4-fix HOTOVO 3.8., OVĚŘENO NA PAGES 4.8.** (manager, vizuálně + v Node): noční hledání
Krátká→Tržnice ve 23:44 i denní scénáře (8:00, 15:30, 15:51, sobota 10:00) drží invariant
`arr > dep`, `total > 0`, `wait ≥ 0`. Žádná záporná doba jízdy, konzole bez chyb, „Jindy" i „Teď"
fungují. Regrese žádná.

**🟡 J7 PŘEDSAZENO — ROZHODNUTO 12. 8. 2026 (Joe). P1 ✅ HOTOVÁ, pushnutá a OVĚŘENÁ JOEEM na Pages
(12. 8.) — funguje včetně režimu „Jindy". ⭐ **P2 (Tabule) ZADANÁ 12. 8., spec v `handoff.md`.**

**P2 obsahuje tři věci:** tab `Tabule` (výběr zastávky → vše, co odtud jede, chronologicky),
**vlastní našeptávač** místo nativního `<datalist>` (použije se i v Hledat) a **sloučení
stejnojmenných zastávek**. Rozhodnutí Joea 12. 8.: našeptávač jednou pro obě místa, tabule
chronologicky (ne po linkách), duplicitní názvy ze zdroje nechat být.

🔴 **Nález managera (12. 8.) — „Lázně I" jsou v datech DVĚ zastávky se stejným názvem** na
identických souřadnicích (0 m): `S63` (24 patternů, linky 2, 11, 52) a `S143` (2 patterny,
**linka 20**). `resolveStopId` vrací jen `S63`, takže **linka 20 je z pohledu appky neviditelná**.
Jediný takový případ ze 156 názvů. P2 to řeší pro tabuli přes `resolveStopIds` + `boardDepartures`.
📌 **Stejnou slepou skvrnu má i Hledat** (zadáš „Lázně I" jako výchozí → linka 20 se neuvažuje).
Oprava sahá do routing jádra → **samostatná předávka**, do P2 se nepřidává.

---

## 🟢 J7-P2 — REVIZE MANAGERA HOTOVÁ (14. 8. 2026), NAVAZUJE POŘADÍ D → C → B

**Revize (manager, 14. 8., ověřeno vlastním během, ne jen čtením RESULTu):** všechny 3 test suity
exit 0, `verify_network.js` 20/20, `index.html` = `index_raw.html` (`diff -q`). `boardDepartures`
proti reálným datům vrací **řádek po řádku** referenční tabulku z `handoff.md` včetně
`10:05 linka 20 → Parkoviště KOME` — merge funguje. `resolveStopIds` kopíruje matching pravidlo
`resolveStopId` 1:1. `routing.js` / `journey.js` fakticky nedotčené (`git diff --ignore-cr-at-eol`
prázdný; „modified" u 15 souborů je CRLF artefakt mountu, ne změna obsahu). Žádné `localStorage`.
✅ **Nad rámec spec dobře:** `tick()` volá `renderBoardRows()`, ne `renderBoard()` — minutový tick
tak nezabije focus ani našeptávač při psaní. Spec to explicitně nepožadovala.

**Rozhodnutí Joea (14. 8.): pořadí dalších kroků `D → C → B`.**

| krok | co | proč v tomhle pořadí |
|---|---|---|
| **D** | slepá skvrna stejnojmenných zastávek **v routing jádře** (Hledat) | největší a nejrizikovější, sahá do `search()`; ať je za námi dřív než na ní staví C |
| **C** | volný text / diakritika při rozlišení zastávky | leží ve stejné vrstvě jako D, ale jde o UX rozhodnutí, ne o jádro |
| **B** | `KNOWN_LINE_CLASSES` — barevné odznaky linek | kosmetika, dotkne se 3 tabů naráz → až nakonec, na čistém základu |

**Nález managera k D (14. 8., přečteno v kódu):** `search()` v `routing.js` řeší co-located
sourozence **jen v přestupním uzlu** (`transferPoints`), výchozí a cílová zastávka jdou přes
`resolveStopId` → jedno id. `planJourney` navíc A/B předrozliší na id, takže expanze **podle názvu**
by se v `search()` už nechytila (`resolveStopIds` na id vrací jen to id). ⇒ oprava musí expandovat
**z id na stejnojmenná id**, ne z názvu. Detail a varianty ve specu (`handoff.md`).

**Nález managera k C (14. 8., ověřeno spuštěním):** `matchStopNames` je bez diakritiky, ale
`resolveStopIds` / `resolveStopId` diakritiku **vyžadují**. Naměřeno: `Krátká` → 3 spoje ·
`Kratka` → **0 spojů** · `lazne` → **0 spojů**. Když uživatel na mobilu napíše text bez diakritiky
a klepne mimo (nevybere z našeptávače), tabule zobrazí `Dnes už odsud nic nejede.` — **což je lež**.
Stejná díra je v Hledat.

**Nález managera k B (14. 8., ověřeno spuštěním):** `KNOWN_LINE_CLASSES = new Set(['3','9',…])` je
Set **stringů**, ale `row.line` / `leg.line` z `network.json` je **number** → `.has()` nematchne
nikdy (naměřeno 0 z 10 řádků). 3 call sites: `index_raw.html` ř. 1022 (Moje trasy), 1199 (Tabule),
1321 (Hledat). Chyba je **pre-existující**, ne z J7-P2 — executor ji našel a záměrně neopravil, aby
nezasáhl 3 taby mimo rozsah předávky. Oprava = `String(line)` nebo Set čísel; **vizuálně změní tři
obrazovky naráz**, proto samostatný krok.

📌 **Drobnosti k ověření na telefonu (manager, 14. 8.), zatím bez zadání:**
(a) `z-index` našeptávače je **20**, sticky hlavička **100** a tab bar **99** → při odscrollování
může rozbalený seznam podlézt lištu tabů; (b) fokus do pole, které už hodnotu má (Tabule, `Krátká`),
hned otevře nabídku a překryje odjezdy; (c) prázdný stav nerozlišuje „konec provozu dnes" ×
„neznámá zastávka" (souvisí s C).

📌 **Kořenová příčina k rozhodnutí (mimo scope D/C/B):** `TASK.md` ř. 236–237 už zmiňuje, že
„Lázně I" má ve zdroji dva **různě pojmenované** záznamy (`Karlovy Vary,Lázně I` × `Lázně I` bez
prefixu). To je pravděpodobně kořen celého rozdvojení — D/C jsou léčba symptomu v appce, čistší by
bylo sjednotit už v `build_network.js`. Stojí za rozhodnutí dřív, než se na `resolveStopIds` navěsí
další logika.

---

**Manager ověřil po předávce (12. 8.):** `journey.test.js` všechny scénáře PASS, `verify_network.js`
20/20, `index.html` = `index_raw.html`, karty vracejí správná data (Okružní→Tržnice 10:00 samé přímé,
Krátká→Horní nádraží 4 řádky s přestupem). Naměřeno executorem 2541 → 690 ms, výstup byte-identický —
sedí na manažerskou pre-check (2509 → 681 ms).

**K posouzení Joem** (executor označil, nejsou to chyby): umístění přepínače `Tam`/`Zpět` vlevo od
názvu skupiny · podřádek přestupu je sdílený s tabem Hledat včetně `(stejné místo)` — spec naznačoval
kratší text, executor zvolil shodu obou míst · nevyužité CSS `.timetable-*` a `.dpkv-link` ponechané.

📌 **Nové z předávky:** `journey.js` nově exportuje i vnitřní funkce (`buildItineraries`,
`mergeDuplicates`, `applyCaps`, `paretoFilter`, `SORTERS`) kvůli testu ekvivalence před/po ořezu —
stejná konvence jako `routing.js`. Veřejné chování beze změny.

**Spouštěč:** tabule ukazovala příjezd 1:28, reálně 1:30. Stará F1 data mají jednu konstantu
`travelMinutes` na celou linku; u 51 je tam 12, ale Okružní → Tržnice trvá reálně 14 min. Prověřeno
u všech 5 starých linek: 3, 13, 15 sedí; **51 má +2 min**; **linka 9 z Krátké na Tržnici podle GTFS
vůbec nejede** (potvrzuje starší poznámku „jezdí jinudy"). Dva datové modely vedle sebe = tyhle
rozpory budou vylézat dál → migrace.

**Cílový stav:** taby `Moje trasy` · `Tabule` · `Hledat` · `Nastavení`. Jízdní řády **pryč**,
sekce „Sledované linky" v Nastavení **pryč**.

- **P1 (zadáno) — Moje trasy:** skupiny pojmenované Joem, každá obsahuje páry zastávek; jedna karta
  na pár, styl jako dnešní odjezdové karty (linka, odjezd → příjezd, doba jízdy, přestup, barevný
  odpočet s minutovým updatem). Vlevo nahoře u skupiny přepínač `Tam` / `Zpět`, který prohodí všechny
  páry. Data z `network.json` přes nový `planBoard()`. **Tímhle vzniká i J6 (oblíbené).**
- **P2 (později) — Tabule:** vybereš zastávku, uvidíš vše, co odtud jede, se směrem. `nextDepartures()`
  to už umí, je to hlavně UI.

**Rozhodnutí (Joe, 12. 8.):**
- Uložení tras: **natvrdo v souboru** (`ROUTE_GROUPS`), cloud/localStorage později.
- První skupina: **Domov–Centrum** = Krátká → Tržnice, Okružní → Tržnice. Horní nádraží až po zjištění,
  co tam reálně jezdí.
- **Odchylka přestupu od přímé linky: +10 min**, platí pro oba směry. Když přímý spoj neexistuje
  (Krátká → Horní nádraží), přestupy se zobrazí bez porovnání — jinak by karta byla prázdná.
- **Při shodném odjezdu i příjezdu vyhrává varianta s méně přestupy** (nález managera: `15` a
  `15→12 @Pivovar` obojí `10:14 → 10:26` — druhý řádek je k ničemu).
- Nastavení: sekce „Sledované linky" smazat.

**Výkon — nález a ověřený fix (manager, 12. 8.):** jeden `planJourney` stojí **~495 ms**, šest karet
**~2510 ms** (topologie `search()` je jen 6–12 ms, zbytek je časová vrstva). Příčina: itineráře se
staví pro celý den a teprve pak se filtruje okno. **Fix = ořez podle `nowMin + windowMin` už při
stavbě** → naměřeno **2509 → 681 ms** a výsledky `JSON.stringify`-identické. Žebřík rozšíření okna
musí build **zopakovat** s širší hranicí, ne filtrovat hotový seznam.

📌 **Legenda zkratek — proč ji nemigrujeme:** písmena `L`/`T`/`X`/`P` (jede jen do…, nestaví v…) jsou
v novém modelu **redundantní** — nese je konečná a vlastní pattern každého spoje. Zůstávají jen dvě
informace: `s` = školní spoj (je v kalendáři, ale nezobrazuje se) a `D`/`A` = „pokračuje jako linka
11/15". To druhé je mimochodem **potvrzení heuristiky `throughService`** — legenda DPKV u linky 13
říká doslova „z Horního nádraží pokračuje jako linka 11". Ruční overlay pro tyhle dvě věci
**zatím neděláme**, zapsáno jako otevřený bod; výluky jsou bezpředmětné (jediná v datech vypršela 30. 6.).

📌 **`DATA.routes` zůstane v souboru jako mrtvý kód** až do konce P2 — kvůli bezpečnému návratu.

---

**✅ J4-sort-2 — ROZHODNUTO 12. 8. 2026 večer (Joe) po živém testu, HOTOVO a pushnuto (commit `aee8ea3`).**

J4-sort je nasazený a funguje dle zadání, ale Joeův test (11:21, Okružní → Tržnice) odhalil
dvě chyby v samotném zadání:

- **Chyba A — `minTransfer: 3` zahazuje průjezdné spoje.** Spoj `11:42 → 11:55 | 13→11 @Horní nádraží |
  čekání 0` v hledání vůbec nebyl, přestože v Odjezdech je. Linka 13 na Horním nádraží končí, linka 11
  tam začíná — bus fakticky pokračuje pod jiným číslem.
- **Chyba B — pravidlo „přímé napřed" je špatné.** Ten spoj odjíždí dřív (11:42 × 11:54) **i** přijíždí
  dřív (11:55 × 12:06) než první přímý, a přesto by skončil pod všemi přímými. **Rozhodovat musí čas,
  kategorie až při shodě.** → zavádí se **Pareto filtr** (zahoď variantu, ke které existuje jiná, co
  odjíždí stejně/později a přijíždí stejně/dřív) + chronologické řazení.

**Zjištění k datům (manager, 12. 8.):** GTFS `block_id` (standardní pole „vůz pokračuje") je **prázdné
u všech 10 151 spojů** → průjezdnost se z dat vyčíst nedá. Změřeno na 280 dotazech: přestupů s čekáním
0–2 min je 89, z toho **8 (9 %) průjezdných** (konečná + výchozí) a **81 (91 %) uprostřed trasy**
(`6→12 @Tržnice 0 min`, `19→22 @Elite 1 min`) — ty jsou reálně nechytatelné.

**ROZHODNUTÍ (Joe, se znalostí toho čísla): `minTransfer` plošně na 0.** Zdůvodnění: osobní appka,
parametr je jednořádkový návrat, těsné případy se vyhodnotí, až přibude GPS a dochozí vzdálenosti
(J5 / J9). Heuristika „konečná + výchozí" se **nepoužije jako filtr**, jen jako příznak
`throughService` pro popisek v kartě (`Přestup: … · bus navazuje okamžitě` × `čekání 0 min — velmi těsné`).
Popisek záměrně netvrdí „stejný vůz" — to z dat nevíme.

**Vedlejší efekt k pozorování v provozu:** v neděli 14:00 (Stará Role → Lázně I) je nově první výsledek
`14:01 → 14:29, přestup 15→2 @Tržnice, čekání 0` — přesně ten typ, který Pareto vytáhne nahoru, protože
je nejrychlejší. Tohle je materiál pro rozhodnutí u J5/J9.

📌 **Nedořešeno:** průjezdný spoj, který mění číslo linky **uprostřed trasy** (ne na konečné), příznak
`throughService` nenajde. Jestli takový v KV existuje, z dat nezjistíme — ukáže až test v terénu.

---

**✅ J4-sort — ROZHODNUTO 12. 8. 2026 (Joe), HOTOVO a pushnuto 12. 8. (executor).**

**Pravidla malého města** — motor dostane domain limity, protože KV nejsou Praha:

1. **Odjezdové okno 90 min** — zobrazí se, co odjíždí do 90 min od času hledání (Joeovo pojmenování,
   používat i v UI). Když v okně nic není, žebřík rozšíření `90 → 240 → bez omezení` a UI to řekne
   („Nejbližší spoj až v 09:44"). Žebřík řeší i noc — přímý noční 51 z Krátké je ve 23:44 přesně
   91 min daleko, tj. o minutu mimo základní okno.
2. **Uvnitř okna: nejdřív přímé spoje, pak přestupy**, obojí chronologicky podle odjezdu
   (nový `SORTERS.smart`). Přestup je alternativa, ne rovnocenná varianta.
3. **Strop celkové doby jízdy 75 min**, **strop čekání na přestupu 40 min**. Vše jako parametry.
4. **Sloučení identických jízd** do jedné karty s výčtem přestupních zastávek.
5. **Řazení podle `arrival` se NEPOUŽIJE** jako default (bylo v úvahách 12. 8.) — s odjezdovým oknem
   ztrácí smysl. `SORTERS.arrival` v kódu zůstává pro budoucí přepínač v UI.

**Podklad k limitům (měření managera 12. 8., 104 náhodných dvojic zastávek, pondělí 8:00):**
přímý spoj medián 10 / p90 18 / **max 22 min**; s přestupem medián 26 / p90 41 / **max 52 min**.
→ Nejhorší reálná jízda po KV je 52 min, strop 75 min má rezervu a neuřízne nic reálného.

**Sloučení duplicit — proč a pozor na klíč:** linky jedoucí kus trasy společně generují N identických
výsledků lišících se jen přestupní zastávkou. Příklad z dat: Stará Role → Lázně I, neděle 14:26 →
třikrát `3→2`, všechny `14:26 → 15:09`, přestup Tržnice × Stadion ZM × Nemocnice. Je to **jedna jízda**
(stejný autobus 3, stejný autobus 2), jen s volbou, kde přesednout — a tři identické karty vytlačí
ze seznamu reálné alternativy. ⚠️ Klíč **nesmí** obsahovat časy jednotlivých nohou (jiná přestupní
zastávka = jiná minuta nástupu do druhého autobusu → nesloučí se); správný klíč je
`depMin | arrMin | posloupnost linek`. Manager na tom naletěl při přípravě ukázky.

---

**Původní nález (4. 8. 2026), pro kontext — jak to vypadalo před rozhodnutím:**
Jádro počítá správně, ale **pořadí výsledků dělá appku v noci zavádějící**. Konkrétně (noc 3.8. 23:44,
Krátká→Tržnice, `sort: 'departure'`, `limit: 8`): uživatel vidí 8 variant za 328–405 min s čekáním na
přestupu 309–388 min, zatímco **přímý spoj linky 51 v 01:15 → 01:30 (15 min) je až 23. v pořadí** a do UI
se vůbec nedostane. V seznamu jsou i varianty s čekáním **1199 min (20 h)**. Denní provoz zasažen mírně
(v 8:00 se do TOP 5 dostala varianta `08:06 → 20:06`, 720 min).
- **Příčina:** `SORTERS.departure` v `scripts/journey.js` řadí **primárně podle `depMin`**; `totalMin` je
  až rozstřel při shodě. V noci mají všechny špatné varianty shodný odjezd (23:51), takže rozstřel
  rozhoduje jen mezi špatnými. Žádný strop čekání (`maxWait`) neexistuje. UI volá `sort: 'departure',
  limit: 8` (`index_raw.html` ř. 1130).
- **⚠️ Rozpor v zadání (proto to vzniklo):** ř. 23 výše říká „rozhoduje **celkový čas**", ř. 17 říká
  „řazení **podle odjezdu** + celková délka jízdy (2B)". Implementace sedí na ř. 17. **Po rozhodnutí
  přepsat na jednu jednoznačnou větu**, ať se to nezopakuje.
- **Změřeno (manager, 4.8., jen čtení — do kódu nezasaženo):** čisté řazení podle délky (`duration`) je
  **horší** — v 8:00 nabídne spoj ve 21:14, protože nejkratší jízda je nejkratší kdykoli. Řazení podle
  **příjezdu (`arrival`)** vychází nejlépe ve všech testech, protože implicitně trestá i pozdní odjezd
  i dlouhé čekání:

  | scénář | dnes (`departure`) | `arrival` |
  |---|---|---|
  | noc 23:44 | 23:51 → 5:19 (328 m) | **1:15 → 1:30 (15 m, přímo)** |
  | den 8:00 | 8:06 → 8:37 (31 m) | **8:13 → 8:26 (13 m, přímo)** |
  | den 15:30 | 15:30 → 15:43 (13 m) | beze změny |

  V nočním TOP 8 podle `arrival` už není nic absurdního (nejdelší čekání 130 min místo 1199).
- **Varianty:** (A) jen `maxWait` filtr + fallback pro hluchá období · (B) přepnout default na `arrival`
  (jednořádková změna v `index_raw.html` + kopie do `index.html`) · (C) A+B + zpřísnit dedup.
  **Doporučení managera:** B jako první krok, dedup samostatně; `maxWait` po B nejspíš není potřeba.
- **Otevřené i po rozhodnutí:** duplicitně vypadající karty — `itineraryKey` je `linka:časOdjezdu` per
  noha, takže **tentýž spoj s nástupem na jiné přestupní zastávce** (Školní × Stará Role) projde jako dvě
  karty se stejnými časy i linkami. Pro uživatele šum. Řešení = rozšířit klíč (pozor: agresivní dedup může
  spolknout skutečně odlišnou variantu → chce test).
- 📌 **Mimo scope, low-hanging fruit pro J4 P2:** `planJourney` už `opts.sort` umí → přepínač řazení
  v UI je levný.

**🔴 J8-hotfix (2026-08-02) — první ostrý scheduled běh SELHAL (guard zablokoval zdravá data):** příčina není v datech (25/26 PASS), ale v `verify_network.js` — sekce „Robustnost routingu (H1)" testuje **chování kódu** navázané na konkrétní snímek. Spadlo `H1c` (smyčka linky 12 Pivovar→Trznice: nový build tu trasu jako smyčku nemá → `FAIL`). Kód (`forwardSegments`) je správně. Druhá časovaná bomba: kontrola výluky Bohatice s natvrdo daty `20260901`/`20260915` (spadne po 12.9.). **Web běží dál na starých datech (rollback OK).** Fix (spec v `handoff.md`): guard = jen build-invariantní kontroly; H1a–d přesunout do `routing.test.js` (tolerantně, smyčku hledat dynamicky), nahradit 1 tolerantním smoke testem `planJourney(Krátká→Tržnice)`, odhardcodovat výluku na obecný invariant, audit zbytku. Princip zapsat do `docs/DATA_SOURCES.md`.

**J8a — HOTOVO 23.7.:** `scripts/update_data.js` — stáhne aktuální GTFS, vyfiltruje MHD KV, streamuje
`stop_times.txt` (~1,38 GB), zavolá `build_network.js`, prožene guardem (validní JSON + prahy
linky≥20/zast≥140/spoje≥9000 + pokles ≤20 % + `verify_network.js` celý PASS → jinak rollback +
nenulový exit). Otestováno end-to-end na reálném čerstvém stažení (22.7. data) — viz `handoff.md` → VÝSLEDEK.

**✅ VYŘEŠENO 23.7. (J8-fix) — NÁLEZ z reálného testu J8a — GTFS interní id nejsou stabilní mezi
obnovami:** čerstvé stažení (22.7.) proti staršímu (17.–18.7.) ukázalo, že `stop_id` (`JDFS-xxxxx`)
téže fyzické zastávky se mezi obnovami **mění**. Důsledky:
1. `COORD_OVERRIDES` v `build_network.js` (klíč = `JDFS-` id, JH/H0 23.7.) se rozbije při každé další
   obnově → 7 zastávek spadne zpět na `0,0` → guard to správně zachytí a odmítne commit, ale
   **automatický běh (J8b) tak nikdy neprojde bez zásahu**. Návrh opravy: rekeyovat override na
   `stop_name` (stabilnější) — potřebuje rozhodnutí, protože „Lázně I" má ve zdroji 2 různě
   pojmenované záznamy (`Karlovy Vary,Lázně I` × `Lázně I` bez prefixu) a je nutné to vyřešit korektně,
   ne overridovat obě.
2. Interní zkrácená id v `network.json` (`S#` zastávky, `P#` patterny) jsou přiřazována pořadím
   výskytu při buildu → nejsou stabilní mezi obnovami. `verify_network.js` má natvrdo `P50` (dřív
   linka 3), `P5` (dřív linka 12 smyčka) — po čerstvém stažení odpovídaly jiným linkám (9, resp. 1) a
   testy proto spadly (FAIL 3×). **Není to regrese dat**, je to křehkost testu vůči přeindexaci.
   Návrh opravy: resolvovat testovací pattern přes (linka, headsign, zastávky), ne přes natvrdo `P#`.
**ROZHODNUTO (Joe 23.7.): varianta (a) — opravit.** → **J8-fix HOTOVO 23.7.** (`handoff.md` → VÝSLEDEK):
`COORD_OVERRIDES` překlíčován na normalizovaný název (aplikuje se jen když GPS chybí, „Lázně I" se
2 záznamy vyřešeno korektně — validní se nepřepíše); `verify_network.js` odhardcodován přes
`findPattern`/`findLoopPattern` (linka + název); trvalé pravidlo v `docs/DATA_SOURCES.md`; **důkaz
proveden:** `update_data.js` na živé čerstvé stažení prošel end-to-end (guard 26/26 PASS, 57,9 s),
patterny se reálně přečíslovaly a dohledání je i tak správně našlo — commitnut i přestavěný
`network.json` (23 linek/157 zast./290 patternů/10 151 spojů).

**📌 BUDOUCÍ — Vlastní stabilní id zastávek (registr / mini-DB), váže se na J4/J6 (zapsáno 23.7.):**
- **Kontext:** zdrojové `JDFS-` i interní `S#`/`P#` jsou per-build volatilní (viz J8-fix). Pro jádro/obnovu
  to vyřešeno name-keyingem. **Ale** až budeme persistovat uživatelská data — **oblíbené (J6)**, sdílené
  odkazy / deep-linky na spojení (**J4**) — nesmí viset na volatilních id ani čistě na názvu (přejmenování,
  normalizované kolize typu „Lázně I").
- **Nápad:** vlastní registr / mini-DB v repu `stabilní klíč → náš pevný KV-id`, mapovaný při buildu; appka
  i uložené dotazy pak drží náš KV-id, ne zdrojové/interní.
- **Kotva = GPS poloha, ne text** (rozhodnutí směru, Joe 23.7.): poloha je jazykově nezávislá a stabilnější
  než název. Pozor na: zastávky bez GPS (`0,0` → řešeno override), 2 označníky/uzly (→ epic **J9** směrové
  pozice), drobné posuny souřadnic mezi obnovami (párovat s tolerancí).
- **Rozhodnout až u J4/J6.** Teď netřeba — name-keying pro J8 stačí. „Uvidíme, jak to bude fungovat" (Joe).

**✅ J8b HOTOVO 23.7.** (rozhodnuto Joe 23.7.: **auto-commit rovnou do `main`**, guard = ventil místo
člověka, + **denní cron `0 3 * * *` UTC**): J8b-1 Last-Modified pre-check + `--force` v `update_data.js`
(otestováno 3× lokálně — skip/force/skip); J8b-2 `.github/workflows/update-data.yml` (cron +
`workflow_dispatch` s FORCE, `permissions: contents:write`, commit jen při změně); J8b-3 keepalive
proti 60dennímu vypnutí (spouští se jen když datový krok nic necommitnul a poslední commit je
≥50 dní starý); **J8b-4 ověřeno na reálném GH Actions runneru** (Joe spustil ručně, Success 42 s,
commit `b43ad7f` proběhl — jen bump `data_source_state.json`, `network.json` beze změny, protože
zdroj se nezměnil od dřívějšího lokálního běhu téhož dne). Detail v `handoff.md` → VÝSLEDEK.
📌 **Nedořešeno:** licence GTFS (atribuce) = must-do před veřejným/ostrým během (viz níže „NEDOŘEŠENÉ").
📌 **Drobný nápad (kosmetický, nezablokoval běh):** `update-data.yml` používá `node-version: '20'`,
GitHub log hlásí deprecation warning (runner vynuceně použil Node 24) — zvážit bump na `'22'`/`'24'`.

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
| Předěl typu dne u přestupu | přestup přes půlnoc → 2. noha jiný kalendářní den/typ dne (svátek/prázdniny/víkend); počítat aktivitu k datu každé nohy | do J3-B |
| Letní/zimní čas | 2×/rok předěl (ne v III/X); kolem 02–03:00 chybějící/dvojitá hodina — ověřit dopad na `startMin` a nejbližší odjezd | do J3-B |
| ~~.gitignore~~ | `data_raw/` NEcommitovat | ✅ přidáno 19.7. |
| Mapa v UI | Leaflet = 1. externí závislost (poruší „no-dep") → rozhodnout | do J5 |
| **Docházka do celkové doby** (Joe 12. 8.) | až bude GPS (J5), přibude čas „než dojdu na zastávku, odkud mi to jede" → **celková doba jízdy se prodlouží** a strop 75 min začne měřit něco jiného. Rozhodnout, jestli se docházka započítává do stropu, nebo se vede zvlášť. Váže se na J9 (pěší přestupy 30–200 m). | do J5 |
| **Asymetrie přímé × přestupy** (nález managera 12. 8.) | `directItineraries` zahodí odjezd před `nowMin` (kromě nočního okna), zatímco `transferItineraries` posouvá o `+1440` → v hluchých obdobích se nabídnou zítřejší přestupy, ale ne zítřejší přímé spoje. Filtry J4-sort to zamaskují, **neopraví**. | samostatný fix po J4-sort |
| **Večerní/víkendová tolerance okna** (Joe 12. 8.: „ještě doladíme") | 90 min je laděné na denní provoz; večer a o víkendu jezdí řidčeji. Po nasazení J4-sort proměřit a případně zvednout — jde jen o čísla parametrů, ne o logiku. | po J4-sort, dle testu |
| **Slepá skvrna `resolveStopId` u stejnojmenných zastávek** (nález managera 12. 8.) = **krok D** | „Lázně I" = 2 id; `resolveStopId` vrací jen první → **Hledat ignoruje linku 20**. J7-P2 to řeší jen pro tabuli (`resolveStopIds`), oprava v routing jádře je samostatná předávka. Pozor na dopad na `search()` a Pareto — víc výchozích id znamená víc variant. | ⭐ **ZADÁNO 14. 8.**, spec v `handoff.md` |
| **Volný text a diakritika při rozlišení zastávky** (nález managera 14. 8.) = **krok C** | `matchStopNames` je bez diakritiky, `resolveStopId(s)` ji vyžaduje → `Kratka` i `lazne` vrátí **0 spojů** a tabule zobrazí `Dnes už odsud nic nejede.`, což je lež. Dvě cesty: (1) fallback bez diakritiky v rozlišení (příjemnější), (2) nepotvrzený text = hláška „Zastávku vyber ze seznamu" (bezpečnější). ⚠️ **NEměnit `normalizeName` globálně** — používá ho i `coLocatedGroups` pro práh 60 m × 30 m. | schváleno Joem 14. 8., po D |
| **`KNOWN_LINE_CLASSES` nikdy nematchne** (nález executora + ověřeno managerem 14. 8.) = **krok B** | Set stringů × `line` je number → barevné odznaky linek 3/9/13/15/51 se nezobrazí **nikde** (Moje trasy ř. 1022, Tabule ř. 1199, Hledat ř. 1321 v `index_raw.html`). Pre-existující, ne z J7-P2. Oprava jednořádková, ale vizuálně změní 3 taby naráz. | schváleno Joem 14. 8., po C |
| **Našeptávač — drobnosti k ověření na telefonu** (manager 14. 8.) | `z-index: 20` × sticky hlavička 100 / taby 99 → seznam může podlézt lištu · fokus do pole s hodnotou hned otevře nabídku přes odjezdy · prázdný stav nerozlišuje „konec provozu" × „neznámá zastávka" | čeká na Joeův mobilní test |
| **Našeptávání zastávek, hlavně na mobilu** (Joe 12. 8., UX) — ✅ **řeší J7-P2** | Dnes je to nativní `<datalist>` (`index_raw.html`, `stopList`) — na desktopu funguje, **na mobilu je chování nekonzistentní** (iOS Safari datalist prakticky nepoužívá). Nálezy managera: (a) zdroj má **duplicitní názvy lišící se jen velikostí písmen a zkratkou** — `Andělská Hora,Dolní obec` × `,dolní obec`, `hor.obec` × `horní obec` → v našeptávači to vypadá jako chyba; (b) ověřit, jak si s nimi poradí `resolveStopId`. Váže se na výběr zastávky v J7-P2 (Tabule) — dá se udělat jednou pro obě místa. | do J7-P2 nebo samostatně |
| **Stránkování výsledků** (Joe 12. 8.) | `limit: 8` je natvrdo. Ve špičce a v centru bude spojů víc → stránkovat / „načíst další". V okrajových oblastech naopak platí opak: každý přestup se hodí. | do J4 P2 |
| Stará appka | nechat F1 běžet, nebo přepsat na nový model? | do J7 |

**Testovací sada (huby od Joea, na ověření routingu J2):** U koníčka (Rozcestí u Koníčka), Tržnice, Stadion ZM, Horní nádraží.

## VARIANTY K ROZHODNUTÍ

| Otázka | Varianty | Doporučení | Rozhodnuto |
|--------|----------|------------|------------|
| **Default řazení výsledků (J4-sort)** | podle odjezdu × podle příjezdu × podle délky × **odjezdové okno + přímé napřed** | okno 90 min + přímé napřed + stropy 75/40 — řazení podle příjezdu s oknem ztrácí smysl | **✅ ANO 12. 8. 2026 (Joe)** |
| Dedup podobných itinerářů (J4-sort) | nechat × sloučit do jedné karty s výčtem přestupů | sloučit — tři identické karty vytlačí reálné alternativy | **✅ sloučit, 12. 8. 2026** |
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
