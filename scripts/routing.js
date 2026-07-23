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

// Index zastavka -> patterny, ktere jí projíždí. Search() nad 2 přestupy dělá
// desítky tisíc "kudy z T vede spoj" dotazů — bez indexu by to bylo O(patterns)
// pokaždé (viz patternsThrough výše), s indexem O(1). Postaveno jednou za search().
function buildStopPatternIndex(net) {
  const idx = new Map();
  for (const pid in net.patterns) {
    for (const s of net.patterns[pid].stops) {
      let set = idx.get(s);
      if (!set) { set = new Set(); idx.set(s, set); }
      set.add(pid);
    }
  }
  return idx;
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

function search(net, A, B, opts = {}) {
  const maxTransfers = opts.maxTransfers != null ? opts.maxTransfers : 1;
  const stopA = resolveStopId(net, A);
  const stopB = resolveStopId(net, B);
  const results = [];

  if (!stopA || !stopB) return results;

  const stopIdx = maxTransfers >= 1 ? buildStopPatternIndex(net) : null;
  const patternsAt = (stopId) => (stopIdx.get(stopId) ? Array.from(stopIdx.get(stopId)) : []);

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
        for (const p2 of patternsAt(T)) {
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

  // 2 prestupy (transfers 2) — retezec A->T1->T2->B pres 2 ruzne uzly, kazda noha
  // jina linka nez sousedni. Vypnuto ve vychozim stavu (maxTransfers=1); zapina se
  // parametrem. Vykon: patternsAt() je O(1) diky indexu, ale porad jde o 3 vnorene
  // urovne — proto se preskakuje vetev, kde uz p2 dojede rovnou do B (to je uz
  // pokryte 1-prestupovym vysledkem vyse, dalsi prestup by byl jen zbytecna oklika).
  if (maxTransfers >= 2) {
    for (const p1 in net.patterns) {
      const afterA = stopsAfter(net, p1, stopA);
      for (const T1 of afterA) {
        if (T1 === stopB || T1 === stopA) continue;
        for (const p2 of patternsAt(T1)) {
          if (lineOf(net, p2) === lineOf(net, p1)) continue;
          const afterT1 = stopsAfter(net, p2, T1);
          if (afterT1.includes(stopB)) continue; // pokryto 1-prestupovym vysledkem
          for (const T2 of afterT1) {
            if (T2 === stopA || T2 === T1 || T2 === stopB) continue;
            for (const p3 of patternsAt(T2)) {
              if (lineOf(net, p3) === lineOf(net, p2)) continue;
              if (stopsAfter(net, p3, T2).includes(stopB)) {
                const leg1 = makeLeg(net, p1, stopA, T1);
                const leg2 = makeLeg(net, p2, T1, T2);
                const leg3 = makeLeg(net, p3, T2, stopB);
                results.push({
                  transfers: 2,
                  legs: [leg1, leg2, leg3],
                  totalHops: leg1.hops + leg2.hops + leg3.hops,
                });
              }
            }
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

  // Razeni: transfers vzestupne -> prestup pres hub napred -> totalHops vzestupne.
  // Jen sekundarni/topologicke razeni (kolik zastavek) — autoritu nad poradim ma
  // journey.js (H2), ktery razeni resi podle skutecneho casu. Zadne filtrovani
  // podle poctu prestupu/hops: rychlejsi prestupni spojeni se musi ukazat i vedle
  // pomalejsiho primeho, o tom rozhoduje az cas v journey.js.
  const hubIds = hubStopIds(net);
  deduped.sort((a, b) => {
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    const aHub = usesHub(a, hubIds) ? 0 : 1;
    const bHub = usesHub(b, hubIds) ? 0 : 1;
    if (aHub !== bHub) return aHub - bHub;
    return a.totalHops - b.totalHops;
  });

  return deduped;
}

module.exports = { search, stopsAfter, patternsThrough, resolveStopId, lineOf, HUBS };

if (typeof window !== "undefined") {
  window.MHDRouting = { search, resolveStopId };
}
