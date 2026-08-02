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

// --- Tolerantni kontroly H1a-d (presunuto z verify_network.js, HF-1, 2026-08-02) ---
// Testuji CHOVANI kodu (ze schopnost funguje), ne konkretni snimek dat -> jen konzoli,
// nikdy neshazuji proces (nesmi blokovat auto-guard v update_data.js).
console.log("\n--- Tolerantni kontroly H1a-d (nebloki build) ---");

// H1a: bez Pareto filtru se soucasne ukazuji primo i 1-prestupove varianty.
const hnResults = search(net, "Krátká", "Horní nádraží", { maxTransfers: 1 });
const hnDirect = hnResults.filter((r) => r.transfers === 0).length;
const hnTransfer = hnResults.filter((r) => r.transfers === 1).length;
console.log(
  hnDirect >= 1 && hnTransfer >= 1
    ? `OK H1a: primo i prestupove varianty soucasne (primo ${hnDirect}, prestup ${hnTransfer}) - bez Pareto zahazovani`
    : `INFO H1a: primo=${hnDirect} prestup=${hnTransfer} - v tomto buildu malo variant, zkontroluj rucne pokud je nula`
);

// H1b: maxTransfers:2 je opt-in, default (bez parametru) zustava na 1 prestupu.
const twoTransfer = search(net, "Rozcestí u Koníčka", "Stadion ZM", { maxTransfers: 2 });
const twoTransferCount = twoTransfer.filter((r) => r.transfers === 2).length;
console.log(
  twoTransferCount > 0
    ? `OK H1b: maxTransfers:2 vraci ${twoTransferCount} retezec(u) o 2 prestupech`
    : "INFO H1b: maxTransfers:2 v tomto buildu nevratilo zadny retezec o 2 prestupech"
);
const defaultNoTwoTransfer = search(net, "Rozcestí u Koníčka", "Stadion ZM").every((r) => r.transfers <= 1);
console.log(
  defaultNoTwoTransfer
    ? "OK H1b: bez parametru (default maxTransfers=1) se 2 prestupy nevraceji"
    : "WARN H1b: bez parametru se presto vratily varianty s 2 prestupy - zkontroluj default v search()"
);

// H1c: smyckovy pattern - misto natvrdo linky 12 hledej JAKYKOLI pattern v aktualnim
// buildu, kde se nejaka zastavka (krome posledni) opakuje, a over ze forwardSegments()
// (pres search) vrati varianty z >=2 ruznych vyskytu. Kdyz zadny smyckovy pattern
// v tomto buildu neni, jde o INFO, ne o problem.
function findAnyLoopPattern(net) {
  for (const pid in net.patterns) {
    const stops = net.patterns[pid].stops;
    const seen = new Set();
    for (let i = 0; i < stops.length - 1; i++) {
      if (seen.has(stops[i])) return { patternId: pid, loopStopId: stops[i] };
      seen.add(stops[i]);
    }
  }
  return null;
}
const loop = findAnyLoopPattern(net);
if (!loop) {
  console.log("INFO H1c: v tomto buildu neni zadny smyckovy pattern (nelze overit forwardSegments na smycce)");
} else {
  const loopStops = net.patterns[loop.patternId].stops;
  const lastStop = loopStops[loopStops.length - 1];
  const loopResults = search(net, loop.loopStopId, lastStop, { maxTransfers: 0 }).filter(
    (r) => r.legs[0].patternId === loop.patternId
  );
  const distinctFromIdx = new Set(loopResults.map((r) => r.legs[0].fromIdx));
  console.log(
    distinctFromIdx.size >= 2
      ? `OK H1c: smyckovy pattern ${loop.patternId} (linka ${net.patterns[loop.patternId].line}) vraci varianty z ${distinctFromIdx.size} ruznych vyskytu zastavky`
      : `WARN H1c: smyckovy pattern ${loop.patternId} vratil jen ${distinctFromIdx.size} vyskyt(u) - zkontroluj forwardSegments`
  );
}

// H1d: co-located prestup - konkretni priklad z aktualnich dat je snimkove specifikum
// (nazev zastavky se muze zmenit), proto tolerantni INFO fallback misto padu.
const komeId = resolveStopId(net, "Parkoviště KOME");
if (!komeId) {
  console.log('INFO H1d: zastavka "Parkoviste KOME" v tomto buildu neexistuje - vyber jiny co-located priklad rucne');
} else {
  const coLocResults = search(net, "Parkoviště KOME", "Tržnice", { maxTransfers: 1 });
  const coLocFound = coLocResults.some((r) => r.coLocated);
  console.log(
    coLocFound
      ? "OK H1d: co-located prestup Parkoviste KOME -> Trznice nalezen"
      : "WARN H1d: co-located prestup Parkoviste KOME -> Trznice NENALEZEN - zkontroluj coLocatedGroups/H1d"
  );
}
