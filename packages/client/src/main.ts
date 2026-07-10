import {
  ARMORS,
  heatBand,
  INTERACT_RANGE,
  SHOP_ARMOR_ORDER,
  SHOP_UPGRADE_ORDER,
  SHOP_WEAPON_ORDER,
  shopPrice,
  UPGRADES,
  WEAPONS,
  type ArmorId,
  type CombatFxEvent,
  type ServerMessage,
  type UnitPublic,
  type UpgradeId,
  type WeaponId,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { sfx } from "./audio.js";
import { portraitDataUrl, statBonus, upgradeTier } from "./avatar.js";
import {
  ARMOR_BAR_ORDER,
  armorIconDataUrl,
  WEAPON_BAR_ORDER,
  weaponIconDataUrl,
} from "./icons.js";
import { GameSocket } from "./net.js";
import { WorldView } from "./worldView.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const loginEl = $("login");
const gameEl = $("game");
const nameInput = $("nameInput") as HTMLInputElement;
const joinBtn = $("joinBtn");
const loginError = $("loginError");
const canvas = $("canvas") as HTMLCanvasElement;
const posseList = $("posseList");
const cashRep = $("cashRep");
const gearEditor = $("gearEditor");
const statsView = $("statsView");
const weaponBar = $("weaponBar");
const armorBar = $("armorBar");
const weaponDetail = $("weaponDetail");
const armorDetail = $("armorDetail");
const openFullEditor = $("openFullEditor");
const crewEditorModal = $("crewEditorModal");
const crewEditorClose = $("crewEditorClose");
const crewEditorRoster = $("crewEditorRoster");
const crewEditorProfile = $("crewEditorProfile");
const crewWeaponBar = $("crewWeaponBar");
const crewArmorBar = $("crewArmorBar");
const crewWeaponDetail = $("crewWeaponDetail");
const crewArmorDetail = $("crewArmorDetail");
const crewEditorStats = $("crewEditorStats");
const eventLog = $("eventLog");
const chatLog = $("chatLog");
const chatForm = $("chatForm") as HTMLFormElement;
const chatInput = $("chatInput") as HTMLInputElement;
const objective = $("objective");
const actionBanner = $("actionBanner");
const actionStatus = $("actionStatus");
const actionDetail = $("actionDetail");
const dialogueModal = $("dialogueModal");
const dlgName = $("dlgName");
const dlgText = $("dlgText");
const dlgChoices = $("dlgChoices");
const dlgClose = $("dlgClose");
const dlgPortraitWrap = $("dlgPortraitWrap");
const dlgPortrait = $("dlgPortrait") as HTMLImageElement;

/** Static NPC art for dialogue (public/art). */
const DIALOGUE_PORTRAITS: Record<string, string> = {
  npc_bartender: "/art/bartender-male.jpg",
  npc_club: "/art/bartender-female.jpg",
};

function dialoguePortraitUrl(npcId: string, npcName: string): string | null {
  if (DIALOGUE_PORTRAITS[npcId]) return DIALOGUE_PORTRAITS[npcId];
  const n = npcName.toLowerCase();
  if (n.includes("vince") || n.includes("barman")) return "/art/bartender-male.jpg";
  if (n.includes("venus") || n.includes("static")) return "/art/bartender-female.jpg";
  return null;
}
const shopModal = $("shopModal");
const shopTitle = $("shopTitle");
const shopUnitName = $("shopUnitName");
const shopCash = $("shopCash");
const shopWeapons = $("shopWeapons");
const shopArmor = $("shopArmor");
const shopUpgrades = $("shopUpgrades");
const shopBuyerRow = $("shopBuyerRow");
const shopClose = $("shopClose");
const jobBoardModal = $("jobBoardModal");
const jobBoardTitle = $("jobBoardTitle");
const jobBoardOffers = $("jobBoardOffers");
const jobBoardClose = $("jobBoardClose");
const missionHud = $("missionHud");
const missionHudTitle = $("missionHudTitle");
const missionHudObjectives = $("missionHudObjectives");
const missionHudProgress = $("missionHudProgress");
const missionHudBar = $("missionHudBar");
const missionAbandon = $("missionAbandon");
const tutorialHud = $("tutorialHud");
const tutorialStepNum = $("tutorialStepNum");
const tutorialTitle = $("tutorialTitle");
const tutorialBody = $("tutorialBody");
const tutorialHint = $("tutorialHint");
const tutorialSkip = $("tutorialSkip");
const minimapBtn = $("minimap");
const districtMapModal = $("districtMapModal");
const districtMapClose = $("districtMapClose");
const districtMapHere = $("districtMapHere");
const districtMapList = $("districtMapList");
const districtMapCanvas = $("districtMapCanvas") as HTMLCanvasElement;
const memorialModal = $("memorialModal");
const memorialClose = $("memorialClose");
const memorialCount = $("memorialCount");
const memorialList = $("memorialList");
const respawnOverlay = $("respawnOverlay");
const respawnCount = $("respawnCount");
const notifyToasts = $("notifyToasts");
const mobileControls = document.getElementById("mobileControls") as HTMLElement | null;
const mobInteract = document.getElementById("mobInteract") as HTMLButtonElement | null;
const mobAttack = document.getElementById("mobAttack") as HTMLButtonElement | null;
const mobStop = document.getElementById("mobStop") as HTMLButtonElement | null;
const mobZoomIn = document.getElementById("mobZoomIn") as HTMLButtonElement | null;
const mobZoomOut = document.getElementById("mobZoomOut") as HTMLButtonElement | null;
const possePanel = document.getElementById("possePanel") as HTMLElement | null;
const possePanelToggle = document.getElementById("possePanelToggle") as HTMLButtonElement | null;
const chatBox = document.getElementById("chatBox") as HTMLElement | null;
const chatToggle = document.getElementById("chatToggle") as HTMLButtonElement | null;
const mobChat = document.getElementById("mobChat") as HTMLButtonElement | null;

let snap: WorldSnapshot | null = null;
let myName = "";
let view: WorldView;
let socket: GameSocket;
let chatFocused = false;

/** Keyboard movement state */
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};
/** Throttle continuous steer packets only — first press is always immediate */
let lastKeyMoveSent = 0;
let keyMoving = false;
const DIR_RESEND_MS = 50;

/** After click-to-interact: walk here then send intent.interact */
let pendingInteract: { x: number; y: number } | null = null;

/** Mobile: next map tap is attack-move instead of walk */
let mobileAttackMode = false;
let touchStart: { x: number; y: number; t: number; id: number } | null = null;
const LONG_PRESS_MS = 420;
const TAP_SLOP_PX = 18;

function isCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse), (max-width: 900px)").matches;
}

function isMobileLayout(): boolean {
  return window.matchMedia("(max-width: 900px)").matches;
}

function setChatCollapsed(collapsed: boolean): void {
  if (!chatBox) return;
  chatBox.classList.toggle("collapsed", collapsed);
  if (chatToggle) {
    chatToggle.textContent = collapsed ? "Show" : "Hide";
    chatToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  if (mobChat) {
    mobChat.classList.toggle("active", !collapsed);
    const lab = mobChat.querySelector(".mob-lab");
    if (lab) lab.textContent = collapsed ? "Chat" : "Hide";
  }
}

function toggleChat(): void {
  if (!chatBox) return;
  setChatCollapsed(!chatBox.classList.contains("collapsed"));
  if (!chatBox.classList.contains("collapsed")) {
    // focus input when opening
    window.setTimeout(() => chatInput.focus(), 50);
  } else {
    chatInput.blur();
  }
}

function setMobileAttackMode(on: boolean): void {
  mobileAttackMode = on;
  if (mobAttack) {
    mobAttack.setAttribute("aria-pressed", on ? "true" : "false");
    mobAttack.classList.toggle("active", on);
  }
}

function fireAttackAtClient(clientX: number, clientY: number): void {
  if (!snap || !socket || !view) return;
  if (snap.you.respawnIn != null && snap.you.respawnIn > 0) return;
  if (snap.dialogue || snap.shop || snap.jobBoard) return;
  pendingInteract = null;
  const w = view.screenToWorld(clientX, clientY);
  let best: { id: string; d: number } | null = null;
  for (const u of snap.units) {
    if (!u.alive || u.posseId === snap.you.posseId) continue;
    const d = Math.hypot(u.x - w.x, u.y - w.y);
    if (d < 3.2 && (!best || d < best.d)) best = { id: u.id, d };
  }
  const s = snap;
  const shooter =
    s.units.find((u) => u.id === s.you.selectedUnitId) ??
    s.units.find((u) => u.posseId === s.you.posseId && u.alive);
  const from = view.leaderWorldPos();
  const weapon = (shooter?.weapon ?? "pistol") as WeaponId;
  if (best) {
    const tgt = s.units.find((u) => u.id === best!.id);
    if (from && tgt) {
      view.playLocalShot(from.x, from.y, tgt.x, tgt.y, weapon);
      weaponFireSfx(weapon);
    }
    socket.send({ type: "intent.fire", targetId: best.id });
  } else {
    if (from) {
      view.playLocalShot(from.x, from.y, w.x, w.y, weapon);
      weaponFireSfx(weapon);
    }
    socket.send({ type: "intent.fire", x: w.x, y: w.y });
  }
  setMobileAttackMode(false);
}

function handlePrimaryPointer(clientX: number, clientY: number, asAttack: boolean): void {
  const s = snap;
  if (!s || !socket || !view) return;
  if (s.you.respawnIn != null && s.you.respawnIn > 0) return;
  if (s.dialogue || s.shop) return;

  if (asAttack || mobileAttackMode) {
    fireAttackAtClient(clientX, clientY);
    return;
  }

  const unitId = view.pickUnit(clientX, clientY);
  if (unitId) {
    const u = s.units.find((x) => x.id === unitId);
    if (u && u.posseId === s.you.posseId) {
      pendingInteract = null;
      socket.send({ type: "intent.select", unitId });
      return;
    }
    if (u && u.kind === "npc") {
      clickInteractAt(u.x, u.y);
      return;
    }
    if (u && u.posseId !== s.you.posseId) {
      // Tap enemy on mobile = attack them
      if (isCoarsePointer()) {
        fireAttackAtClient(clientX, clientY);
      }
      return;
    }
  }

  const building = view.pickBuilding(clientX, clientY);
  if (building) {
    if (s.you.insideBuildingId) {
      const ex = building.exitX ?? building.doorX;
      const ey = building.exitY ?? building.doorY;
      clickInteractAt(ex + 0.5, ey + 0.5);
    } else {
      clickInteractAt(building.doorX + 0.5, building.doorY + 0.5);
    }
    return;
  }

  const prop = view.pickProp(clientX, clientY);
  if (prop) {
    clickInteractAt(prop.x, prop.y);
    return;
  }

  pendingInteract = null;
  keys.up = keys.down = keys.left = keys.right = false;
  if (keyMoving) {
    keyMoving = false;
    socket.send({ type: "intent.dir", dx: 0, dy: 0 });
  }
  const w = view.screenToWorld(clientX, clientY);
  view.predictClickMove(w.x, w.y);
  socket.send({ type: "intent.move", x: w.x, y: w.y });
}

const EVENT_LINE_FADE_MS = 6500;
const EVENT_PANEL_IDLE_MS = 4000;
let eventPanelFadeTimer: number | null = null;

function bumpEventLogVisible(): void {
  eventLog.classList.add("visible");
  eventLog.classList.remove("faded");
  if (eventPanelFadeTimer != null) window.clearTimeout(eventPanelFadeTimer);
  eventPanelFadeTimer = window.setTimeout(() => {
    if (!eventLog.matches(":hover")) {
      eventLog.classList.add("faded");
      eventLog.classList.remove("visible");
    }
  }, EVENT_PANEL_IDLE_MS);
}

function pushEvent(text: string): void {
  const d = document.createElement("div");
  d.textContent = text;
  d.className = "event-line";
  eventLog.appendChild(d);
  while (eventLog.children.length > 8) eventLog.removeChild(eventLog.firstChild!);
  bumpEventLogVisible();
  window.setTimeout(() => {
    d.classList.add("fade-out");
    window.setTimeout(() => d.remove(), 600);
  }, EVENT_LINE_FADE_MS);

  // Heuristic SFX from non-combat log lines (combat audio comes from fx events)
  const t = text.toLowerCase();
  if (t.includes("bought") || t.includes("equip")) sfx.play("buy");
  else if (t.includes("dumpster") || t.includes("crate")) sfx.play("dumpster");
  else if (t.includes("shook") || t.includes("liberated") || t.includes("$")) sfx.play("cash");
  else if (t.includes("entered") || t.includes("left ")) sfx.play("door");
  else if (t.includes("stitch") || t.includes("coach") || t.includes("blessed")) sfx.play("ui");
  // hit/miss/death handled by combat FX to avoid double-playing with VFX path
}

function showNotify(msg: Extract<ServerMessage, { type: "notify" }>): void {
  sfx.unlock();
  const el = document.createElement("div");
  el.className = "notify-toast";

  if (msg.kind === "loot") {
    const hasUpgrade = msg.upgrades.some((u) => u.upgrade);
    el.classList.add(hasUpgrade ? "loot-upgrade" : "loot");
    if (hasUpgrade) sfx.play("lootFanfare", { force: true });
    else sfx.play("cash", { force: true });
    const upgradeHtml = msg.upgrades
      .filter((u) => u.upgrade)
      .map(
        (u) =>
          `<div class="nt-upgrade"><span class="tag">NEW BEST</span><span class="name">${escapeHtml(u.name)}</span></div>`,
      )
      .join("");
    const other =
      msg.otherItems.length > 0
        ? `<p class="nt-other">Also looted: ${msg.otherItems.map(escapeHtml).join(", ")}</p>`
        : "";
    el.innerHTML = `
      <div class="nt-kicker">${hasUpgrade ? "CREW UPGRADE" : "SPOILS OF WAR"}</div>
      <div class="nt-title">${escapeHtml(msg.title)}</div>
      <p class="nt-sub">${escapeHtml(msg.subtitle ?? `Wiped ${msg.victimName}`)}</p>
      ${msg.cash > 0 ? `<span class="nt-cash">+$${msg.cash}</span>` : ""}
      ${upgradeHtml ? `<div class="nt-upgrades">${upgradeHtml}</div>` : ""}
      ${other}
    `;
  } else if (msg.kind === "killed") {
    el.classList.add("killed");
    sfx.play("playerDeath", { force: true });
    el.innerHTML = `
      <div class="nt-kicker">WIPED</div>
      <div class="nt-title">${escapeHtml(msg.title)}</div>
      <p class="nt-sub">${escapeHtml(msg.body)}</p>
    `;
  } else if (msg.kind === "downed") {
    el.classList.add("downed");
    sfx.play("hurt", { force: true });
    el.innerHTML = `
      <div class="nt-kicker">CRITICAL</div>
      <div class="nt-title">${escapeHtml(msg.title)}</div>
      <p class="nt-sub">${escapeHtml(msg.body)}</p>
    `;
  } else if (msg.kind === "mission") {
    el.classList.add("mission");
    sfx.play("cash", { force: true });
    const pay =
      msg.cash != null || msg.rep != null
        ? `<span class="nt-cash">${msg.cash != null ? `$${msg.cash}` : ""}${
            msg.cash != null && msg.rep != null ? " · " : ""
          }${msg.rep != null ? `+${msg.rep} rep` : ""}</span>`
        : "";
    el.innerHTML = `
      <div class="nt-kicker">CONTRACT</div>
      <div class="nt-title">${escapeHtml(msg.title)}</div>
      <p class="nt-sub">${escapeHtml(msg.body)}</p>
      ${pay}
    `;
  }

  notifyToasts.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
  while (notifyToasts.children.length > 4) notifyToasts.firstChild?.remove();
}

function pushChat(from: string, text: string, system?: boolean): void {
  const d = document.createElement("div");
  if (system) {
    d.className = "sys";
    d.textContent = text;
  } else {
    d.innerHTML = `<span class="${from === myName ? "me" : ""}">${escapeHtml(from)}:</span> ${escapeHtml(text)}`;
  }
  chatLog.appendChild(d);
  chatLog.scrollTop = chatLog.scrollHeight;
  while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild!);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isBossUnit(u: UnitPublic): boolean {
  return !!(u.isPlayerLeader || u.kind === "player" || u.kind === "ai_boss");
}

function myUnits(): UnitPublic[] {
  if (!snap) return [];
  // Only living posse members (dead goons are removed server-side; leader may show while respawning)
  // Boss is always slot #1
  return snap.units
    .filter(
      (u) =>
        u.posseId === snap!.you.posseId &&
        (u.alive || u.isPlayerLeader || u.kind === "player"),
    )
    .sort((a, b) => {
      const ab = isBossUnit(a) ? 0 : 1;
      const bb = isBossUnit(b) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return a.name.localeCompare(b.name);
    });
}

function selectedUnit(): UnitPublic | undefined {
  if (!snap) return undefined;
  return myUnits().find((u) => u.id === snap!.you.selectedUnitId) ?? myUnits()[0];
}

function tierLabel(tier: number): string {
  if (tier <= 0) return "Street";
  if (tier === 1) return "Hardened";
  if (tier === 2) return "Trained";
  if (tier === 3) return "Veteran";
  if (tier === 4) return "Elite";
  return "Legend";
}

function tierStars(tier: number): string {
  if (tier <= 0) return "○ ○ ○";
  return "★".repeat(tier) + "☆".repeat(Math.max(0, 5 - tier));
}

function formatBonus(n: number): string {
  if (n > 0) return `<span class="bonus">+${n}</span>`;
  if (n < 0) return `<span class="malus">${n}</span>`;
  return `<span class="flat">·</span>`;
}

function miniStat(label: string, value: number, baseline = 5): string {
  const b = statBonus(value, baseline);
  const cls = b > 0 ? "up" : b < 0 ? "down" : "";
  return `<div class="mini-stat ${cls}" title="${label} ${value} (${b >= 0 ? "+" : ""}${b} vs baseline)"><span class="k">${label}</span><span class="v">${value}</span>${b > 0 ? `<span class="pip">▲${b}</span>` : ""}</div>`;
}

let lastPosseKey = "";

function renderPosse(): void {
  if (!snap) return;
  const h = snap.you.heat ?? 0;
  const band = heatBand(h);
  cashRep.innerHTML = `<span class="cash">$${snap.you.cash}</span> <span class="rep">Rep ${snap.you.rep}</span> <span class="heat heat-${band}" title="Street heat — cool off at the bar">Heat ${h}</span>`;
  const units = myUnits();
  const key = units
    .map(
      (u) =>
        `${u.id}:${u.health}:${u.weapon}:${u.armor}:${u.alive}:${u.incapacitated ? 1 : 0}:${u.stats.aim},${u.stats.guts},${u.stats.muscle},${u.stats.speed},${u.stats.maxHealth}`,
    )
    .join("|") + `|sel:${snap.you.selectedUnitId}`;
  if (key === lastPosseKey) {
    renderGear();
    return;
  }
  lastPosseKey = key;

  posseList.innerHTML = "";
  units.forEach((u, i) => {
    const tier = upgradeTier(u.stats);
    const boss = isBossUnit(u);
    const portrait = portraitDataUrl(u.id + u.name, {
      leader: boss,
      dead: !u.alive,
      upgradeTier: tier,
      female: u.gender === "female",
    });
    const card = document.createElement("div");
    card.className =
      "posse-card" +
      (u.id === snap!.you.selectedUnitId ? " selected" : "") +
      (tier > 0 ? " upgraded" : "") +
      (!u.alive ? " dead" : "") +
      (u.incapacitated ? " incapacitated" : "");
    card.innerHTML = `
      <div class="card-top">
        <div class="portrait-wrap tier-${tier}">
          <img class="portrait" src="${portrait}" alt="" width="48" height="48" draggable="false" />
          <span class="slot-num">${i + 1}</span>
        </div>
        <div class="card-main">
          <div class="name-row">
            <span class="name">${escapeHtml(u.name)}</span>
            ${boss ? '<span class="badge boss">BOSS</span>' : ""}
            ${u.incapacitated ? '<span class="badge downed">DOWNED</span>' : ""}
            ${tier > 0 ? `<span class="badge up-tier t${tier}">${tierLabel(tier)}</span>` : '<span class="badge street">Street</span>'}
          </div>
          <div class="stars" title="Upgrade tier">${tierStars(tier)}</div>
          <div class="meta gear-line">
            <span class="wep">🔫 ${escapeHtml(WEAPONS[u.weapon].name)}</span>
            <span class="arm">🛡 ${escapeHtml(ARMORS[u.armor].name)}</span>
          </div>
          ${!u.alive ? '<div class="status-dead">RESPAWNING…</div>' : ""}
          ${u.incapacitated && u.alive ? '<div class="status-dead">CAN\'T FIGHT — covered by crew</div>' : ""}
        </div>
      </div>
      <div class="mini-stats">
        ${miniStat("AIM", u.stats.aim)}
        ${miniStat("GUT", u.stats.guts)}
        ${miniStat("MUS", u.stats.muscle)}
        ${miniStat("SPD", u.stats.speed)}
      </div>
      <div class="hp" title="HP ${Math.round(u.health)} / ${u.maxHealth}">
        <span style="width:${Math.max(0, (u.health / u.maxHealth) * 100)}%"></span>
      </div>
      <div class="hp-label">${Math.round(u.health)}/${u.maxHealth} HP</div>
    `;
    card.addEventListener("click", () => {
      socket.send({ type: "intent.select", unitId: u.id });
    });
    posseList.appendChild(card);
  });
  renderGear();
}

function fillWeaponBar(
  container: HTMLElement,
  detailEl: HTMLElement,
  u: UnitPublic,
  large = false,
): void {
  const owned = new Set(u.ownedWeapons ?? [u.weapon]);
  container.innerHTML = "";
  for (const id of WEAPON_BAR_ORDER) {
    const has = owned.has(id);
    const active = u.weapon === id;
    const def = WEAPONS[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn" + (active ? " active" : "") + (!has ? " locked" : "");
    btn.dataset.equip = "weapon";
    btn.dataset.itemId = id;
    btn.disabled = !has;
    btn.title = has
      ? `${def.name} — DMG ${def.damage} · RNG ${def.range} · CD ${def.fireCooldown}s`
      : `${def.name} (not owned — buy at Pawn-O-Matic)`;
    const img = document.createElement("img");
    img.src = weaponIconDataUrl(id, { active, locked: !has });
    img.alt = def.name;
    img.width = large ? 48 : 40;
    img.height = large ? 48 : 40;
    img.draggable = false;
    btn.appendChild(img);
    if (has && active) {
      const tag = document.createElement("span");
      tag.className = "icon-eq";
      tag.textContent = "EQ";
      btn.appendChild(tag);
    }
    container.appendChild(btn);
  }
  const w = WEAPONS[u.weapon];
  detailEl.innerHTML = `<b>${escapeHtml(w.name)}</b> · DMG ${w.damage} · RNG ${w.range} · ROF ${(1 / w.fireCooldown).toFixed(1)}/s`;
}

function fillArmorBar(
  container: HTMLElement,
  detailEl: HTMLElement,
  u: UnitPublic,
  large = false,
): void {
  const owned = new Set(u.ownedArmors ?? [u.armor]);
  container.innerHTML = "";
  for (const id of ARMOR_BAR_ORDER) {
    const has = owned.has(id);
    const active = u.armor === id;
    const def = ARMORS[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn" + (active ? " active" : "") + (!has ? " locked" : "");
    btn.dataset.equip = "armor";
    btn.dataset.itemId = id;
    btn.disabled = !has;
    btn.title = has
      ? `${def.name} — −${Math.round(def.damageReduce * 100)}% dmg`
      : `${def.name} (not owned)`;
    const img = document.createElement("img");
    img.src = armorIconDataUrl(id, { active, locked: !has });
    img.alt = def.name;
    img.width = large ? 48 : 40;
    img.height = large ? 48 : 40;
    img.draggable = false;
    btn.appendChild(img);
    if (has && active) {
      const tag = document.createElement("span");
      tag.className = "icon-eq";
      tag.textContent = "EQ";
      btn.appendChild(tag);
    }
    container.appendChild(btn);
  }
  const a = ARMORS[u.armor];
  detailEl.innerHTML = `<b>${escapeHtml(a.name)}</b> · −${Math.round(a.damageReduce * 100)}% damage taken`;
}

function statBarHtml(label: string, value: number, max = 20, baseline = 5): string {
  const b = statBonus(value, baseline);
  const pct = Math.min(100, Math.round((value / max) * 100));
  const boostPct = Math.min(100, Math.round((Math.max(0, baseline) / max) * 100));
  return `
    <div class="stat-bar-row ${b > 0 ? "boosted" : ""}">
      <span class="stat-bar-label">${label}</span>
      <div class="stat-bar-track" title="${value} (baseline ${baseline})">
        <div class="stat-bar-base" style="width:${boostPct}%"></div>
        <div class="stat-bar-fill" style="width:${pct}%"></div>
      </div>
      <b class="stat-bar-val">${value}</b>
      ${formatBonus(b)}
    </div>`;
}

let lastGearKey = "";
let crewEditorOpen = false;

function renderGear(): void {
  const u = selectedUnit();
  if (!u) {
    gearEditor.classList.add("hidden");
    return;
  }
  gearEditor.classList.remove("hidden");
  const tier = upgradeTier(u.stats);
  const ownedW = (u.ownedWeapons ?? []).slice().sort().join(",");
  const ownedA = (u.ownedArmors ?? []).slice().sort().join(",");
  const key = `${u.id}|${u.weapon}|${u.armor}|${ownedW}|${ownedA}|${u.stats.aim},${u.stats.guts},${u.stats.muscle},${u.stats.brains},${u.stats.speed},${u.stats.maxHealth}|${u.health}|${crewEditorOpen}`;
  if (key === lastGearKey) return;
  lastGearKey = key;

  const portrait = portraitDataUrl(u.id + u.name, {
    leader: !!(u.isPlayerLeader || u.kind === "player"),
    dead: !u.alive,
    upgradeTier: tier,
    female: u.gender === "female",
  });

  statsView.innerHTML = `
    <div class="gear-profile">
      <img class="portrait lg" src="${portrait}" alt="" width="56" height="56" draggable="false" />
      <div>
        <div class="gear-name">${escapeHtml(u.name)}</div>
        <div class="badge up-tier t${tier}">${tierLabel(tier)} ${tierStars(tier)}</div>
        <div class="muted tiny">Slot keys 1–4 · Icon bar equip · FULL for loadout desk</div>
      </div>
    </div>
    <div class="stat-bars">
      ${statBarHtml("Aim", u.stats.aim)}
      ${statBarHtml("Guts", u.stats.guts)}
      ${statBarHtml("Muscle", u.stats.muscle)}
      ${statBarHtml("Brains", u.stats.brains)}
      ${statBarHtml("Speed", u.stats.speed)}
      ${statBarHtml("Max HP", u.stats.maxHealth, 200, 100)}
    </div>
  `;

  fillWeaponBar(weaponBar, weaponDetail, u, false);
  fillArmorBar(armorBar, armorDetail, u, false);

  if (crewEditorOpen) renderCrewEditor();
}

function renderCrewEditor(): void {
  if (!snap || !crewEditorOpen) return;
  const u = selectedUnit();
  if (!u) return;
  const units = myUnits();
  const tier = upgradeTier(u.stats);
  const portrait = portraitDataUrl(u.id + u.name, {
    leader: !!(u.isPlayerLeader || u.kind === "player"),
    dead: !u.alive,
    upgradeTier: tier,
    female: u.gender === "female",
  });

  crewEditorRoster.innerHTML = "";
  units.forEach((member, i) => {
    const t = upgradeTier(member.stats);
    const img = portraitDataUrl(member.id + member.name, {
      leader: !!(member.isPlayerLeader || member.kind === "player"),
      dead: !member.alive,
      upgradeTier: t,
      female: member.gender === "female",
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "crew-roster-card" + (member.id === u.id ? " active" : "") + (!member.alive ? " dead" : "");
    btn.innerHTML = `
      <img src="${img}" alt="" width="40" height="40" draggable="false" />
      <div>
        <div class="name">${i + 1}. ${escapeHtml(member.name)}</div>
        <div class="muted tiny">${tierLabel(t)} · ${escapeHtml(WEAPONS[member.weapon].name)}</div>
      </div>
    `;
    btn.addEventListener("click", () => {
      socket.send({ type: "intent.select", unitId: member.id });
    });
    crewEditorRoster.appendChild(btn);
  });

  crewEditorProfile.innerHTML = `
    <div class="crew-profile-hero">
      <img class="portrait xl" src="${portrait}" alt="" width="72" height="72" draggable="false" />
      <div>
        <h3>${escapeHtml(u.name)}</h3>
        <div class="badge up-tier t${tier}">${tierLabel(tier)} ${tierStars(tier)}</div>
        <p class="muted">HP ${Math.round(u.health)}/${u.maxHealth} · ${u.alive ? "Active" : "Respawning"}</p>
        <p class="muted tiny">Owned weapons unlock icon slots. Buy more at Pawn-O-Matic.</p>
      </div>
    </div>
  `;

  fillWeaponBar(crewWeaponBar, crewWeaponDetail, u, true);
  fillArmorBar(crewArmorBar, crewArmorDetail, u, true);

  crewEditorStats.innerHTML = `
    <div class="equip-label">ATTRIBUTES</div>
    <div class="stat-bars wide">
      ${statBarHtml("Aim", u.stats.aim)}
      ${statBarHtml("Guts", u.stats.guts)}
      ${statBarHtml("Muscle", u.stats.muscle)}
      ${statBarHtml("Brains", u.stats.brains)}
      ${statBarHtml("Speed", u.stats.speed)}
      ${statBarHtml("Max HP", u.stats.maxHealth, 200, 100)}
    </div>
  `;
}

function openCrewEditor(): void {
  crewEditorOpen = true;
  lastGearKey = "";
  crewEditorModal.classList.remove("hidden");
  renderCrewEditor();
}

function closeCrewEditor(): void {
  crewEditorOpen = false;
  crewEditorModal.classList.add("hidden");
}

function onEquipBarClick(ev: MouseEvent): void {
  const btn = (ev.target as HTMLElement | null)?.closest?.("button[data-equip]") as
    | HTMLButtonElement
    | null;
  if (!btn || btn.disabled || !socket) return;
  const u = selectedUnit();
  if (!u) return;
  const kind = btn.dataset.equip;
  const itemId = btn.dataset.itemId;
  if (!kind || !itemId) return;
  if (kind === "weapon") {
    socket.send({ type: "posse.setWeapon", unitId: u.id, weaponId: itemId as WeaponId });
  } else if (kind === "armor") {
    socket.send({ type: "posse.setArmor", unitId: u.id, armorId: itemId as ArmorId });
  }
}

/** Avoid rebuilding dialogue buttons every snapshot (was eating clicks). */
let lastDialogueKey = "";

function renderDialogue(): void {
  if (!snap?.dialogue) {
    dialogueModal.classList.add("hidden");
    lastDialogueKey = "";
    return;
  }
  const d = snap.dialogue;
  const key = `${d.npcId}|${d.text}|${d.choices.map((c) => c.id + ":" + c.label).join(";")}`;
  dialogueModal.classList.remove("hidden");
  if (key === lastDialogueKey) return;
  lastDialogueKey = key;

  const portrait = dialoguePortraitUrl(d.npcId, d.npcName);
  if (portrait) {
    dlgPortraitWrap.classList.remove("hidden");
    if (dlgPortrait.getAttribute("src") !== portrait) {
      dlgPortrait.src = portrait;
    }
    dlgPortrait.alt = d.npcName;
    dialogueModal.querySelector(".dialogue-card")?.classList.add("has-portrait");
  } else {
    dlgPortraitWrap.classList.add("hidden");
    dlgPortrait.removeAttribute("src");
    dlgPortrait.alt = "";
    dialogueModal.querySelector(".dialogue-card")?.classList.remove("has-portrait");
  }

  dlgName.textContent = d.npcName;
  dlgText.textContent = d.text;
  dlgChoices.innerHTML = "";
  for (const c of d.choices) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `[${c.tone}] ${c.label}`;
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      socket.send({ type: "dialogue.choice", choiceId: c.id });
    });
    dlgChoices.appendChild(b);
  }
}

/** Avoid rebuilding shop buttons every snapshot (was eating all clicks). */
let lastShopKey = "";
let lastJobBoardKey = "";

function shopTargetUnitId(): string | null {
  if (!snap) return null;
  const u = selectedUnit();
  if (u) return u.id;
  return snap.you.selectedUnitId || null;
}

function renderJobBoard(): void {
  if (!snap?.jobBoard) {
    jobBoardModal.classList.add("hidden");
    lastJobBoardKey = "";
    return;
  }
  const jb = snap.jobBoard;
  jobBoardModal.classList.remove("hidden");
  jobBoardTitle.textContent = jb.title || "Job Board";
  const key = `${jb.npcId}|${jb.offers.map((o) => o.id).join(",")}|${snap.you.cash}`;
  if (key === lastJobBoardKey) return;
  lastJobBoardKey = key;

  jobBoardOffers.innerHTML = "";
  for (const offer of jb.offers) {
    const card = document.createElement("article");
    card.className = "job-offer";
    card.innerHTML = `
      <div class="job-offer-head">
        <h3>${escapeHtml(offer.title)}</h3>
        <span class="job-diff" data-d="${offer.difficulty}">${"★".repeat(offer.difficulty)}${"☆".repeat(3 - offer.difficulty)}</span>
      </div>
      <p class="job-blurb">${escapeHtml(offer.blurb)}</p>
      <div class="job-offer-foot">
        <span class="job-pay">$${offer.rewardCash} · +${offer.rewardRep} rep</span>
        <button type="button" class="job-accept" data-mission-id="${escapeHtml(offer.id)}">ACCEPT</button>
      </div>
    `;
    jobBoardOffers.appendChild(card);
  }
}

function renderMissionHud(): void {
  if (!snap?.mission || snap.mission.phase === "complete" || snap.mission.phase === "failed") {
    missionHud.classList.add("hidden");
    return;
  }
  const m = snap.mission;
  missionHud.classList.remove("hidden");
  missionHud.classList.toggle("extract", m.phase === "extract");
  missionHudTitle.textContent =
    m.phase === "extract" ? `${m.title} — EXTRACT` : m.instanced ? `${m.title} (INSTANCE)` : m.title;
  missionHudObjectives.innerHTML = "";
  for (const o of m.objectives) {
    const li = document.createElement("li");
    li.className = o.done ? "done" : "";
    li.textContent = `${o.done ? "✓" : "○"} ${o.label}`;
    missionHudObjectives.appendChild(li);
  }
  if (m.progress != null) {
    missionHudProgress.classList.remove("hidden");
    missionHudBar.style.width = `${Math.round(m.progress * 100)}%`;
  } else {
    missionHudProgress.classList.add("hidden");
  }
}

function renderTutorialHud(): void {
  if (!snap?.tutorial) {
    tutorialHud.classList.add("hidden");
    return;
  }
  const t = snap.tutorial;
  tutorialHud.classList.remove("hidden");
  tutorialStepNum.textContent = `${t.stepIndex}/${t.stepCount}`;
  tutorialTitle.textContent = t.title;
  tutorialBody.textContent = t.body;
  if (t.hintX != null && t.hintY != null) {
    tutorialHint.textContent = `Waypoint ≈ (${Math.round(t.hintX)}, ${Math.round(t.hintY)}) · click the ground or WASD`;
  } else {
    tutorialHint.textContent = "Follow the prompt — E to interact when in range.";
  }
}

function openDistrictMap(): void {
  districtMapModal.classList.remove("hidden");
  renderDistrictMap();
  sfx.play("ui");
}

function closeDistrictMap(): void {
  districtMapModal.classList.add("hidden");
}

function renderMemorialWall(): void {
  if (!snap) return;
  // Server opens via memorial.open from priest; also allow local view from snapshot
  const open = !memorialModal.classList.contains("hidden");
  // Auto-open when server set memorialOpen — we don't have that flag on snap; use message flow
  const list = snap.memorials ?? [];
  memorialCount.textContent =
    list.length === 0 ? "No names yet. Lucky you." : `${list.length} name${list.length === 1 ? "" : "s"} on the wall`;
  if (!open) return;
  memorialList.innerHTML = "";
  if (list.length === 0) {
    memorialList.innerHTML =
      `<p class="memorial-empty">The wall is blank. Hire meat, take jobs, try not to fill it.</p>`;
    return;
  }
  for (const m of list) {
    const card = document.createElement("article");
    card.className = "memorial-entry";
    const who = m.gender === "female" ? "She" : m.gender === "male" ? "He" : "They";
    card.innerHTML = `
      <div class="memorial-name">${escapeHtml(m.name)}</div>
      <p class="memorial-epitaph">"${escapeHtml(m.epitaph)}"</p>
      <p class="memorial-cause">${escapeHtml(m.cause)}</p>
      <p class="muted tiny">${who} will be remembered. Briefly.</p>
    `;
    memorialList.appendChild(card);
  }
}

function openMemorialWall(): void {
  socket.send({ type: "memorial.open" });
  memorialModal.classList.remove("hidden");
  renderMemorialWall();
  sfx.play("ui");
}

function closeMemorialWall(): void {
  memorialModal.classList.add("hidden");
  socket.send({ type: "memorial.close" });
}

function renderDistrictMap(): void {
  if (!snap?.districts?.length) return;
  const here = snap.you.districtName ?? "—";
  const lock = snap.you.districtUnlocked === false ? " (locked!)" : "";
  districtMapHere.textContent = `You are here: ${here}${lock} · Rep ${snap.you.rep}`;

  districtMapList.innerHTML = "";
  for (const d of snap.districts) {
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "district-row" +
      (d.unlocked ? "" : " locked") +
      (d.id === snap.you.districtId ? " current" : "") +
      ` danger-${d.danger}`;
    row.dataset.districtId = d.id;
    row.innerHTML = `
      <div class="district-row-top">
        <strong>${escapeHtml(d.short)}</strong>
        <span class="district-badge">${d.unlocked ? "OPEN" : `REP ${d.minRep}`}</span>
      </div>
      <div class="district-name">${escapeHtml(d.name)}</div>
      <p class="district-blurb">${escapeHtml(d.blurb)}</p>
      ${d.landmark ? `<p class="muted tiny">${escapeHtml(d.landmark)}</p>` : ""}
    `;
    if (d.unlocked) {
      row.addEventListener("click", () => {
        const cx = (d.x0 + d.x1) / 2;
        const cy = (d.y0 + d.y1) / 2;
        socket.send({ type: "map.ping", x: cx, y: cy });
        closeDistrictMap();
      });
    }
    districtMapList.appendChild(row);
  }

  // Sketch canvas
  const ctx = districtMapCanvas.getContext("2d");
  if (!ctx || !snap.mapWidth) return;
  const W = districtMapCanvas.width;
  const H = districtMapCanvas.height;
  const pad = 8;
  const scaleX = (W - pad * 2) / snap.mapWidth;
  const scaleY = (H - pad * 2) / snap.mapHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0c12";
  ctx.fillRect(0, 0, W, H);
  // Safe line
  const safeY = 38;
  ctx.strokeStyle = "rgba(255, 80, 60, 0.55)";
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(pad, pad + safeY * scaleY);
  ctx.lineTo(W - pad, pad + safeY * scaleY);
  ctx.stroke();
  ctx.setLineDash([]);

  const colors: Record<string, string> = {
    safe: "rgba(80, 180, 120, 0.35)",
    risky: "rgba(220, 160, 40, 0.35)",
    hot: "rgba(220, 60, 50, 0.4)",
  };
  for (const d of snap.districts) {
    const x = pad + d.x0 * scaleX;
    const y = pad + d.y0 * scaleY;
    const w = (d.x1 - d.x0 + 1) * scaleX;
    const h = (d.y1 - d.y0 + 1) * scaleY;
    ctx.fillStyle = d.unlocked ? colors[d.danger] ?? "#444" : "rgba(40,40,50,0.7)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = d.id === snap.you.districtId ? "#f0c040" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = d.id === snap.you.districtId ? 2 : 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = d.unlocked ? "#e8e0d4" : "#666";
    ctx.font = "10px system-ui,sans-serif";
    ctx.fillText(d.short, x + 4, y + 12);
  }
  // Player marker
  const me = snap.units.find((u) => u.isPlayerLeader);
  if (me && !snap.you.insideBuildingId) {
    ctx.fillStyle = "#f0c040";
    ctx.beginPath();
    ctx.arc(pad + me.x * scaleX, pad + me.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderShop(): void {
  if (!snap?.shop) {
    shopModal.classList.add("hidden");
    lastShopKey = "";
    return;
  }
  shopModal.classList.remove("hidden");
  shopTitle.textContent = "PAWN-O-MATIC";
  shopCash.textContent = `$${snap.you.cash}`;
  const u = selectedUnit();
  shopUnitName.textContent = u?.name ?? "—";

  const ownedW = (u?.ownedWeapons ?? []).slice().sort().join(",");
  const ownedA = (u?.ownedArmors ?? []).slice().sort().join(",");
  const rosterKey = myUnits()
    .map((m) => m.id)
    .join(",");
  const heat = snap.you.heat ?? 0;
  const rep = snap.you.rep ?? 0;
  const key = `${snap.shop.shopName}|${u?.id ?? ""}|${ownedW}|${ownedA}|${snap.you.cash}|${heat}|${rep}|${rosterKey}|${u?.stats.aim},${u?.stats.guts}`;
  if (key === lastShopKey) return;
  lastShopKey = key;

  // Buyer chips
  shopBuyerRow.innerHTML = "";
  for (const m of myUnits()) {
    if (!m.alive && !(m.isPlayerLeader || m.kind === "player")) continue;
    const t = upgradeTier(m.stats);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "shop-buyer-chip" + (m.id === u?.id ? " active" : "");
    chip.dataset.selectUnit = m.id;
    const img = portraitDataUrl(m.id + m.name, {
      leader: !!(m.isPlayerLeader || m.kind === "player"),
      dead: !m.alive,
      upgradeTier: t,
      female: m.gender === "female",
    });
    chip.innerHTML = `
      <img src="${img}" alt="" width="32" height="32" draggable="false" />
      <span>${escapeHtml(m.name.split(" ")[0] ?? m.name)}</span>
    `;
    shopBuyerRow.appendChild(chip);
  }

  shopWeapons.innerHTML = "";
  for (const id of SHOP_WEAPON_ORDER) {
    const w = WEAPONS[id];
    const owned = u?.ownedWeapons?.includes(id);
    const needRep = w.minRep ?? 0;
    const locked = !owned && rep < needRep;
    const price = shopPrice(w.price, heat);
    const canAfford = snap.you.cash >= price;
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "shop-item" +
      (owned ? " owned" : "") +
      (locked ? " locked" : "") +
      (!owned && !locked && !canAfford ? " broke" : "");
    b.dataset.shopAction = "weapon";
    b.dataset.itemId = id;
    if (locked) b.disabled = true;
    const priceLabel = owned
      ? "EQUIP"
      : locked
        ? `REP ${needRep}`
        : price !== w.price
          ? `$${price}*`
          : `$${price}`;
    b.innerHTML = `
      <img class="shop-item-icon" src="${weaponIconDataUrl(id, { active: u?.weapon === id, locked })}" alt="" width="40" height="40" draggable="false" />
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(w.name)}</div>
        <div class="shop-item-meta">DMG ${w.damage} · RNG ${w.range}${needRep > 0 ? ` · Rep ${needRep}` : ""}</div>
        <div class="shop-item-desc">${escapeHtml(w.description)}</div>
      </div>
      <div class="shop-item-price">${priceLabel}</div>
    `;
    shopWeapons.appendChild(b);
  }

  shopArmor.innerHTML = "";
  for (const id of SHOP_ARMOR_ORDER) {
    const a = ARMORS[id];
    const owned = u?.ownedArmors?.includes(id);
    const needRep = a.minRep ?? 0;
    const locked = !owned && rep < needRep;
    const price = shopPrice(a.price, heat);
    const canAfford = snap.you.cash >= price;
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "shop-item" +
      (owned ? " owned" : "") +
      (locked ? " locked" : "") +
      (!owned && !locked && !canAfford ? " broke" : "");
    b.dataset.shopAction = "armor";
    b.dataset.itemId = id;
    if (locked) b.disabled = true;
    const priceLabel = owned
      ? "EQUIP"
      : locked
        ? `REP ${needRep}`
        : a.price <= 0
          ? "FREE"
          : price !== a.price
            ? `$${price}*`
            : `$${price}`;
    b.innerHTML = `
      <img class="shop-item-icon" src="${armorIconDataUrl(id, { active: u?.armor === id, locked })}" alt="" width="40" height="40" draggable="false" />
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(a.name)}</div>
        <div class="shop-item-meta">−${Math.round(a.damageReduce * 100)}% dmg${needRep > 0 ? ` · Rep ${needRep}` : ""}</div>
        <div class="shop-item-desc">${escapeHtml(a.description)}</div>
      </div>
      <div class="shop-item-price">${priceLabel}</div>
    `;
    shopArmor.appendChild(b);
  }

  shopUpgrades.innerHTML = "";
  for (const id of SHOP_UPGRADE_ORDER) {
    const up = UPGRADES[id];
    const needRep = up.minRep ?? 0;
    const locked = rep < needRep;
    const price = shopPrice(up.price, heat);
    const canAfford = snap.you.cash >= price;
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "shop-item upgrade" + (locked ? " locked" : "") + (!locked && !canAfford ? " broke" : "");
    b.dataset.shopAction = "upgrade";
    b.dataset.itemId = id;
    if (locked) b.disabled = true;
    b.innerHTML = `
      <div class="shop-upgrade-glyph">${id === "medkit" ? "+" : "▲"}</div>
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(up.name)}</div>
        <div class="shop-item-desc">${escapeHtml(up.description)}${needRep > 0 ? ` · Rep ${needRep}` : ""}</div>
      </div>
      <div class="shop-item-price">${locked ? `REP ${needRep}` : price !== up.price ? `$${price}*` : `$${price}`}</div>
    `;
    shopUpgrades.appendChild(b);
  }
}

function onShopClick(ev: MouseEvent): void {
  const selectBtn = (ev.target as HTMLElement | null)?.closest?.(
    "button[data-select-unit]",
  ) as HTMLButtonElement | null;
  if (selectBtn?.dataset.selectUnit && socket) {
    ev.preventDefault();
    socket.send({ type: "intent.select", unitId: selectBtn.dataset.selectUnit });
    return;
  }

  const btn = (ev.target as HTMLElement | null)?.closest?.("button[data-shop-action]") as
    | HTMLButtonElement
    | null;
  if (!btn || !socket) return;
  ev.preventDefault();
  ev.stopPropagation();

  const unitId = shopTargetUnitId();
  if (!unitId) {
    pushEvent("Select a posse member first.");
    return;
  }
  const action = btn.dataset.shopAction;
  const itemId = btn.dataset.itemId;
  if (!action || !itemId) return;

  if (action === "weapon") {
    socket.send({ type: "shop.buyWeapon", weaponId: itemId as WeaponId, unitId });
  } else if (action === "armor") {
    socket.send({ type: "shop.buyArmor", armorId: itemId as ArmorId, unitId });
  } else if (action === "upgrade") {
    socket.send({ type: "shop.buyUpgrade", upgradeId: itemId as UpgradeId, unitId });
  }
}

function updateActionBanner(s: WorldSnapshot): void {
  const action = s.you.action || "IDLE";
  const detail = s.you.actionDetail;
  actionStatus.textContent = action;
  actionDetail.textContent = detail ?? "";
  actionBanner.classList.remove("assault", "moving", "idle", "safe", "war");
  if (action === "ASSASSINATE" || action === "ENGAGING" || action === "ALERT") {
    actionBanner.classList.add("assault");
  } else if (action === "GOING" || action === "MOVING") {
    actionBanner.classList.add("moving");
  } else {
    actionBanner.classList.add("idle");
  }
  if (s.you.inSafeZone) actionBanner.classList.add("safe");
  else actionBanner.classList.add("war");
}

function updateZoneObjective(s: WorldSnapshot): void {
  const compact = isMobileLayout();
  if (s.mission && (s.mission.phase === "active" || s.mission.phase === "extract")) {
    const next = s.mission.objectives.find((o) => !o.done);
    const label = next?.label ?? s.mission.title;
    const hint =
      s.mission.hintX != null && s.mission.hintY != null
        ? ` → (${Math.round(s.mission.hintX)}, ${Math.round(s.mission.hintY)})`
        : "";
    const tag = s.mission.phase === "extract" ? "EXTRACT" : s.mission.instanced ? "INSTANCE" : "JOB";
    objective.textContent = compact
      ? `${tag} · ${s.mission.title}`
      : `${tag}: ${s.mission.title} — ${label}${hint}`;
    objective.classList.remove("zone-safe", "zone-war");
    objective.classList.add("zone-war");
    return;
  }
  if (s.tutorial) {
    const hint =
      s.tutorial.hintX != null && s.tutorial.hintY != null
        ? ` → (${Math.round(s.tutorial.hintX)}, ${Math.round(s.tutorial.hintY)})`
        : "";
    objective.textContent = compact
      ? `TUT ${s.tutorial.stepIndex}/${s.tutorial.stepCount} · ${s.tutorial.title}`
      : `TUTORIAL ${s.tutorial.stepIndex}/${s.tutorial.stepCount}: ${s.tutorial.title}${hint}`;
    objective.classList.remove("zone-safe", "zone-war");
    objective.classList.add("zone-safe");
    return;
  }
  if (s.you.insideBuildingId) {
    const b = s.buildings.find((bb) => bb.id === s.you.insideBuildingId);
    objective.textContent = b
      ? compact
        ? `INSIDE · ${b.name.toUpperCase()}`
        : `INSIDE: ${b.name.toUpperCase()} — E to exit near door`
      : "INSIDE";
    objective.classList.remove("zone-safe", "zone-war");
    objective.classList.add("zone-safe");
    return;
  }
  const distLabel = s.you.districtName
    ? compact
      ? s.you.districtName
      : `${s.you.districtName}${s.you.districtUnlocked === false ? " [LOCKED]" : ""}`
    : null;
  if (s.you.inSafeZone) {
    objective.textContent = compact
      ? distLabel
        ? `SAFE · ${distLabel}`
        : "SAFE DOWNTOWN (PvE)"
      : distLabel
        ? `${distLabel} (PvE) — M map · V memorial · recruit · Rita`
        : "SAFE DOWNTOWN (PvE) — recruit · shop · no murders · Rita has jobs";
    objective.classList.remove("zone-war");
    objective.classList.add("zone-safe");
  } else {
    objective.textContent = compact
      ? distLabel
        ? `WAR · ${distLabel}`
        : "WAR ZONE (PvP)"
      : distLabel
        ? `${distLabel} — RMB attack · M for map · earn rep to unlock deeper turf`
        : "WAR ZONE (PvP) — rival gangs · RMB attack · survive";
    objective.classList.remove("zone-safe");
    objective.classList.add("zone-war");
  }
}

/** Keep status bar just under the mobile posse strip (height changes when collapsed). */
function syncMobileHudTop(): void {
  if (!possePanel) return;
  const h = possePanel.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--mobile-hud-top", `${Math.ceil(h)}px`);
}

function onSnapshot(s: WorldSnapshot): void {
  snap = s;
  view.applySnapshot(s);
  // Combat VFX SFX (visuals applied inside WorldView.applySnapshot)
  if (s.fx?.length) playCombatFxAudio(s.fx);
  renderPosse();
  renderDialogue();
  renderShop();
  renderJobBoard();
  renderMissionHud();
  renderTutorialHud();
  updateActionBanner(s);
  updateZoneObjective(s);
  if (!districtMapModal.classList.contains("hidden")) renderDistrictMap();
  if (s.memorialOpen) {
    memorialModal.classList.remove("hidden");
    renderMemorialWall();
  } else if (!memorialModal.classList.contains("hidden") && s.memorialOpen === false) {
    // keep open if user opened with V until they close
  }
  if (!memorialModal.classList.contains("hidden")) renderMemorialWall();
  if (s.you.respawnIn != null && s.you.respawnIn > 0) {
    respawnOverlay.classList.remove("hidden");
    respawnCount.textContent = Math.ceil(s.you.respawnIn).toString();
  } else {
    respawnOverlay.classList.add("hidden");
  }
  // Auto-complete click-to-interact when in range
  if (pendingInteract && view) {
    const d = view.distToLeader(pendingInteract.x, pendingInteract.y);
    if (d <= INTERACT_RANGE + 0.35) {
      pendingInteract = null;
      fireInteract();
    }
  }
}

function weaponFireSfx(weapon: WeaponId): void {
  sfx.unlock();
  if (weapon === "shotgun") sfx.play("shotgun");
  else if (weapon === "minigun") sfx.play("minigun");
  else if (weapon === "tommy") sfx.play("tommy");
  else if (weapon === "uzi") sfx.play("uzi");
  else if (weapon === "pipe") sfx.play("melee");
  else if (weapon === "switchblade") sfx.play("blade");
  else if (weapon === "flamethrower") sfx.play("flame");
  else if (weapon === "pistol") sfx.play("pistol");
  else sfx.play("gun");
}

function playCombatFxAudio(events: CombatFxEvent[]): void {
  if (!events.length) return;
  sfx.unlock();
  // Cap concurrent one-shots per snapshot so auto-fire stays audible but not clipped
  let shots = 0;
  let hits = 0;
  for (const e of events) {
    if (e.kind === "shot" || e.kind === "melee" || e.kind === "flame") {
      if (shots < 6) {
        weaponFireSfx(e.weapon);
        shots++;
      }
    } else if (e.kind === "hit") {
      if (hits < 5) {
        sfx.play(e.crit ? "crit" : "hit");
        hits++;
      }
    } else if (e.kind === "miss") {
      sfx.play("miss");
    } else if (e.kind === "death") {
      sfx.play("death", { force: true });
    }
  }
}

function fireInteract(): void {
  if (!socket) return;
  keys.up = keys.down = keys.left = keys.right = false;
  keyMoving = false;
  pendingInteract = null;
  view?.clearLocalPrediction();
  socket.send({ type: "intent.dir", dx: 0, dy: 0 });
  socket.send({ type: "intent.stop" });
  socket.send({ type: "intent.interact" });
  sfx.play("ui");
}

/** Walk toward a world point, then interact when close enough. */
function clickInteractAt(x: number, y: number): void {
  if (!socket || !view || !snap) return;
  keys.up = keys.down = keys.left = keys.right = false;
  if (keyMoving) {
    keyMoving = false;
    socket.send({ type: "intent.dir", dx: 0, dy: 0 });
  }
  const d = view.distToLeader(x, y);
  if (d <= INTERACT_RANGE + 0.2) {
    pendingInteract = null;
    fireInteract();
    return;
  }
  pendingInteract = { x, y };
  view.predictClickMove(x, y);
  socket.send({ type: "intent.move", x, y });
}

/** Screen WASD/arrows → world-space free movement vector (isometric camera). */
function worldDirFromKeys(): { wx: number; wy: number } {
  let wx = 0;
  let wy = 0;
  if (keys.up) {
    wx -= 1;
    wy -= 1;
  }
  if (keys.down) {
    wx += 1;
    wy += 1;
  }
  if (keys.left) {
    wx -= 1;
    wy += 1;
  }
  if (keys.right) {
    wx += 1;
    wy -= 1;
  }
  return { wx, wy };
}

function canKeyboardMove(): boolean {
  if (!snap || !socket || chatFocused) return false;
  if (snap.dialogue || snap.shop || snap.jobBoard) return false;
  if (snap.you.respawnIn != null && snap.you.respawnIn > 0) return false;
  return true;
}

/** Instant local prediction + optional network send (immediate on press). */
function applyKeyboardSteer(forceSend: boolean): void {
  if (!view) return;
  if (!canKeyboardMove()) {
    if (keyMoving) {
      view.clearLocalPrediction();
      socket?.send({ type: "intent.dir", dx: 0, dy: 0 });
      keyMoving = false;
    }
    return;
  }

  const { wx, wy } = worldDirFromKeys();
  if (wx === 0 && wy === 0) {
    view.clearLocalPrediction();
    if (keyMoving) {
      socket.send({ type: "intent.dir", dx: 0, dy: 0 });
      keyMoving = false;
      lastKeyMoveSent = performance.now();
    }
    return;
  }

  const len = Math.hypot(wx, wy) || 1;
  const dx = wx / len;
  const dy = wy / len;
  // Local prediction every frame — zero perceived input lag
  view.setLocalPrediction(dx, dy);

  const now = performance.now();
  if (forceSend || !keyMoving || now - lastKeyMoveSent >= DIR_RESEND_MS) {
    lastKeyMoveSent = now;
    keyMoving = true;
    socket.send({ type: "intent.dir", dx, dy });
  }
}

function setKeyFromCode(code: string, down: boolean): boolean {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      keys.up = down;
      return true;
    case "KeyS":
    case "ArrowDown":
      keys.down = down;
      return true;
    case "KeyA":
    case "ArrowLeft":
      keys.left = down;
      return true;
    case "KeyD":
    case "ArrowRight":
      keys.right = down;
      return true;
    default:
      return false;
  }
}

/**
 * Map screen directions to world axes for the fixed isometric camera.
 * worldToScreen: sx=(x-y)*tw/2, sy=(x+y)*th/2
 * - Screen up  => decrease x and y
 * - Screen down => increase x and y
 * - Screen left => decrease x, increase y
 * - Screen right => increase x, decrease y
 *
 * Prediction runs every frame; network intents are immediate on press
 * and re-sent at DIR_RESEND_MS while held.
 */
function keyboardMoveLoop(): void {
  requestAnimationFrame(keyboardMoveLoop);
  applyKeyboardSteer(false);
}

async function startGame(): Promise<void> {
  loginEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  sfx.unlock();
  view = new WorldView(canvas);
  await view.init();

  socket = new GameSocket({
    onAuthOk: () => {
      sfx.play("ui");
      pushEvent("You're on the street. Dumpsters, corners, gyms — crime is a lifestyle.");
      window.dispatchEvent(new Event("resize"));
    },
    onAuthFail: (reason) => {
      loginError.textContent = reason;
      gameEl.classList.add("hidden");
      loginEl.classList.remove("hidden");
    },
    onSnapshot,
    onEvent: pushEvent,
    onChat: pushChat,
    onNotify: showNotify,
    onClose: () => {
      pushEvent("Disconnected from server.");
    },
  });

  socket.connect(myName);
  bindInput();
  // Phones: chat starts hidden so it never covers the map / zone pill
  if (isMobileLayout()) setChatCollapsed(true);
  syncMobileHudTop();
  if (possePanel && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => syncMobileHudTop());
    ro.observe(possePanel);
  }
  window.addEventListener("resize", () => syncMobileHudTop());
}

function bindInput(): void {
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousemove", (e) => {
    if (!view || !snap || isCoarsePointer()) return;
    const cursor = view.updateHover(e.clientX, e.clientY);
    canvas.style.cursor = cursor;
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!view) return;
      e.preventDefault();
      // Scroll up = zoom in
      const dir = e.deltaY > 0 ? -1 : 1;
      view.adjustZoom(dir * 0.08);
    },
    { passive: false },
  );

  // Mouse (desktop) — skip synthetic mouse events after touch
  let lastTouchAt = 0;
  canvas.addEventListener("mousedown", (e) => {
    if (performance.now() - lastTouchAt < 500) return;
    if (e.button === 0) {
      handlePrimaryPointer(e.clientX, e.clientY, false);
    } else if (e.button === 2) {
      fireAttackAtClient(e.clientX, e.clientY);
    }
  });

  // Touch: tap = move / interact, long-press = attack, attack-mode button sticky
  canvas.addEventListener(
    "touchstart",
    (e) => {
      lastTouchAt = performance.now();
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      touchStart = { x: t.clientX, y: t.clientY, t: performance.now(), id: t.identifier };
      if (view) view.updateHover(t.clientX, t.clientY);
    },
    { passive: true },
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!touchStart || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (Math.hypot(dx, dy) > TAP_SLOP_PX * 2) {
        // Drag cancel long-press intent; still allow release as move if short drag
      }
    },
    { passive: true },
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t =
        Array.from(e.changedTouches).find((c) => c.identifier === touchStart!.id) ??
        e.changedTouches[0];
      if (!t) {
        touchStart = null;
        return;
      }
      e.preventDefault();
      const dt = performance.now() - touchStart.t;
      const dist = Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y);
      const longPress = dt >= LONG_PRESS_MS && dist < TAP_SLOP_PX * 1.5;
      if (dist < TAP_SLOP_PX * 2.5) {
        handlePrimaryPointer(t.clientX, t.clientY, longPress);
      }
      touchStart = null;
    },
    { passive: false },
  );

  canvas.addEventListener("touchcancel", () => {
    touchStart = null;
  });

  // Mobile chrome buttons
  mobInteract?.addEventListener("click", (e) => {
    e.preventDefault();
    fireInteract();
  });
  mobAttack?.addEventListener("click", (e) => {
    e.preventDefault();
    setMobileAttackMode(!mobileAttackMode);
    if (mobileAttackMode) pushEvent("Attack mode — tap a target or the ground.");
  });
  mobStop?.addEventListener("click", (e) => {
    e.preventDefault();
    pendingInteract = null;
    keys.up = keys.down = keys.left = keys.right = false;
    keyMoving = false;
    setMobileAttackMode(false);
    view?.clearLocalPrediction();
    socket?.send({ type: "intent.dir", dx: 0, dy: 0 });
    socket?.send({ type: "intent.stop" });
  });
  mobZoomIn?.addEventListener("click", (e) => {
    e.preventDefault();
    view?.adjustZoom(0.12);
  });
  mobZoomOut?.addEventListener("click", (e) => {
    e.preventDefault();
    view?.adjustZoom(-0.12);
  });
  possePanelToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    possePanel?.classList.toggle("collapsed");
    // next frame after layout
    requestAnimationFrame(() => syncMobileHudTop());
  });

  chatToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChat();
  });
  mobChat?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChat();
  });

  // Keep chat collapsed when rotating into mobile layout
  window.matchMedia("(max-width: 900px)").addEventListener("change", (ev) => {
    if (ev.matches) setChatCollapsed(true);
    else setChatCollapsed(false);
  });

  // Browsers block audio until a gesture — unlock often so combat SFX always work
  const unlockAudio = () => sfx.unlock();
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  window.addEventListener("touchstart", unlockAudio, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (chatFocused) {
      if (e.key === "Escape") {
        chatInput.blur();
      }
      return;
    }
    if (setKeyFromCode(e.code, true)) {
      e.preventDefault();
      pendingInteract = null;
      // First frame of press: send + predict immediately (no 33ms wait)
      applyKeyboardSteer(true);
      return;
    }
    // Zoom: +/= zoom in, - zoom out (scroll wheel also works). Slot 7 weapon via crew editor.
    if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
      e.preventDefault();
      view?.adjustZoom(0.1);
      return;
    }
    if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") {
      e.preventDefault();
      view?.adjustZoom(-0.1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      chatInput.focus();
      return;
    }
    if (e.key === "e" || e.key === "E") {
      pendingInteract = null;
      fireInteract();
    }
    if (e.key === "Escape") {
      if (crewEditorOpen) {
        closeCrewEditor();
        return;
      }
      if (snap?.dialogue) socket.send({ type: "dialogue.close" });
      if (snap?.shop) socket.send({ type: "shop.close" });
      if (snap?.jobBoard) socket.send({ type: "jobBoard.close" });
      if (!districtMapModal.classList.contains("hidden")) closeDistrictMap();
      if (!memorialModal.classList.contains("hidden")) closeMemorialWall();
    }
    if (e.key === "m" || e.key === "M") {
      if (!chatFocused && !snap?.dialogue && !snap?.shop && !snap?.jobBoard) {
        e.preventDefault();
        if (districtMapModal.classList.contains("hidden")) openDistrictMap();
        else closeDistrictMap();
      }
    }
    if (e.key === "v" || e.key === "V") {
      if (!chatFocused && !snap?.dialogue && !snap?.shop && !snap?.jobBoard) {
        e.preventDefault();
        if (memorialModal.classList.contains("hidden")) openMemorialWall();
        else closeMemorialWall();
      }
    }
    // Syndicate-style: number row 5–0 / - for weapon slots when unit selected
    if (!crewEditorOpen && !snap?.dialogue && !snap?.shop && !snap?.jobBoard) {
      const wepKeys: Record<string, number> = {
        Digit5: 0,
        Digit6: 1,
        Digit7: 2,
        Digit8: 3,
        Digit9: 4,
        Digit0: 5,
        // Minus reserved for zoom out; equip via crew editor / click bar
      };
      if (e.code in wepKeys) {
        const u = selectedUnit();
        if (u) {
          const id = WEAPON_BAR_ORDER[wepKeys[e.code]!]!;
          if ((u.ownedWeapons ?? []).includes(id)) {
            socket.send({ type: "posse.setWeapon", unitId: u.id, weaponId: id });
          }
        }
      }
    }
    if (e.key >= "1" && e.key <= "4") {
      const units = myUnits();
      const u = units[Number(e.key) - 1];
      if (u) socket.send({ type: "intent.select", unitId: u.id });
    }
  });

  window.addEventListener("keyup", (e) => {
    if (setKeyFromCode(e.code, false)) {
      e.preventDefault();
      applyKeyboardSteer(true);
    }
  });

  window.addEventListener("blur", () => {
    keys.up = keys.down = keys.left = keys.right = false;
    if (keyMoving) {
      keyMoving = false;
      view?.clearLocalPrediction();
      socket?.send({ type: "intent.dir", dx: 0, dy: 0 });
    }
  });

  requestAnimationFrame(keyboardMoveLoop);

  chatInput.addEventListener("focus", () => {
    chatFocused = true;
  });
  chatInput.addEventListener("blur", () => {
    chatFocused = false;
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
      socket.send({ type: "chat", text });
      chatInput.value = "";
    }
    chatInput.blur();
  });

  dlgClose.addEventListener("click", () => socket.send({ type: "dialogue.close" }));
  shopClose.addEventListener("click", () => socket.send({ type: "shop.close" }));
  jobBoardClose.addEventListener("click", () => socket.send({ type: "jobBoard.close" }));
  missionAbandon.addEventListener("click", () => {
    if (confirm("Abandon this job? No pay, no glory.")) {
      socket.send({ type: "mission.abandon" });
    }
  });
  tutorialSkip.addEventListener("click", () => {
    if (confirm("Skip the first-session guide? You can still find Rita in the bar.")) {
      socket.send({ type: "tutorial.skip" });
    }
  });
  minimapBtn.addEventListener("click", () => openDistrictMap());
  districtMapClose.addEventListener("click", () => closeDistrictMap());
  districtMapModal.addEventListener("click", (e) => {
    if (e.target === districtMapModal) closeDistrictMap();
  });
  memorialClose.addEventListener("click", () => closeMemorialWall());
  memorialModal.addEventListener("click", (e) => {
    if (e.target === memorialModal) closeMemorialWall();
  });

  // Event delegation — survives re-renders and only wires once
  shopWeapons.addEventListener("click", onShopClick);
  shopArmor.addEventListener("click", onShopClick);
  shopUpgrades.addEventListener("click", onShopClick);
  shopBuyerRow.addEventListener("click", onShopClick);
  shopModal.addEventListener("click", (e) => {
    if (e.target === shopModal) socket.send({ type: "shop.close" });
  });
  jobBoardModal.addEventListener("click", (e) => {
    if (e.target === jobBoardModal) {
      socket.send({ type: "jobBoard.close" });
      return;
    }
    const btn = (e.target as HTMLElement).closest("button[data-mission-id]") as HTMLButtonElement | null;
    if (btn?.dataset.missionId) {
      e.preventDefault();
      socket.send({ type: "jobBoard.accept", missionId: btn.dataset.missionId });
    }
  });

  weaponBar.addEventListener("click", onEquipBarClick);
  armorBar.addEventListener("click", onEquipBarClick);
  crewWeaponBar.addEventListener("click", onEquipBarClick);
  crewArmorBar.addEventListener("click", onEquipBarClick);

  openFullEditor.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCrewEditor();
  });
  crewEditorClose.addEventListener("click", () => closeCrewEditor());
  crewEditorModal.addEventListener("click", (e) => {
    if (e.target === crewEditorModal) closeCrewEditor();
  });
}

/* ——— Onboarding wizard ——— */
const ONBOARD_KEY = "lc_onboard_v1";

type OnboardStep = {
  title: string;
  text: string;
  bullets: string[];
  art: string;
};

const ONBOARD_STEPS: OnboardStep[] = [
  {
    title: "Welcome to Skidrow",
    text: "Loose Cannon is a crime-city posse game: recruit muscle, gear up, and survive rival gangs. The city is split into districts — press M for the map.",
    bullets: [
      "Safe Downtown (PvE) — shops, bars, recruit. No murders.",
      "War Zone (PvP) — south of the red line. Rival posses shoot back.",
      "Deep war, docks, and neon edge unlock with street rep.",
    ],
    art: "/art/splash.jpg",
  },
  {
    title: "Build your posse",
    text: "Talk to street NPCs and bar muscle. Hire them, equip better iron, and keep the boss in the middle of the pack.",
    bullets: [
      "E / Use — doors, shops, talk, recruit.",
      "Street meat is ~20% women / 80% men — both can join the crew.",
      "Boss goes DOWNED if bodyguards still stand — they cover you until the wipe.",
    ],
    art: "/art/gangster-female.jpg",
  },
  {
    title: "Move & fight",
    text: "Walk the block, pick fights carefully, and loot better gear when you wipe a crew.",
    bullets: [
      "Desktop: WASD move · click to move · RMB attack-move.",
      "Mobile: tap to move · long-press or Attack button to fire.",
      "Better weapons from wipe loot show a gold GEAR UPGRADE toast.",
    ],
    art: "/art/combat-scene.jpg",
  },
  {
    title: "The nightlife",
    text: "Bars, pawn shops, gun counters, and neon clubs keep the city alive. Charm the staff — or just buy their inventory.",
    bullets: [
      "Interiors open as a full room view (outside is hidden).",
      "Bartenders, fixers, and dealers have their own deals.",
      "Cash is king. Don't die broke.",
    ],
    art: "/art/bartender-female.jpg",
  },
  {
    title: "You're ready",
    text: "After you join, a short first-session guide walks you through the bar, a hire, Rita's job book, and your first contract. Skip anytime.",
    bullets: [
      "Name → The Rusty Nail → hire Vince's meat → Rita Fix → take a job → get paid.",
      "Open FULL loadout for weapons and armor.",
      "Proximity chat for nearby players. Good luck, boss.",
    ],
    art: "/art/gangster-male.jpg",
  },
];

let onboardStep = 0;
let onboardThenJoin = false;

const onboardEl = document.getElementById("onboard") as HTMLElement | null;
const onboardTitle = document.getElementById("onboardTitle");
const onboardText = document.getElementById("onboardText");
const onboardBullets = document.getElementById("onboardBullets");
const onboardArt = document.getElementById("onboardArt") as HTMLImageElement | null;
const onboardProgress = document.getElementById("onboardProgress");
const onboardNext = document.getElementById("onboardNext");
const onboardBack = document.getElementById("onboardBack");
const onboardSkip = document.getElementById("onboardSkip");
const howToPlayBtn = document.getElementById("howToPlayBtn");

function renderOnboard(): void {
  const step = ONBOARD_STEPS[onboardStep];
  if (!step || !onboardEl) return;
  if (onboardTitle) onboardTitle.textContent = step.title;
  if (onboardText) onboardText.textContent = step.text;
  if (onboardArt) onboardArt.src = step.art;
  if (onboardBullets) {
    onboardBullets.innerHTML = step.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  }
  if (onboardProgress) {
    onboardProgress.innerHTML = ONBOARD_STEPS.map(
      (_, i) => `<span class="${i <= onboardStep ? "on" : ""}"></span>`,
    ).join("");
  }
  if (onboardBack) {
    onboardBack.style.visibility = onboardStep === 0 ? "hidden" : "visible";
    onboardBack.toggleAttribute("disabled", onboardStep === 0);
  }
  if (onboardNext) {
    onboardNext.textContent = onboardStep >= ONBOARD_STEPS.length - 1 ? "Let's go" : "Next";
  }
}

function openOnboard(thenJoin: boolean): void {
  onboardThenJoin = thenJoin;
  onboardStep = 0;
  onboardEl?.classList.remove("hidden");
  renderOnboard();
  sfx.play("ui");
}

function closeOnboard(markDone: boolean): void {
  onboardEl?.classList.add("hidden");
  if (markDone) {
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  if (onboardThenJoin) {
    onboardThenJoin = false;
    void startGame();
  }
}

function finishOnboardStep(): void {
  if (onboardStep >= ONBOARD_STEPS.length - 1) {
    closeOnboard(true);
    return;
  }
  onboardStep += 1;
  renderOnboard();
  sfx.play("ui");
}

joinBtn.addEventListener("click", () => {
  myName = nameInput.value.trim() || "Thug";
  loginError.textContent = "";
  let seen = false;
  try {
    seen = localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    seen = false;
  }
  if (!seen) {
    openOnboard(true);
    return;
  }
  void startGame();
});

howToPlayBtn?.addEventListener("click", () => {
  openOnboard(false);
});

onboardNext?.addEventListener("click", () => finishOnboardStep());
onboardBack?.addEventListener("click", () => {
  if (onboardStep > 0) {
    onboardStep -= 1;
    renderOnboard();
    sfx.play("ui");
  }
});
onboardSkip?.addEventListener("click", () => closeOnboard(true));

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

// Event log: show on hover, fade when idle
eventLog.addEventListener("mouseenter", () => {
  eventLog.classList.add("visible");
  eventLog.classList.remove("faded");
  if (eventPanelFadeTimer != null) window.clearTimeout(eventPanelFadeTimer);
});
eventLog.addEventListener("mouseleave", () => {
  bumpEventLogVisible();
});
// Touch: brief tap on log region keeps it visible
eventLog.addEventListener(
  "touchstart",
  () => {
    bumpEventLogVisible();
  },
  { passive: true },
);

nameInput.focus();
