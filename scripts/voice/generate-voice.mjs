/**
 * Offline Grok TTS generation for Loose Cannon NPC barks.
 *
 * Auth: XAI_API_KEY or ~/.grok/auth.json OIDC access token.
 *
 *   node scripts/voice/generate-voice.mjs
 *   node scripts/voice/generate-voice.mjs --force
 *   node scripts/voice/generate-voice.mjs --only=vince_greet_1,venus_greet_1
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "packages/client/public/voice");
const catalogPath = path.join(root, "packages/shared/src/voiceLines.ts");

const force = process.argv.includes("--force");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean))
  : null;

function loadAuthToken() {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  const authPath = path.join(os.homedir(), ".grok", "auth.json");
  if (!fs.existsSync(authPath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(authPath, "utf8"));
    for (const v of Object.values(j)) {
      if (v && typeof v === "object" && typeof v.key === "string" && v.key.length > 20) {
        return v.key;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseCatalog(src) {
  const lines = [];
  const blocks = src.split(/\{\s*\n?\s*id:/);
  for (const block of blocks.slice(1)) {
    const idM = block.match(/^\s*"([^"]+)"/);
    const voiceM = block.match(/voice:\s*"([^"]+)"/);
    // speak may span lines inside one string
    const speakM = block.match(/speak:\s*"((?:\\.|[^"\\])*)"/s);
    if (!idM || !voiceM || !speakM) continue;
    lines.push({
      id: idM[1],
      speak: speakM[1]
        .replace(/\\n/g, " ")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\s+/g, " ")
        .trim(),
      voice: voiceM[1],
    });
  }
  return lines;
}

async function tts(token, { text, voice_id }) {
  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id,
      language: "en",
      output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS ${res.status}: ${err.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const token = loadAuthToken();
if (!token) {
  console.error("No XAI_API_KEY or ~/.grok/auth.json token found.");
  process.exit(1);
}

const src = fs.readFileSync(catalogPath, "utf8");
let catalog = parseCatalog(src);
if (!catalog.length) {
  console.error("Failed to parse VOICE_LINES from", catalogPath);
  process.exit(1);
}
if (only) catalog = catalog.filter((l) => only.has(l.id));

fs.mkdirSync(outDir, { recursive: true });
console.log(`Generating ${catalog.length} lines → ${outDir}`);

let ok = 0;
let skip = 0;
let fail = 0;
for (const line of catalog) {
  const out = path.join(outDir, `${line.id}.mp3`);
  if (!force && fs.existsSync(out) && fs.statSync(out).size > 1000) {
    console.log(`skip  ${line.id}`);
    skip++;
    continue;
  }
  process.stdout.write(`tts   ${line.id} (${line.voice})… `);
  try {
    const buf = await tts(token, { text: line.speak, voice_id: line.voice });
    fs.writeFileSync(out, buf);
    console.log(`${buf.length} bytes`);
    ok++;
    await sleep(150);
  } catch (e) {
    console.log("FAIL", e.message);
    fail++;
    await sleep(600);
  }
}

console.log(`Done. ok=${ok} skip=${skip} fail=${fail}`);
if (fail) process.exit(1);
