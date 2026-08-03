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
