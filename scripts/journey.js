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

  // Cache aktivnich sluzeb per kalendarni den — dep2 (viz nize) muze pro ruzne
  // spoje 2. nohy padnout na ruzne kalendarni dny, activeServicesOn se pak muze
  // pro stejny den volat vicekrat.
  const activeCache = new Map();
  function activeOn(d) {
    if (!activeCache.has(d)) activeCache.set(d, activeServicesOn(net, d));
    return activeCache.get(d);
  }

  for (const trip1 of trips1) {
    if (!active1.has(trip1[1])) continue;
    const [dep1Raw, arr1Raw] = tripTimes(net, leg1.patternId, trip1, idxFrom1, idxT1);

    // Monotonni osa (FIX-A): dep1 = prvni odjezd >= nowMin (posun o cele dny,
    // dokud neplati). arr1 dopocitan z rozdilu offsetu, takze arr1 >= dep1 vzdy
    // z konstrukce (offy podel patternu jsou neklesajici).
    let dep1 = dep1Raw;
    while (dep1 < nowMin) dep1 += DAY_MIN;
    const arr1 = dep1 + (arr1Raw - dep1Raw);

    let best = null;

    for (const trip2 of trips2) {
      const [dep2Raw, arr2Raw] = tripTimes(net, leg2.patternId, trip2, idxT2, idxB2);

      // Nejblizsi odjezd 2. nohy na stejne ose >= arr1 + minTransfer (posun o
      // cele dny, dokud neplati) — nahrazuje puvodni dateStr2/dayOffset2/nightAdjust patchwork.
      let dep2 = dep2Raw;
      while (dep2 < arr1 + minTransfer) dep2 += DAY_MIN;

      // Aktivni sluzby 2. nohy se posuzuji pro kalendarni den, na ktery dep2
      // realne padne (muze byt ruzny spoj od spoje — proto kontrola az tady, ne
      // jednou pred smyckou).
      const dayOffset2 = Math.floor(dep2 / DAY_MIN);
      const dateStr2 = dayOffset2 === 0 ? dateStr : addDays(dateStr, dayOffset2);
      if (!activeOn(dateStr2).has(trip2[1])) continue;

      if (!best || dep2 < best.dep2) {
        const arr2 = dep2 + (arr2Raw - dep2Raw);
        best = { dep2, arr2 };
      }
    }
    if (!best) continue;

    // throughService (J4-sort-2, label only): transfer stop is literally the
    // last stop of leg1's pattern AND the first stop of leg2's pattern — bus
    // is standing there and leaving now. NOT proof of "same vehicle" (block_id
    // is empty in the source data); a H1d co-located sibling never counts,
    // since it is a different stop ID by construction.
    const p1 = net.patterns[leg1.patternId];
    const p2 = net.patterns[leg2.patternId];
    const throughService = p1.stops[p1.stops.length - 1] === leg1.to && p2.stops[0] === leg2.from;

    out.push({
      transfers: 1,
      depMin: dep1,
      arrMin: best.arr2,
      totalMin: best.arr2 - dep1,
      legs: [
        { line: leg1.line, headsign: leg1.headsign, patternId: leg1.patternId, from: leg1.from, to: leg1.to, depMin: dep1, arrMin: arr1, hops: leg1.hops },
        { line: leg2.line, headsign: leg2.headsign, patternId: leg2.patternId, from: leg2.from, to: leg2.to, depMin: best.dep2, arrMin: best.arr2, hops: leg2.hops },
      ],
      transferStop: leg1.to,
      waitMin: best.dep2 - arr1,
      // Vsechny prestupy v teto predavce jsou "same-place" — bud doslova stejna
      // zastavka, nebo H1d co-located sourozenec (<=30 m). Pesi presun mezi
      // ruznymi oznacniky (30-200 m) je az epic J9, do te doby vzdy 0.
      walkMin: 0,
      throughService,
    });
  }
  return out;
}

// J4-sort: klic NESMI obsahovat casy jednotlivych nohou — kdyz se prestoupi na
// jine zastavce, nastupuje se do 2. autobusu o jinou minutu, takze per-leg klic
// by tri identicke jizdy (stejna linka, jen jiny presedaci bod) nesloucil.
function itineraryKey(it) {
  return `${it.depMin}|${it.arrMin}|${it.legs.map((l) => l.line).join(">")}`;
}

// Slouceni identickych jizd (J4-sort 1c) — linky jedouci kus trasy spolecne
// generuji N vysledku lisicich se jen presedaci zastavkou (stejny autobus,
// stejny autobus, jen jina volba, kde presednout). Prvni vyskyt = reprezentant,
// z dalsich se sbiraji jen presedaci zastavky do it.viaStops. transferStop
// zustava (= viaStops[0]) kvuli zpetne kompatibilite. U primych spoju a u
// prestupovych bez duplicity viaStops nenastavuje (fallback na transferStop).
function mergeDuplicates(itineraries) {
  const seen = new Map();
  const out = [];
  for (const it of itineraries) {
    const key = itineraryKey(it);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, it);
      out.push(it);
    } else if (it.transfers === 1) {
      if (!existing.viaStops) existing.viaStops = [existing.transferStop];
      if (!existing.viaStops.includes(it.transferStop)) existing.viaStops.push(it.transferStop);
    }
  }
  return out;
}

// Tvrde stropy (J4-sort 1d) — "pravidla maleho mesta": nic realneho v KV
// nepresahne ~55 min jizdy, strop 75 je rezerva. U primych je waitMin null ->
// strop cekani se neaplikuje.
function applyCaps(itineraries, maxTotal, maxWait) {
  return itineraries.filter((it) => it.totalMin <= maxTotal && (it.waitMin == null || it.waitMin <= maxWait));
}

// Odjezdove okno se zebrikem rozsireni (J4-sort 1e) — kdyz je zaklad prazdny
// (hluche obdobi / noc), zkusi se sirsi okno, az uplne bez omezeni.
const WINDOW_LADDER_STEP = 240;
function applyWindowLadder(itineraries, nowMin, windowMin) {
  for (const w of [windowMin, WINDOW_LADDER_STEP, Infinity]) {
    const filtered = itineraries.filter((it) => it.depMin <= nowMin + w);
    if (filtered.length > 0) return filtered;
  }
  return [];
}

// Pareto filtr (J4-sort-2, 1c) — zahodi kazdy itinerar, ke kteremu existuje jiny,
// co odjizdi stejne/pozdeji A prijizdi stejne/driv (horsi v obou rozmerech).
// Jeden pruchod misto O(n^2): serad sestupne podle depMin (vzestupne podle arrMin
// pri shode), pak projizdi skupiny stejneho depMin a sleduje nejlepsi arrMin
// zprava (od nejpozdejsiho odjezdu). Skupina se stejnym depMin i arrMin (ruzne
// linky) je legitimni alternativa a zustava cela.
function paretoFilter(itineraries) {
  const sorted = itineraries.slice().sort((a, b) => (b.depMin !== a.depMin ? b.depMin - a.depMin : a.arrMin - b.arrMin));
  const out = [];
  let minArr = Infinity;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].depMin === sorted[i].depMin) j++;
    const gMin = sorted[i].arrMin; // skupina je uz serazena vzestupne podle arrMin
    if (gMin < minArr) {
      for (let k = i; k < j && sorted[k].arrMin === gMin; k++) out.push(sorted[k]);
      minArr = gMin;
    }
    i = j;
  }
  return out;
}

// Prepinatelne razeni (H2) — pripravene pro UI filtry (prijezd / delka / prestupy),
// aniz by se muselo sahat do jadra. Kazdy klic ma sekundarni tie-break, aby razeni
// bylo stabilni i pri shode hlavniho kriteria. Vychozi je 'smart' (J4-sort, Joe
// 4.8.: v malem meste uvnitr odjezdoveho okna nejdriv prime spoje, pak prestupy,
// obojí chronologicky podle odjezdu).
const SORTERS = {
  departure: (a, b) => (a.depMin !== b.depMin ? a.depMin - b.depMin : a.totalMin !== b.totalMin ? a.totalMin - b.totalMin : a.transfers - b.transfers),
  arrival: (a, b) => (a.arrMin !== b.arrMin ? a.arrMin - b.arrMin : a.totalMin !== b.totalMin ? a.totalMin - b.totalMin : a.transfers - b.transfers),
  duration: (a, b) => (a.totalMin !== b.totalMin ? a.totalMin - b.totalMin : a.depMin - b.depMin),
  transfers: (a, b) => (a.transfers !== b.transfers ? a.transfers - b.transfers : a.depMin - b.depMin),
  // J4-sort-2: cas rozhoduje, kategorie je jen rozstrel pri shode (Joeuv nalez
  // 4.8. — "prime napred" jako hlavni pravidlo skryvalo prestup, co odjizdel
  // i prijizdel drive nez kazdy primy spoj).
  smart: (a, b) =>
    a.depMin !== b.depMin
      ? a.depMin - b.depMin // drivejsi odjezd
      : a.arrMin !== b.arrMin
      ? a.arrMin - b.arrMin // pak drivejsi prijezd
      : a.transfers !== b.transfers
      ? a.transfers - b.transfers // pak prime vyhrava
      : a.totalMin - b.totalMin,
};

function planJourney(net, A, B, opts = {}) {
  const { date, nowMin } = opts;
  // J4-sort-2: 0 = zadny ochranny okraj na prestupu (Joeovo rozhodnuti 4.8. — viz
  // handoff.md). Terminus->origin heuristika (throughService) je jen popisek v
  // karte, nikdy filtr.
  const minTransfer = opts.minTransfer != null ? opts.minTransfer : 0;
  const limit = opts.limit != null ? opts.limit : 8;
  const maxTransfers = opts.maxTransfers != null ? opts.maxTransfers : 1;
  const sortKey = opts.sort && SORTERS[opts.sort] ? opts.sort : "smart";
  const windowMin = opts.windowMin != null ? opts.windowMin : 90;
  const maxTotal = opts.maxTotal != null ? opts.maxTotal : 75;
  const maxWait = opts.maxWait != null ? opts.maxWait : 40;

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

  // FIX-B: pojistka proti chybnym itinerarum (nikdy by nemely projit, ale
  // levna zachranna sit, kdyby neco proklouzlo).
  itineraries = itineraries.filter((it) => it.arrMin > it.depMin && (it.waitMin == null || it.waitMin >= 0));

  // Poradi 1e (J4-sort-2, zavazne): slouceni -> stropy -> okno+zebrik -> Pareto -> razeni -> limit.
  // Pareto az PO okne — varianta mimo okno nesmi smazat viditelnou (a limit az
  // uplne na konci, jinak se filtruje uz useknuty seznam).
  itineraries = mergeDuplicates(itineraries);
  itineraries = applyCaps(itineraries, maxTotal, maxWait);
  itineraries = applyWindowLadder(itineraries, nowMin, windowMin);
  itineraries = paretoFilter(itineraries);

  itineraries.sort(SORTERS[sortKey]);

  return itineraries.slice(0, limit);
}

const MHDJourney = { planJourney };

if (typeof module !== "undefined" && module.exports) module.exports = MHDJourney;
if (typeof window !== "undefined") window.MHDJourney = MHDJourney;

})();
