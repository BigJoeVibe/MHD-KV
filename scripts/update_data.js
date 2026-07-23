// update_data.js — J8a: stahne aktualni GTFS, vyfiltruje MHD KV, prestavi network.json, guard.
//
// Spusteni z korene repa: node scripts/update_data.js
// Zdroj+filtr: docs/DATA_SOURCES.md. Zadani: handoff.md (KROK J8a-1..4).
//
// Kroky: pre-check Last-Modified (preskoci stazeni, kdyz zdroj nezmenen) -> stahnout ZIP
//   -> filtr (agency 48364282 + route_short_name 425xxx) -> data_raw/kv_gtfs/
//   -> build_network.js -> regression guard -> commit (necha nova data) nebo rollback.
// stop_times.txt (~1,38 GB nekomprimovane) se STREAMUJE, nikdy necte cele do pameti.
// Prepinac --force (nebo env FORCE=1/true) preskoci pre-check a stahne vzdy (workflow_dispatch, test).
// J8b (mimo scope tady): GitHub Actions workflow, keepalive.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SRC_URL = "https://data.jr.ggu.cz/results/latest/JDF_merged_GTFS.zip";
const TMP_DIR = path.join(ROOT, "data_raw", "_tmp");
const ZIP_PATH = path.join(TMP_DIR, "JDF_merged_GTFS.zip");
const HEADERS_PATH = path.join(TMP_DIR, "headers.txt");
const KV_DIR = path.join(ROOT, "data_raw", "kv_gtfs");
const NETWORK_JSON = path.join(ROOT, "data", "network.json");
const NETWORK_BACKUP = path.join(TMP_DIR, "network.json.bak");
const STATE_PATH = path.join(ROOT, "data", "data_source_state.json");
const BUILD_SCRIPT = path.join(ROOT, "scripts", "build_network.js");
const VERIFY_SCRIPT = path.join(ROOT, "scripts", "verify_network.js");

const AGENCY_ID_PREFIX = "JDFA-48364282";
const LINE_RE = /^425\d{3}$/;

// Prahy zdrave sady + max relativni pokles oproti predchozi verzi (docs/DATA_SOURCES.md -> Test/QA B).
const THRESHOLDS = { lines: 20, stops: 140, trips: 9000 };
const MAX_DROP_RATIO = 0.2;

function log(...args) {
  console.log(...args);
}

// --- CSV (stejna logika jako build_network.js parseCSV, radek-po-radku pro maly soubory) ---
function parseCSV(txt) {
  const rows = [];
  let i = 0, f = "", row = [], q = false;
  while (i < txt.length) {
    const c = txt[i];
    if (q) {
      if (c === '"') {
        if (txt[i + 1] === '"') { f += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      f += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { row.push(f); f = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; i++; continue; }
    f += c; i++;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return { head, rows: rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]]))) };
}

function toCSV(header, rows) {
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [header.map(esc).join(",")];
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(","));
  return lines.join("\n") + "\n";
}

// Rychly parser prvnich N poli radku (pro filtr stop_times.txt bez plneho parse+objekt).
function parseFields(line, n) {
  const out = [];
  let i = 0, f = "", q = false;
  while (i < line.length && out.length < n) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { f += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      f += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { out.push(f); f = ""; i++; continue; }
    f += c; i++;
  }
  out.push(f);
  return out;
}

// --- extrakce ze ZIPu: unzip (Linux/GH Actions/git-bash), fallback tar/bsdtar (Windows) ---
function detectExtractor() {
  const probe = (cmd, args) => !spawnSync(cmd, args, { stdio: "ignore" }).error;
  if (probe("unzip", ["-v"])) return "unzip";
  if (probe("tar", ["--version"])) return "tar";
  throw new Error("Nenalezen 'unzip' ani 'tar' pro rozbaleni ZIP.");
}

function extractorArgs(extractor, zipPath, member) {
  return extractor === "unzip" ? ["-p", zipPath, member] : ["-xOf", zipPath, member];
}

// Male soubory (agency/routes/trips/stops/calendar/calendar_dates) -> cele do pameti.
function extractText(extractor, zipPath, member, maxBuffer) {
  const r = spawnSync(extractor, extractorArgs(extractor, zipPath, member), {
    encoding: "utf8",
    maxBuffer: maxBuffer || 50 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (!r.stdout) throw new Error(`Extrakce '${member}' selhala (prazdny vystup). stderr: ${r.stderr || ""}`);
  return r.stdout;
}

// stop_times.txt (~1,38 GB) -> STREAM: filtr radek po radku, zapis primo na disk.
function streamFilterStopTimes(extractor, zipPath, tripIdSet, outTmpPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(extractor, extractorArgs(extractor, zipPath, "stop_times.txt"), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    const out = fs.createWriteStream(outTmpPath);
    let header = null;
    let total = 0, kept = 0;
    const stopIds = new Set();
    let stderrBuf = "";
    let exitCode = null;
    child.stderr.on("data", (d) => { stderrBuf += d; });
    child.on("error", reject);
    // Zaznamenat exit hned (posluchac musi byt zaregistrovany driv, nez muze udalost nastat) —
    // NEcekat na 'exit' pro rozhodnuti o uspechu, jen pro diagnostiku (tar/unzip muze skoncit
    // nenulove i pri uspesnem cteni; rozhodujici je, ze jsme prectli >0 radku a header existuje).
    child.on("exit", (code) => { exitCode = code; });

    rl.on("line", (line) => {
      if (header === null) { header = line; out.write(line + "\n"); return; }
      if (!line) return;
      total++;
      const fields = parseFields(line, 4); // trip_id, arrival_time, departure_time, stop_id
      if (tripIdSet.has(fields[0])) {
        kept++;
        stopIds.add(fields[3]);
        out.write(line + "\n");
      }
    });
    rl.on("close", () => {
      out.end(() => {
        if (header === null) {
          reject(new Error(`Extrakce stop_times.txt neprodukovala zadny vystup (exit ${exitCode}). stderr: ${stderrBuf}`));
        } else {
          resolve({ total, kept, stopIds });
        }
      });
    });
  });
}

function parseHeaderValue(headersText, name) {
  const re = new RegExp("^" + name + ":\\s*(.+?)\\r?$", "gim");
  let m, last = null;
  while ((m = re.exec(headersText))) last = m[1].trim();
  return last;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function isForced() {
  const flag = process.env.FORCE;
  return process.argv.includes("--force") || flag === "1" || flag === "true";
}

// Levny pre-check bez stazeni celeho ZIPu (123 MB) — jen HTTP HEAD hlavicky.
function headLastModified(url) {
  const r = spawnSync("curl", ["-sI", "-f", "--connect-timeout", "30", "--max-time", "60", url], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  return parseHeaderValue(r.stdout, "Last-Modified");
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function countTrips(net) {
  let n = 0;
  for (const pid in net.trips) n += net.trips[pid].length;
  return n;
}

function readCounts(networkJsonPath) {
  if (!fs.existsSync(networkJsonPath)) return null;
  try {
    const net = JSON.parse(fs.readFileSync(networkJsonPath, "utf8"));
    return {
      lines: (net.meta && net.meta.lines && net.meta.lines.length) || 0,
      stops: Object.keys(net.stops || {}).length,
      trips: countTrips(net),
    };
  } catch {
    return null;
  }
}

function runGuard(prevCounts) {
  const reasons = [];
  let net;
  try {
    net = JSON.parse(fs.readFileSync(NETWORK_JSON, "utf8"));
    log("GUARD: network.json je validni JSON — OK");
  } catch (e) {
    return { ok: false, reasons: [`network.json neni validni JSON: ${e.message}`] };
  }

  const counts = {
    lines: (net.meta && net.meta.lines && net.meta.lines.length) || 0,
    stops: Object.keys(net.stops || {}).length,
    trips: countTrips(net),
  };
  log(`GUARD: pocty — linky=${counts.lines} zastavky=${counts.stops} spoje=${counts.trips}`);

  for (const key of Object.keys(THRESHOLDS)) {
    if (counts[key] < THRESHOLDS[key]) {
      reasons.push(`${key}=${counts[key]} < prah ${THRESHOLDS[key]}`);
    } else {
      log(`GUARD: prah ${key} >= ${THRESHOLDS[key]} — OK (${counts[key]})`);
    }
  }

  if (prevCounts) {
    for (const key of Object.keys(THRESHOLDS)) {
      if (prevCounts[key] > 0) {
        const drop = 1 - counts[key] / prevCounts[key];
        if (drop > MAX_DROP_RATIO) {
          reasons.push(`${key} pokles o ${(drop * 100).toFixed(1)}% oproti predchozi verzi (${prevCounts[key]} -> ${counts[key]}), limit ${MAX_DROP_RATIO * 100}%`);
        } else {
          log(`GUARD: pokles ${key} ${(drop * 100).toFixed(1)}% <= ${MAX_DROP_RATIO * 100}% — OK`);
        }
      }
    }
  } else {
    log("GUARD: zadna predchozi verze network.json — relativni pokles se neposuzuje");
  }

  const vr = spawnSync(process.execPath, [VERIFY_SCRIPT], { cwd: ROOT, encoding: "utf8" });
  const vrOut = (vr.stdout || "") + (vr.stderr || "");
  console.log(vrOut);
  if (vr.status !== 0) {
    reasons.push("verify_network.js NEPROSEL (viz vystup vyse)");
  } else {
    log("GUARD: verify_network.js prosel cely — OK");
  }

  return { ok: reasons.length === 0, reasons, counts };
}

async function main() {
  const t0 = Date.now();
  const force = isForced();

  if (force) {
    log("PRE-CHECK: preskoceno (--force/FORCE) — stahuji vzdy.");
  } else {
    log(`PRE-CHECK: HEAD ${SRC_URL} ...`);
    const remoteLM = headLastModified(SRC_URL);
    if (!remoteLM) {
      log("PRE-CHECK: Last-Modified se nepodarilo zjistit (HEAD selhal nebo hlavicka chybi) — pokracuji stazenim, at se pipeline nezasekne.");
    } else {
      const state = readState(STATE_PATH);
      if (state && state.lastModified === remoteLM) {
        log(`PRE-CHECK: zdroj beze zmeny (Last-Modified: ${remoteLM}) — preskoceno, nestahuji.`);
        log(`\nCELKEM: preskoceno za ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
        return;
      }
      log(`PRE-CHECK: zdroj zmenen (${(state && state.lastModified) || "(zadny predchozi stav)"} -> ${remoteLM}) — pokracuji.`);
    }
  }

  rmrf(TMP_DIR);
  fs.mkdirSync(TMP_DIR, { recursive: true });

  let guardResult = null;
  try {
    // 1) stahnout ZIP
    log(`STAHUJI ${SRC_URL} ...`);
    const dl = spawnSync(
      "curl",
      ["-sSL", "-f", "--retry", "2", "--connect-timeout", "30", "--max-time", "540", "-D", HEADERS_PATH, "-o", ZIP_PATH, SRC_URL],
      { encoding: "utf8" }
    );
    if (dl.status !== 0 || !fs.existsSync(ZIP_PATH)) {
      throw new Error(`Stazeni ZIPu selhalo (curl exit ${dl.status}): ${dl.stderr || ""}`);
    }
    const zipSize = fs.statSync(ZIP_PATH).size;
    if (zipSize < 10 * 1024 * 1024) {
      throw new Error(`Stazeny ZIP je podezrele maly (${zipSize} B) — pravdepodobne chyba/HTML misto dat.`);
    }
    const headersText = fs.readFileSync(HEADERS_PATH, "utf8");
    const lastModified = parseHeaderValue(headersText, "Last-Modified");
    log(`OK, ZIP ${(zipSize / 1024 / 1024).toFixed(1)} MB, Last-Modified: ${lastModified}`);

    const extractor = detectExtractor();
    log(`Extraktor: ${extractor}`);

    // 2) filtr — agency -> routes -> trips (male soubory, cele v pameti)
    const agencyText = extractText(extractor, ZIP_PATH, "agency.txt");
    const { rows: agencyRows } = parseCSV(agencyText);
    const agencyIds = new Set(agencyRows.filter((a) => a.agency_id.startsWith(AGENCY_ID_PREFIX)).map((a) => a.agency_id));
    if (agencyIds.size === 0) throw new Error(`Zadny agency_id nezacina na '${AGENCY_ID_PREFIX}' — zdroj se zmenil?`);
    log(`FILTR: agency_id (DPKV) = ${agencyIds.size}`);

    const routesText = extractText(extractor, ZIP_PATH, "routes.txt");
    const { head: routesHead, rows: routesAll } = parseCSV(routesText);
    const routesKV = routesAll.filter((r) => agencyIds.has(r.agency_id) && LINE_RE.test(r.route_short_name));
    const routeIds = new Set(routesKV.map((r) => r.route_id));
    if (routeIds.size === 0) throw new Error("Filtr routes.txt nenasel zadnou linku MHD KV (425xxx) — zdroj se zmenil?");
    log(`FILTR: routes MHD KV (425xxx) = ${routeIds.size}`);

    const tripsText = extractText(extractor, ZIP_PATH, "trips.txt", 250 * 1024 * 1024);
    const { head: tripsHead, rows: tripsAll } = parseCSV(tripsText);
    const tripsKV = tripsAll.filter((t) => routeIds.has(t.route_id));
    const tripIds = new Set(tripsKV.map((t) => t.trip_id));
    const serviceIds = new Set(tripsKV.map((t) => t.service_id));
    if (tripIds.size === 0) throw new Error("Filtr trips.txt nenasel zadny spoj pro MHD KV routes — zdroj se zmenil?");
    log(`FILTR: trips MHD KV = ${tripIds.size} (service_id: ${serviceIds.size})`);

    // 3) stop_times.txt — STREAM filtr podle tripIds
    log("STREAMUJI stop_times.txt (~1,38 GB nekomprimovane, muze trvat minuty)...");
    const stTmpPath = path.join(TMP_DIR, "stop_times.filtered.txt");
    const { total, kept, stopIds } = await streamFilterStopTimes(extractor, ZIP_PATH, tripIds, stTmpPath);
    log(`FILTR: stop_times — precteno ${total} radku, ponecheno ${kept}, zastavek pouzitych ${stopIds.size}`);
    if (kept === 0) throw new Error("Stream filtr stop_times.txt neponechal zadny radek.");

    // 4) stops/calendar/calendar_dates (male soubory)
    const stopsText = extractText(extractor, ZIP_PATH, "stops.txt");
    const { head: stopsHead, rows: stopsAll } = parseCSV(stopsText);
    const stopsKV = stopsAll.filter((s) => stopIds.has(s.stop_id));
    log(`FILTR: stops pouzite v MHD KV = ${stopsKV.length}`);

    const calText = extractText(extractor, ZIP_PATH, "calendar.txt");
    const { head: calHead, rows: calAll } = parseCSV(calText);
    const calKV = calAll.filter((c) => serviceIds.has(c.service_id));

    const calDatesText = extractText(extractor, ZIP_PATH, "calendar_dates.txt");
    const { head: calDatesHead, rows: calDatesAll } = parseCSV(calDatesText);
    const calDatesKV = calDatesAll.filter((c) => serviceIds.has(c.service_id));
    log(`FILTR: calendar = ${calKV.length}, calendar_dates = ${calDatesKV.length}`);

    // 5) zapsat data_raw/kv_gtfs/ (prepsat stare)
    fs.mkdirSync(KV_DIR, { recursive: true });
    fs.writeFileSync(path.join(KV_DIR, "routes.txt"), toCSV(routesHead, routesKV));
    fs.writeFileSync(path.join(KV_DIR, "trips.txt"), toCSV(tripsHead, tripsKV));
    fs.writeFileSync(path.join(KV_DIR, "stops.txt"), toCSV(stopsHead, stopsKV));
    fs.writeFileSync(path.join(KV_DIR, "calendar.txt"), toCSV(calHead, calKV));
    fs.writeFileSync(path.join(KV_DIR, "calendar_dates.txt"), toCSV(calDatesHead, calDatesKV));
    fs.copyFileSync(stTmpPath, path.join(KV_DIR, "stop_times.txt"));
    log(`OK, data_raw/kv_gtfs/ prepsano.`);

    // 6) zaloha soucasneho network.json + jeho pocty (pro relativni pokles v guardu)
    const prevCounts = readCounts(NETWORK_JSON);
    if (fs.existsSync(NETWORK_JSON)) fs.copyFileSync(NETWORK_JSON, NETWORK_BACKUP);

    // 7) build
    log("BUILD: spoustim build_network.js ...");
    const build = spawnSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, encoding: "utf8" });
    console.log(build.stdout || "");
    if (build.status !== 0) {
      throw new Error(`build_network.js selhal (exit ${build.status}): ${build.stderr || ""}`);
    }

    // 8) guard
    log("\n=== GUARD ===");
    guardResult = runGuard(prevCounts);

    if (!guardResult.ok) {
      log("\nGUARD SELHAL:");
      for (const r of guardResult.reasons) log(" - " + r);
      if (fs.existsSync(NETWORK_BACKUP)) {
        fs.copyFileSync(NETWORK_BACKUP, NETWORK_JSON);
        log("ROLLBACK: puvodni data/network.json obnoveno.");
      } else {
        fs.rmSync(NETWORK_JSON, { force: true });
        log("ROLLBACK: zadna predchozi verze nebyla k dispozici, nove (spatne) network.json smazano.");
      }
      rmrf(TMP_DIR);
      log(`\nCELKEM: SELHALO za ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
      process.exitCode = 1;
      return;
    }

    // 9) stavovy soubor (jen pri uspechu)
    const state = {
      lastModified,
      size: zipSize,
      updatedAt: new Date().toISOString(),
      counts: guardResult.counts,
    };
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
    log(`\nSTAV: zapsano ${STATE_PATH}`);

    rmrf(TMP_DIR);
    log(`\nCELKEM: OK za ${((Date.now() - t0) / 1000).toFixed(1)} s. Guard prosel, data/network.json aktualizovano.`);
  } catch (e) {
    console.error("\nCHYBA:", e.message);
    if (fs.existsSync(NETWORK_BACKUP)) {
      fs.copyFileSync(NETWORK_BACKUP, NETWORK_JSON);
      log("ROLLBACK: puvodni data/network.json obnoveno.");
    }
    rmrf(TMP_DIR);
    process.exitCode = 1;
  }
}

main();
