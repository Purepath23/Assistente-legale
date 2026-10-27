#!/usr/bin/env node
/**
 * glm-ocr.mjs — OCR locale di documenti scansionati con GLM-OCR via Ollama.
 *
 * Uso:
 *   node glm-ocr.mjs check
 *   node glm-ocr.mjs <file.pdf|png|jpg|webp> [--out <file.md>] [--mode text|table|formula]
 *                    [--pages 1-3,7] [--dpi 150] [--force-ocr]
 *   node glm-ocr.mjs selfcheck
 *
 * Le pagine che hanno gia testo digitale (PDF non scansionati o con livello OCR) non passano
 * dal modello: si usa il loro testo, molto piu veloce. --force-ocr le rilegge comunque con GLM-OCR.
 * L'output viene scritto pagina per pagina, quindi un'interruzione non fa perdere il lavoro fatto.
 *
 * Zero dipendenze (Node >= 18). PDF: su macOS usa il motore PDF di sistema (PDFKit, nessuna
 * installazione); altrove serve `pdftoppm` (poppler), usato anche su macOS se presente.
 * Segreto professionale (Art. 622 CP, L. 247/2012): il documento non lascia mai la
 * macchina. Lo script parla SOLO con un Ollama su loopback e rifiuta host remoti.
 *
 * Variabili d'ambiente:
 *   OLLAMA_HOST    default http://127.0.0.1:11434 (solo localhost / 127.x / ::1)
 *   GLM_OCR_MODEL  default glm-ocr (senza tag usa la variante installata: latest, q8_0, bf16)
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const MODEL = process.env.GLM_OCR_MODEL || "glm-ocr";
const TAG_PREFERENCE = ["latest", "q8_0", "bf16"];
const PROMPTS = { text: "Text Recognition:", table: "Table Recognition:", formula: "Formula Recognition:" };
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PAGE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TOKENS_PER_PAGE = 4096;   // ferma il modello se entra in un ciclo di ripetizioni
const MIN_TEXT_LAYER_CHARS = 200;   // sotto questa soglia la pagina e considerata scansionata

// ---------------------------------------------------------------- helpers
function fail(msg) {
  console.error(`glm-ocr: ${msg}`);
  process.exit(1);
}

/** Normalizza OLLAMA_HOST e rifiuta tutto cio che non e loopback. */
function resolveHost(raw) {
  let s = (raw || "http://127.0.0.1:11434").trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const url = new URL(s);
  if (!url.port) url.port = "11434";
  // 0.0.0.0 e l'indirizzo di bind del server Ollama: il client si collega in locale.
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  const h = url.hostname.replace(/^\[|\]$/g, "");
  const loopback = h === "localhost" || h === "::1" || /^127\.\d+\.\d+\.\d+$/.test(h);
  if (!loopback)
    throw new Error(`OLLAMA_HOST=${raw} non e locale. Per il segreto professionale l'OCR gira solo su localhost.`);
  return url.origin;
}

/** "1-3,7" -> Set{1,2,3,7}; null = tutte le pagine. */
function parsePages(spec) {
  if (!spec) return null;
  const out = new Set();
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`--pages non valido: "${part}"`);
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (a < 1 || b < a) throw new Error(`--pages non valido: "${part}"`);
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}

function parseArgs(argv) {
  const opts = { file: null, out: null, mode: "text", pages: null, dpi: 150, forceOcr: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else if (a === "--mode") opts.mode = argv[++i];
    else if (a === "--pages") opts.pages = parsePages(argv[++i]);
    else if (a === "--dpi") opts.dpi = Number(argv[++i]);
    else if (a === "--force-ocr") opts.forceOcr = true;
    else if (a.startsWith("--")) throw new Error(`opzione sconosciuta: ${a}`);
    else if (!opts.file) opts.file = a;
    else throw new Error(`argomento in eccesso: ${a}`);
  }
  if (!PROMPTS[opts.mode]) throw new Error(`--mode deve essere text, table o formula (ricevuto "${opts.mode}")`);
  if (!Number.isFinite(opts.dpi) || opts.dpi < 72 || opts.dpi > 600) throw new Error("--dpi deve essere tra 72 e 600");
  return opts;
}

// ---------------------------------------------------------------- ollama
async function ollamaTags(host) {
  let res;
  try {
    res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`Ollama non raggiungibile su ${host}. Avvialo con \`ollama serve\` (o apri l'app Ollama).`);
  }
  if (!res.ok) throw new Error(`Ollama ha risposto ${res.status} su /api/tags`);
  const body = await res.json();
  return (body.models || []).map((m) => m.name);
}

/** Sceglie il nome esatto da usare: con un tag lo richiede tale e quale, senza tag accetta qualsiasi variante installata. */
function pickModel(names, model) {
  if (model.includes(":")) return names.includes(model) ? model : null;
  const variants = names.filter((n) => n.startsWith(`${model}:`));
  const rank = (n) => { const i = TAG_PREFERENCE.indexOf(n.slice(model.length + 1)); return i < 0 ? TAG_PREFERENCE.length : i; };
  return variants.sort((a, b) => rank(a) - rank(b))[0] || null;
}

async function ensureModel(host) {
  const model = pickModel(await ollamaTags(host), MODEL);
  if (!model)
    throw new Error(`modello "${MODEL}" non installato. Esegui: ollama pull ${MODEL.includes(":") ? MODEL : `${MODEL}:q8_0`}`);
  return model;
}

async function ocrImage(host, model, pngPath, mode) {
  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: PROMPTS[mode],
      images: [readFileSync(pngPath).toString("base64")],
      stream: false,
      options: { temperature: 0, num_predict: MAX_TOKENS_PER_PAGE },
    }),
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama ha risposto ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = String(body.response || "").trim();
  return body.done_reason === "length" ? `${text}\n\n[ATTENZIONE: trascrizione interrotta, pagina da verificare sull'originale]` : text;
}

/** Testo digitale della pagina, se ne ha abbastanza da non richiedere l'OCR. */
function usableTextLayer(text) {
  return text && text.replace(/\s/g, "").length >= MIN_TEXT_LAYER_CHARS ? text.trim() : null;
}

const fmtDuration = (ms) => {
  if (ms < 60000) return "meno di 1 min";
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

// ---------------------------------------------------------------- pages
// Renderer PDF -> PNG con PDFKit di macOS (JavaScript for Automation, nessuna dipendenza).
// Argomenti: <pdf> <cartella> <dpi> <prima pagina> <ultima pagina>; scrive p-<n>.png e, se la
// pagina ha testo digitale, p-<n>.txt.
const MAC_RENDER_JXA = `
ObjC.import('Foundation'); ObjC.import('AppKit'); ObjC.import('PDFKit');
function run(argv) {
  const dpi = Number(argv[2]);
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (!doc || doc.isNil()) throw new Error('PDF non leggibile (protetto o danneggiato?)');
  const n = Number(doc.pageCount);
  const from = Math.max(1, Number(argv[3]) || 1), to = Math.min(n, Number(argv[4]) || n);
  for (let i = from; i <= to; i++) {
    const page = doc.pageAtIndex(i - 1);
    const box = page.boundsForBox(0);
    const rotated = Number(page.rotation) % 180 !== 0;
    const w = (rotated ? box.size.height : box.size.width) * dpi / 72;
    const h = (rotated ? box.size.width : box.size.height) * dpi / 72;
    const img = page.thumbnailOfSizeForBox($.NSMakeSize(w, h), 0);
    const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
    const png = rep.representationUsingTypeProperties(4, $());
    if (!png.writeToFileAtomically(argv[1] + '/p-' + i + '.png', true)) throw new Error('scrittura pagina ' + i + ' non riuscita');
    const str = page.string;
    if (str && !str.isNil() && ObjC.unwrap(str).trim()) str.writeToFileAtomicallyEncodingError(argv[1] + '/p-' + i + '.txt', true, 4, $());
  }
  return String(n);
}`;

function hasPdftoppm() {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Motore usato per i PDF, o null se non ce n'e uno. */
function pdfEngine() {
  if (hasPdftoppm()) return "pdftoppm";
  return process.platform === "darwin" ? "macos" : null;
}

/** Con poppler: estrae il testo digitale in p-<n>.txt (pagine separate da form feed). */
function writePdftotextPages(file, opts, workdir) {
  let out;
  try {
    const range = opts.pages ? ["-f", String(Math.min(...opts.pages)), "-l", String(Math.max(...opts.pages))] : [];
    out = execFileSync("pdftotext", ["-layout", ...range, file, "-"], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  } catch {
    return; // pdftotext assente o errore: si fa OCR su tutte le pagine
  }
  const first = opts.pages ? Math.min(...opts.pages) : 1;
  out.split("\f").forEach((t, i) => { if (t.trim()) writeFileSync(join(workdir, `p-${first + i}.txt`), t); });
}

/** Ritorna [{page, path, text}] — rasterizza i PDF in una cartella temporanea. */
function pagesFor(file, opts, workdir) {
  const ext = extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return [{ page: 1, path: file }];
  if (ext !== ".pdf") throw new Error(`formato non supportato: ${ext || "(nessuna estensione)"} — usa PDF, PNG, JPG o WEBP`);
  const first = opts.pages ? Math.min(...opts.pages) : 0;
  const last = opts.pages ? Math.max(...opts.pages) : 0;
  const engine = pdfEngine();
  if (engine === "macos") {
    const script = join(workdir, "render.js");
    writeFileSync(script, MAC_RENDER_JXA);
    try {
      execFileSync("osascript", ["-l", "JavaScript", script, file, workdir, String(opts.dpi), String(first), String(last)],
        { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      throw new Error(`conversione del PDF non riuscita: ${String(e.stderr || e.message).trim().slice(0, 200)}`);
    }
  } else if (engine === "pdftoppm") {
    const args = ["-r", String(opts.dpi), "-png"];
    if (opts.pages) args.push("-f", String(first), "-l", String(last));
    execFileSync("pdftoppm", [...args, file, join(workdir, "p")], { stdio: ["ignore", "ignore", "pipe"] });
    writePdftotextPages(file, opts, workdir);
  } else {
    throw new Error("pdftoppm non trovato. Installa poppler (Debian/Ubuntu: apt install poppler-utils; Windows: choco install poppler).");
  }
  return readdirSync(workdir)
    .map((f) => ({ f, m: f.match(/^p-0*(\d+)\.png$/) }))
    .filter((x) => x.m)
    .map((x) => {
      const txt = join(workdir, `p-${Number(x.m[1])}.txt`);
      return { page: Number(x.m[1]), path: join(workdir, x.f), text: existsSync(txt) ? readFileSync(txt, "utf8") : null };
    })
    .filter((p) => !opts.pages || opts.pages.has(p.page))
    .sort((a, b) => a.page - b.page);
}

async function run(opts) {
  if (!opts.file) fail("specifica un file. Uso: glm-ocr.mjs <file> [--out file.md] [--mode text|table|formula] [--pages 1-3] [--dpi 150] [--force-ocr]");
  if (!existsSync(opts.file)) fail(`file non trovato: ${opts.file}`);
  const host = resolveHost(process.env.OLLAMA_HOST);
  const model = await ensureModel(host);

  const workdir = mkdtempSync(join(tmpdir(), "glm-ocr-"));
  try {
    const pages = pagesFor(opts.file, opts, workdir);
    if (!pages.length) throw new Error("nessuna pagina da elaborare (controlla --pages)");
    if (opts.out) {
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, "");
    }
    const emit = (chunk) => (opts.out ? appendFileSync(opts.out, chunk) : process.stdout.write(chunk));
    emit([
      `<!-- glm-ocr: ${basename(opts.file)} | modello ${model} | modalita ${opts.mode} | ${new Date().toISOString()} -->`,
      `<!-- Testo da OCR automatico: verificare sull'originale prima di citarlo. -->`,
    ].join("\n") + "\n");

    const toOcr = pages.filter((p) => opts.forceOcr || !usableTextLayer(p.text)).length;
    if (toOcr < pages.length)
      process.stderr.write(`glm-ocr: ${pages.length - toOcr} pagine hanno gia testo digitale (nessun OCR), ${toOcr} da leggere con GLM-OCR\n`);
    let done = 0, ocrMs = 0;
    for (const [i, p] of pages.entries()) {
      const digital = opts.forceOcr ? null : usableTextLayer(p.text);
      let text;
      if (digital) {
        text = digital;
        process.stderr.write(`glm-ocr: pagina ${i + 1}/${pages.length} (testo digitale)\n`);
      } else {
        const t0 = Date.now();
        text = await ocrImage(host, model, p.path, opts.mode);
        ocrMs += Date.now() - t0;
        done++;
        const eta = toOcr > done ? ` — fine stimata tra ${fmtDuration((ocrMs / done) * (toOcr - done))}` : "";
        process.stderr.write(`glm-ocr: pagina ${i + 1}/${pages.length} (OCR ${Math.round((Date.now() - t0) / 1000)} s)${eta}\n`);
      }
      emit(`\n<!-- pagina ${p.page}${digital ? " (testo digitale)" : ""} -->\n\n${text || "[pagina vuota o illeggibile]"}\n`);
    }
    if (opts.out) process.stderr.write(`glm-ocr: ${pages.length} pagine -> ${opts.out}\n`);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function check() {
  const host = resolveHost(process.env.OLLAMA_HOST);
  const model = await ensureModel(host);
  const engine = pdfEngine();
  console.log(`OK: Ollama su ${host}, modello ${model} installato.`);
  console.log(engine === "macos" ? "OK: PDF supportati (motore PDF di macOS)."
    : engine ? "OK: pdftoppm disponibile (PDF supportati)."
    : "ATTENZIONE: pdftoppm mancante — solo immagini. Installa poppler per i PDF.");
}

function selfcheck() {
  const assert = (cond, msg) => { if (!cond) fail(`selfcheck fallito: ${msg}`); };
  assert(resolveHost(undefined) === "http://127.0.0.1:11434", "host di default");
  assert(resolveHost("localhost") === "http://localhost:11434", "host senza schema");
  assert(resolveHost("http://[::1]:8080") === "http://[::1]:8080", "IPv6 loopback");
  assert(resolveHost("0.0.0.0") === "http://127.0.0.1:11434", "bind 0.0.0.0");
  for (const bad of ["http://192.168.1.5:11434", "https://api.example.com", "10.0.0.1:11434"]) {
    let threw = false;
    try { resolveHost(bad); } catch { threw = true; }
    assert(threw, `host remoto accettato: ${bad}`);
  }
  assert(pickModel(["glm-ocr:q8_0", "x:latest"], "glm-ocr") === "glm-ocr:q8_0", "variante q8_0");
  assert(pickModel(["glm-ocr:bf16", "glm-ocr:latest"], "glm-ocr") === "glm-ocr:latest", "preferenza latest");
  assert(pickModel(["glm-ocr:bf16"], "glm-ocr:q8_0") === null, "tag esplicito mancante");
  assert(pickModel(["glm-ocr-x:latest"], "glm-ocr") === null, "nome diverso");
  assert(usableTextLayer("a".repeat(250)) && !usableTextLayer("  abc \n ") && !usableTextLayer(null), "soglia testo digitale");
  assert(fmtDuration(30000) === "meno di 1 min" && fmtDuration(125 * 60000) === "2 h 5 min", "durata");
  assert([...parsePages("1-3,7")].join() === "1,2,3,7", "parsePages");
  let threw = false;
  try { parsePages("3-1"); } catch { threw = true; }
  assert(threw, "intervallo invertito accettato");
  console.log("selfcheck OK");
}

// ---------------------------------------------------------------- main
const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "check") await check();
  else if (cmd === "selfcheck") selfcheck();
  else if (!cmd || cmd === "-h" || cmd === "--help")
    console.log("Uso: glm-ocr.mjs check | selfcheck | <file.pdf|png|jpg|webp> [--out file.md] [--mode text|table|formula] [--pages 1-3,7] [--dpi 150] [--force-ocr]");
  else await run(parseArgs([cmd, ...rest]));
} catch (e) {
  fail(e.message);
}
