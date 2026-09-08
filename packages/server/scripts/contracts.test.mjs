/** Real GameWorld contract progression; direct fixtures place crew and resolve lethal hits deterministically. */
import assert from "node:assert/strict";
import test from "node:test";
import { GameWorld } from "../src/game.ts";
import { TICK_HZ, listMissionOffers } from "@loose-cannon/shared";

function player(world = new GameWorld("contract-test"), name = "Contract Boss") {
  const messages = [];
  const joined = world.join(name, { characterId: null, send: (m) => messages.push(m) });
  assert.equal(joined.ok, true);
  const posse = world.posses.get(joined.posseId);
  posse.tutorialStep = null;
  const session = world.sessions.get(joined.characterId);
  return { world, posse, session, messages, send: (m) => world.handle(joined.characterId, m) };
}

function accept(p, missionId) {
  p.posse.jobBoard = { npcId: "rita", npcName: "Rita", title: "Jobs", offers: listMissionOffers({ completedIds: p.posse.completedMissions }) };
  p.send({ type: "jobBoard.accept", missionId, rewardCash: 999999, bonusCash: 999999, rank: "S" });
}

function crackStash(p) {
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = 44;
  lead.y = 28;
  p.send({ type: "intent.interact" });
}

function clearRaid(p) {
  const enemy = p.world.posses.get(p.posse.mission.enemyPosseId);
  for (const id of [...enemy.memberIds]) {
    const unit = p.world.units.get(id);
    if (unit?.alive) p.world.killUnit(unit, p.posse.id, p.session);
  }
}

function extractRaid(p) {
  const template = p.world.map.buildings.find((b) => b.id === p.posse.mission.templateBuildingId);
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = template.exitX + 0.5;
  lead.y = template.exitY + 0.5;
  p.send({ type: "intent.exit" });
}

test("server awards clean, quick payday and ignores forged client rewards", () => {
  const p = player();
  accept(p, "smash_stash");
  p.world.tick += 30 * TICK_HZ;
  const startCash = p.posse.cash;
  crackStash(p);
  assert.equal(p.posse.mission, null);
  const result = p.world.buildSnapshot(p.session).missionDebrief;
  assert.equal(result.rank, "S");
  assert.equal(result.elapsedSeconds, 30);
  assert.equal(result.baseCash, 280);
  assert.equal(result.bonusCash, 112);
  assert.equal(result.totalCash, 392);
  assert.equal(p.posse.rep, 2);
  assert.equal(p.posse.crateMarks, 1, "contract crates also feed the Pallet Pete fence loop");
  assert.ok(p.posse.cash >= startCash + 392 && p.posse.cash <= startCash + 431, "payday plus real crate loose change");
  const paid = p.posse.cash;
  p.world.tryCompleteMission(p.session, p.posse);
  assert.equal(p.posse.cash, paid, "duplicate completion cannot pay twice");
  accept(p, "smash_stash");
  assert.equal(p.posse.mission, null, "outdoor contract stays one-time");
});

test("optional deadline expires without failing the job or withholding base cash", () => {
  const p = player();
  accept(p, "smash_stash");
  p.world.tick += 151 * TICK_HZ;
  assert.equal(p.world.buildSnapshot(p.session).mission.bonuses[0].eligible, false);
  assert.equal(p.posse.mission.phase, "active");
  crackStash(p);
  assert.equal(p.posse.missionDebrief.rank, "A");
  assert.equal(p.posse.missionDebrief.totalCash, 336);
});

test("a downed boss permanently loses clean bonus even after healing", () => {
  const p = player();
  accept(p, "smash_stash");
  const boss = p.world.units.get(p.posse.leaderId);
  assert.equal(p.world.tryIncapacitateBoss(boss, "ai_dogs"), true);
  boss.incapacitated = false;
  boss.health = boss.stats.maxHealth;
  p.world.tick += 151 * TICK_HZ;
  crackStash(p);
  assert.equal(p.posse.missionDebrief.rank, "B");
  assert.equal(p.posse.missionDebrief.bonusCash, 0);
  assert.equal(p.posse.missionDebrief.totalCash, 280);
});

test("crew casualty survives corpse cleanup in bonus evaluation", () => {
  const p = player();
  accept(p, "smash_stash");
  const goonId = p.posse.memberIds.find((id) => id !== p.posse.leaderId);
  p.world.killUnit(p.world.units.get(goonId), "ai_dogs");
  crackStash(p);
  assert.equal(p.posse.missionDebrief.rank, "A");
  assert.equal(p.posse.missionDebrief.bonuses.find((b) => b.id === "clean").eligible, false);
});

test("private raids require clear, replay at reduced cash, preserve best rank and never farm rep", () => {
  const p = player();
  accept(p, "warehouse_raid");
  const firstLayer = p.posse.insideBuildingId;
  p.send({ type: "intent.exit" });
  assert.ok(p.posse.mission, "exit sealed while enemies live");
  clearRaid(p);
  extractRaid(p);
  assert.equal(p.posse.mission, null);
  assert.equal(p.posse.missionDebrief.totalCash, 630);
  assert.equal(p.posse.rep, 4);
  const offer = listMissionOffers({ completedIds: p.posse.completedMissions, bestRanks: p.posse.bestMissionRanks }).find((m) => m.id === "warehouse_raid");
  assert.equal(offer.replay, true);
  assert.equal(offer.rewardCash, 270);
  assert.equal(offer.rewardRep, 0);
  assert.equal(offer.bestRank, "S");
  accept(p, "warehouse_raid");
  assert.notEqual(p.posse.insideBuildingId, firstLayer);
  assert.equal(p.posse.mission.replay, true);
  p.world.tick += 181 * TICK_HZ;
  clearRaid(p);
  extractRaid(p);
  assert.equal(p.posse.missionDebrief.totalCash, 324);
  assert.equal(p.posse.missionDebrief.rank, "A");
  assert.equal(p.posse.bestMissionRanks.warehouse_raid, "S");
  assert.equal(p.posse.rep, 4);
});

test("abandoning awards no money, record or completed flag", () => {
  const p = player();
  const cash = p.posse.cash;
  accept(p, "warehouse_raid");
  p.send({ type: "mission.abandon" });
  assert.equal(p.posse.cash, cash);
  assert.equal(p.posse.missionDebrief, undefined);
  assert.deepEqual(p.posse.completedMissions, []);
  assert.equal(p.posse.insideBuildingId, null);
});

test("party members get their own replay terms and host rerun cannot destroy a partner's old instance", () => {
  const a = player();
  const b = player(a.world, "Contract Partner");
  b.posse.completedMissions.push("warehouse_raid");
  a.send({ type: "party.invite", targetName: "Contract Partner" });
  b.send({ type: "party.accept" });
  accept(a, "warehouse_raid");
  assert.equal(a.posse.insideBuildingId, b.posse.insideBuildingId);
  assert.equal(a.posse.mission.replay, false);
  assert.equal(b.posse.mission.replay, true);
  const oldLayer = b.posse.insideBuildingId;
  const oldEnemies = b.posse.mission.enemyPosseId;
  clearRaid(a);
  extractRaid(a);
  accept(a, "warehouse_raid");
  assert.notEqual(a.posse.insideBuildingId, oldLayer);
  assert.equal(b.posse.insideBuildingId, oldLayer);
  assert.ok(a.world.posses.has(oldEnemies), "old shared instance survives new host run");
  extractRaid(b);
  assert.equal(b.posse.missionDebrief.totalCash, 378);
  assert.equal(b.posse.rep, 0);
  assert.ok(a.posse.mission, "partner extraction cannot complete host's new run");
});

test("invalid catalog keys and absent board cannot accept a contract", () => {
  const p = player();
  p.send({ type: "jobBoard.accept", missionId: "warehouse_raid" });
  assert.equal(p.posse.mission, null);
  for (const id of ["toString", "__proto__", "missing"]) {
    assert.doesNotThrow(() => accept(p, id));
    assert.equal(p.posse.mission, null);
  }
});

test("direct exit intent cannot skip walking to the extraction door", () => {
  const p = player();
  accept(p, "warehouse_raid");
  clearRaid(p);
  const lead = p.world.units.get(p.posse.leaderId);
  const template = p.world.map.buildings.find((b) => b.id === p.posse.mission.templateBuildingId);
  lead.x = template.exitX + 5;
  lead.y = template.exitY + 5;
  const cash = p.posse.cash;
  p.send({ type: "intent.exit" });
  assert.ok(p.posse.mission);
  assert.equal(p.posse.cash, cash);
  extractRaid(p);
  assert.equal(p.posse.mission, null);
  assert.ok(p.posse.cash > cash);
});

test("party acceptance cannot replay another member's retired outdoor job", () => {
  const a = player();
  const b = player(a.world, "Contract Partner");
  b.posse.completedMissions.push("smash_stash");
  a.send({ type: "party.invite", targetName: "Contract Partner" });
  b.send({ type: "party.accept" });
  accept(a, "smash_stash");
  assert.ok(a.posse.mission);
  assert.equal(b.posse.mission, null);
  const cash = b.posse.cash;
  crackStash(a);
  assert.equal(b.posse.cash, cash);
  assert.equal(b.posse.rep, 0);
});

test("quick bonus uses the server tick deadline boundary, without a client clock", () => {
  for (const [ticks, expectedRank] of [[150 * TICK_HZ, "S"], [150 * TICK_HZ + 1, "A"]]) {
    const p = player();
    accept(p, "smash_stash");
    p.world.tick += ticks;
    crackStash(p);
    assert.equal(p.posse.missionDebrief.rank, expectedRank);
  }
});

test("E selects the nearby mission crate instead of a farther hydrant earlier in the map catalog", () => {
  const p = player();
  accept(p, "still_not_guns");
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = 58;
  lead.y = 50;
  p.send({ type: "intent.interact" });
  assert.equal(p.posse.mission, null);
  assert.equal(p.posse.missionDebrief.missionId, "still_not_guns");
  assert.equal(p.posse.crateMarks, 1);
  assert.equal(p.world.propReadyAt.has("h2"), false, "nearby hydrant is not accidentally hustled");
});

test("bodyguards protect a downed boss from further shots until the last guard falls", () => {
  const p = player();
  accept(p, "warehouse_raid");
  const boss = p.world.units.get(p.posse.leaderId);
  const enemy = p.world.posses.get(p.posse.mission.enemyPosseId);
  const shooter = p.world.units.get(enemy.leaderId);
  assert.equal(p.world.tryIncapacitateBoss(boss, enemy.id), true);
  const hp = boss.health;
  for (let i = 0; i < 20; i++) {
    shooter.fireCd = 0;
    p.world.resolveShot(shooter, boss);
  }
  assert.equal(boss.alive, true);
  assert.equal(boss.health, hp, "additional bullets cannot execute protected downed boss");
  assert.notEqual(p.world.pickBestFireTarget(shooter, p.posse.memberIds)?.id, boss.id);
  for (const id of [...p.posse.memberIds]) {
    if (id !== boss.id) p.world.killUnit(p.world.units.get(id), enemy.id);
  }
  assert.equal(boss.alive, false, "last bodyguard death still finishes the full wipe");
});

test("attack-move and AI command switch to standing guards after their boss is downed", () => {
  const p = player();
  accept(p, "warehouse_raid");
  const enemy = p.world.posses.get(p.posse.mission.enemyPosseId);
  const boss = p.world.units.get(enemy.leaderId);
  assert.equal(p.world.tryIncapacitateBoss(boss, p.posse.id), true);
  const shooter = p.world.units.get(p.posse.leaderId);
  const hp = boss.health;
  p.world.resolveShot(shooter, boss);
  assert.equal(boss.health, hp, "same downed protection applies to AI bosses");
  assert.notEqual(p.world.aiCommander(enemy).id, boss.id);
  // Inspect the targeting decision before damage: a lucky critical can otherwise
  // kill the new target in this same update and correctly clear attackTargetId.
  for (const id of p.posse.memberIds) p.world.units.get(id).fireCd = 1;
  p.posse.attackTargetId = boss.id;
  p.world.updateAttackOrders();
  const next = p.world.units.get(p.posse.attackTargetId);
  assert.ok(next && !next.incapacitated && next.posseId === enemy.id, "attack order must switch to a standing member of the same gang");
});

test("boss contracts require the marked boss, never an unrelated bodyguard", () => {
  const p = player();
  accept(p, "collect_debt");
  const gang = p.world.posses.get("ai_dogs");
  const guard = p.world.units.get(gang.memberIds.find((id) => id !== gang.leaderId));
  p.world.killUnit(guard, p.posse.id);
  assert.ok(p.posse.mission, "bodyguard kill cannot claim boss payday");
  assert.equal(p.posse.mission.targetUnitId, gang.leaderId);
  assert.equal(p.posse.rep, 0);
  assert.equal(p.world.units.get(gang.leaderId).alive, true);
  p.world.killUnit(p.world.units.get(gang.leaderId), p.posse.id);
  assert.equal(p.posse.mission, null);
  assert.equal(p.posse.missionDebrief.missionId, "collect_debt");
  assert.ok(p.posse.rep >= 5);
});

test("E at the taxi jacks it instead of opening the nearby fence NPC", () => {
  const p = player();
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = 38;
  lead.y = 20;
  p.send({ type: "intent.interact" });
  assert.equal(p.posse.hotWheels, 1);
  assert.equal(p.posse.dialogue, null);
});

test("an explicitly clicked NPC wins over a nearer prop, and E at the NPC still talks", () => {
  const p = player();
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = 38;
  lead.y = 20;
  p.send({ type: "intent.interact", targetUnitId: "npc_fence" });
  assert.equal(p.posse.hotWheels, 0);
  assert.equal(p.posse.dialogue?.npcId, "npc_fence");
  p.send({ type: "dialogue.close" });
  lead.x = 36;
  p.send({ type: "intent.interact" });
  assert.equal(p.posse.dialogue?.npcId, "npc_fence");
});

test("Tony remains interactable where his talk radius overlaps the garage exit", () => {
  const p = player();
  p.world.enterBuilding(p.posse, "garage");
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = 51;
  lead.y = 84.4;
  p.posse.hotWheels = 1;
  p.send({ type: "intent.interact" });
  assert.equal(p.posse.insideBuildingId, "garage");
  assert.ok(p.posse.dialogue?.choices.some((c) => c.id === "chop_car"));
  const cash = p.posse.cash;
  p.send({ type: "dialogue.choice", choiceId: "chop_car" });
  assert.equal(p.posse.hotWheels, 0);
  assert.ok(p.posse.cash > cash, "jacked title sells through Tony's real service");
  p.send({ type: "intent.exit" });
  assert.equal(p.posse.insideBuildingId, null, "explicit EXIT cannot be stolen by Tony");
});

test("E still leaves when the door is closer, while an explicit NPC click talks from the mat", () => {
  const p = player();
  p.world.enterBuilding(p.posse, "garage");
  const lead = p.world.units.get(p.posse.leaderId);
  lead.x = 51.5;
  lead.y = 83.4;
  p.send({ type: "intent.interact", targetUnitId: "npc_mech" });
  assert.equal(p.posse.dialogue?.npcId, "npc_mech");
  assert.equal(p.posse.insideBuildingId, "garage");
  p.send({ type: "dialogue.close" });
  p.send({ type: "intent.interact" });
  assert.equal(p.posse.insideBuildingId, null);
});
