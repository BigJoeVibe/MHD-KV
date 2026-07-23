// Jednorazovy sanity test dat po buildu network.json.
// Spustit: node scripts/verify_network.js
// Kontroly dle docs/DATA_SOURCES.md ("Test / QA, sekce A") a handoff.md KROK 3.

const path = require("path");
const net = require(path.join(__dirname, "..", "data", "network.json"));
const { stopsAfter, resolveStopId, search, coLocatedGroups } = require("./routing.js");
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

// Linka 3, Kratka -> Trznice (P50, viz scripts/routing.test.js)
const workdaySample = "20260202"; // pondeli
const saturdaySample = "20260207"; // sobota
const line3Pattern = "P50";
const workdayCount = countActiveTrips(line3Pattern, workdaySample);
const saturdayCount = countActiveTrips(line3Pattern, saturdaySample);
console.log(`INFO: linka 3 (${line3Pattern}) spoju: pondeli ${workdaySample}=${workdayCount}, sobota ${saturdaySample}=${saturdayCount}`);
if (workdayCount > saturdayCount) {
  pass(`vsedni den hustsi nez sobota (${workdayCount} > ${saturdayCount})`);
} else {
  fail(`vsedni den NENI hustsi nez sobota (${workdayCount} vs ${saturdayCount})`);
}

// --- Vyluka Bohatice,namesti ---
console.log("\n--- Vyluka Bohatice,namesti ---");
const bohaticeId = resolveStopId(net, "Bohatice,náměstí");
if (!bohaticeId) {
  fail('zastavka "Bohatice,náměstí" nenalezena');
} else {
  const patternsWithBohatice = patternIds.filter((pid) => net.patterns[pid].stops.includes(bohaticeId));
  const beforeSample = "20260901"; // pred vylukou (do 11.9.2026)
  const afterSample = "20260915"; // po vyluce (od 12.9.2026)
  const beforeCount = patternsWithBohatice.reduce((sum, pid) => sum + countActiveTrips(pid, beforeSample), 0);
  const afterCount = patternsWithBohatice.reduce((sum, pid) => sum + countActiveTrips(pid, afterSample), 0);
  console.log(`INFO: spoju pres Bohatice,namesti: ${beforeSample}=${beforeCount}, ${afterSample}=${afterCount}`);
  if (beforeCount === 0) {
    pass(`0 spoju do 11.9.2026 (vzorek ${beforeSample})`);
  } else {
    fail(`ocekavano 0 spoju do 11.9.2026, nalezeno ${beforeCount} (vzorek ${beforeSample})`);
  }
  if (afterCount >= 1) {
    pass(`>=1 spoj od 12.9.2026 (vzorek ${afterSample}: ${afterCount})`);
  } else {
    fail(`ocekavano >=1 spoj od 12.9.2026, nalezeno ${afterCount} (vzorek ${afterSample})`);
  }
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

// --- Casove planovani spojeni (J3-B: journey.js) ---
console.log("\n--- Casove planovani spojeni (journey.js) ---");
const minTransferSample = 3;
const journeyResults = planJourney(net, "Krátká", "Růžový vrch", {
  date: workdaySample,
  nowMin: 8 * 60,
  minTransfer: minTransferSample,
  limit: 20,
});
const transferSample = journeyResults.find((it) => it.transfers === 1);
if (transferSample) {
  const [leg1, leg2] = transferSample.legs;
  if (leg2.depMin >= leg1.arrMin + minTransferSample) {
    pass(`prestupni spojeni drzi navaznost (leg2.depMin ${leg2.depMin} >= leg1.arrMin ${leg1.arrMin} + minTransfer ${minTransferSample})`);
  } else {
    fail(`prestupni spojeni NEDRZI navaznost (leg2.depMin ${leg2.depMin} < leg1.arrMin ${leg1.arrMin} + minTransfer ${minTransferSample})`);
  }
} else {
  fail("nenalezeno zadne prestupni spojeni Kratka->Ruzovy vrch pro kontrolu navaznosti");
}

const anySample = journeyResults[0];
if (anySample && anySample.totalMin === anySample.arrMin - anySample.depMin && anySample.totalMin > 0) {
  pass(`totalMin === arrMin - depMin a totalMin > 0 (${anySample.totalMin} min)`);
} else if (anySample) {
  fail(`totalMin neodpovida arrMin-depMin nebo neni kladne (totalMin=${anySample.totalMin}, arrMin-depMin=${anySample.arrMin - anySample.depMin})`);
} else {
  fail("nenalezeno zadne spojeni Kratka->Ruzovy vrch pro kontrolu totalMin");
}

// --- Robustnost routingu (H1) ---
console.log("\n--- Robustnost routingu (H1) ---");

// H1a: bez Pareto filtru musi search() vracet vic nez jen "hop-minimalni" variantu —
// primo i vic 1-prestupovych moznosti soucasne (drivejsi filterDominated by prestupni
// varianty s vic zastavkami zahodil, i kdyz v case mohou byt potreba/rychlejsi).
const hnResults = search(net, "Krátká", "Horní nádraží", { maxTransfers: 1 });
const hnDirect = hnResults.filter((r) => r.transfers === 0).length;
const hnTransfer = hnResults.filter((r) => r.transfers === 1).length;
console.log(`INFO: Kratka->Horni nadrazi: ${hnDirect} primych, ${hnTransfer} 1-prestupovych variant`);
if (hnDirect >= 1 && hnTransfer >= 5) {
  pass(`primo i vic 1-prestupovych variant soucasne (primo ${hnDirect}, prestup ${hnTransfer}) — bez Pareto zahazovani`);
} else {
  fail(`ocekavano >=1 primo a >=5 prestupovych variant, nalezeno primo=${hnDirect} prestup=${hnTransfer}`);
}

// H1b: 2 prestupy zapnute parametrem, vypnute ve vychozim stavu.
const twoTransfer = search(net, "Rozcestí u Koníčka", "Stadion ZM", { maxTransfers: 2 });
const twoTransferCount = twoTransfer.filter((r) => r.transfers === 2).length;
if (twoTransferCount > 0) {
  pass(`maxTransfers:2 vraci >=1 retezec o 2 prestupech (${twoTransferCount})`);
} else {
  fail("maxTransfers:2 nevratilo zadny retezec o 2 prestupech");
}
const defaultNoTwoTransfer = search(net, "Rozcestí u Koníčka", "Stadion ZM").every((r) => r.transfers <= 1);
if (defaultNoTwoTransfer) {
  pass("bez parametru (default maxTransfers=1) se 2 prestupy nevraceji");
} else {
  fail("bez parametru se presto vratily varianty s 2 prestupy — default se nechova jako drive");
}

// H1c: smyckovy pattern (P5, linka 12, Pivovar<->Trznice) musi vratit >=2 variant
// primeho spoje (kratka cesta i cesta pres celou smycku), s ruznymi fromIdx.
const loopResults = search(net, "Pivovar", "Tržnice", { maxTransfers: 0 }).filter((r) => r.legs[0].patternId === "P5");
const distinctFromIdx = new Set(loopResults.map((r) => r.legs[0].fromIdx));
if (loopResults.length >= 2 && distinctFromIdx.size >= 2) {
  pass(`smyckovy pattern P5 (Pivovar->Trznice) vraci ${loopResults.length} varianty z ${distinctFromIdx.size} ruznych vyskytu zastavky`);
} else {
  fail(`smyckovy pattern P5 (Pivovar->Trznice) vratil jen ${loopResults.length} variant(y), ${distinctFromIdx.size} vyskyt(u) — ocekavano >=2/>=2`);
}

// H1d: co-located prestup (Parkoviste KOME na lince 20 -> Lazne I S155 -> S116 -> linka 2/52).
const coLocResults = search(net, "Parkoviště KOME", "Tržnice", { maxTransfers: 1 });
const coLocFound = coLocResults.some((r) => r.coLocated);
if (coLocFound) {
  pass("co-located prestup Parkoviste KOME -> (S155<->S116 Lazne I) -> Trznice nalezen");
} else {
  fail("co-located prestup Parkoviste KOME -> Trznice NENALEZEN (H1d nefunguje)");
}

// --- Souhrn ---
console.log("\n=== SOUHRN ===");
console.log(`PASS: ${passCount}, FAIL: ${failCount}`);
if (failCount > 0) process.exitCode = 1;
