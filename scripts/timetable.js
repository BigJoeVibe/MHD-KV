// Casova vrstva nad data/network.json — "jede/nejede k datu" a "nejblizsi odjezdy".
// Zadne zavislosti. Pouzitelne v Node (test) i v prohlizeci (pozdeji J4).
// POZOR: zatim se NEintegruje do routing.js search() — to je az KROK B.

// IIFE: viz routing.js — izoluje top-level jmena od ostatnich <script src> modulu.
(function () {

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

// Same matching rule as routing.js resolveStopId (prefix-strip + trim + lowercase),
// duplicated here on purpose — routing.js is off-limits for this handoff and does not
// export normalizeName.
function normalizeName(name) {
  return name.replace(/^Karlovy Vary,/, "").trim().toLowerCase();
}

// Diacritics-stripped normalizeName, for a second-pass fallback ONLY (STEP C1) — see
// routing.js's copy of the same helper for why the exact pass must stay untouched.
function normalizeLoose(name) {
  return normalizeName(name).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Unlike resolveStopId (first match only), returns EVERY stop id sharing the name —
// e.g. "Lázně I" is split across S63 (lines 2/11/52) and S143 (line 20 only).
function resolveStopIds(net, stopIdOrName) {
  if (net.stops[stopIdOrName]) return [stopIdOrName];
  const target = normalizeName(stopIdOrName);
  const ids = [];
  for (const id in net.stops) {
    if (normalizeName(net.stops[id].n) === target) ids.push(id);
  }
  if (ids.length > 0) return ids;
  const loose = normalizeLoose(stopIdOrName);
  for (const id in net.stops) {
    if (normalizeLoose(net.stops[id].n) === loose) ids.push(id);
  }
  return ids;
}

// Board for a stop name/id: merges nextDepartures() across every id resolveStopIds
// finds, so a name split across stop ids (see resolveStopIds) still shows all lines.
function boardDepartures(net, stopIdOrName, dateStr, nowMin, opts = {}) {
  const limit = opts.limit != null ? opts.limit : 10;
  const ids = resolveStopIds(net, stopIdOrName);
  const rows = [];
  for (const id of ids) {
    rows.push(...nextDepartures(net, id, dateStr, nowMin, { limit: limit * 4 }));
  }
  rows.sort((a, b) => a.depMin - b.depMin);
  return rows.slice(0, limit);
}

// Diacritics- and case-insensitive substring matcher for the stop picker (STEP 2).
// Pure/testable in Node — no DOM.
function normalizeForMatch(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchStopNames(names, query, limit = 8) {
  const limitN = limit != null ? limit : 8;
  const q = normalizeForMatch(String(query).trim());
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const name of names) {
    const norm = normalizeForMatch(name);
    if (norm.startsWith(q)) starts.push(name);
    else if (norm.includes(q)) contains.push(name);
  }
  starts.sort((a, b) => a.localeCompare(b, "cs"));
  contains.sort((a, b) => a.localeCompare(b, "cs"));
  return [...starts, ...contains].slice(0, limitN);
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

const MHDTimetable = {
  isServiceActive, activeServicesOn, patternDeparturesOn, nextDepartures,
  resolveStopIds, boardDepartures, matchStopNames, normalizeName, normalizeLoose
};

if (typeof module !== "undefined" && module.exports) module.exports = MHDTimetable;
if (typeof window !== "undefined") window.MHDTimetable = MHDTimetable;

})();
