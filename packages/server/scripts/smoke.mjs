/**
 * Server smoke test — expects a Mode A game server on ws://127.0.0.1:3001
 *
 * Exit 0 + SMOKE_OK only if hub + outdoor job + instance job pass.
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
  if (msg.type === "notify" && msg.kind === "mission") {
    console.log("NOTIFY mission", msg.title, msg.cash != null ? `$${msg.cash}` : "");
  }
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
if (last.you?.realmId !== "public") {
  fail(`expected default realm public, got ${last.you?.realmId}`);
}
if (last.tutorial?.step !== "go_bar") {
  fail(`expected tutorial go_bar, got ${last.tutorial?.step}`);
}
if (!last.districts?.length) fail("expected districts on snapshot");
if (!Array.isArray(last.memorials)) fail("expected memorials array");
if (last.memorials.length !== 0) fail("expected empty memorial wall at start");
const lockedDeep = last.districts.find((d) => d.id === "war_deep");
if (!lockedDeep || lockedDeep.unlocked) fail("war_deep should start locked at rep 0");
console.log(
  "tutorial start",
  last.tutorial?.step,
  "districts",
  last.districts.length,
  "realm",
  last.you.realmId,
);

/** @returns {Promise<object|undefined>} */
async function goTo(x, y, seconds = 16) {
  // Re-issue move periodically (straight-line path can stick on façades)
  const steps = seconds * 5;
  for (let i = 0; i < steps; i++) {
    if (i % 8 === 0) ws.send(JSON.stringify({ type: "intent.move", x, y }));
    await wait(200);
    const me = last?.units.find((u) => u.isPlayerLeader);
    if (!me) continue;
    if (Math.hypot(me.x - x, me.y - y) < 0.7) return me;
  }
  return last?.units.find((u) => u.isPlayerLeader);
}

/** Multi-hop path to avoid getting stuck on building shells */
async function goVia(points, secondsEach = 12) {
  let me;
  for (const [x, y] of points) {
    me = await goTo(x, y, secondsEach);
  }
  return me;
}

function leader() {
  return last?.units.find((u) => u.isPlayerLeader);
}

function openRitaBoard() {
  return (async () => {
    // Ensure outside then enter bar
    if (last?.you.insideBuildingId && !String(last.you.insideBuildingId).startsWith("mi_")) {
      ws.send(JSON.stringify({ type: "intent.exit" }));
      await wait(400);
      if (last?.you.insideBuildingId) {
        ws.send(JSON.stringify({ type: "intent.interact" }));
        await wait(400);
      }
    }
    let me = await goVia(
      [
        [30, 22],
        [18, 18],
        [8.5, 15.2],
      ],
      12,
    );
    if (!me || Math.hypot(me.x - 8.5, me.y - 15.2) > 1.5) fail("bar door");
    if (last?.you.insideBuildingId !== "bar_rusty") {
      ws.send(JSON.stringify({ type: "intent.interact" }));
      await wait(500);
    }
    if (last?.you.insideBuildingId !== "bar_rusty") fail("enter bar");
    me = await goTo(7.0, 4.0, 10);
    ws.send(JSON.stringify({ type: "intent.interact" }));
    await wait(400);
    if (!last?.dialogue) fail("rita dialogue");
    ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "job" }));
    await wait(400);
    if (!last?.jobBoard?.offers?.length) fail("job board");
  })();
}

console.log("map", last?.mapWidth, "x", last?.mapHeight);
if (!last?.mapWidth || !last?.mapHeight) fail("missing map size in snapshot");

// --- Bar hire ---
// Waypoints: spawn (40,30) → open street → bar door (avoid building shells)
let me = await goVia(
  [
    [30, 22],
    [18, 18],
    [8.5, 15.2],
  ],
  14,
);
console.log("at bar door", me?.x?.toFixed(2), me?.y?.toFixed(2));
if (!me || Math.hypot(me.x - 8.5, me.y - 15.2) > 1.5) fail("bar door");
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
if (last?.you.insideBuildingId !== "bar_rusty") fail(`bar enter ${last?.you.insideBuildingId}`);
if (last?.tutorial?.step !== "hire_vince") {
  fail(`expected tutorial hire_vince after bar, got ${last?.tutorial?.step}`);
}
console.log("tutorial after bar", last.tutorial?.step);

me = await goTo(3.2, 3.2, 10);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
if (!last?.dialogue?.npcName) fail("bartender dialogue");
if (last.dialogue.choices?.some((c) => c.id === "hire")) {
  ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "hire" }));
  await wait(400);
  console.log("hire cash", last.you.cash);
}
if (last?.tutorial?.step !== "talk_rita") {
  fail(`expected tutorial talk_rita after hire, got ${last?.tutorial?.step}`);
}
console.log("tutorial after hire", last.tutorial?.step);
ws.send(JSON.stringify({ type: "dialogue.close" }));
await wait(200);

// --- Outdoor job: smash_stash ---
me = await goTo(7.0, 4.0, 10);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "job" }));
await wait(400);
if (!last?.jobBoard?.offers?.some((o) => o.id === "smash_stash")) fail("no smash offer");

let cash0 = last.you.cash;
let rep0 = last.you.rep;
ws.send(JSON.stringify({ type: "jobBoard.accept", missionId: "smash_stash" }));
await wait(500);
if (last?.mission?.id !== "smash_stash") fail("smash not active");
me = await goTo(44, 28, 22);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(600);
if (last?.mission) fail("smash should complete");
// Job pay + tutorial complete bonus ($100) if first job finishes tutorial
if (last.you.cash < cash0 + 280) fail("smash pay");
if (last.you.rep < rep0 + 2) fail("smash rep");
if (last.tutorial) fail(`tutorial should complete after first job, got ${last.tutorial.step}`);
// Soft job adds some heat
if ((last.you.heat ?? 0) < 1) fail(`expected heat after job, got ${last.you.heat}`);
console.log("outdoor smash_stash ok cash", last.you.cash, "heat", last.you.heat, "tutorial done");

// --- Instance job: warehouse_raid ---
await openRitaBoard();
if (!last.jobBoard.offers.some((o) => o.id === "warehouse_raid")) fail("no warehouse_raid offer");
cash0 = last.you.cash;
rep0 = last.you.rep;
ws.send(JSON.stringify({ type: "jobBoard.accept", missionId: "warehouse_raid" }));
await wait(600);
console.log(
  "instance layer",
  last?.you.insideBuildingId,
  "mission",
  last?.mission?.id,
  last?.mission?.phase,
  "instanced",
  last?.mission?.instanced,
);
if (!String(last?.you.insideBuildingId ?? "").startsWith("mi_")) {
  fail(`expected mi_ layer, got ${last?.you.insideBuildingId}`);
}
if (last?.mission?.id !== "warehouse_raid") fail("warehouse_raid not active");
if (!last.mission.instanced) fail("mission not marked instanced");

// Fight hostiles in the bay
const fireBudget = 200;
for (let i = 0; i < fireBudget; i++) {
  const foe = last?.units.find(
    (u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive,
  );
  if (!foe) break;
  ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
  // Also attack-move by firing repeatedly
  await wait(80);
  if (last?.mission?.phase === "extract") break;
  // Revive wait if we died (should fail job)
  if (last?.mission == null && last?.you.respawnIn != null) {
    fail("job failed (died in bay) before extract");
  }
}
await wait(400);
console.log("after fight phase", last?.mission?.phase, "hostiles left", last?.units?.filter((u) => u.kind === "ai_boss" || u.kind === "ai_goon").length);

// Wait up to a few seconds for phase extract
for (let i = 0; i < 40; i++) {
  if (last?.mission?.phase === "extract") break;
  const foe = last?.units.find((u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive);
  if (foe) {
    ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
  }
  await wait(150);
}
if (last?.mission?.phase !== "extract") {
  fail(`expected extract phase, got ${last?.mission?.phase} mission=${JSON.stringify(last?.mission)}`);
}
console.log("extract phase ok");

// Warehouse template exit ~ (27, 82)
me = await goTo(27.5, 82.5, 14);
console.log("at exit", me?.x?.toFixed(2), me?.y?.toFixed(2));
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(600);
console.log("after extract mission", last?.mission, "cash", last?.you.cash, "inside", last?.you.insideBuildingId);
if (last?.mission) fail("mission should clear after extract");
if (last.you.cash < cash0 + 450) fail(`instance pay expected +450 (cash ${last.you.cash} vs ${cash0})`);
if (last.you.rep < rep0 + 4) fail("instance rep");
if (last?.you.insideBuildingId) fail("should be outdoors after extract");
// Combat + mission should push heat well above soft-job baseline
if ((last.you.heat ?? 0) < 15) fail(`expected higher heat after warehouse fight, got ${last.you.heat}`);
console.log("warehouse_raid instance ok heat", last.you.heat, "memorials", last.memorials?.length ?? 0);

// --- Shop quick check ---
me = await goTo(51.5, 15.2, 20);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
if (last?.you.insideBuildingId !== "shop_pawn") fail("shop enter");
me = await goTo(100.5, 3.4, 12);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
if (!last?.shop) fail("shop ui");
ws.send(JSON.stringify({ type: "shop.close" }));
await wait(200);
ws.send(JSON.stringify({ type: "intent.exit" }));
await wait(400);

// Reconnect (same name, public realm — Mode A removes posse on disconnect)
ws.close();
await wait(300);
const ws2 = new WebSocket("ws://127.0.0.1:3001");
let last2 = null;
ws2.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "snapshot") last2 = msg.data;
  if (msg.type === "auth.fail") process.exit(1);
});
await new Promise((res, rej) => {
  ws2.on("open", res);
  ws2.on("error", rej);
});
ws2.send(JSON.stringify({ type: "auth", name, protocolVersion: 1 }));
await wait(500);
if (!last2?.you) fail("reconnect");
if (last2.you.realmId !== "public") fail("reconnect should land in public");
console.log("reconnect ok realm", last2.you.realmId);

// --- Realms isolation: private realm must not see public player ---
const publicName = name;
const isoName = "Iso" + Math.floor(Math.random() * 999);
const wsIso = new WebSocket("ws://127.0.0.1:3001");
let lastIso = null;
wsIso.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "snapshot") lastIso = msg.data;
  if (msg.type === "auth.fail") {
    console.error(msg);
    process.exit(1);
  }
});
await new Promise((res, rej) => {
  wsIso.on("open", res);
  wsIso.on("error", rej);
});
wsIso.send(
  JSON.stringify({
    type: "auth",
    name: isoName,
    protocolVersion: 1,
    realm: "smoke-alpha",
  }),
);
await wait(500);
if (!lastIso?.you) fail("no snapshot in private realm");
if (lastIso.you.realmId !== "smoke-alpha") {
  fail(`expected realm smoke-alpha, got ${lastIso.you.realmId}`);
}
const isoPlayers = (lastIso.units || []).filter((u) => u.kind === "player");
if (isoPlayers.some((u) => u.name === publicName)) {
  fail("private realm should not see public player");
}
if (!isoPlayers.some((u) => u.name === isoName)) {
  fail("private realm should see own player");
}
// Public snapshot still must not include isolated player
await wait(200);
const publicPlayers = (last2.units || []).filter((u) => u.kind === "player");
if (publicPlayers.some((u) => u.name === isoName)) {
  fail("public realm should not see private-realm player");
}
// Invalid realm rejected
const wsBad = new WebSocket("ws://127.0.0.1:3001");
let badFail = null;
wsBad.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "auth.fail") badFail = msg.reason;
});
await new Promise((res, rej) => {
  wsBad.on("open", res);
  wsBad.on("error", rej);
});
wsBad.send(
  JSON.stringify({
    type: "auth",
    name: "BadRealm",
    protocolVersion: 1,
    realm: "no spaces!",
  }),
);
await wait(300);
if (!badFail) fail("expected auth.fail for invalid realm");
console.log("realm isolation ok", lastIso.you.realmId, "invalid realm rejected");

console.log("SMOKE_OK");
ws2.close();
wsIso.close();
wsBad.close();
process.exit(0);
