// Node test pro scripts/timetable.js — spustit: node scripts/timetable.test.js

const path = require("path");
const { nextDepartures } = require("./timetable.js");
const net = require(path.join(__dirname, "..", "data", "network.json"));

function fmt(depMin) {
  const h = Math.floor(depMin / 60) % 24;
  const m = depMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function runCase(label, stop, dateStr, nowMin) {
  console.log(`\n=== ${label}: ${stop} (${dateStr}, nyní ${fmt(nowMin)}) ===`);
  const results = nextDepartures(net, stop, dateStr, nowMin, { limit: 5 });
  if (results.length === 0) {
    console.log("  (žádné odjezdy nenalezeny)");
    return;
  }
  for (const r of results) {
    console.log(`  ${fmt(r.depMin)} linka ${r.line} → ${r.headsign}`);
  }
}

const WORKDAY = "20260202"; // pondělí
const SATURDAY = "20260207"; // sobota

for (const stop of ["Krátká", "Tržnice", "Horní nádraží"]) {
  runCase("všední den 08:00", stop, WORKDAY, 8 * 60);
  runCase("všední den 20:00", stop, WORKDAY, 20 * 60);
  runCase("sobota 08:00", stop, SATURDAY, 8 * 60);
  runCase("sobota 20:00", stop, SATURDAY, 20 * 60);
}

console.log("\n--- Linka 51 kolem půlnoci (přesah dne) ---");
runCase("všední noc ~23:50", "Krátká", WORKDAY, 23 * 60 + 50);
runCase("všední noc ~23:50", "Okružní", WORKDAY, 23 * 60 + 50);
