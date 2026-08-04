// Node test pro scripts/journey.js — spustit: node scripts/journey.test.js
// Citelny vypis planovanych spojeni (primo + 1 prestup + noc/pulnoc + H2 razeni + H1d co-located).

const path = require("path");
const { planJourney } = require("./journey.js");
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

// den ráno — přímý spoj 13 má vyhrát nad dřívějšími odjezdy přestupů (smart: přímé napřed)
const morningResults = planJourney(net, "Tržnice", "Okružní", { date: "20260804", nowMin: 8 * 60 });
checkFirst("den ráno (Tržnice→Okružní, 8:00)", morningResults, { depMin: 8 * 60 + 6, arrMin: 8 * 60 + 18, line: "13" });
checkGlobalInvariants("den ráno", morningResults);

// den odpoledne
const afternoonResults = planJourney(net, "Tržnice", "Okružní", { date: "20260804", nowMin: 15 * 60 + 30 });
checkFirst("den odpoledne (Tržnice→Okružní, 15:30)", afternoonResults, { depMin: 15 * 60 + 30, arrMin: 15 * 60 + 42, line: "13" });
checkGlobalInvariants("den odpoledne", afternoonResults);

// noc — základní okno 90 min je prázdné (nejbližší přímý spoj 51 je 91 min daleko), žebřík rozšíří na 240
const nightWindowResults = planJourney(net, "Krátká", "Tržnice", { date: "20260803", nowMin: 23 * 60 + 44 });
checkFirst("noc — žebřík oken (Krátká→Tržnice, 23:44)", nightWindowResults, { depMin: 25 * 60 + 15, arrMin: 25 * 60 + 30, line: "51" });
checkGlobalInvariants("noc — žebřík oken", nightWindowResults);

// slučování duplicit — tři jízdy 3→2 lišící se jen přestupní zastávkou se mají sloučit do jedné karty
const mergeResults = planJourney(net, "Stará Role", "Lázně I", { date: "20260809", nowMin: 14 * 60 });
const merged = mergeResults.find((it) => it.depMin === 14 * 60 + 26 && it.arrMin === 15 * 60 + 9);
const mergeOk = !!merged && Array.isArray(merged.viaStops) && merged.viaStops.length === 3;
console.log(
  (mergeOk ? "  OK   " : "  FAIL ") +
    "sloučení duplicit (Stará Role→Lázně I, ne 14:00): 14:26 → 15:09 s viaStops.length===3" +
    (merged ? ` (skutečně ${merged.viaStops ? merged.viaStops.length : 0})` : " (výsledek nenalezen)")
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

console.log(j4sortAllOk ? "\nOK: J4-sort — všechny scénáře a invarianty prošly" : "\nFAIL: J4-sort — některý scénář nebo invariant selhal (viz výše)");
