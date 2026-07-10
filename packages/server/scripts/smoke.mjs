import WebSocket from "ws";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  ws.on("error", rej);
});

const name = "Walker" + Math.floor(Math.random() * 999);
ws.send(JSON.stringify({ type: "auth", name, protocolVersion: 1 }));
await wait(300);

async function goTo(x, y, seconds = 14) {
  ws.send(JSON.stringify({ type: "intent.move", x, y }));
  const steps = seconds * 5;
  for (let i = 0; i < steps; i++) {
    await wait(200);
    const me = last?.units.find((u) => u.isPlayerLeader);
    if (!me) continue;
    if (Math.hypot(me.x - x, me.y - y) < 0.6) return me;
  }
  return last?.units.find((u) => u.isPlayerLeader);
}

console.log("map", last?.mapWidth, "x", last?.mapHeight);
let me = await goTo(10.5, 17.2, 18);
console.log("at bar door", me?.x?.toFixed(2), me?.y?.toFixed(2));
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
console.log("inside", last?.you.insideBuildingId);

ws.send(JSON.stringify({ type: "intent.move", x: 3.2, y: 3.2 }));
await wait(2500);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(300);
console.log("dialogue", last?.dialogue?.npcName);

if (last?.dialogue) {
  ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "hire" }));
  await wait(300);
  console.log("hire cash", last.you.cash);
  ws.send(JSON.stringify({ type: "dialogue.close" }));
}

ws.send(JSON.stringify({ type: "intent.exit" }));
await wait(400);

me = await goTo(53.5, 17.2, 20);
console.log("at shop door", me?.x?.toFixed(2), me?.y?.toFixed(2));
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
console.log("shop building", last?.you.insideBuildingId);

ws.send(JSON.stringify({ type: "intent.move", x: 76, y: 3.2 }));
await wait(2500);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(400);
console.log("shop", last?.shop?.shopName, "cash", last?.you.cash);

if (last?.shop) {
  const u = last.units.find((x) => x.posseId === last.you.posseId && x.isPlayerLeader);
  ws.send(JSON.stringify({ type: "shop.buyWeapon", weaponId: "pistol", unitId: u.id }));
  await wait(300);
  console.log("weapon", last.units.find((x) => x.id === u.id)?.weapon, "cash", last.you.cash);
}

if (last?.you.insideBuildingId) {
  ws.send(JSON.stringify({ type: "intent.exit" }));
  await wait(400);
}

// Force death via walking into AI and shooting - or skip if long
me = await goTo(14, 22, 16);
console.log("near dogs", me?.x?.toFixed(2), me?.y?.toFixed(2));
// fire at nearby ai
const foe = last?.units.find((u) => u.kind === "ai_boss" || u.kind === "ai_goon");
if (foe) {
  for (let i = 0; i < 40; i++) {
    ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
    await wait(100);
  }
}
await wait(2000);
// if we died, check respawn delay
const start = Date.now();
let sawCountdown = false;
for (let i = 0; i < 50; i++) {
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
  console.log(
    "respawned after ~",
    elapsed.toFixed(1),
    "s at",
    last?.units.find((u) => u.isPlayerLeader)?.x?.toFixed(1),
    last?.units.find((u) => u.isPlayerLeader)?.y?.toFixed(1),
    "alive",
    last?.units.find((u) => u.isPlayerLeader)?.alive,
  );
} else {
  console.log("no death this run (ok) map size", last?.mapWidth, last?.mapHeight);
}

console.log("SMOKE_OK");
process.exit(0);
