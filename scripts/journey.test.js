// Node test pro scripts/journey.js — spustit: node scripts/journey.test.js
// Citelny vypis planovanych spojeni (primo + 1 prestup + noc/pulnoc).

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
    `1 přestup (${net.stops[it.transferStop] ? net.stops[it.transferStop].n : it.transferStop}, čekání ${it.waitMin} min): ` +
    `${l1.line} → ${l1.headsign} (${fmt(l1.depMin)}–${fmt(l1.arrMin)})  ⇒  ${l2.line} → ${l2.headsign} (${fmt(l2.depMin)}–${fmt(l2.arrMin)})`
  );
}

function runCase(label, A, B, date, nowMin) {
  console.log(`\n=== ${label}: ${A} → ${B} (${date}, nyní ${fmt(nowMin)}) ===`);
  const results = planJourney(net, A, B, { date, nowMin });
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
