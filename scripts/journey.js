// Casove planovani spojeni A->B nad data/network.json — KROK B (J3).
// Kombinuje topologii (routing.js: search) a casy (timetable.js: activeServicesOn).
// Zadne zavislosti, Node i prohlizec. Jadro je deterministicke — dostava `date` +
// `nowMin` jako vstup, samo necte systemovy cas (to resi UI v J4).

// IIFE: viz routing.js — izoluje top-level jmena od ostatnich <script src> modulu.
(function () {

const routing = (typeof require !== "undefined" && typeof module !== "undefined") ? require("./routing.js") : window.MHDRouting;
const timetable = (typeof require !== "undefined" && typeof module !== "undefined") ? require("./timetable.js") : window.MHDTimetable;
const { search, resolveStopId } = routing;
const { activeServicesOn } = timetable;

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

function tripTimes(net, patternId, trip, idxFrom, idxTo) {
  const offs = stopOffsets(net, patternId, trip);
  return [trip[0] + offs[idxFrom], trip[0] + offs[idxTo]];
}

function directItineraries(net, leg, dateStr, nowMin) {
  const active = activeServicesOn(net, dateStr);
  const trips = net.trips[leg.patternId] || [];
  // leg.fromIdx/leg.toIdx prijdou primo z routing.js (search()) — presna pozice
  // v ramci patternu, i pro smyckove patterny se 2 vyskyty stejne zastavky.
  const [idxFrom, idxTo] = [leg.fromIdx, leg.toIdx];
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
  const [idxFrom1, idxT1] = [leg1.fromIdx, leg1.toIdx];
  const [idxT2, idxB2] = [leg2.fromIdx, leg2.toIdx];
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
      // Vsechny prestupy v teto predavce jsou "same-place" — bud doslova stejna
      // zastavka, nebo H1d co-located sourozenec (<=30 m). Pesi presun mezi
      // ruznymi oznacniky (30-200 m) je az epic J9, do te doby vzdy 0.
      walkMin: 0,
    });
  }
  return out;
}

function itineraryKey(it) {
  return it.legs.map((l) => `${l.line}:${l.depMin}`).join("|");
}

// Prepinatelne razeni (H2) — pripravene pro UI filtry (prijezd / delka / prestupy),
// aniz by se muselo sahat do jadra. Kazdy klic ma sekundarni tie-break, aby razeni
// bylo stabilni i pri shode hlavniho kriteria. Vychozi je 'departure' (Joe: zatim
// prio nejblizsi odjezd).
const SORTERS = {
  departure: (a, b) => (a.depMin !== b.depMin ? a.depMin - b.depMin : a.totalMin !== b.totalMin ? a.totalMin - b.totalMin : a.transfers - b.transfers),
  arrival: (a, b) => (a.arrMin !== b.arrMin ? a.arrMin - b.arrMin : a.totalMin !== b.totalMin ? a.totalMin - b.totalMin : a.transfers - b.transfers),
  duration: (a, b) => (a.totalMin !== b.totalMin ? a.totalMin - b.totalMin : a.depMin - b.depMin),
  transfers: (a, b) => (a.transfers !== b.transfers ? a.transfers - b.transfers : a.depMin - b.depMin),
};

function planJourney(net, A, B, opts = {}) {
  const { date, nowMin } = opts;
  const minTransfer = opts.minTransfer != null ? opts.minTransfer : 3;
  const limit = opts.limit != null ? opts.limit : 8;
  const maxTransfers = opts.maxTransfers != null ? opts.maxTransfers : 1;
  const sortKey = opts.sort && SORTERS[opts.sort] ? opts.sort : "departure";

  const stopA = resolveStopId(net, A);
  const stopB = resolveStopId(net, B);
  if (!stopA || !stopB) return [];

  const variants = search(net, stopA, stopB, { maxTransfers });

  let itineraries = [];
  for (const variant of variants) {
    if (variant.transfers === 0) {
      itineraries = itineraries.concat(directItineraries(net, variant.legs[0], date, nowMin));
    } else if (variant.transfers === 1) {
      itineraries = itineraries.concat(transferItineraries(net, variant, date, nowMin, minTransfer));
    }
    // transfers === 2 (H1b): casova vrstva pro retezec o 2 prestupech zatim
    // neni implementovana (mimo rozsah teto predavky) — search() s maxTransfers:2
    // je pripraveny pro budouci UI "dalsi moznosti", journey.js ho zatim
    // preskakuje, aby nevracel nekompletni/spatny itinerar (jen 2 ze 3 nohou).
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

  deduped.sort(SORTERS[sortKey]);

  return deduped.slice(0, limit);
}

const MHDJourney = { planJourney };

if (typeof module !== "undefined" && module.exports) module.exports = MHDJourney;
if (typeof window !== "undefined") window.MHDJourney = MHDJourney;

})();
