// Node test pro scripts/routing.js — spustit: node scripts/routing.test.js
// Vypisuje citelne vysledky routingu pro testovaci sadu (huby + domovske zastavky).

const path = require("path");
const { search, resolveStopId, HUBS } = require("./routing.js");
const net = require(path.join(__dirname, "..", "data", "network.json"));

function fmtResult(r) {
  if (r.transfers === 0) {
    const l = r.legs[0];
    return `přímo linkou ${l.line} → ${l.headsign}: ${l.from} → ${l.to} (${l.hops} zast.)`;
  }
  const [l1, l2] = r.legs;
  return (
    `1 přestup: linka ${l1.line}→${l1.headsign} (${l1.from}→${l1.to}) ` +
    `⇒ linka ${l2.line}→${l2.headsign} (${l2.from}→${l2.to})`
  );
}

function runCase(A, B) {
  console.log(`\n=== ${A} → ${B} ===`);
  const results = search(net, A, B);
  if (results.length === 0) {
    console.log("  (žádné spojení nenalezeno)");
    return;
  }
  for (const r of results) console.log("  " + fmtResult(r));
}

console.log("--- Kontrola HUBS (resolveStopId) ---");
for (const hub of HUBS) {
  const id = resolveStopId(net, hub);
  if (id) {
    console.log(`OK: "${hub}" -> ${id} (${net.stops[id].n})`);
  } else {
    console.log(`VAROVANI: "${hub}" nenalezen v net.stops!`);
    const needle = hub.toLowerCase().slice(0, 4);
    const candidates = Object.values(net.stops)
      .map((s) => s.n)
      .filter((n) => n.toLowerCase().includes(needle))
      .slice(0, 5);
    console.log("  nejblizsi nazvy:", candidates);
  }
}

console.log("\n--- Testovaci sada ---");
runCase("Krátká", "Horní nádraží");
runCase("Okružní", "Růžový vrch");
runCase("Krátká", "Tržnice");
runCase("Okružní", "Horní nádraží");
runCase("Krátká", "Růžový vrch");

console.log("\n--- Přes každý hub (jako A nebo T) ---");
runCase("Rozcestí u Koníčka", "Tržnice");
runCase("Tržnice", "Horní nádraží");
runCase("Stadion ZM", "Tržnice");
runCase("Horní nádraží", "Tržnice");
