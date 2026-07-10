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
if (!Array.isArray(last.presence)) fail("expected presence array");
if (last.party != null) fail("expected solo party null at start");
if (last.partyInvite != null) fail("expected no party invite at start");
const lockedDeep = last.districts.find((d) => d.id === "war_deep");
if (!lockedDeep || lockedDeep.unlocked) fail("war_deep should start locked at rep 0");
const phases = new Set(["dawn", "day", "dusk", "night"]);
if (!phases.has(last.dayPhase)) {
  fail(`expected dayPhase dawn|day|dusk|night, got ${last.dayPhase}`);
}
// M5 ammo: starter tommy is limited; pistol is unlimited (no key / no dry)
const meAmmo = last.units.find((u) => u.isPlayerLeader);
if (!meAmmo?.weaponAmmo || typeof meAmmo.weaponAmmo.tommy !== "number") {
  fail("expected starter tommy ammo on leader weaponAmmo.tommy");
}
if (meAmmo.weaponAmmo.tommy < 1 || meAmmo.weaponAmmo.tommy > 150) {
  fail(`tommy ammo out of range: ${meAmmo.weaponAmmo.tommy}`);
}
if (meAmmo.weaponAmmo.pistol != null) {
  fail("pistol should be unlimited (no weaponAmmo.pistol key)");
}
console.log(
  "tutorial start",
  last.tutorial?.step,
  "districts",
  last.districts.length,
  "realm",
  last.you.realmId,
  "dayPhase",
  last.dayPhase,
  "tommyAmmo",
  meAmmo.weaponAmmo.tommy,
);

// --- M7 street hustles: prop catalog + outdoor NPCs present ---
{
  const props0 = last.props || [];
  if (!props0.some((p) => p.kind === "phonebooth")) fail("expected phonebooth prop");
  if (!props0.some((p) => p.kind === "mailbox")) fail("expected mailbox prop");
  if (!props0.some((p) => p.kind === "hydrant")) fail("expected hydrant prop");
  if (!props0.some((p) => p.kind === "cone")) fail("expected cone prop");
  const streetThugs = (last.units || []).filter(
    (u) => u.kind === "npc" && u.npcRole === "thug",
  );
  if (streetThugs.length < 6) {
    fail(`expected outdoor street thugs, got ${streetThugs.length}`);
  }
  if (!(last.units || []).some((u) => u.id === "npc_fence")) {
    fail("expected outdoor fence NPC npc_fence");
  }
  console.log("hustle catalog ok props", props0.length, "streetThugs", streetThugs.length);
}

/** @returns {Promise<object|undefined>} */
async function goTo(x, y, seconds = 16) {
  // Re-issue move occasionally (server A* + stuck repath should mostly own routing)
  const steps = seconds * 5;
  for (let i = 0; i < steps; i++) {
    if (i % 12 === 0) ws.send(JSON.stringify({ type: "intent.move", x, y }));
    await wait(200);
    const me = last?.units.find((u) => u.isPlayerLeader);
    if (!me) continue;
    if (Math.hypot(me.x - x, me.y - y) < 0.7) return me;
  }
  return last?.units.find((u) => u.isPlayerLeader);
}

/** Multi-hop helper when a single click is not enough */
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
    // Single long click — server A* must route around shells
    let me = await goTo(8.5, 15.2, 28);
    if (!me || Math.hypot(me.x - 8.5, me.y - 15.2) > 1.5) fail("bar door (pathing)");
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

/** Full crew heal at Doc's — reduces instance wipe flakes after outdoor jobs */
async function healCrew() {
  if (last?.you.insideBuildingId && !String(last.you.insideBuildingId).startsWith("mi_")) {
    ws.send(JSON.stringify({ type: "intent.exit" }));
    await wait(400);
    if (last?.you.insideBuildingId) {
      ws.send(JSON.stringify({ type: "intent.interact" }));
      await wait(400);
    }
  }
  let me = await goTo(73, 15.2, 22);
  if (!me || Math.hypot(me.x - 73, me.y - 15.2) > 1.8) return;
  if (last?.you.insideBuildingId !== "hospital") {
    ws.send(JSON.stringify({ type: "intent.interact" }));
    await wait(500);
  }
  if (last?.you.insideBuildingId !== "hospital") return;
  me = await goTo(3.5, 85, 12);
  ws.send(JSON.stringify({ type: "intent.interact" }));
  await wait(400);
  ws.send(JSON.stringify({ type: "intent.exit" }));
  await wait(400);
}

console.log("map", last?.mapWidth, "x", last?.mapHeight);
if (!last?.mapWidth || !last?.mapHeight) fail("missing map size in snapshot");

// --- M7 hustle interact: phone booth CD + outdoor fence tip ---
let me = await goTo(28, 22, 22);
if (!me || Math.hypot(me.x - 28, me.y - 22) > 1.5) fail("phone booth path");
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
const phoneAfter = (last?.props || []).find((p) => p.id === "phone1");
if (!phoneAfter) fail("phone1 missing after interact");
if (!(phoneAfter.readyIn > 0)) {
  fail(`expected phone1 readyIn after hustle, got ${phoneAfter.readyIn}`);
}
console.log("hustle phone ok readyIn", phoneAfter.readyIn, "cash", last?.you?.cash);

me = await goTo(36, 20, 22);
if (!me || Math.hypot(me.x - 36, me.y - 20) > 1.8) fail("fence Frankie path");
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(500);
if (!last?.dialogue) fail("expected fence dialogue");
const fenceChoices = last.dialogue.choices || [];
if (!fenceChoices.some((c) => c.id === "fence_ammo" || c.id === "street_tip")) {
  fail("expected fence hustle choices");
}
const repBefore = last.you?.rep ?? 0;
ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "street_tip" }));
await wait(400);
if ((last.you?.rep ?? 0) < repBefore + 1) fail("street tip should grant rep");
console.log("hustle fence tip ok rep", last.you.rep);
ws.send(JSON.stringify({ type: "dialogue.choice", choiceId: "bye" }));
await wait(250);
if (last?.dialogue) {
  // force-close if still open
  ws.send(JSON.stringify({ type: "dialogue.close" }));
  await wait(200);
}

// --- Bar hire ---
// Single click from spawn (~40,30) to bar door — exercises A* around shells
me = await goTo(8.5, 15.2, 30);
console.log("at bar door (direct path)", me?.x?.toFixed(2), me?.y?.toFixed(2));
if (!me || Math.hypot(me.x - 8.5, me.y - 15.2) > 1.5) fail("bar door direct pathing");
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

// AI roles on instance hostiles (M5)
const bayHostiles = (last?.units ?? []).filter(
  (u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive,
);
if (bayHostiles.length < 2) fail(`expected bay hostiles, got ${bayHostiles.length}`);
const withRole = bayHostiles.filter((u) => u.aiRole === "shooter" || u.aiRole === "rusher" || u.aiRole === "coward");
if (withRole.length < bayHostiles.length) {
  fail(`hostiles missing aiRole: ${JSON.stringify(bayHostiles.map((u) => ({ n: u.name, r: u.aiRole })))}`);
}
const roleSet = new Set(withRole.map((u) => u.aiRole));
console.log("bay AI roles", [...roleSet].join(","), "count", withRole.length);

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

// --- M6 outdoor: still_not_guns (crate cr2) ---
await openRitaBoard();
const m6Ids = ["still_not_guns", "parking_tax", "chop_shop_raid", "rail_rats"];
for (const id of m6Ids) {
  if (!last.jobBoard.offers.some((o) => o.id === id)) fail(`missing M6 offer ${id}`);
}
console.log("M6 offers present", m6Ids.join(", "));
cash0 = last.you.cash;
rep0 = last.you.rep;
ws.send(JSON.stringify({ type: "jobBoard.accept", missionId: "still_not_guns" }));
await wait(500);
if (last?.mission?.id !== "still_not_guns") fail("still_not_guns not active");
me = await goTo(58, 50, 28);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(600);
if (last?.mission) fail("still_not_guns should complete");
if (last.you.cash < cash0 + 300) fail(`still_not_guns pay expected +300 (cash ${last.you.cash} vs ${cash0})`);
if (last.you.rep < rep0 + 2) fail("still_not_guns rep");
console.log("still_not_guns outdoor ok cash", last.you.cash);

// --- M6 instance: chop_shop_raid (garage template) ---
await healCrew();
await openRitaBoard();
cash0 = last.you.cash;
rep0 = last.you.rep;
ws.send(JSON.stringify({ type: "jobBoard.accept", missionId: "chop_shop_raid" }));
await wait(600);
if (!String(last?.you.insideBuildingId ?? "").startsWith("mi_")) {
  fail(`chop shop expected mi_ layer, got ${last?.you.insideBuildingId}`);
}
if (last?.mission?.id !== "chop_shop_raid") fail("chop_shop_raid not active");
if (!last.mission.instanced) fail("chop_shop not marked instanced");
const chopHostiles = (last?.units ?? []).filter(
  (u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive,
);
if (chopHostiles.length < 2) fail(`expected chop hostiles >=2, got ${chopHostiles.length}`);
// Boss name should use Chop label
if (!chopHostiles.some((u) => /chop/i.test(u.name ?? ""))) {
  fail(`expected Chop-labeled hostiles, got ${chopHostiles.map((u) => u.name).join(",")}`);
}
// Fire with the whole posse selected (leader + goons) — attack-move helps survive leather hostiles
ws.send(JSON.stringify({ type: "intent.select", unitId: null }));
await wait(100);
for (let i = 0; i < 260; i++) {
  const foe = last?.units.find(
    (u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive,
  );
  if (!foe) break;
  ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
  await wait(70);
  if (last?.mission?.phase === "extract") break;
  if (last?.mission == null && last?.you.respawnIn != null) {
    fail("chop job failed (died) before extract");
  }
}
for (let i = 0; i < 60; i++) {
  if (last?.mission?.phase === "extract") break;
  const foe = last?.units.find((u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive);
  if (foe) ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
  await wait(120);
}
if (last?.mission?.phase !== "extract") {
  fail(`chop expected extract, got ${last?.mission?.phase}`);
}
// Garage template exit ~ (51, 82)
me = await goTo(51.5, 82.5, 16);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(600);
if (last?.mission) fail("chop_shop should clear after extract");
if (last.you.cash < cash0 + 520) fail(`chop pay expected +520 (cash ${last.you.cash} vs ${cash0})`);
if (last.you.rep < rep0 + 5) fail("chop rep");
if (last?.you.insideBuildingId) fail("should be outdoors after chop extract");
console.log("chop_shop_raid instance ok cash", last.you.cash);

// --- M7 instance: cold_storage (coldstore template) ---
await healCrew();
await openRitaBoard();
if (!last.jobBoard.offers.some((o) => o.id === "cold_storage")) fail("no cold_storage offer");
cash0 = last.you.cash;
rep0 = last.you.rep;
ws.send(JSON.stringify({ type: "jobBoard.accept", missionId: "cold_storage" }));
await wait(600);
if (!String(last?.you.insideBuildingId ?? "").startsWith("mi_")) {
  fail(`cold store expected mi_ layer, got ${last?.you.insideBuildingId}`);
}
if (last?.mission?.id !== "cold_storage") fail("cold_storage not active");
if (!last.mission.instanced) fail("cold_storage not marked instanced");
const frostHostiles = (last?.units ?? []).filter(
  (u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive,
);
if (frostHostiles.length < 2) fail(`expected frost hostiles >=2, got ${frostHostiles.length}`);
if (!frostHostiles.some((u) => /frost/i.test(u.name ?? ""))) {
  fail(`expected Frost-labeled hostiles, got ${frostHostiles.map((u) => u.name).join(",")}`);
}
// Select whole posse — threat-3 freezer crew hits hard
ws.send(JSON.stringify({ type: "intent.select", unitId: null }));
await wait(100);
for (let i = 0; i < 280; i++) {
  const foe = last?.units.find(
    (u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive,
  );
  if (!foe) break;
  ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
  await wait(70);
  if (last?.mission?.phase === "extract") break;
  if (last?.mission == null && last?.you.respawnIn != null) {
    fail("cold job failed (died) before extract");
  }
}
for (let i = 0; i < 60; i++) {
  if (last?.mission?.phase === "extract") break;
  const foe = last?.units.find((u) => (u.kind === "ai_boss" || u.kind === "ai_goon") && u.alive);
  if (foe) ws.send(JSON.stringify({ type: "intent.fire", targetId: foe.id }));
  await wait(120);
}
if (last?.mission?.phase !== "extract") {
  fail(`cold expected extract, got ${last?.mission?.phase}`);
}
// Coldstore template exit ~ (87, 82)
me = await goTo(87.5, 82.5, 16);
ws.send(JSON.stringify({ type: "intent.interact" }));
await wait(600);
if (last?.mission) fail("cold_storage should clear after extract");
if (last.you.cash < cash0 + 580) fail(`cold pay expected +580 (cash ${last.you.cash} vs ${cash0})`);
if (last.you.rep < rep0 + 6) fail("cold rep");
if (last?.you.insideBuildingId) fail("should be outdoors after cold extract");
console.log("cold_storage instance ok cash", last.you.cash);

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

// --- M4 parties: invite / accept / presence / leave (same realm) ---
const partyRealm = "smoke-party";
const hostName = "Host" + Math.floor(Math.random() * 999);
const mateName = "Mate" + Math.floor(Math.random() * 999);
const wsHost = new WebSocket("ws://127.0.0.1:3001");
const wsMate = new WebSocket("ws://127.0.0.1:3001");
let lastHost = null;
let lastMate = null;
wsHost.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "snapshot") lastHost = msg.data;
});
wsMate.on("message", (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === "snapshot") lastMate = msg.data;
});
await new Promise((res, rej) => {
  wsHost.on("open", res);
  wsHost.on("error", rej);
});
await new Promise((res, rej) => {
  wsMate.on("open", res);
  wsMate.on("error", rej);
});
wsHost.send(
  JSON.stringify({ type: "auth", name: hostName, protocolVersion: 1, realm: partyRealm }),
);
wsMate.send(
  JSON.stringify({ type: "auth", name: mateName, protocolVersion: 1, realm: partyRealm }),
);
await wait(600);
if (!lastHost?.you || !lastMate?.you) fail("party clients no snapshot");
if (!Array.isArray(lastHost.presence)) fail("expected presence array on snapshot");
if (!lastHost.presence.some((p) => p.name === mateName)) {
  fail("host presence should list mate");
}
if (lastHost.party) fail("host should start solo (party null)");
if (lastMate.partyInvite) fail("mate should not have invite yet");

wsHost.send(JSON.stringify({ type: "party.invite", targetName: mateName }));
await wait(400);
if (!lastMate?.partyInvite || lastMate.partyInvite.fromName !== hostName) {
  fail(`expected party invite for mate from ${hostName}`);
}
wsMate.send(JSON.stringify({ type: "party.accept" }));
await wait(500);
if (!lastHost?.party || lastHost.party.members.length !== 2) {
  fail(`host party size expected 2, got ${lastHost?.party?.members?.length}`);
}
if (!lastMate?.party || lastMate.party.members.length !== 2) {
  fail(`mate party size expected 2, got ${lastMate?.party?.members?.length}`);
}
if (!lastHost.party.isLeader) fail("host should be party leader");
if (lastMate.party.isLeader) fail("mate should not be leader");

// Party chat
wsHost.send(JSON.stringify({ type: "chat", text: "/p smoke party check", channel: "party" }));
await wait(300);

// Shared outdoor job attach
// Skip job board UI: mate must not already be on mission (fresh spawn)
// Host can't open Rita without walking — skip co-op mission in smoke; invite/leave is enough
wsMate.send(JSON.stringify({ type: "party.leave" }));
await wait(400);
if (lastMate?.party) fail("mate should be solo after leave");
if (lastHost?.party) fail("host party should dissolve after mate leaves");
console.log("party invite/accept/leave ok", hostName, mateName);

console.log("SMOKE_OK");
ws2.close();
wsIso.close();
wsBad.close();
wsHost.close();
wsMate.close();
process.exit(0);
