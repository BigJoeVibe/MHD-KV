# Handoff — EXECUTOR spec (J8-hotfix: guard robustnost — verify jen build-invariantní kontroly)

> 🔴 **AKTIVNÍ ZADÁNÍ (manager, 2026-08-02) — PROD HOTFIX, priorita.** J8b (automat) je nasazený, ale
> **první ostrý scheduled běh SELHAL** (`exit 1`, guard zablokoval jinak zdravá data). Web běží dál na
> starých datech (rollback funguje), ale automat se nedaří dokončit.
> **Kořenová příčina (potvrzeno z logu):** `verify_network.js` obsahuje kontroly navázané na KONKRÉTNÍ
> snímek dat — ne na invarianty. Selhalo `H1c` (smyčka linky 12 Pivovar→Trznice: v novém buildu ta trasa
> smyčku nemá → `FAIL: … vratil jen 1 variant`). Kód (`forwardSegments`) je správně; brittle je jen ta
> kontrola. Navíc je tam druhá časovaná bomba: kontrola výluky Bohatice s natvrdo daty `20260901`/`20260915`.
> **Cíl:** guard smí testovat JEN to, co platí v každém zdravém KV feedu. Snímková specifika a testy chování
> kódu ven z guardu. Pak zdravá nová data konečně protečou.

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů, **nic nad zadání**. Git děláš ty.
> Malé kroky, kód jako **diff**, commit + test po každém kroku.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md`, `TASK.md` (sekce TEĎ), `scripts/verify_network.js`, `scripts/routing.js`,
   `scripts/journey.js`, `scripts/routing.test.js`, `scripts/journey.test.js`, tento soubor.
3. **Před prvním commitem** commitni necommitnuté manager docs.

---

## Princip (zapiš i do `docs/DATA_SOURCES.md`)

`verify_network.js` běží **uvnitř auto-guardu** (`update_data.js`). Smí tedy obsahovat **jen kontroly
invariantní vůči každému zdravému buildu** KV feedu — NIKDY:
- konkrétní data/termíny (výluky, platnosti),
- konkrétní topologii jedné linky (že zrovna linka 12 má smyčku na daném úseku),
- přesné počty variant vázané na snímek,
- konkrétní OD dvojice, které se mohou přetrasovat.

Testy **chování kódu** (routing/journey robustnost) patří do `routing.test.js` / `journey.test.js`
(běží při vývoji, **NEblokují** automat). Toto je stejné ponaučení jako u ID (J8-fix): guard testuje
invarianty, ne specifika snímku.

---

## HF-1 — Vyjmout testy chování routingu (H1a–H1d) z `verify_network.js`

Celou sekci **„--- Robustnost routingu (H1) ---"** (H1a Pareto počty, H1b 2 přestupy, H1c smyčka,
H1d co-located) **vyjmi** z `verify_network.js` a **přesuň do `routing.test.js`** (testují `routing.js`).
Tam je udělej **tolerantní** (nesmí tvrdě padat na variabilitě dat):
- **H1c (smyčka):** místo pevné linky 12/`Pivovar→Trznice` **projdi celou síť a najdi JAKÝKOLI pattern,
  kde se `stopId` opakuje** (smyčka). Když nějaký existuje → ověř, že `forwardSegments` na něm vrátí
  ≥2 úseky. Když v tomto buildu **žádný smyčkový pattern není** → vypiš **INFO** („v tomto buildu není
  smyčkový pattern"), NE FAIL.
- **H1a/H1b/H1d:** kde závisí na konkrétních datech (počty ≥5, existence linky 20/Lázně I…), převeď na
  INFO/print nebo tolerantní práh; smyslem je ukázat, že schopnost funguje, ne fixovat počet.

## HF-2 — Nahradit v `verify_network.js` jedním tolerantním smoke testem (integrace data×engine)

Do `verify_network.js` přidej **jednu** kontrolu, že nová data reálně fungují s jádrem (invariant zdravého
feedu):
- `planJourney(net, 'Krátká', 'Tržnice', { date: <reprezentativní všední den>, nowMin: 480 })` vrátí
  **≥1 spojení** s **rostoucími/kladnými časy** (`arrMin > depMin`, `totalMin === arrMin−depMin`).
- Zdůvodnění: Krátká↔Tržnice je páteřní směr s častým **přímým** spojem → platí v každém zdravém buildu.
  Když vrátí 0, data jsou opravdu rozbitá → legitimní FAIL.
- Použij `resolveStopId` (názvy), ne `S#`. `date` zvol tak, aby měl jistě provoz (napevno známý všední den,
  nebo dopočítej nejbližší všední den) — bez vázání na konkrétní výluku/termín.

## HF-3 — Odhardcodovat kontrolu výluky Bohatice

Kontrola s natvrdo `20260901`/`20260915` spadne, jakmile výluka skončí (12. 9. 2026) nebo ji zdroj změní.
- **Odstraň konkrétní data.** Nahraď **obecným invariantem**, že se mechanismus výluk/výjimek do modelu
  propisuje — např.: v `services` existuje ≥1 služba s neprázdným `rem` **nebo** `add` (tj. `calendar_dates`
  se aplikují). Nezkoumej konkrétní zastávku/termín.
- Cílem je „výjimky kalendáře se promítají", ne „Bohatice nejede do 11. 9.".

## HF-4 — Audit zbylých kontrol na snímková specifika

Projdi zbytek `verify_network.js` a odstraň/zjemni vše, co visí na konkrétním snímku:
- **Logika dne** (linka 3 Krátká→Tržnice, všední > sobota): ponech jako **poměr** (ne přesné počty); ideálně
  odolné vůči přetrasování (klidně „nějaká páteřní linka má všední > víkend").
- **journey totalMin** (dnes `Krátká→Růžový vrch`): přesuň na robustní OD (Krátká→Tržnice) nebo zjemni.
- Cíl: `verify_network.js` **projde na jakémkoli zdravém KV buildu**, ne jen na tom z 22. 7.

## HF-5 — DŮKAZ (klíčové ověření)

1. `node scripts/verify_network.js` na aktuálních datech → **FAIL: 0**.
2. `node scripts/update_data.js --force` → **guard PROJDE** na čerstvých datech (to, co dřív padalo na H1c)
   → zdravá nová data se zapíšou (`network.json` + state).
3. `node scripts/routing.test.js` a `node scripts/journey.test.js` → proběhnou bez tvrdého pádu (relokované
   H1 testy jsou tolerantní).
4. Commitni fixy + přestavěný `data/network.json` + state.
5. Do `VÝSLEDEK` napiš: co se přesunulo/zjemnilo, guard po fixu (počty), a že `update_data.js --force` prošel.

**Pozn.:** finální ověření na runneru (ruční spuštění workflow) udělá Joe po mergi — napiš mu to do VÝSLEDKU
jako jeho krok.

---

## Co NESAHAT
- **Neměnit** logiku routingu/journey/timetable ani `build_network.js` — kód je správně, opravuje se JEN
  robustnost kontrol.
- Neměnit prahy guardu v `update_data.js` (lines≥20/stops≥140/trips≥9000, pokles ≤20 %) — ty jsou invariantní, OK.
- Workflow `.yml` neměnit.

---

## VÝSLEDEK (vyplní executor)

**Hotovo 2026-08-02, vše dle bodů HF-1 až HF-5.**

- **HF-1** — sekce „--- Robustnost routingu (H1) ---" (H1a Pareto, H1b 2 přestupy, H1c smyčka,
  H1d co-located) kompletně vyjmuta z `verify_network.js`. Přesunuto:
  - `routing.test.js`: nová sekce „Tolerantní kontroly H1a-d" — jen `console.log` (OK/INFO/WARN),
    **nikdy nenastavuje `process.exitCode`**. H1c už nehledá natvrdo linku 12/`Pivovar→Tržnice`, ale
    `findAnyLoopPattern()` projde celou síť a najde JAKÝKOLI smyčkový pattern; když žádný v buildu
    není, vypíše INFO místo pádu. H1d (co-located Parkoviště KOME) má fallback INFO, když zastávka
    v buildu chybí.
  - `journey.test.js`: přesunuta kontrola návaznosti přestupu (Krátká→Růžový vrch, `leg2.depMin >=
    leg1.arrMin + minTransfer`) — taky jen tolerantní `console.log`, s INFO fallbackem, když
    v aktuálním buildu žádné přestupové spojení na té trase není.
- **HF-2** — do `verify_network.js` přidán jeden smoke test: `planJourney(Krátká→Tržnice, date=
  20260202 pondělí, nowMin=480)` musí vrátit ≥1 spojení s konzistentními časy (`arrMin>depMin`,
  `totalMin===arrMin−depMin`). Toto je JEDINÉ místo v guardu, kde smí spadnout celý build kvůli
  chování enginu — protože Krátká→Tržnice je páteřní přímý spoj, který musí fungovat v každém
  zdravém KV feedu.
- **HF-3** — kontrola výluky Bohatice (natvrdo `20260901`/`20260915`) nahrazena obecným invariantem:
  `Object.values(net.services)` musí obsahovat ≥1 službu s neprázdným `rem` nebo `add` (tj.
  `calendar_dates` výjimky se do modelu vůbec propisují) — bez vazby na konkrétní zastávku/termín.
- **HF-4** — audit zbytku:
  - „Logika dne" už nezávisí natvrdo na lince 3 — zkouší postupně 3/9/13/15 (Krátká/Okružní→Tržnice)
    a stačí, že JEDNA z nich má všední den hustší než sobotu (odolné vůči přetrasování jedné linky).
  - Journey `totalMin` test (dřív Krátká→Růžový vrch) sloučen do HF-2 smoke testu na robustní OD
    Krátká→Tržnice.
  - Struktura/Úplnost/Integrita/Co-located/Směrovost/Časová vrstva ponechány beze změny — už byly
    invariantní (nezávisí na konkrétních id, jen na obecných vlastnostech buildu).
  - Nepoužitý import `search` a mrtvá funkce `findLoopPattern` z `verify_network.js` odstraněny
    (přesunuty/nahrazeny jinde).
- **HF-5 — DŮKAZ:**
  1. `node scripts/verify_network.js` na aktuálních datech → **PASS: 20, FAIL: 0**.
  2. `node scripts/update_data.js --force` → **plný běh na živé čerstvé stažení GTFS** (63,0 s) →
     guard **PASS: 20, FAIL: 0**, `CELKEM: OK` → `data/network.json` + `data_source_state.json`
     přestavěny a zapsány. Přesně to, co dřív padalo na H1c, teď prochází (patterny se skutečně
     přečíslovaly — smyčkový pattern byl `P18`/linka 1 před buildem, po přestavbě `P55`/linka 17 —
     `findAnyLoopPattern()` a `findPattern()` to i tak správně dohledaly).
  3. `node scripts/routing.test.js` a `node scripts/journey.test.js` → `exit 0`, žádný tvrdý pád;
     nové tolerantní H1 kontroly vypsaly `OK` pro všechny (H1a/b/c/d i navaznost přestupu).
- **Commit:** fixy (`verify_network.js`, `routing.test.js`, `journey.test.js`), princip zapsaný do
  `docs/DATA_SOURCES.md` (nová sekce „Princip guardu: invarianty, ne snímek"), přestavěný
  `data/network.json` + `data_source_state.json` ze skutečného `--force` běhu výše. Spolu s tím
  commitnuty i necommitnuté manager úpravy `TASK.md`/`handoff.md` (dle protokolu předávky).

**Co ověřit Joeovi (dle handoff pozn.):** finální ověření na reálném GH Actions runneru — spustit
`workflow_dispatch` ručně (Actions tab, `main`) a zkontrolovat, že scheduled/manuální běh teď
projde bez `FORCE` i s ním. Očekávané chování: guard by měl projít i na dalším ostrém denním cronu,
protože kontroly už nezávisí na konkrétním snímku dat.
