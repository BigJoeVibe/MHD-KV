// Node test pro scripts/routing.js — spustit: node scripts/routing.test.js
// Vypisuje citelne vysledky routingu pro testovaci sadu (huby + domovske zastavky).
//
// POZOR (H1a, 2026-07-23): search() uz nefiltruje pres topologicky Pareto (transfers,
// totalHops) — vraci VSECHNY rozumne (dedup) varianty, klidne desitky/stovky pro
// husty hub. Proto se tu vypisuje pocet po transferech + jen nekolik ukazkovych
// radku, ne cely seznam (drive slo vypsat vse, protoze Pareto ho drzelo male).

const path = require("path");
const { search, resolveStopId, HUBS } = require("./routing.js");
const net = require(path.join(__dirname, "..", "data", "network.json"));

function fmtResult(r) {
  if (r.transfers === 0) {
    const l = r.legs[0];
    return `přímo linkou ${l.line} → ${l.headsign}: ${l.from} → ${l.to} (${l.hops} zast.)`;
  }
  const legsStr = r.legs
    .map((l, i) => `linka ${l.line}→${l.headsign} (${l.from}→${l.to})${r[`coLocated${i === 0 ? "" : i + 1}`] || (i === 0 && r.coLocated) ? " [co-located]" : ""}`)
    .join(" ⇒ ");
  return `${r.transfers} přestup(y): ${legsStr}`;
}

function runCase(A, B, opts) {
  console.log(`\n=== ${A} → ${B} ${opts && opts.maxTransfers ? `(maxTransfers: ${opts.maxTransfers})` : ""} ===`);
  const results = search(net, A, B, opts);
  if (results.length === 0) {
    console.log("  (žádné spojení nenalezeno)");
    return;
  }
  const byTransfers = {};
  for (const r of results) byTransfers[r.transfers] = (byTransfers[r.transfers] || 0) + 1;
  console.log(`  celkem ${results.length} variant (${Object.entries(byTransfers).map(([t, n]) => `${t} přestup(y): ${n}`).join(", ")})`);
  for (const r of results.slice(0, 5)) console.log("  " + fmtResult(r));
  if (results.length > 5) console.log(`  … a dalších ${results.length - 5}`);
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

console.log("\n--- H1b: 2 přestupy (opt-in parametrem, default je stále 1) ---");
runCase("Rozcestí u Koníčka", "Stadion ZM", { maxTransfers: 2 });

console.log("\n--- H1c: smyčkový pattern (P5, linka 12) — Pivovar má ve smyčce 2 výskyty ---");
runCase("Pivovar", "Tržnice");

console.log("\n--- H1d: co-located přestup (Parkoviště KOME, linka 20 → Lázně I S155↔S116 → linka 2/52) ---");
runCase("Parkoviště KOME", "Tržnice");
