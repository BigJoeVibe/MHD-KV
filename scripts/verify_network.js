// Jednorazovy sanity test dat po buildu network.json.
// Spustit: node scripts/verify_network.js
// Kontroly dle docs/DATA_SOURCES.md ("Test / QA, sekce A") a handoff.md KROK 3.

const path = require("path");
const net = require(path.join(__dirname, "..", "data", "network.json"));
const { stopsAfter, resolveStopId, coLocatedGroups } = require("./routing.js");
const { nextDepartures } = require("./timetable.js");
const { planJourney } = require("./journey.js");

let passCount = 0;
let failCount = 0;

function pass(msg) {
  console.log(`PASS: ${msg}`);
  passCount++;
}

function fail(msg) {
  console.log(`FAIL: ${msg}`);
  failCount++;
}

// --- Struktura ---
console.log("--- Struktura ---");
for (const key of ["stops", "patterns", "trips", "services"]) {
  if (net[key] && typeof net[key] === "object") {
    pass(`net.${key} existuje`);
  } else {
    fail(`net.${key} chybi`);
  }
}
if (net.meta && Array.isArray(net.meta.lines) && net.meta.lines.length === 23) {
  pass(`meta.lines ma 23 linek (${net.meta.lines.length})`);
} else {
  fail(`meta.lines nema 23 linek (ma ${net.meta && net.meta.lines ? net.meta.lines.length : "?"})`);
}

// --- Uplnost ---
console.log("\n--- Uplnost ---");
const stopIds = Object.keys(net.stops);
let withName = 0;
let withGps = 0;
const zeroGps = [];
for (const id of stopIds) {
  const s = net.stops[id];
  if (s.n) withName++;
  const validGps = typeof s.lat === "number" && typeof s.lon === "number" && s.lat !== 0 && s.lon !== 0;
  if (validGps) withGps++;
  else if (typeof s.lat === "number" && typeof s.lon === "number") zeroGps.push(`${id} (${s.n}): ${s.lat},${s.lon}`);
}
if (withName === stopIds.length) {
  pass(`vsechny zastavky maji jmeno (${withName}/${stopIds.length})`);
} else {
  fail(`chybi jmeno u ${stopIds.length - withName} zastavek`);
}
console.log(`INFO: zastavek s validni GPS (0,0 se nepocita): ${withGps}/${stopIds.length} (ocekavano 157/157)`);
if (withGps === stopIds.length) {
  pass("vsechny zastavky maji validni GPS (zadna 0,0)");
} else {
  fail(`${stopIds.length - withGps} zastavek ma chybejici/nulovou GPS: ${zeroGps.join("; ")}`);
}

// --- Integrita ---
console.log("\n--- Integrita ---");
const patternIds = Object.keys(net.patterns);
let badPatternShape = 0;
let missingTrips = 0;
for (const pid of patternIds) {
  const p = net.patterns[pid];
  if (!(p.stops.length >= 2 && p.off.length === p.stops.length)) badPatternShape++;
  if (!(pid in net.trips)) missingTrips++;
}
if (badPatternShape === 0) {
  pass(`vsechny patterny maji >=2 zastavky a off.length===stops.length (${patternIds.length} patternu)`);
} else {
  fail(`${badPatternShape} patternu ma spatny tvar (stops/off)`);
}
if (missingTrips === 0) {
  pass("kazdy pattern ma klic v trips");
} else {
  fail(`${missingTrips} patternu nema klic v trips`);
}

let badServiceRefs = 0;
for (const pid of patternIds) {
  const trips = net.trips[pid] || [];
  for (const [, serviceId] of trips) {
    if (!(serviceId in net.services)) badServiceRefs++;
  }
}
if (badServiceRefs === 0) {
  pass("kazdy serviceId v trips existuje v services");
} else {
  fail(`${badServiceRefs} odkazu na neexistujici serviceId`);
}

// --- Co-located zastavky (H1d) ---
console.log("\n--- Co-located zastavky (H1d, pro rucni kontrolu) ---");
function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const coGroups = coLocatedGroups(net);
console.log(`INFO: nalezeno ${coGroups.length} skupin co-located zastavek (zkontroluj rucne, ze nejde o 2 ruzna mista):`);
let maxGroupDist = 0;
for (const g of coGroups) {
  const names = g.map((id) => `${id} "${net.stops[id].n}"`).join("  <->  ");
  let dists = [];
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) {
      const d = haversineM(net.stops[g[i]], net.stops[g[j]]);
      dists.push(d);
      if (d > maxGroupDist) maxGroupDist = d;
    }
  }
  console.log(`  ${names}  (${dists.map((d) => d.toFixed(0)).join(", ")} m)`);
}
if (coGroups.length > 0 && coGroups.length <= 10 && maxGroupDist <= 60) {
  pass(`co-located skupiny v rozumnem poctu a vzdalenosti (max ${maxGroupDist.toFixed(0)} m)`);
} else {
  fail(`co-located skupiny podezrele (pocet ${coGroups.length}, max vzdalenost ${maxGroupDist.toFixed(0)} m) - zkontroluj rucne`);
}

// --- Logika dne ---
console.log("\n--- Logika dne ---");

function isServiceActive(service, dateStr) {
  if (service.rem.includes(dateStr)) return false;
  if (service.add.includes(dateStr)) return true;
  if (dateStr < service.s || dateStr > service.e) return false;
  const date = new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(4, 6)) - 1,
    Number(dateStr.slice(6, 8))
  );
  const dow = (date.getDay() + 6) % 7; // Po=0 ... Ne=6
  return service.d[dow] === 1;
}

function countActiveTrips(patternId, dateStr) {
  const trips = net.trips[patternId] || [];
  let n = 0;
  for (const [, serviceId] of trips) {
    if (isServiceActive(net.services[serviceId], dateStr)) n++;
  }
  return n;
}

// Patternova/S# id jsou per-build volatilni (JrUtil je pri kazde obnove preciska,
// viz docs/DATA_SOURCES.md) - dohledavame pattern pres linku + nazvy zastavek, ne natvrdo.
function findPattern(net, line, fromName, toName) {
  const fromId = resolveStopId(net, fromName);
  const toId = resolveStopId(net, toName);
  if (!fromId || !toId) return null;
  for (const pid in net.patterns) {
    const p = net.patterns[pid];
    if (p.line !== line) continue;
    const fromIdx = p.stops.indexOf(fromId);
    const toIdx = p.stops.indexOf(toId);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) return pid;
  }
  return null;
}

// Nekolik paterizch linek/domovskych smeru - staci, ze JEDNA z nich ma vsedni > vikend
// (odolne vuci pripadnemu pretrasovani jedne konkretni linky mezi obnovami dat, misto
// natvrdo linky 3 - HF-4).
const workdaySample = "20260202"; // pondeli
const saturdaySample = "20260207"; // sobota
const BACKBONE_ROUTES = [
  [3, "Krátká", "Tržnice"],
  [9, "Krátká", "Tržnice"],
  [13, "Okružní", "Tržnice"],
  [15, "Okružní", "Tržnice"],
];
let dayLogicOk = false;
for (const [line, from, to] of BACKBONE_ROUTES) {
  const pid = findPattern(net, line, from, to);
  if (!pid) continue;
  const workdayCount = countActiveTrips(pid, workdaySample);
  const saturdayCount = countActiveTrips(pid, saturdaySample);
  console.log(`INFO: linka ${line} (${pid}) spoju: vsedni ${workdaySample}=${workdayCount}, sobota ${saturdaySample}=${saturdayCount}`);
  if (workdayCount > saturdayCount) {
    pass(`paterni linka ${line} ma vsedni den hustsi nez sobota (${workdayCount} > ${saturdayCount})`);
    dayLogicOk = true;
    break;
  }
}
if (!dayLogicOk) {
  fail("zadna z paterizch linek (3/9/13/15) nema vsedni den hustsi nez sobota - zkontroluj kalendarni logiku");
}

// --- Vyjimky kalendare (calendar_dates se promitaji do modelu) ---
// HF-3: nahrazuje drivejsi natvrdo test vyluky Bohatice (20260901/20260915) -
// ten spadne, jakmile vyluka skonci nebo ji zdroj zmeni. Obecny invariant: existuje
// >=1 sluzba s neprazdnym rem/add (tj. mechanismus calendar_dates se do modelu
// vubec propisuje), bez vazby na konkretni zastavku/termin.
console.log("\n--- Vyjimky kalendare (services rem/add) ---");
const servicesWithExceptions = Object.values(net.services).filter(
  (s) => (s.rem && s.rem.length > 0) || (s.add && s.add.length > 0)
).length;
if (servicesWithExceptions > 0) {
  pass(`vyjimky kalendare (rem/add) se promitaji do modelu (${servicesWithExceptions} sluzeb ma vyjimku)`);
} else {
  fail("zadna sluzba nema kalendarni vyjimku (rem/add) - mechanismus calendar_dates se nepromita do modelu");
}

// --- Smerovost ---
console.log("\n--- Smerovost ---");
const kratkaId = resolveStopId(net, "Krátká");
const trznidceId = resolveStopId(net, "Tržnice");
const directionOk = patternIds.every((pid) => {
  const p = net.patterns[pid];
  if (!p.stops.includes(kratkaId) || !p.stops.includes(trznidceId)) return true;
  // pokud je Trznice PRED Kratkou ve stops, muselo by to byt protismerne zarazeni Trznice do "po Kratke"
  const after = stopsAfter(net, pid, kratkaId);
  const before = p.stops.slice(0, p.stops.indexOf(kratkaId));
  // smerovy pattern smi mit Trznici bud pred, nebo po Kratke - nikdy soucasne (to by byla smycka pres stejnou zastavku 2x)
  return !(after.includes(trznidceId) && before.includes(trznidceId));
});
if (directionOk) {
  pass("odjezdy z Kratke smer Trznice neobsahuji protismer v ramci jednoho patternu");
} else {
  fail("nalezen pattern s Trznici pred i po Kratke (mozna smycka/duplicitni zaznam)");
}

// --- Casova vrstva (J3-lite) ---
console.log("\n--- Casova vrstva (J3-lite) ---");
const depsWorkday = nextDepartures(net, "Krátká", workdaySample, 0, { limit: 1000 });
const depsSaturday = nextDepartures(net, "Krátká", saturdaySample, 0, { limit: 1000 });

if (depsWorkday.length > 0) {
  pass(`nextDepartures z Kratke (vsedni ${workdaySample}) vraci neprazdne pole (${depsWorkday.length} odjezdu)`);
} else {
  fail(`nextDepartures z Kratke (vsedni ${workdaySample}) vratilo prazdne pole`);
}

const isIncreasing = depsWorkday.every((r, i) => i === 0 || r.depMin >= depsWorkday[i - 1].depMin);
if (isIncreasing) {
  pass("casy z nextDepartures jsou rostouci (vzestupne serazene)");
} else {
  fail("casy z nextDepartures NEJSOU rostouci");
}

console.log(`INFO: Kratka odjezdu: vsedni ${workdaySample}=${depsWorkday.length}, sobota ${saturdaySample}=${depsSaturday.length}`);
if (depsWorkday.length > depsSaturday.length) {
  pass(`vsedni den ma vic odjezdu z Kratke nez sobota (${depsWorkday.length} > ${depsSaturday.length})`);
} else {
  fail(`vsedni den NEMA vic odjezdu z Kratke nez sobota (${depsWorkday.length} vs ${depsSaturday.length})`);
}

const noNegative = depsWorkday.every((r) => r.depMin >= 0) && depsSaturday.every((r) => r.depMin >= 0);
if (noNegative) {
  pass("zadny depMin neni zaporny");
} else {
  fail("nalezen zaporny depMin");
}

// --- Smoke test: data x engine (HF-2, invariant zdraveho feedu) ---
// Nahrazuje drivejsi test navaznosti prestupu Kratka->Ruzovy vrch (HF-4, snimkove
// specifikum - konkretni prestupova varianta se muze mezi obnovami zmenit/prestat
// existovat). Kratka->Trznice je paterni smer s castym primym spojem, ktery musi
// fungovat v kazdem zdravem KV buildu. Behaviorem journey.js (navaznost prestupu atd.)
// se zabyvaji tolerantni testy v journey.test.js (nebloki automat).
console.log("\n--- Smoke test: planJourney Kratka -> Trznice ---");
const smokeResults = planJourney(net, "Krátká", "Tržnice", {
  date: workdaySample,
  nowMin: 8 * 60,
});
if (smokeResults.length > 0) {
  pass(`planJourney Kratka->Trznice vraci >=1 spojeni (${smokeResults.length})`);
} else {
  fail("planJourney Kratka->Trznice nevratilo zadne spojeni - paterni smer by mel mit spoj v kazdem zdravem buildu");
}
const smokeFirst = smokeResults[0];
if (smokeFirst && smokeFirst.arrMin > smokeFirst.depMin && smokeFirst.totalMin === smokeFirst.arrMin - smokeFirst.depMin) {
  pass(`casy prvniho spojeni jsou konzistentni (dep ${smokeFirst.depMin} < arr ${smokeFirst.arrMin}, totalMin ${smokeFirst.totalMin})`);
} else if (smokeFirst) {
  fail(`casy prvniho spojeni nejsou konzistentni (dep ${smokeFirst.depMin}, arr ${smokeFirst.arrMin}, totalMin ${smokeFirst.totalMin})`);
}

// --- Souhrn ---
// Robustnost routingu (drive H1a-d zde) presunuta do routing.test.js/journey.test.js
// (HF-1) - testuje CHOVANI kodu na konkretnim snimku dat, ne invarianty zdraveho
// buildu, a NESMI blokovat auto-guard. Spustit rucne: node scripts/routing.test.js,
// node scripts/journey.test.js.
console.log("\n=== SOUHRN ===");
console.log(`PASS: ${passCount}, FAIL: ${failCount}`);
if (failCount > 0) process.exitCode = 1;
