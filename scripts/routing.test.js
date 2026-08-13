// Node test pro scripts/routing.js — spustit: node scripts/routing.test.js
// Vypisuje citelne vysledky routingu pro testovaci sadu (huby + domovske zastavky).
//
// POZOR (H1a, 2026-07-23): search() uz nefiltruje pres topologicky Pareto (transfers,
// totalHops) — vraci VSECHNY rozumne (dedup) varianty, klidne desitky/stovky pro
// husty hub. Proto se tu vypisuje pocet po transferech + jen nekolik ukazkovych
// radku, ne cely seznam (drive slo vypsat vse, protoze Pareto ho drzelo male).

const path = require("path");
const { search, resolveStopId, HUBS, normalizeName, normalizeLoose } = require("./routing.js");
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

// --- STEP D: same-name stop ids in the routing core (2026-08-14) ---
// "Lázně I" is split across two ids sharing the same name — one carries lines 2/11/52,
// the other carries line 20 (a two-stop shuttle Lázně I <-> Parkoviště KOME).
// resolveStopId() only ever returns the first match, so before this fix search() was
// blind to line 20 no matter which id it silently picked. Ids are looked up by name
// (never hardcoded), per handoff.md — S#/P# are reshuffled by every J8 data refresh.
console.log("\n--- STEP D: same-name stop ids (Lázně I / Parkoviště KOME, line 20) ---");
let stepDAllOk = true;

const laznePK = search(net, "Lázně I", "Parkoviště KOME", { maxTransfers: 1 });
const laznePKDirectLine20 = laznePK.some((r) => r.transfers === 0 && r.legs[0].line === 20);
stepDAllOk = stepDAllOk && laznePKDirectLine20;
console.log(
  (laznePKDirectLine20 ? "  OK   " : "  FAIL ") +
    `Lázně I → Parkoviště KOME: ${laznePK.length} varianta/y, přímá linka 20 ${laznePKDirectLine20 ? "nalezena" : "CHYBÍ"}`
);

const pkLazne = search(net, "Parkoviště KOME", "Lázně I", { maxTransfers: 1 });
const pkLazneDirectLine20 = pkLazne.some((r) => r.transfers === 0 && r.legs[0].line === 20);
stepDAllOk = stepDAllOk && pkLazneDirectLine20;
console.log(
  (pkLazneDirectLine20 ? "  OK   " : "  FAIL ") +
    `Parkoviště KOME → Lázně I (opačný směr): ${pkLazne.length} varianta/y, přímá linka 20 ${pkLazneDirectLine20 ? "nalezena" : "CHYBÍ"}`
);

// No-regression invariant: a name with a single id must return exactly the same
// counts as before the fix — measured by the manager on today's data (2026-08-14).
const kratkaTrznice = search(net, "Krátká", "Tržnice", { maxTransfers: 1 });
const kratkaTrzniceDirect = kratkaTrznice.filter((r) => r.transfers === 0).length;
const noRegression = kratkaTrznice.length === 1296 && kratkaTrzniceDirect === 7;
stepDAllOk = stepDAllOk && noRegression;
console.log(
  (noRegression ? "  OK   " : "  FAIL ") +
    `no-regression: Krátká → Tržnice vrací ${kratkaTrznice.length} variant (${kratkaTrzniceDirect} přímých), čekáno 1296 (7 přímých)`
);

console.time("  STEP D timing: Krátká → Tržnice");
search(net, "Krátká", "Tržnice");
console.timeEnd("  STEP D timing: Krátká → Tržnice");

console.log(stepDAllOk ? "OK: STEP D — všechny scénáře prošly" : "FAIL: STEP D — některý scénář selhal (viz výše)");

// --- STEP C: diacritics-tolerant stop resolution (2026-08-14) ---
// The picker's suggestion matching (matchStopNames) already ignores diacritics, but
// resolution demanded them exactly — so text that autocompletes fine resolved to
// nothing. resolveStopId now retries diacritics-stripped when the exact pass finds
// nothing; the exact pass itself must stay byte-identical.
console.log("\n--- STEP C: diacritics-tolerant resolveStopId ---");
let stepCAllOk = true;

const looseId = resolveStopId(net, "kratka");
const exactId = resolveStopId(net, "Krátká");
const looseOk = looseId !== null && looseId === exactId;
stepCAllOk = stepCAllOk && looseOk;
console.log(
  (looseOk ? "  OK   " : "  FAIL ") +
    `resolveStopId(net, "kratka") = ${looseId}, resolveStopId(net, "Krátká") = ${exactId}`
);

const looseSearch = search(net, "kratka", "trznice", { maxTransfers: 1 });
const looseSearchDirect = looseSearch.filter((r) => r.transfers === 0).length;
const looseSearchOk = looseSearch.length === 1296 && looseSearchDirect === 7;
stepCAllOk = stepCAllOk && looseSearchOk;
console.log(
  (looseSearchOk ? "  OK   " : "  FAIL ") +
    `search(net, "kratka", "trznice") vrací ${looseSearch.length} variant (${looseSearchDirect} přímých), čekáno 1296 (7 přímých) — stejně jako přesný název`
);

// Data guard: if a future data refresh introduces two DIFFERENT exact names that
// collapse to the same diacritics-stripped string, the loose fallback becomes
// ambiguous (resolveStopId would silently pick whichever comes first). This must
// fail loudly, not quietly pick a stop, if that ever happens.
const exactNames = new Set();
for (const id in net.stops) exactNames.add(normalizeName(net.stops[id].n));
const looseToExact = new Map();
let collision = null;
for (const exact of exactNames) {
  const loose = normalizeLoose(exact);
  if (looseToExact.has(loose) && looseToExact.get(loose) !== exact) {
    collision = { loose, a: looseToExact.get(loose), b: exact };
    break;
  }
  looseToExact.set(loose, exact);
}
const guardOk = collision === null;
stepCAllOk = stepCAllOk && guardOk;
console.log(
  (guardOk ? "  OK   " : "  FAIL ") +
    `data guard: ${exactNames.size} přesných názvů → ${looseToExact.size} po odstranění diakritiky` +
    (collision ? ` — KOLIZE: "${collision.a}" i "${collision.b}" → "${collision.loose}"` : ", 0 kolizí")
);

console.log(stepCAllOk ? "OK: STEP C (routing.js) — všechny scénáře prošly" : "FAIL: STEP C (routing.js) — některý scénář selhal (viz výše)");
