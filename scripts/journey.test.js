// Node test pro scripts/journey.js — spustit: node scripts/journey.test.js
// Citelny vypis planovanych spojeni (primo + 1 prestup + noc/pulnoc + H2 razeni + H1d co-located).

const path = require("path");
const { planJourney, planBoard, buildItineraries, mergeDuplicates, applyCaps, paretoFilter, SORTERS } = require("./journey.js");
const { search: routingSearch, resolveStopId } = require("./routing.js");
const net = require(path.join(__dirname, "..", "data", "network.json"));

function fmt(m) {
  const h = Math.floor(m / 60) % 24;
  const mi = m % 60;
  const day = m >= 1440 ? "+1d " : "";
  return `${day}${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function fmtItinerary(it) {
  const head = `${fmt(it.depMin)} → ${fmt(it.arrMin)} · ${it.totalMin} min · `;
  if (it.transfers === 0) {
    const l = it.legs[0];
    return head + `přímo linka ${l.line} → ${l.headsign}`;
  }
  const [l1, l2] = it.legs;
  return (
    head +
    `1 přestup (${net.stops[it.transferStop] ? net.stops[it.transferStop].n : it.transferStop}, čekání ${it.waitMin} min, walkMin ${it.walkMin}): ` +
    `${l1.line} → ${l1.headsign} (${fmt(l1.depMin)}–${fmt(l1.arrMin)})  ⇒  ${l2.line} → ${l2.headsign} (${fmt(l2.depMin)}–${fmt(l2.arrMin)})`
  );
}

function runCase(label, A, B, date, nowMin, opts) {
  console.log(`\n=== ${label}: ${A} → ${B} (${date}, nyní ${fmt(nowMin)}${opts && opts.sort ? `, sort=${opts.sort}` : ""}) ===`);
  const results = planJourney(net, A, B, { date, nowMin, ...opts });
  if (results.length === 0) {
    console.log("  (žádné spojení nenalezeno)");
    return;
  }
  for (const it of results) console.log("  " + fmtItinerary(it));
}

const WORKDAY = "20260202"; // pondělí

runCase("přímé spojení", "Krátká", "Tržnice", WORKDAY, 8 * 60);
runCase("spojení s přestupem", "Krátká", "Růžový vrch", WORKDAY, 8 * 60);
runCase("přes půlnoc (linka 51)", "Okružní", "Garáže MHD", WORKDAY, 23 * 60 + 50);

// Tolerantni kontrola navaznosti prestupu (presunuto z verify_network.js, HF-1/HF-4,
// 2026-08-02) - konkretni prestupova varianta Kratka->Ruzovy vrch je snimkove
// specifikum (muze se mezi obnovami dat prestrasovat/zmizet), proto jen konzole,
// nikdy neshazuje proces (nesmi blokovat auto-guard).
const MIN_TRANSFER = 3;
const transferCheck = planJourney(net, "Krátká", "Růžový vrch", {
  date: WORKDAY,
  nowMin: 8 * 60,
  minTransfer: MIN_TRANSFER,
}).find((it) => it.transfers === 1);
if (transferCheck) {
  const [l1, l2] = transferCheck.legs;
  console.log(
    l2.depMin >= l1.arrMin + MIN_TRANSFER
      ? `OK: přestupní spojení drží návaznost (${fmt(l2.depMin)} >= ${fmt(l1.arrMin)} + ${MIN_TRANSFER} min)`
      : `WARN: přestupní spojení NEDRŽÍ návaznost (${fmt(l2.depMin)} < ${fmt(l1.arrMin)} + ${MIN_TRANSFER} min)`
  );
} else {
  console.log("INFO: v tomto buildu nenalezeno přestupové spojení Krátká->Růžový vrch pro kontrolu návaznosti");
}

// H1a/H2: vedle pomalejsiho primeho spoje (13 min, ale odjezd az 08:14) se ted
// ukazuji i drive odjizdejici prestupove varianty (odjezd 08:06) - pri vychozim
// razeni 'departure' se zobrazi napred, protoze odjizdi driv, i kdyz je celkem
// pomalejsi. Drivejsi Pareto filtr (podle poctu zastavek/prestupu) by tyhle
// prestupove varianty v routing.js vubec nevratil.
console.log("\n--- H1a/H2: razeni 'departure' vs 'arrival' vs 'duration' (Krátká → Tržnice) ---");
runCase("departure (výchozí)", "Krátká", "Tržnice", WORKDAY, 8 * 60, { sort: "departure", limit: 5 });
runCase("arrival", "Krátká", "Tržnice", WORKDAY, 8 * 60, { sort: "arrival", limit: 5 });
runCase("duration", "Krátká", "Tržnice", WORKDAY, 8 * 60, { sort: "duration", limit: 5 });

// H1d: prestup mezi fakticky totoznymi zastavkami s jinym ID (Lazne I: S155 linka
// 20 <-> S116 linky 2/11/52). Bez H1d by se toto spojeni vubec nenaslo (jine ID).
console.log("\n--- H1d: co-located přestup (Lázně I, linka 20 ⇄ 2/11/52) ---");
runCase("Parkoviště KOME → Tržnice přes Lázně I", "Parkoviště KOME", "Tržnice", WORKDAY, 9 * 60, { limit: 3 });

// J4-fix: nocni prestup (leg1 pozde vecer -> leg2 az rano nasledujici den) drive
// vracel zaporne totalMin (viz handoff.md repro, hledani ve 23:22). FIX-A ma
// zarucit monotonni osu dep1 <= arr1 <= dep2 <= arr2 vzdy.
console.log("\n--- J4-fix: noční hledání (23:22, přestup až ráno) ---");
const NIGHT_NOW = 23 * 60 + 22;
const nightResults = planJourney(net, "Krátká", "Tržnice", { date: WORKDAY, nowMin: NIGHT_NOW, limit: 8 });
if (nightResults.length === 0) {
  console.log("  (žádné spojení nenalezeno)");
} else {
  let allOk = true;
  for (const it of nightResults) {
    const ok = it.arrMin > it.depMin && it.totalMin > 0 && (it.waitMin == null || it.waitMin >= 0);
    if (!ok) allOk = false;
    console.log((ok ? "  OK   " : "  FAIL ") + fmtItinerary(it));
  }
  console.log(allOk ? "OK: všechny noční itineráře mají arrMin > depMin, totalMin > 0, waitMin >= 0" : "FAIL: noční itinerář porušuje invariant (arrMin > depMin, totalMin > 0, waitMin >= 0)");
}

// ============================================================
// J4-sort: pravidla maleho mesta (okno 90 min + zebrik, stropy 75/40,
// smart razeni "prime napred", slouceni duplicit do viaStops)
// ============================================================
console.log("\n--- J4-sort: pravidla malého města ---");

let j4sortAllOk = true;

function checkGlobalInvariants(label, results) {
  let ok = true;
  for (const it of results) {
    const invOk =
      it.arrMin > it.depMin &&
      it.totalMin > 0 &&
      it.totalMin <= 75 &&
      (it.waitMin == null || (it.waitMin >= 0 && it.waitMin <= 40));
    if (!invOk) {
      ok = false;
      console.log(`  FAIL invariant (${label}): ` + fmtItinerary(it));
    }
  }
  if (!ok) j4sortAllOk = false;
  return ok;
}

function checkFirst(label, results, expect) {
  const first = results[0];
  const ok =
    first &&
    first.transfers === 0 &&
    first.depMin === expect.depMin &&
    first.arrMin === expect.arrMin &&
    String(first.legs[0].line) === String(expect.line);
  console.log(
    (ok ? "  OK   " : "  FAIL ") +
      `${label}: 1. výsledek ` +
      (first ? fmtItinerary(first) : "(žádný)") +
      (ok ? "" : ` — očekáváno přímo linka ${expect.line}, ${fmt(expect.depMin)} → ${fmt(expect.arrMin)}`)
  );
  if (!ok) j4sortAllOk = false;
}

// J4-sort-2: Pareto invariant — zadny vysledek nesmi byt dominovan jinym (odjezd
// stejny/pozdejsi A prijezd drivejsi = strictne horsi, nesmi prezit filtr).
function checkParetoInvariant(label, results) {
  let ok = true;
  for (const r of results) {
    for (const o of results) {
      if (o === r) continue;
      if (o.depMin >= r.depMin && o.arrMin < r.arrMin) {
        ok = false;
        console.log(`  FAIL Pareto invariant (${label}): ` + fmtItinerary(r) + `  dominated by  ` + fmtItinerary(o));
      }
    }
  }
  if (ok) console.log(`  OK   Pareto invariant (${label}): žádný výsledek není dominovaný`);
  if (!ok) j4sortAllOk = false;
  return ok;
}

// Joeuv nalez 4.8. (Okruzni->Trznice, ut 11:21) — prestup 13->11 @Horni nadrazi
// s cekanim 0 min (linka 13 tam konci, linka 11 tam zacina). Driv s minTransfer:3
// vypadl uplne (Problem A), pak by ho "prime napred" zatlacilo pod kazdy primy
// spoj i kdyz odjizdi i prijizdi driv (Problem B). Ted musi byt 1.
const joeCaseResults = planJourney(net, "Okružní", "Tržnice", { date: "20260804", nowMin: 11 * 60 + 21 });
const joeFirst = joeCaseResults[0];
const joeOk =
  !!joeFirst &&
  joeFirst.transfers === 1 &&
  joeFirst.depMin === 11 * 60 + 42 &&
  joeFirst.arrMin === 11 * 60 + 55 &&
  String(joeFirst.legs[0].line) === "13" &&
  String(joeFirst.legs[1].line) === "11" &&
  joeFirst.throughService === true &&
  joeFirst.waitMin === 0;
console.log(
  (joeOk ? "  OK   " : "  FAIL ") +
    "Joeův nález (Okružní→Tržnice, 11:21): 1. výsledek " +
    (joeFirst ? fmtItinerary(joeFirst) + ` throughService=${joeFirst.throughService}` : "(žádný)") +
    (joeOk ? "" : " — očekáváno přestup 13→11 @Horní nádraží, 11:42 → 11:55, throughService=true, wait=0")
);
if (!joeOk) j4sortAllOk = false;
checkGlobalInvariants("Joeův nález", joeCaseResults);
checkParetoInvariant("Joeův nález", joeCaseResults);

// den ráno — přímý spoj 13 má vyhrát nad dřívějšími odjezdy přestupů (smart: přímé napřed)
const morningResults = planJourney(net, "Tržnice", "Okružní", { date: "20260804", nowMin: 8 * 60 });
checkFirst("den ráno (Tržnice→Okružní, 8:00)", morningResults, { depMin: 8 * 60 + 6, arrMin: 8 * 60 + 18, line: "13" });
checkGlobalInvariants("den ráno", morningResults);
checkParetoInvariant("den ráno", morningResults);

// den odpoledne
const afternoonResults = planJourney(net, "Tržnice", "Okružní", { date: "20260804", nowMin: 15 * 60 + 30 });
checkFirst("den odpoledne (Tržnice→Okružní, 15:30)", afternoonResults, { depMin: 15 * 60 + 30, arrMin: 15 * 60 + 42, line: "13" });
checkGlobalInvariants("den odpoledne", afternoonResults);
checkParetoInvariant("den odpoledne", afternoonResults);

// noc — základní okno 90 min je prázdné (nejbližší přímý spoj 51 je 91 min daleko), žebřík rozšíří na 240
const nightWindowResults = planJourney(net, "Krátká", "Tržnice", { date: "20260803", nowMin: 23 * 60 + 44 });
checkFirst("noc — žebřík oken (Krátká→Tržnice, 23:44)", nightWindowResults, { depMin: 25 * 60 + 15, arrMin: 25 * 60 + 30, line: "51" });
checkGlobalInvariants("noc — žebřík oken", nightWindowResults);
checkParetoInvariant("noc — žebřík oken", nightWindowResults);

// slučování duplicit — jízdy lišící se jen přestupní zastávkou se mají sloučit do
// jedné karty. J4-sort-2 (minTransfer:0 + Pareto): puvodni scenar 14:26 → 15:09
// (viaStops.length===3) je s minTransfer:0 dominovan drivejsim/rychlejsim
// spojenim a Pareto ho odstrani (viz handoff.md, ocekavana zmena, ne regrese) —
// kontrola merge presunuta na to, co pipeline skutecne vraci: aspon jeden
// vysledek se sloucenymi viaStops (delka > 1).
const mergeResults = planJourney(net, "Stará Role", "Lázně I", { date: "20260809", nowMin: 14 * 60 });
const merged = mergeResults.find((it) => Array.isArray(it.viaStops) && it.viaStops.length > 1);
const mergeOk = !!merged;
console.log(
  (mergeOk ? "  OK   " : "  FAIL ") +
    "sloučení duplicit (Stará Role→Lázně I, ne 14:00): existuje výsledek se sloučenými viaStops (délka > 1)" +
    (merged ? ` (${fmtItinerary(merged)}, viaStops.length===${merged.viaStops.length})` : " (žádný nenalezen)")
);
if (!mergeOk) j4sortAllOk = false;
// zadne dva vysledky nemaji shodnou trojici (depMin, arrMin, linky) — merge musi byt uplny
const keysSeen = new Set();
let noDupKeys = true;
for (const it of mergeResults) {
  const k = `${it.depMin}|${it.arrMin}|${it.legs.map((l) => l.line).join(">")}`;
  if (keysSeen.has(k)) noDupKeys = false;
  keysSeen.add(k);
}
console.log((noDupKeys ? "  OK   " : "  FAIL ") + "žádné dva výsledky nemají shodnou trojici (depMin, arrMin, linky)");
if (!noDupKeys) j4sortAllOk = false;
checkGlobalInvariants("sloučení duplicit", mergeResults);
checkParetoInvariant("sloučení duplicit", mergeResults);

// hluché období — žebřík rozšíří okno, výsledky nejsou prázdné, 1. odjezd 09:44 (spouští hlášku v UI)
const deadPeriodResults = planJourney(net, "Globus", "Nádraží Dalovice", { date: "20260804", nowMin: 8 * 60 });
const deadPeriodOk = deadPeriodResults.length > 0 && deadPeriodResults[0].depMin === 9 * 60 + 44;
console.log(
  (deadPeriodOk ? "  OK   " : "  FAIL ") +
    "hluché období (Globus→Nádraží Dalovice, 8:00): výsledky nejsou prázdné, 1. odjezd 09:44" +
    (deadPeriodResults.length > 0 ? ` (skutečně ${fmt(deadPeriodResults[0].depMin)})` : " (žádné výsledky)")
);
if (!deadPeriodOk) j4sortAllOk = false;
checkGlobalInvariants("hluché období", deadPeriodResults);
checkParetoInvariant("hluché období", deadPeriodResults);

console.log(j4sortAllOk ? "\nOK: J4-sort — všechny scénáře a invarianty prošly" : "\nFAIL: J4-sort — některý scénář nebo invariant selhal (viz výše)");

// ============================================================
// J7-P1 STEP 1a: perf pruning — pruned build (planJourney after the fix) must
// be JSON-identical to the pre-1a (unpruned) pipeline, only faster. Pre-1a
// pipeline reconstructed from the internals journey.js exports for exactly
// this purpose (buildItineraries/mergeDuplicates/applyCaps/paretoFilter/
// SORTERS) — same convention as routing.js exposing its internals for tests.
// ============================================================
console.log("\n--- J7-P1 STEP 1a: perf pruning — pruned vs unpruned output ---");

function unprunedPlan(net, A, B, opts = {}) {
  const date = opts.date, nowMin = opts.nowMin;
  const minTransfer = opts.minTransfer != null ? opts.minTransfer : 0;
  const limit = opts.limit != null ? opts.limit : 8;
  const maxTransfers = opts.maxTransfers != null ? opts.maxTransfers : 1;
  const sortKey = opts.sort && SORTERS[opts.sort] ? opts.sort : "smart";
  const windowMin = opts.windowMin != null ? opts.windowMin : 90;
  const maxTotal = opts.maxTotal != null ? opts.maxTotal : 75;
  const maxWait = opts.maxWait != null ? opts.maxWait : 40;

  const stopA = resolveStopId(net, A);
  const stopB = resolveStopId(net, B);
  if (!stopA || !stopB) return [];

  const variants = routingSearch(net, stopA, stopB, { maxTransfers });

  // Pre-1a behaviour: build itineraries for the WHOLE day (maxDep=null), THEN
  // filter the already-built list by window — this is exactly what planJourney
  // did before STEP 1a folded the window into the build itself.
  let itineraries = buildItineraries(net, variants, date, nowMin, minTransfer, null);
  itineraries = mergeDuplicates(itineraries);
  itineraries = applyCaps(itineraries, maxTotal, maxWait);
  for (const w of [windowMin, 240, Infinity]) {
    const filtered = itineraries.filter((it) => it.depMin <= nowMin + w);
    itineraries = filtered;
    if (filtered.length > 0) break;
  }
  itineraries = paretoFilter(itineraries);
  itineraries.sort(SORTERS[sortKey]);
  return itineraries.slice(0, limit);
}

const PERF_PAIRS = [
  ["Krátká", "Tržnice"],
  ["Okružní", "Tržnice"],
  ["Tržnice", "Krátká"],
  ["Tržnice", "Okružní"],
  ["Krátká", "Horní nádraží"],
  ["Okružní", "Horní nádraží"],
];
const PERF_DATE = "20260805";
const PERF_NOW = 10 * 60;

let prunedTotalMs = 0;
let unprunedTotalMs = 0;
let perfIdentical = true;
for (const [A, B] of PERF_PAIRS) {
  const t0 = process.hrtime.bigint();
  const pruned = planJourney(net, A, B, { date: PERF_DATE, nowMin: PERF_NOW });
  const t1 = process.hrtime.bigint();
  const unpruned = unprunedPlan(net, A, B, { date: PERF_DATE, nowMin: PERF_NOW });
  const t2 = process.hrtime.bigint();
  prunedTotalMs += Number(t1 - t0) / 1e6;
  unprunedTotalMs += Number(t2 - t1) / 1e6;

  const same = JSON.stringify(pruned) === JSON.stringify(unpruned);
  if (!same) {
    perfIdentical = false;
    console.log(`  FAIL ${A} → ${B}: pruned/unpruned output differs`);
  }
}
console.log((perfIdentical ? "  OK   " : "  FAIL ") + `pruned vs unpruned output byte-identical for all ${PERF_PAIRS.length} pairs (${PERF_DATE}, ${fmt(PERF_NOW)})`);
console.log(`  timing: pruned ${prunedTotalMs.toFixed(1)} ms total / unpruned ${unprunedTotalMs.toFixed(1)} ms total (${PERF_PAIRS.length} pairs)`);

// ============================================================
// J7-P1 STEP 1b: planBoard() — "Moje trasy" rules on top of planJourney
// ============================================================
console.log("\n--- J7-P1 STEP 1b: planBoard (Moje trasy) ---");
let j7p1AllOk = !perfIdentical ? false : true;

function checkBoardFirst(label, rows, expect) {
  const first = rows[0];
  const ok =
    first &&
    first.transfers === 0 &&
    first.depMin === expect.depMin &&
    first.arrMin === expect.arrMin &&
    String(first.legs[0].line) === String(expect.line);
  console.log(
    (ok ? "  OK   " : "  FAIL ") +
      `${label}: 1. řádek ` +
      (first ? fmtItinerary(first) : "(žádný)") +
      (ok ? "" : ` — očekáváno přímo linka ${expect.line}, ${fmt(expect.depMin)} → ${fmt(expect.arrMin)}`)
  );
  if (!ok) j7p1AllOk = false;
}

function checkNoDupTimeKeys(label, rows) {
  const keys = new Set();
  let ok = true;
  for (const r of rows) {
    const k = `${r.depMin}|${r.arrMin}`;
    if (keys.has(k)) ok = false;
    keys.add(k);
  }
  console.log((ok ? "  OK   " : "  FAIL ") + `${label}: žádné dva řádky nesdílí (depMin, arrMin)`);
  if (!ok) j7p1AllOk = false;
}

function checkDetourCap(label, rows, maxDetour = 10) {
  const directs = rows.filter((r) => r.transfers === 0);
  let ok = true;
  if (directs.length > 0) {
    const bestDirect = Math.min(...directs.map((r) => r.totalMin));
    for (const r of rows) {
      if (r.transfers > 0 && r.totalMin > bestDirect + maxDetour) ok = false;
    }
  }
  console.log((ok ? "  OK   " : "  FAIL ") + `${label}: žádný přestup nepřesahuje nejlepší přímý o víc než ${maxDetour} min`);
  if (!ok) j7p1AllOk = false;
}

// board, midday — Okružní → Tržnice, 20260805 10:00
const boardMidday = planBoard(net, "Okružní", "Tržnice", { date: "20260805", nowMin: 10 * 60 });
console.log(`  Okružní→Tržnice 10:00 (${boardMidday.length} řádků): ` + boardMidday.map(fmtItinerary).join(" | "));
const middayAllDirect = boardMidday.every((r) => r.transfers === 0);
console.log((middayAllDirect ? "  OK   " : "  FAIL ") + "board, midday: všechny řádky přímé");
if (!middayAllDirect) j7p1AllOk = false;
const middayCountOk = boardMidday.length >= 5 && boardMidday.length <= 6;
console.log((middayCountOk ? "  OK   " : "  FAIL ") + `board, midday: 5–6 řádků (skutečně ${boardMidday.length})`);
if (!middayCountOk) j7p1AllOk = false;
checkBoardFirst("board, midday (Okružní→Tržnice, 10:00)", boardMidday, { depMin: 10 * 60 + 14, arrMin: 10 * 60 + 26, line: "15" });
checkNoDupTimeKeys("board, midday", boardMidday);
checkDetourCap("board, midday", boardMidday);

// board, morning — Krátká → Tržnice, 20260805 06:00
const boardMorning = planBoard(net, "Krátká", "Tržnice", { date: "20260805", nowMin: 6 * 60 });
console.log(`  Krátká→Tržnice 06:00 (${boardMorning.length} řádků): ` + boardMorning.map(fmtItinerary).join(" | "));
checkBoardFirst("board, morning (Krátká→Tržnice, 06:00)", boardMorning, { depMin: 6 * 60 + 6, arrMin: 6 * 60 + 19, line: "3" });
checkNoDupTimeKeys("board, morning", boardMorning);
checkDetourCap("board, morning", boardMorning);

// no direct exists — Krátká → Horní nádraží, 20260805 10:00
const boardNoDirect = planBoard(net, "Krátká", "Horní nádraží", { date: "20260805", nowMin: 10 * 60 });
console.log(`  Krátká→Horní nádraží 10:00 (${boardNoDirect.length} řádků): ` + boardNoDirect.map(fmtItinerary).join(" | "));
const noDirectOk = boardNoDirect.length > 0 && boardNoDirect.every((r) => r.transfers === 1);
console.log(
  (noDirectOk ? "  OK   " : "  FAIL ") +
    `no direct exists (Krátká→Horní nádraží, 10:00): ${boardNoDirect.length} řádků, všechny s 1 přestupem`
);
if (!noDirectOk) j7p1AllOk = false;
checkNoDupTimeKeys("no direct exists", boardNoDirect);

console.log(j7p1AllOk ? "\nOK: J7-P1 (perf + planBoard) — všechny scénáře a invarianty prošly" : "\nFAIL: J7-P1 (perf + planBoard) — některý scénář nebo invariant selhal (viz výše)");
