/**
 * Interaction / soft-lock UI tests (Mode A).
 * Spawns server if needed, drives WebSocket flows like smoke + a few client checks.
 *
 *   npm run test:ui
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const WS_URL = process.env.WS_URL || "ws://127.0.0.1:3001";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error("UI_TEST_FAIL:", msg);
  process.exit(1);
}

function connectWs(url = WS_URL, openTimeoutMs = 15_000) {
  const ws = new WebSocket(url);
  const opened = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`ws open timeout`)), openTimeoutMs);
    const finish = (fn) => (arg) => {
      clearTimeout(t);
      fn(arg);
    };
    if (ws.readyState === WebSocket.OPEN) {
      clearTimeout(t);
      res();
      return;
    }
    ws.once("open", finish(res));
    ws.once("error", finish(rej));
  });
  return { ws, opened };
}

async function ensureServer() {
  try {
    const { ws, opened } = connectWs(WS_URL, 2000);
    await opened;
    ws.close();
    return null;
  } catch {
    console.log("Starting game server for UI tests…");
    const child = spawn("npm", ["run", "server"], {
      cwd: root,
      shell: true,
      stdio: "pipe",
    });
    for (let i = 0; i < 40; i++) {
      await wait(500);
      try {
        const { ws, opened } = connectWs(WS_URL, 1500);
        await opened;
        ws.close();
        return child;
      } catch {
        /* retry */
      }
    }
    child.kill();
    fail("could not start server");
  }
}

async function main() {
  const serverProc = await ensureServer();
  const { ws, opened } = connectWs();
  let last = null;
  let events = [];
  ws.on("message", (d) => {
    const msg = JSON.parse(String(d));
    if (msg.type === "snapshot") last = msg.data;
    if (msg.type === "event") events.push(msg.text);
    if (msg.type === "auth.fail") fail(JSON.stringify(msg));
  });
  await opened;

  const name = "UiBot" + Math.floor(Math.random() * 999);
  ws.send(JSON.stringify({ type: "auth", name, protocolVersion: 1 }));
  await wait(500);
  if (!last) fail("no snapshot after auth");
  if (last.tutorial?.step !== "go_bar") fail(`tutorial expected go_bar got ${last.tutorial?.step}`);

  // Select leader (should not soft-lock)
  const me = last.units.find((u) => u.posseId === last.you.posseId);
  if (!me) fail("no player unit");
  ws.send(JSON.stringify({ type: "intent.select", unitId: me.id }));
  await wait(200);
  if (last.you.selectedUnitId !== me.id) fail("select unit did not stick");

  // Move toward bar door (tutorial) — no hang
  ws.send(JSON.stringify({ type: "intent.move", x: 8.5, y: 15.5 }));
  await wait(800);
  if (!last.you) fail("lost you after move");

  // Interact path: open dialogue or enter building near door
  ws.send(JSON.stringify({ type: "intent.move", x: 8.5, y: 14.5 }));
  await wait(600);
  ws.send(JSON.stringify({ type: "intent.interact" }));
  await wait(500);
  // Soft-lock: dialogue or inside or event log progress — any is fine
  const progressed =
    last.dialogue ||
    last.you.insideBuildingId ||
    last.tutorial?.step !== "go_bar" ||
    events.some((e) => /enter|Rusty|Vince|Rita|tutorial/i.test(e));
  if (!progressed) {
    // One more interact attempt at door
    ws.send(JSON.stringify({ type: "intent.interact" }));
    await wait(400);
  }
  // Still must have live snapshot
  if (!last.tick) fail("snapshot dead after interact");

  // Weather + dayPhase present
  if (!last.dayPhase) fail("missing dayPhase");
  if (last.weather == null) fail("missing weather field");

  // Fire at ground in safe zone should not crash
  ws.send(JSON.stringify({ type: "intent.fire", x: me.x + 1, y: me.y }));
  await wait(200);
  if (!last.you) fail("snapshot lost after fire");

  // Hydrant exist on map props
  const hydrants = (last.props || []).filter((p) => p.kind === "hydrant");
  if (hydrants.length < 1) fail("expected hydrant props on map");
  if (hydrants.length > 12) fail(`too many hydrants (${hydrants.length}) — placement spam?`);

  ws.close();
  if (serverProc) {
    serverProc.kill();
  }
  console.log("UI_TEST_OK hydrants", hydrants.length, "tutorial", last.tutorial?.step);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
