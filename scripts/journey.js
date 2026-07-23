// Casove planovani spojeni A->B nad data/network.json — KROK B (J3).
// Kombinuje topologii (routing.js: search) a casy (timetable.js: activeServicesOn).
// Zadne zavislosti, Node i prohlizec. Jadro je deterministicke — dostava `date` +
// `nowMin` jako vstup, samo necte systemovy cas (to resi UI v J4).

const { search, resolveStopId } = require("./routing.js");
const { activeServicesOn } = require("./timetable.js");

const DAY_MIN = 1440;

function addDays(dateStr, days) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  const dt = new Date(y, m, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// Nocni prevod (stejne pravidlo jako v timetable.js nextDepartures): kdyz uz je
// vecer (nowMin >= 1080) a cas padne do rana (raw < 420), bere se jako "dnesni
// noc pokracujici zitra" -> +1440, aby slo srovnavat na jedne ose s nowMin.
function nightAdjust(nowMin, raw) {
  return nowMin >= 1080 && raw < 420 ? raw + DAY_MIN : raw;
}

function stopOffsets(net, patternId, trip) {
  // trip[2] (vlastni offs spoje) ma prednost pred sablonou patternu — viz KROK C.
  return trip[2] || net.patterns[patternId].off;
}

function legStopIndices(net, patternId, from, hops) {
  // Konzistentni s routing.js makeLeg(): "from" = prvni vyskyt v patternu,
  // "to" = from + hops (okruzni linky mivaji stopId 2x, indexOf by jinak selhal).
  const stops = net.patterns[patternId].stops;
  const idxFrom = stops.indexOf(from);
  return [idxFrom, idxFrom + hops];
}

function tripTimes(net, patternId, trip, idxFrom, idxTo) {
  const offs = stopOffsets(net, patternId, trip);
  return [trip[0] + offs[idxFrom], trip[0] + offs[idxTo]];
}

function directItineraries(net, leg, dateStr, nowMin) {
  const active = activeServicesOn(net, dateStr);
  const trips = net.trips[leg.patternId] || [];
  const [idxFrom, idxTo] = legStopIndices(net, leg.patternId, leg.from, leg.hops);
  const out = [];

  for (const trip of trips) {
    if (!active.has(trip[1])) continue;
    const [depRaw, arrRaw] = tripTimes(net, leg.patternId, trip, idxFrom, idxTo);
    const depMin = nightAdjust(nowMin, depRaw);
    if (depMin < nowMin) continue;
    const arrMin = nightAdjust(nowMin, arrRaw);

    out.push({
      transfers: 0,
      depMin,
      arrMin,
      totalMin: arrMin - depMin,
      legs: [
        { line: leg.line, headsign: leg.headsign, patternId: leg.patternId, from: leg.from, to: leg.to, depMin, arrMin, hops: leg.hops },
      ],
    });
  }
  return out;
}

function transferItineraries(net, variant, dateStr, nowMin, minTransfer) {
  const [leg1, leg2] = variant.legs;
  const active1 = activeServicesOn(net, dateStr);
  const trips1 = net.trips[leg1.patternId] || [];
  const [idxFrom1, idxT1] = legStopIndices(net, leg1.patternId, leg1.from, leg1.hops);
  const [idxT2, idxB2] = legStopIndices(net, leg2.patternId, leg2.from, leg2.hops);
  const trips2 = net.trips[leg2.patternId] || [];
  const out = [];

  for (const trip1 of trips1) {
    if (!active1.has(trip1[1])) continue;
    const [dep1Raw, arrTRaw] = tripTimes(net, leg1.patternId, trip1, idxFrom1, idxT1);
    const depMin1 = nightAdjust(nowMin, dep1Raw);
    if (depMin1 < nowMin) continue;
    const arrT = nightAdjust(nowMin, arrTRaw);

    // Predel typu dne pres pulnoc (otevrene tema 1): kdyz dojezd na uzel prestupu
    // padne az po pulnoci, 2. noha jede k nasledujicimu kalendarnimu dni.
    let dateStr2 = dateStr;
    let arrTForCompare = arrT;
    let dayOffset2 = 0;
    if (arrT >= DAY_MIN) {
      dateStr2 = addDays(dateStr, 1);
      arrTForCompare = arrT - DAY_MIN;
      dayOffset2 = DAY_MIN;
    }

    const active2 = activeServicesOn(net, dateStr2);
    let best = null;

    for (const trip2 of trips2) {
      if (!active2.has(trip2[1])) continue;
      const [dep2Raw, arrBRaw] = tripTimes(net, leg2.patternId, trip2, idxT2, idxB2);
      // Ve stejnem dni jeste muze jit o nocni presah (nowMin kontext); v ramu
      // nasledujiciho dne uz srovnavame primo v jeho vlastnim rozsahu 0-1439.
      const dep2Cmp = dayOffset2 === 0 ? nightAdjust(nowMin, dep2Raw) : dep2Raw;
      if (dep2Cmp < arrTForCompare + minTransfer) continue;
      if (!best || dep2Cmp < best.dep2Cmp) {
        const arrBCmp = dayOffset2 === 0 ? nightAdjust(nowMin, arrBRaw) : arrBRaw;
        best = { dep2Cmp, arrBCmp };
      }
    }
    if (!best) continue;

    const depMin2 = best.dep2Cmp + dayOffset2;
    const arrB = best.arrBCmp + dayOffset2;

    out.push({
      transfers: 1,
      depMin: depMin1,
      arrMin: arrB,
      totalMin: arrB - depMin1,
      legs: [
        { line: leg1.line, headsign: leg1.headsign, patternId: leg1.patternId, from: leg1.from, to: leg1.to, depMin: depMin1, arrMin: arrT, hops: leg1.hops },
        { line: leg2.line, headsign: leg2.headsign, patternId: leg2.patternId, from: leg2.from, to: leg2.to, depMin: depMin2, arrMin: arrB, hops: leg2.hops },
      ],
      transferStop: leg1.to,
      waitMin: depMin2 - arrT,
    });
  }
  return out;
}

function itineraryKey(it) {
  return it.legs.map((l) => `${l.line}:${l.depMin}`).join("|");
}

function planJourney(net, A, B, opts = {}) {
  const { date, nowMin } = opts;
  const minTransfer = opts.minTransfer != null ? opts.minTransfer : 3;
  const limit = opts.limit != null ? opts.limit : 5;
  const maxTransfers = opts.maxTransfers != null ? opts.maxTransfers : 1;

  const stopA = resolveStopId(net, A);
  const stopB = resolveStopId(net, B);
  if (!stopA || !stopB) return [];

  const variants = search(net, stopA, stopB, { maxTransfers });

  let itineraries = [];
  for (const variant of variants) {
    if (variant.transfers === 0) {
      itineraries = itineraries.concat(directItineraries(net, variant.legs[0], date, nowMin));
    } else {
      itineraries = itineraries.concat(transferItineraries(net, variant, date, nowMin, minTransfer));
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const it of itineraries) {
    const key = itineraryKey(it);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(it);
    }
  }

  deduped.sort((a, b) => {
    if (a.depMin !== b.depMin) return a.depMin - b.depMin;
    if (a.totalMin !== b.totalMin) return a.totalMin - b.totalMin;
    return a.transfers - b.transfers;
  });

  return deduped.slice(0, limit);
}

module.exports = { planJourney };

if (typeof window !== "undefined") {
  window.MHDJourney = { planJourney };
}
