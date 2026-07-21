// Routing A->B nad data/network.json — topologicky, BEZ casu (cas resi J3).
// Zadne zavislosti. Pouzitelne v Node (test) i v prohlizeci (J4) — funkce dostavaji
// `net` (naparsovany network.json) jako parametr, modul si data sam nenacita.

const HUBS = ["Rozcestí u Koníčka", "Tržnice", "Stadion ZM", "Horní nádraží"];

function normalizeName(name) {
  return name.replace(/^Karlovy Vary,/, "").trim().toLowerCase();
}

function resolveStopId(net, nameOrId) {
  if (net.stops[nameOrId]) return nameOrId;
  const target = normalizeName(nameOrId);
  for (const id in net.stops) {
    if (normalizeName(net.stops[id].n) === target) return id;
  }
  return null;
}

function stopsAfter(net, patternId, stopId) {
  const stops = net.patterns[patternId].stops;
  const idx = stops.indexOf(stopId);
  if (idx === -1) return [];
  return stops.slice(idx + 1);
}

function patternsThrough(net, stopId) {
  const out = [];
  for (const id in net.patterns) {
    if (net.patterns[id].stops.includes(stopId)) out.push(id);
  }
  return out;
}

function lineOf(net, patternId) {
  return net.patterns[patternId].line;
}

function makeLeg(net, patternId, from, to) {
  const pattern = net.patterns[patternId];
  // Pozor: pattern.stops muze obsahovat stejne ID zastavky vicekrat (okruzni linky,
  // napr. P5). Hops proto pocitat ze stejneho "dopredneho" useku jako stopsAfter()
  // (indexOf by jinak mohl trefit jiny vyskyt "to" a vratit zaporny/spatny pocet).
  const after = stopsAfter(net, patternId, from);
  const hops = after.indexOf(to) + 1;
  return { line: pattern.line, headsign: pattern.headsign, patternId, from, to, hops };
}

function legKey(leg) {
  return `${leg.line}:${leg.from}>${leg.to}`;
}

function resultKey(result) {
  return result.legs.map(legKey).join("|");
}

function hubStopIds(net) {
  return HUBS.map((name) => resolveStopId(net, name)).filter(Boolean);
}

function usesHub(result, hubIds) {
  if (result.transfers === 0) return false;
  const transferStop = result.legs[0].to;
  return hubIds.includes(transferStop);
}

function dominates(a, b) {
  // a dominuje b, pokud a je <= ve vsem a ostre lepsi aspon v jednom
  const le = a.transfers <= b.transfers && a.totalHops <= b.totalHops;
  const lt = a.transfers < b.transfers || a.totalHops < b.totalHops;
  return le && lt;
}

function filterDominated(results) {
  return results.filter((r) => !results.some((other) => other !== r && dominates(other, r)));
}

function search(net, A, B, opts = {}) {
  const maxTransfers = opts.maxTransfers != null ? opts.maxTransfers : 1;
  const stopA = resolveStopId(net, A);
  const stopB = resolveStopId(net, B);
  const results = [];

  if (!stopA || !stopB) return results;

  // Prime spoje (transfers 0)
  for (const patternId in net.patterns) {
    if (stopsAfter(net, patternId, stopA).includes(stopB)) {
      const leg = makeLeg(net, patternId, stopA, stopB);
      results.push({ transfers: 0, legs: [leg], totalHops: leg.hops });
    }
  }

  // 1 prestup (transfers 1)
  if (maxTransfers >= 1) {
    for (const p1 in net.patterns) {
      const afterA = stopsAfter(net, p1, stopA);
      for (const T of afterA) {
        if (T === stopB || T === stopA) continue;
        for (const p2 of patternsThrough(net, T)) {
          if (lineOf(net, p2) === lineOf(net, p1)) continue;
          if (stopsAfter(net, p2, T).includes(stopB)) {
            const leg1 = makeLeg(net, p1, stopA, T);
            const leg2 = makeLeg(net, p2, T, stopB);
            results.push({
              transfers: 1,
              legs: [leg1, leg2],
              totalHops: leg1.hops + leg2.hops,
            });
          }
        }
      }
    }
  }

  // Dedup
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = resultKey(r);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Filtr dominovanych variant (Pareto na transfers, totalHops)
  const pareto = filterDominated(deduped);

  // Razeni: transfers vzestupne -> prestup pres hub napred -> totalHops vzestupne
  const hubIds = hubStopIds(net);
  pareto.sort((a, b) => {
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    const aHub = usesHub(a, hubIds) ? 0 : 1;
    const bHub = usesHub(b, hubIds) ? 0 : 1;
    if (aHub !== bHub) return aHub - bHub;
    return a.totalHops - b.totalHops;
  });

  return pareto;
}

module.exports = { search, stopsAfter, patternsThrough, resolveStopId, lineOf, HUBS };

if (typeof window !== "undefined") {
  window.MHDRouting = { search, resolveStopId };
}
