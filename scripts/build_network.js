// build_network.js — GTFS (MHD KV subset) → kompaktní data/network.json pro appku.
//
// Vstup:  data_raw/kv_gtfs/*.txt  (filtr MHD KV z JrUtil GTFS, viz docs/DATA_SOURCES.md)
// Výstup: data/network.json       (~600 KB, ~62 KB gzip)
//
// Spuštění z kořene repa:   node scripts/build_network.js
// (data_raw/ NEjde do repa — je v .gitignore; skript se pouští při obnově dat, viz J8.)
//
// Model:
//   stops     { S0: {n,lat,lon}, ... }              zastávky (n = jméno bez prefixu "Karlovy Vary,")
//   patterns  { P0: {line,dir,headsign,stops[],off[]} }  linka×směr×varianta trasy; off = min. offsety od startu
//   trips     { P0: [[start,svc] | [start,svc,offs]] }   spoje: čas startu + service; offs jen když se liší od šablony
//   services  { svc: {d:[po..ne]|null, s,e, add[], rem[]} }  kalendář + výjimky (výluky/svátky/prázdniny)
//
// POZOR na omezení dat (viz docs/DATA_SOURCES.md):
//   - "zastávka na znamení" (pickup/drop_off_type) GTFS nese nespolehlivě (v KV jen linka 8) → NEspoléhat.
//   - Zachyceny jen PLÁNOVANÉ výluky nahlášené do CIS JŘ; náhlé same-day ne.

const fs = require('fs');
const path = require('path');
const SRC = 'data_raw/kv_gtfs';
const OUT = 'data/network.json';

function parseCSV(txt) {
  const rows = []; let i = 0, f = '', row = [], q = false;
  while (i < txt.length) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; } f += c; i++; continue; }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, k) => [h, r[k]])));
}
const load = f => parseCSV(fs.readFileSync(path.join(SRC, f), 'utf8'));
const toMin = t => { if (!t) return null; const [a, b] = t.split(':'); return (+a) * 60 + (+b); };

const routes = load('routes.txt');
const trips = load('trips.txt');
const stopsRaw = load('stops.txt');
const cal = load('calendar.txt');
const calDates = load('calendar_dates.txt');

// veřejné číslo linky = route_short_name - 425000 (viz DATA_SOURCES.md)
const lineOf = {};
for (const r of routes) lineOf[r.route_id] = parseInt(r.route_short_name) - 425000;

// stop_times seskupené podle spoje, seřazené podle pořadí
const stByTrip = {};
{
  const st = parseCSV(fs.readFileSync(path.join(SRC, 'stop_times.txt'), 'utf8'));
  for (const s of st) (stByTrip[s.trip_id] || (stByTrip[s.trip_id] = [])).push(s);
  for (const t in stByTrip) stByTrip[t].sort((a, b) => (+a.stop_sequence) - (+b.stop_sequence));
}

// Ruční doplnění GPS pro zastávky, které zdroj (CIS/GTFS) nemá (0,0). Joe, 2026-07-23.
// PROVIZORNÍ single-point na uzel — přesné směrové pozice řeší epic J9.
const COORD_OVERRIDES = {
  'JDFS-10020': [50.225355, 12.839125],  // Kpt.Jaroše — střed 2 označníků (~90 m od sebe)
  'JDFS-14283': [50.239712, 12.889429],  // Mattoniho nábřeží — 2 MHD označníky (příměstský 3. bod → J9)
  'JDFS-16310': [50.255920, 12.885421],  // Nádraží Dalovice
  'JDFS-16311': [50.252510, 12.882424],  // Na Pasece
  'JDFS-18345': [50.217823, 12.806296],  // Globus
  'JDFS-32745': [50.226009, 12.823021],  // Tesco
  'JDFS-36827': [50.219270, 12.880980],  // Lázně I (S155) = poloha totožné zastávky S116 (JDFS-6580)
};

// remap stop_id na krátké S0,S1,... (úspora bytů)
const stopIdx = {}, stops = {}; let sc = 0;
const sid = gid => { if (!(gid in stopIdx)) stopIdx[gid] = 'S' + (sc++); return stopIdx[gid]; };
const stopMeta = Object.fromEntries(stopsRaw.map(s => [s.stop_id, s]));

const patterns = {}, patKey = {}, tripsByPat = {}; let pc = 0, tripCount = 0, devCount = 0;

for (const t of trips) {
  const rows = stByTrip[t.trip_id]; if (!rows || !rows.length) continue;
  const line = lineOf[t.route_id];
  const seqStops = rows.map(r => sid(r.stop_id));
  const times = rows.map(r => toMin(r.departure_time || r.arrival_time));
  const start = times[0];
  const offs = times.map(x => x - start);
  const key = line + '|' + t.direction_id + '|' + seqStops.join(',');
  let pid = patKey[key];
  if (pid === undefined) {
    pid = 'P' + (pc++); patKey[key] = pid;
    patterns[pid] = { line, dir: +t.direction_id, headsign: t.trip_headsign, stops: seqStops, off: offs };
    tripsByPat[pid] = [];
  }
  tripCount++;
  const base = patterns[pid].off;
  const same = offs.length === base.length && offs.every((v, k) => v === base[k]);
  if (same) tripsByPat[pid].push([start, t.service_id]);
  else { devCount++; tripsByPat[pid].push([start, t.service_id, offs]); } // odchylné mezičasy (špička×sedlo)
  for (const gid of rows.map(r => r.stop_id)) {
    const k = stopIdx[gid];
    if (!(k in stops)) {
      const m = stopMeta[gid];
      const override = COORD_OVERRIDES[gid];
      stops[k] = {
        n: (m.stop_name || '').replace(/^Karlovy Vary,/, ''),
        lat: override ? override[0] : (m.stop_lat ? +(+m.stop_lat).toFixed(5) : null),
        lon: override ? override[1] : (m.stop_lon ? +(+m.stop_lon).toFixed(5) : null),
      };
    }
  }
}

// služby: týdenní kalendář + výjimky (add = jede navíc, rem = nejede)
const services = {};
for (const c of cal) {
  services[c.service_id] = {
    d: [c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday].map(Number),
    s: c.start_date, e: c.end_date, add: [], rem: [],
  };
}
for (const cd of calDates) {
  const sv = services[cd.service_id] || (services[cd.service_id] = { d: null, s: null, e: null, add: [], rem: [] });
  if (cd.exception_type === '1') sv.add.push(cd.date); else sv.rem.push(cd.date);
}

const net = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    source: 'CIS JR / JrUtil GTFS, filtr MHD KV (agency 48364282, route 425xxx)',
    lines: [...new Set(Object.values(patterns).map(p => p.line))].sort((a, b) => a - b),
  },
  stops, patterns, trips: tripsByPat, services,
};

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(net));

const kb = JSON.stringify(net).length / 1024;
console.log('OK →', OUT);
console.log('  zastávek:', Object.keys(stops).length, '| patternů:', Object.keys(patterns).length,
  '| spojů:', tripCount, '| service_id:', Object.keys(services).length);
console.log('  spojů s odchylnými mezičasy:', devCount, '(' + (100 * devCount / tripCount).toFixed(1) + '%)');
console.log('  velikost:', kb.toFixed(0), 'KB (nekomprimovaně)');
