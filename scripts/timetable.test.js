// Node test pro scripts/timetable.js — spustit: node scripts/timetable.test.js

const path = require("path");
const { nextDepartures, resolveStopIds, boardDepartures, matchStopNames } = require("./timetable.js");
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

// ============================================================
// J7-P2 — resolveStopIds / boardDepartures (Lázně I = S63 + S143) / matchStopNames
// ============================================================
console.log("\n--- J7-P2: resolveStopIds / boardDepartures / matchStopNames ---");

const DAY = "20260812"; // streda, referencni den ze spec (handoff.md)
let j7p2AllOk = true;

function check(label, ok) {
  console.log((ok ? "  OK   " : "  FAIL ") + label);
  if (!ok) j7p2AllOk = false;
  return ok;
}

// resolveStopIds by name -> vsechny id se shodnym nazvem (Lazne I je rozdelena na 2 id).
// POZOR (J8-fix): S#/P# id nejsou stabilni mezi obnovami dat, nehardcodovat literaly —
// dohledat spravnou sadu id primo z net.stops podle jmena, stejne jako verify_network.js.
const lazneExpectedIds = Object.keys(net.stops).filter((id) => net.stops[id].n === "Lázně I").sort();
const lazneIds = resolveStopIds(net, "Lázně I").slice().sort();
check(`resolveStopIds("Lázně I") -> vsechna id jmena "Lázně I" (ocekavano ${JSON.stringify(lazneExpectedIds)}, skutecne ${JSON.stringify(lazneIds)})`,
  lazneExpectedIds.length === 2 && JSON.stringify(lazneIds) === JSON.stringify(lazneExpectedIds));

// resolveStopIds by id -> jen to jedno id (id samotne dohledane vyse, ne literal)
const oneLazneId = lazneExpectedIds[0];
const oneIdResult = resolveStopIds(net, oneLazneId);
check(`resolveStopIds("${oneLazneId}") -> ["${oneLazneId}"] (skutecne ${JSON.stringify(oneIdResult)})`,
  oneIdResult.length === 1 && oneIdResult[0] === oneLazneId);

// merged board — Lazne I musi obsahovat linku 20 (jinak by S143 byla neviditelna)
const lazneBoard = boardDepartures(net, "Lázně I", DAY, 600, { limit: 10 });
check("boardDepartures(Lázně I, 10:00) obsahuje aspon jeden radek linky 20",
  lazneBoard.some((r) => r.line === 20));
check(`boardDepartures(Lázně I, 10:00) prvni radek je 10:03 linka 2 (skutecne ${lazneBoard[0] ? fmt(lazneBoard[0].depMin) + " linka " + lazneBoard[0].line : "(prazdne)"})`,
  lazneBoard[0] && lazneBoard[0].depMin === 603 && lazneBoard[0].line === 2);

// chronologicke razeni + respektovani limitu
const chronoOk = lazneBoard.every((r, i) => i === 0 || r.depMin >= lazneBoard[i - 1].depMin);
check("boardDepartures(Lázně I) je chronologicke (neklesajici depMin)", chronoOk);
check(`boardDepartures(Lázně I, limit 10) respektuje limit (skutecne ${lazneBoard.length} radku)`,
  lazneBoard.length <= 10);

// hub — Trznice, prvni odjezd v 10:00 (linka 13 nebo 6, obe odjizdi ve stejnou minutu)
const trznBoard = boardDepartures(net, "Tržnice", DAY, 600, { limit: 8 });
check(`boardDepartures(Tržnice, 10:00) prvni radek odjizdi v 10:00 (skutecne ${trznBoard[0] ? fmt(trznBoard[0].depMin) : "(prazdne)"})`,
  trznBoard[0] && trznBoard[0].depMin === 600);

// noc — Kratka 23:50, zadny radek s depMin < nowMin (pulnocni prechod uz resi nextDepartures)
const nightBoard = boardDepartures(net, "Krátká", DAY, 23 * 60 + 50, { limit: 5 });
check("boardDepartures(Krátká, 23:50) neni prazdne", nightBoard.length > 0);
check("boardDepartures(Krátká, 23:50) — zadny radek nema depMin < nowMin",
  nightBoard.every((r) => r.depMin >= 23 * 60 + 50));

// matchStopNames — diakritika/case insensitive substring, "starts with" napred
const stopNames = [...new Set(Object.values(net.stops).map((s) => s.n))];
check(`matchStopNames("lazne") obsahuje Lázně I i Lázně III (skutecne ${JSON.stringify(matchStopNames(stopNames, "lazne"))})`,
  (() => { const m = matchStopNames(stopNames, "lazne"); return m.includes("Lázně I") && m.includes("Lázně III"); })());
check(`matchStopNames("krat") -> [Krátká] (skutecne ${JSON.stringify(matchStopNames(stopNames, "krat"))})`,
  JSON.stringify(matchStopNames(stopNames, "krat")) === JSON.stringify(["Krátká"]));
check(`matchStopNames("trznice") -> [Tržnice] (skutecne ${JSON.stringify(matchStopNames(stopNames, "trznice"))})`,
  JSON.stringify(matchStopNames(stopNames, "trznice")) === JSON.stringify(["Tržnice"]));
check(`matchStopNames("horni nad") -> [Horní nádraží] (skutecne ${JSON.stringify(matchStopNames(stopNames, "horni nad"))})`,
  JSON.stringify(matchStopNames(stopNames, "horni nad")) === JSON.stringify(["Horní nádraží"]));
check(`matchStopNames("zzz-neexistuje") -> [] (skutecne ${JSON.stringify(matchStopNames(stopNames, "zzz-neexistuje"))})`,
  matchStopNames(stopNames, "zzz-neexistuje").length === 0);

console.log(j7p2AllOk ? "\nOK: J7-P2 — všechny scénáře prošly" : "\nFAIL: J7-P2 — některý scénář selhal (viz výše)");

// ============================================================
// STEP C — diacritics-tolerant resolveStopIds (2026-08-14)
// ============================================================
console.log("\n--- STEP C: diacritics-tolerant resolveStopIds ---");
let stepCAllOk = true;
function checkC(label, ok) {
  console.log((ok ? "  OK   " : "  FAIL ") + label);
  if (!ok) stepCAllOk = false;
  return ok;
}

// tolerant, by name — same ids as the exact-name call, regardless of order
const kratkaLoose = resolveStopIds(net, "Kratka").slice().sort();
const kratkaExact = resolveStopIds(net, "Krátká").slice().sort();
checkC(`resolveStopIds("Kratka") = resolveStopIds("Krátká") (skutecne ${JSON.stringify(kratkaLoose)} vs ${JSON.stringify(kratkaExact)})`,
  kratkaExact.length > 0 && JSON.stringify(kratkaLoose) === JSON.stringify(kratkaExact));

// tolerant board — merged Lázně I board (line 20 included), same rows regardless of typed diacritics
const lazneLooseBoard = boardDepartures(net, "lazne i", DAY, 600, { limit: 10 });
const lazneExactBoard = boardDepartures(net, "Lázně I", DAY, 600, { limit: 10 });
checkC(`boardDepartures("lazne i") = boardDepartures("Lázně I") (${lazneLooseBoard.length} vs ${lazneExactBoard.length} radku)`,
  JSON.stringify(lazneLooseBoard) === JSON.stringify(lazneExactBoard));
checkC("boardDepartures(\"lazne i\") obsahuje aspon jeden radek linky 20",
  lazneLooseBoard.some((r) => r.line === 20));

// still strict about nonsense — no fallback match for a name that isn't close to any stop
checkC('resolveStopIds("zzz-neexistuje") -> [] (stale prazdne i po loose fallbacku)',
  resolveStopIds(net, "zzz-neexistuje").length === 0);

console.log(stepCAllOk ? "OK: STEP C (timetable.js) — všechny scénáře prošly" : "FAIL: STEP C (timetable.js) — některý scénář selhal (viz výše)");
