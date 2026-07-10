/**
 * Server smoke test — expects a Mode A game server on ws://127.0.0.1:3001
 * (start with `npm run server` in another terminal, or `npm run dev`).
 *
 * Exit 0 + SMOKE_OK only if critical hub flows pass.
 */
import WebSocket from "ws";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error("SMOKE_FAIL:", msg);
  process.exit(1);
}

const ws = new WebSocket("ws://127.0.0.1:3001");
let last = null;

ws.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "snapshot") last = msg.data;
  if (msg.type === "event") console.log("EVENT", msg.text);
  if (msg.type === "auth.ok") console.log("AUTH", msg.characterId);
  if (msg.type === "auth.fail") {
    console.error(msg);
    process.exit(1);
  }
});

await new Promise((res, rej) => {
  ws.on("open", res);
  ws.on("error", (err) => rej(err));
});

const name = "Walker" + Math.floor(Math.random() * 999);
ws.send(JSON.stringify({ type: "auth", name, protocolVersion: 1 }));
await wait(400);
if (!last) fail("no snapshot after auth");

/** @returns {Promise<object|undefined>} */
async function goTo(x, y, seconds = 16) {
  ws.send(JSON.stringify({ type: "intent.move", x, y }));
  const steps = seconds * 5;
  for (let i = 0; i < steps; i++) {
    await wait(200);
    const me = last?.units.find((u) => u.isPlayerLeader);
    if (!me) continue;
    if (Math.hypot(me.x - x, me.y - y) < 0.65) return me;
  }
  return last?.units.find((u) => u.isPlayerLeader);
}

function leader() {
  return last?.units.find((u) => u.isPlayerLeader);
}

console.log("map", last?.mapWidth, "x", last?.mapHeight);
if (!last?.mapWidth || !last?.mapHeight) fail("missing map size in snapshot");

// --- Bar: The Rusty Nail door is (8, 14); stand just south of door ---
let me = await goTo(8.5, 15.2, 20);
console.log("at bar door", me?.x?.toFixed(2), me?.y?.toFixed(2));
if (!me || Math.hypot(me.x - 8.5, me.y - 15.2) > 1.2) {
  fail(`could not reach bar door (at ${me?.x?.toFixed(2)}, ${me?.y?.toFixed(2)})`);
}
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
console.log("inside", last?.you.insideBuildingId);
if (last?.you.insideBuildingId !== "bar_rusty") {
  fail(`expected inside bar_rusty, got ${last?.you.insideBuildingId}`);
}

// Bartender Vince at (3, 3) interior
me = await goTo(3.2, 3.2, 10);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
console.log("dialogue", last?.dialogue?.npcName);
if (!last?.dialogue?.npcName) fail("expected bartender dialogue");

if (last.dialogue.choices?.some((c) => c.id === "hire")) {
  const cashBefore = last.you.cash;
  ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "hire" }));
  await wait(400);
  console.log("hire cash", last.you.cash, "(was", cashBefore + ")");
  if (last.you.cash >= cashBefore) {
    // Hire may fail if roster full — not fatal
    console.log("hire skipped or free (roster/cash edge)");
  }
}
ws.send(JSON.stringify({ type: "dialogue.close" }));
await wait(200);

ws.send(JSON.stringify({ type: "intent.exit" }));
await wait(500);
if (last?.you.insideBuildingId) {
  // Prefer exit intent; fall back to interact at exit tile
  ws.send(JSON.stringify({ type: "intent.interact" }));
  await wait(400);
}
if (last?.you.insideBuildingId) fail("could not exit bar");

// --- Shop: Pawn-O-Matic door (51, 14) ---
me = await goTo(51.5, 15.2, 22);
console.log("at shop door", me?.x?.toFixed(2), me?.y?.toFixed(2));
if (!me || Math.hypot(me.x - 51.5, me.y - 15.2) > 1.2) {
  fail(`could not reach shop door (at ${me?.x?.toFixed(2)}, ${me?.y?.toFixed(2)})`);
}
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
console.log("shop building", last?.you.insideBuildingId);
if (last?.you.insideBuildingId !== "shop_pawn") {
  fail(`expected inside shop_pawn, got ${last?.you.insideBuildingId}`);
}

// Pawnshop Phil at (100.5, 3.2); shop tiles at x≈100–101, y≈3 — stay off exit (103,7)
me = await goTo(100.5, 3.4, 14);
console.log("near dealer", me?.x?.toFixed(2), me?.y?.toFixed(2));
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
console.log("shop", last?.shop?.shopName, "cash", last?.you.cash);
if (!last?.shop) fail("expected shop UI open (talk to dealer or stand on shop tile)");

const u = last.units.find((x) => x.posseId === last.you.posseId && x.isPlayerLeader);
if (!u) fail("missing player leader unit for shop buy");
const cashBeforeBuy = last.you.cash;
ws.send(JSON.stringify({ type: "shop.buyWeapon", weaponId: "pistol", unitId: u.id }));
await wait(400);
console.log(
  "weapon",
  last.units.find((x) => x.id === u.id)?.weapon,
  "cash",
  last.you.cash,
);
// Pistol may already be owned — cash should not go negative
if (last.you.cash < 0) fail("cash went negative after shop buy");
if (last.you.cash > cashBeforeBuy) fail("cash increased on buy");

if (last?.you.insideBuildingId) {
  ws.send(JSON.stringify({ type: "intent.exit" }));
  await wait(400);
  if (last?.you.insideBuildingId) {
    ws.send(JSON.stringify({ type: "intent.interact" }));
    await wait(400);
  }
}

// Optional combat near war-zone edge (safe-zone fire should be rejected, not crash)
me = await goTo(14, 22, 16);
console.log("near dogs", me?.x?.toFixed(2), me?.y?.toFixed(2));
const foe = last?.units.find((u) => u.kind === "ai_boss" || u.kind === "ai_goon");
if (foe) {
  for (let i = 0; i < 15; i++) {
    ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
    await wait(80);
  }
}
await wait(800);
const start = Date.now();
let sawCountdown = false;
for (let i = 0; i < 30; i++) {
  await wait(100);
  if (last?.you.respawnIn != null && last.you.respawnIn > 0) {
    sawCountdown = true;
    console.log("respawnIn", last.you.respawnIn.toFixed(2));
    break;
  }
}
if (sawCountdown) {
  while (last?.you.respawnIn != null && last.you.respawnIn > 0) {
    await wait(100);
  }
  await wait(200);
  const elapsed = (Date.now() - start) / 1000;
  const alive = leader()?.alive;
  console.log(
    "respawned after ~",
    elapsed.toFixed(1),
    "s at",
    leader()?.x?.toFixed(1),
    leader()?.y?.toFixed(1),
    "alive",
    alive,
  );
  if (!alive) fail("leader not alive after respawn countdown");
} else {
  console.log("no death this run (ok) map size", last?.mapWidth, last?.mapHeight);
}

// Light reconnect: disconnect + rejoin same name should succeed (new session; Mode A wipe-on-leave)
ws.close();
await wait(300);
const ws2 = new WebSocket("ws://127.0.0.1:3001");
let last2 = null;
ws2.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "snapshot") last2 = msg.data;
  if (msg.type === "auth.fail") {
    console.error(msg);
    process.exit(1);
  }
});
await new Promise((res, rej) => {
  ws2.on("open", res);
  ws2.on("error", rej);
});
ws2.send(JSON.stringify({ type: "auth", name, protocolVersion: 1 }));
await wait(500);
if (!last2?.you) fail("no snapshot after reconnect auth");
console.log("reconnect ok cash", last2.you.cash, "units", last2.units?.length);

console.log("SMOKE_OK");
ws2.close();
process.exit(0);
