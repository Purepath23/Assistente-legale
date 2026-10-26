#!/usr/bin/env node
/**
 * glm-ocr.mjs — OCR locale di documenti scansionati con GLM-OCR via Ollama.
 *
 * Uso:
 *   node glm-ocr.mjs check
 *   node glm-ocr.mjs <file.pdf|png|jpg|webp> [--out <file.md>] [--mode text|table|formula]
 *                    [--pages 1-3,7] [--dpi 200]
 *   node glm-ocr.mjs selfcheck
 *
 * Zero dipendenze (Node >= 18). Per i PDF serve `pdftoppm` (poppler).
 * Segreto professionale (Art. 622 CP, L. 247/2012): il documento non lascia mai la
 * macchina. Lo script parla SOLO con un Ollama su loopback e rifiuta host remoti.
 *
 * Variabili d'ambiente:
 *   OLLAMA_HOST    default http://127.0.0.1:11434 (solo localhost / 127.x / ::1)
 *   GLM_OCR_MODEL  default glm-ocr
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const MODEL = process.env.GLM_OCR_MODEL || "glm-ocr";
const PROMPTS = { text: "Text Recognition:", table: "Table Recognition:", formula: "Formula Recognition:" };
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PAGE_TIMEOUT_MS = 5 * 60 * 1000;

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
  const opts = { file: null, out: null, mode: "text", pages: null, dpi: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else if (a === "--mode") opts.mode = argv[++i];
    else if (a === "--pages") opts.pages = parsePages(argv[++i]);
    else if (a === "--dpi") opts.dpi = Number(argv[++i]);
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

async function ensureModel(host) {
  const names = await ollamaTags(host);
  const want = MODEL.includes(":") ? MODEL : `${MODEL}:latest`;
  if (!names.includes(MODEL) && !names.includes(want))
    throw new Error(`modello "${MODEL}" non installato. Esegui: ollama pull ${MODEL}`);
}

async function ocrImage(host, pngPath, mode) {
  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: PROMPTS[mode],
      images: [readFileSync(pngPath).toString("base64")],
      stream: false,
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama ha risposto ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return String(body.response || "").trim();
}

// ---------------------------------------------------------------- pages
/** Ritorna [{page, path}] — rasterizza i PDF con pdftoppm in una cartella temporanea. */
function pagesFor(file, opts, workdir) {
  const ext = extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return [{ page: 1, path: file }];
  if (ext !== ".pdf") throw new Error(`formato non supportato: ${ext || "(nessuna estensione)"} — usa PDF, PNG, JPG o WEBP`);
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("pdftoppm non trovato. Installa poppler (macOS: brew install poppler; Debian/Ubuntu: apt install poppler-utils; Windows: choco install poppler).");
  }
  const args = ["-r", String(opts.dpi), "-png"];
  if (opts.pages) args.push("-f", String(Math.min(...opts.pages)), "-l", String(Math.max(...opts.pages)));
  execFileSync("pdftoppm", [...args, file, join(workdir, "p")], { stdio: ["ignore", "ignore", "pipe"] });
  return readdirSync(workdir)
    .map((f) => ({ f, m: f.match(/^p-0*(\d+)\.png$/) }))
    .filter((x) => x.m)
    .map((x) => ({ page: Number(x.m[1]), path: join(workdir, x.f) }))
    .filter((p) => !opts.pages || opts.pages.has(p.page))
    .sort((a, b) => a.page - b.page);
}

async function run(opts) {
  if (!opts.file) fail("specifica un file. Uso: glm-ocr.mjs <file> [--out file.md] [--mode text|table|formula] [--pages 1-3] [--dpi 200]");
  if (!existsSync(opts.file)) fail(`file non trovato: ${opts.file}`);
  const host = resolveHost(process.env.OLLAMA_HOST);
  await ensureModel(host);

  const workdir = mkdtempSync(join(tmpdir(), "glm-ocr-"));
  try {
    const pages = pagesFor(opts.file, opts, workdir);
    if (!pages.length) throw new Error("nessuna pagina da elaborare (controlla --pages)");
    const parts = [
      `<!-- glm-ocr: ${basename(opts.file)} | modello ${MODEL} | modalita ${opts.mode} | ${new Date().toISOString()} -->`,
      `<!-- Testo da OCR automatico: verificare sull'originale prima di citarlo. -->`,
    ];
    for (const p of pages) {
      process.stderr.write(`glm-ocr: pagina ${p.page}/${pages[pages.length - 1].page}...\n`);
      const text = await ocrImage(host, p.path, opts.mode);
      parts.push(`\n<!-- pagina ${p.page} -->\n`);
      parts.push(text || "[pagina vuota o illeggibile]");
    }
    const md = parts.join("\n") + "\n";
    if (opts.out) {
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, md);
      process.stderr.write(`glm-ocr: ${pages.length} pagine -> ${opts.out}\n`);
    } else process.stdout.write(md);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function check() {
  const host = resolveHost(process.env.OLLAMA_HOST);
  await ensureModel(host);
  let pdf = true;
  try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); } catch { pdf = false; }
  console.log(`OK: Ollama su ${host}, modello ${MODEL} installato.`);
  console.log(pdf ? "OK: pdftoppm disponibile (PDF supportati)." : "ATTENZIONE: pdftoppm mancante — solo immagini. Installa poppler per i PDF.");
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
    console.log("Uso: glm-ocr.mjs check | selfcheck | <file.pdf|png|jpg|webp> [--out file.md] [--mode text|table|formula] [--pages 1-3,7] [--dpi 200]");
  else await run(parseArgs([cmd, ...rest]));
} catch (e) {
  fail(e.message);
}
