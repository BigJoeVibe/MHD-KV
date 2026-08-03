// Routing A->B nad data/network.json — topologicky, BEZ casu (cas resi J3).
// Zadne zavislosti. Pouzitelne v Node (test) i v prohlizeci (J4) — funkce dostavaji
// `net` (naparsovany network.json) jako parametr, modul si data sam nenacita.

// IIFE: v prohlizeci se routing.js/timetable.js/journey.js nacitaji jako 3 samostatne
// <script src> tagy, ktere v klasickem (non-module) rezimu sdileji jeden top-level
// scope. Bez obalu by top-level jmena (search, resolveStopId, ...) kolidovala s
// destrukturovanymi consty stejneho jmena v timetable.js/journey.js (SyntaxError:
// identifier already declared). Obal jen izoluje scope, verejne je porad jen window.MHD*.
(function () {

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

// Okruzni linky mivaji stejne stopId v patternu vicekrat (napr. P5, linka 12) —
// pruchod uzlem na zacatku i konci smycky. stopsAfter()/indexOf() by trefilo jen
// prvni vyskyt a mohlo minout platny nastup/prestup z toho druheho. forwardSegments
// vraci "dopredny usek" pro KAZDY pouzitelny vyskyt stopId (jeden per vyskyt),
// krome posledni zastavky patternu (z konecne se dal neodjizdi — smerova logika).
function forwardSegments(net, patternId, stopId) {
  const stops = net.patterns[patternId].stops;
  const segments = [];
  for (let i = 0; i < stops.length - 1; i++) {
    if (stops[i] === stopId) segments.push({ fromIdx: i, after: stops.slice(i + 1) });
  }
  return segments;
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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Nektere fyzicky stejne zastavky maji ve zdroji dve ID (napr. Lazne I: S116 pro
// linky 2/11/52 x S155/JDFS-36827 pro linku 20). Bez propojeni se prestup mezi
// nimi nenajde (jine ID = jiny uzel grafu). H1d resi JEN tento pripad — fakticky
// totozne misto — ne pesi presun mezi ruznymi oznacniky (30-200 m, to je epic J9).
// Kriterium: haversine <= SAME_NAME_MAX_M pri shodnem normalizovanem nazvu (trochu
// volnejsi, tolerantni k drobnym odchylkam GPS na tomtez oznacniku), jinak <= DIFF_NAME_MAX_M
// (prisne — u neshodneho nazvu radeji nedomyslet, ze jde o totez misto).
const SAME_NAME_MAX_M = 60;
const DIFF_NAME_MAX_M = 30;

function coLocatedGroups(net) {
  const ids = Object.keys(net.stops);
  const parent = {};
  for (const id of ids) parent[id] = id;
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < ids.length; i++) {
    const a = net.stops[ids[i]];
    for (let j = i + 1; j < ids.length; j++) {
      const b = net.stops[ids[j]];
      const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
      const sameName = normalizeName(a.n) === normalizeName(b.n);
      const maxM = sameName ? SAME_NAME_MAX_M : DIFF_NAME_MAX_M;
      if (dist <= maxM) union(ids[i], ids[j]);
    }
  }

  const groups = {};
  for (const id of ids) {
    const root = find(id);
    (groups[root] || (groups[root] = [])).push(id);
  }
  return Object.values(groups).filter((g) => g.length > 1);
}

// Mapa stopId -> pole "sourozeneckych" ID (fakticky totez misto, bez sebe sama).
function buildCoLocatedMap(net) {
  const map = new Map();
  for (const group of coLocatedGroups(net)) {
    for (const id of group) {
      map.set(id, group.filter((x) => x !== id));
    }
  }
  return map;
}

// Leg z explicitnich indexu (fromIdx/toIdx v ramci pattern.stops) — jednoznacne
// i pro smyckove patterny, kde stejne stopId muze mit vice vyskytu. journey.js
// (KROK B/H2) pouziva leg.fromIdx/leg.toIdx primo, misto zpetneho hledani pres
// indexOf, aby nedoslo k namatchovani na jiny vyskyt te same zastavky.
function legFromIndices(net, patternId, fromIdx, toIdx) {
  const pattern = net.patterns[patternId];
  return {
    line: pattern.line,
    headsign: pattern.headsign,
    patternId,
    from: pattern.stops[fromIdx],
    to: pattern.stops[toIdx],
    hops: toIdx - fromIdx,
    fromIdx,
    toIdx,
  };
}

function legKey(leg) {
  // patternId+fromIdx+toIdx odlisi i dva vyskyty stejne zastavky ve smyckovem
  // patternu (stejne "from"/"to" stopId, jina pozice = jiny spoj v case).
  return `${leg.patternId}:${leg.fromIdx}>${leg.toIdx}`;
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
  const coLoc = maxTransfers >= 1 ? buildCoLocatedMap(net) : null;
  // Uzel T i jeho co-located "sourozenci" (H1d) se pri prestupu berou jako totez
  // misto — leg1 dojede na T, leg2 muze odjet z kteregokoli z nich.
  const transferPoints = (stopId) => [stopId, ...(coLoc.get(stopId) || [])];

  // Prime spoje (transfers 0) — kazdy pouzitelny vyskyt stopA v patternu zvlast
  // (smycky), pro kazdy nejblizsi nasledujici vyskyt stopB v jeho useku.
  for (const patternId in net.patterns) {
    for (const seg of forwardSegments(net, patternId, stopA)) {
      const ai = seg.after.indexOf(stopB);
      if (ai === -1) continue;
      const leg = legFromIndices(net, patternId, seg.fromIdx, seg.fromIdx + 1 + ai);
      results.push({ transfers: 0, legs: [leg], totalHops: leg.hops });
    }
  }

  // 1 prestup (transfers 1)
  if (maxTransfers >= 1) {
    for (const p1 in net.patterns) {
      for (const seg1 of forwardSegments(net, p1, stopA)) {
        for (let i = 0; i < seg1.after.length; i++) {
          const T = seg1.after[i];
          if (T === stopB || T === stopA) continue;
          const idxT1 = seg1.fromIdx + 1 + i;
          for (const Tp of transferPoints(T)) {
            if (Tp === stopA || Tp === stopB) continue;
            for (const p2 of patternsAt(Tp)) {
              if (lineOf(net, p2) === lineOf(net, p1)) continue;
              for (const seg2 of forwardSegments(net, p2, Tp)) {
                const bi = seg2.after.indexOf(stopB);
                if (bi === -1) continue;
                const leg1 = legFromIndices(net, p1, seg1.fromIdx, idxT1);
                const leg2 = legFromIndices(net, p2, seg2.fromIdx, seg2.fromIdx + 1 + bi);
                results.push({
                  transfers: 1,
                  legs: [leg1, leg2],
                  totalHops: leg1.hops + leg2.hops,
                  coLocated: Tp !== T,
                });
              }
            }
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
      for (const seg1 of forwardSegments(net, p1, stopA)) {
        for (let i = 0; i < seg1.after.length; i++) {
          const T1 = seg1.after[i];
          if (T1 === stopB || T1 === stopA) continue;
          const idxT1 = seg1.fromIdx + 1 + i;
          for (const T1p of transferPoints(T1)) {
            if (T1p === stopA || T1p === stopB) continue;
            for (const p2 of patternsAt(T1p)) {
              if (lineOf(net, p2) === lineOf(net, p1)) continue;
              for (const seg2 of forwardSegments(net, p2, T1p)) {
                if (seg2.after.includes(stopB)) continue; // pokryto 1-prestupovym vysledkem
                for (let j = 0; j < seg2.after.length; j++) {
                  const T2 = seg2.after[j];
                  if (T2 === stopA || T2 === T1 || T2 === T1p || T2 === stopB) continue;
                  const idxT2 = seg2.fromIdx + 1 + j;
                  for (const T2p of transferPoints(T2)) {
                    if (T2p === stopA || T2p === stopB || T2p === T1 || T2p === T1p) continue;
                    for (const p3 of patternsAt(T2p)) {
                      if (lineOf(net, p3) === lineOf(net, p2)) continue;
                      for (const seg3 of forwardSegments(net, p3, T2p)) {
                        const bi = seg3.after.indexOf(stopB);
                        if (bi === -1) continue;
                        const leg1 = legFromIndices(net, p1, seg1.fromIdx, idxT1);
                        const leg2 = legFromIndices(net, p2, seg2.fromIdx, idxT2);
                        const leg3 = legFromIndices(net, p3, seg3.fromIdx, seg3.fromIdx + 1 + bi);
                        results.push({
                          transfers: 2,
                          legs: [leg1, leg2, leg3],
                          totalHops: leg1.hops + leg2.hops + leg3.hops,
                          coLocated1: T1p !== T1,
                          coLocated2: T2p !== T2,
                        });
                      }
                    }
                  }
                }
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

const MHDRouting = { search, resolveStopId, lineOf, forwardSegments, HUBS, coLocatedGroups, stopsAfter, patternsThrough };

if (typeof module !== "undefined" && module.exports) module.exports = MHDRouting;
if (typeof window !== "undefined") window.MHDRouting = MHDRouting;

})();
