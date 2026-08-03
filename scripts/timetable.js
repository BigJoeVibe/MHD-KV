// Casova vrstva nad data/network.json — "jede/nejede k datu" a "nejblizsi odjezdy".
// Zadne zavislosti. Pouzitelne v Node (test) i v prohlizeci (pozdeji J4).
// POZOR: zatim se NEintegruje do routing.js search() — to je az KROK B.

const routing = (typeof require !== "undefined" && typeof module !== "undefined") ? require("./routing.js") : window.MHDRouting;
const { resolveStopId } = routing;

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

function activeServicesOn(net, dateStr) {
  const active = new Set();
  for (const serviceId in net.services) {
    if (isServiceActive(net.services[serviceId], dateStr)) active.add(serviceId);
  }
  return active;
}

function patternDeparturesOn(net, patternId, dateStr) {
  const trips = net.trips[patternId] || [];
  const active = activeServicesOn(net, dateStr);
  const startMins = [];
  for (const [startMin, serviceId] of trips) {
    if (active.has(serviceId)) startMins.push(startMin);
  }
  startMins.sort((a, b) => a - b);
  return startMins;
}

function firstNonLastIndex(stops, stopId) {
  // Prvni vyskyt stopId, ktery NENI posledni zastavkou patternu (smerove, konzistentni
  // se stopsAfter — z konecne se dal neodjizdi). Okruzni linky mivaji stopId 2x.
  for (let i = 0; i < stops.length; i++) {
    if (stops[i] === stopId && i < stops.length - 1) return i;
  }
  return -1;
}

function nextDepartures(net, stopIdOrName, dateStr, nowMin, opts = {}) {
  const limit = opts.limit != null ? opts.limit : 5;
  const stopId = resolveStopId(net, stopIdOrName);
  const results = [];
  if (!stopId) return results;

  const active = activeServicesOn(net, dateStr);

  for (const patternId in net.patterns) {
    const pattern = net.patterns[patternId];
    const stopIndex = firstNonLastIndex(pattern.stops, stopId);
    if (stopIndex === -1) continue;

    const trips = net.trips[patternId] || [];
    for (const trip of trips) {
      const [startMin, serviceId, tripOffs] = trip;
      if (!active.has(serviceId)) continue;
      // Pozor: ~45 % spoju ma vlastni "offs" (spicka/sedlo se lisi od sablony
      // patternu) — 3. prvek tripu. Kdyz chybi, pouzit sablonu pattern.off.
      const offset = (tripOffs || pattern.off)[stopIndex];
      let depMin = startMin + offset;
      // Noční přesah (linka 51 a pod.) — konvence z CLAUDE.md getUpcomingDepartures:
      // kolem půlnoci se pozdní odjezd počítá vůči "dnešku" i po přechodu do dalšího dne.
      if (nowMin >= 1080 && depMin < 420) depMin += 1440;
      if (depMin >= nowMin) {
        results.push({ line: pattern.line, headsign: pattern.headsign, patternId, stopIndex, depMin });
      }
    }
  }

  results.sort((a, b) => a.depMin - b.depMin);
  return results.slice(0, limit);
}

const MHDTimetable = { isServiceActive, activeServicesOn, patternDeparturesOn, nextDepartures };

if (typeof module !== "undefined" && module.exports) module.exports = MHDTimetable;
if (typeof window !== "undefined") window.MHDTimetable = MHDTimetable;
