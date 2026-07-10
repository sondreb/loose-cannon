import {
  ARMORS,
  INTERACT_RANGE,
  SHOP_ARMOR_ORDER,
  SHOP_UPGRADE_ORDER,
  SHOP_WEAPON_ORDER,
  UPGRADES,
  WEAPONS,
  type ArmorId,
  type CombatFxEvent,
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
const shopModal = $("shopModal");
const shopTitle = $("shopTitle");
const shopUnitName = $("shopUnitName");
const shopCash = $("shopCash");
const shopWeapons = $("shopWeapons");
const shopArmor = $("shopArmor");
const shopUpgrades = $("shopUpgrades");
const shopBuyerRow = $("shopBuyerRow");
const shopClose = $("shopClose");
const respawnOverlay = $("respawnOverlay");
const respawnCount = $("respawnCount");

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

function pushEvent(text: string): void {
  const d = document.createElement("div");
  d.textContent = text;
  eventLog.appendChild(d);
  while (eventLog.children.length > 8) eventLog.removeChild(eventLog.firstChild!);
  // Heuristic SFX from non-combat log lines (combat audio comes from fx events)
  const t = text.toLowerCase();
  if (t.includes("bought") || t.includes("equip")) sfx.play("buy");
  else if (t.includes("dumpster") || t.includes("crate")) sfx.play("dumpster");
  else if (t.includes("shook") || t.includes("liberated") || t.includes("$")) sfx.play("cash");
  else if (t.includes("entered") || t.includes("left ")) sfx.play("door");
  else if (t.includes("stitch") || t.includes("coach") || t.includes("blessed")) sfx.play("ui");
  // hit/miss/death handled by combat FX to avoid double-playing with VFX path
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

function myUnits(): UnitPublic[] {
  if (!snap) return [];
  // Only living posse members (dead goons are removed server-side; leader may show while respawning)
  return snap.units.filter(
    (u) =>
      u.posseId === snap!.you.posseId &&
      (u.alive || u.isPlayerLeader || u.kind === "player"),
  );
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
  cashRep.innerHTML = `<span class="cash">$${snap.you.cash}</span> <span class="rep">Rep ${snap.you.rep}</span>`;
  const units = myUnits();
  const key = units
    .map(
      (u) =>
        `${u.id}:${u.health}:${u.weapon}:${u.armor}:${u.alive}:${u.stats.aim},${u.stats.guts},${u.stats.muscle},${u.stats.speed},${u.stats.maxHealth}`,
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
    const portrait = portraitDataUrl(u.id + u.name, {
      leader: !!(u.isPlayerLeader || u.kind === "player"),
      dead: !u.alive,
      upgradeTier: tier,
    });
    const card = document.createElement("div");
    card.className =
      "posse-card" +
      (u.id === snap!.you.selectedUnitId ? " selected" : "") +
      (tier > 0 ? " upgraded" : "") +
      (!u.alive ? " dead" : "");
    card.innerHTML = `
      <div class="card-top">
        <div class="portrait-wrap tier-${tier}">
          <img class="portrait" src="${portrait}" alt="" width="48" height="48" draggable="false" />
          <span class="slot-num">${i + 1}</span>
        </div>
        <div class="card-main">
          <div class="name-row">
            <span class="name">${escapeHtml(u.name)}</span>
            ${u.isPlayerLeader || u.kind === "player" ? '<span class="badge boss">BOSS</span>' : ""}
            ${tier > 0 ? `<span class="badge up-tier t${tier}">${tierLabel(tier)}</span>` : '<span class="badge street">Street</span>'}
          </div>
          <div class="stars" title="Upgrade tier">${tierStars(tier)}</div>
          <div class="meta gear-line">
            <span class="wep">🔫 ${escapeHtml(WEAPONS[u.weapon].name)}</span>
            <span class="arm">🛡 ${escapeHtml(ARMORS[u.armor].name)}</span>
          </div>
          ${!u.alive ? '<div class="status-dead">RESPAWNING…</div>' : ""}
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
  });

  crewEditorRoster.innerHTML = "";
  units.forEach((member, i) => {
    const t = upgradeTier(member.stats);
    const img = portraitDataUrl(member.id + member.name, {
      leader: !!(member.isPlayerLeader || member.kind === "player"),
      dead: !member.alive,
      upgradeTier: t,
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

function shopTargetUnitId(): string | null {
  if (!snap) return null;
  const u = selectedUnit();
  if (u) return u.id;
  return snap.you.selectedUnitId || null;
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
  const key = `${snap.shop.shopName}|${u?.id ?? ""}|${ownedW}|${ownedA}|${snap.you.cash}|${rosterKey}|${u?.stats.aim},${u?.stats.guts}`;
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
    const canAfford = snap.you.cash >= w.price;
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "shop-item" + (owned ? " owned" : "") + (!owned && !canAfford ? " broke" : "");
    b.dataset.shopAction = "weapon";
    b.dataset.itemId = id;
    b.innerHTML = `
      <img class="shop-item-icon" src="${weaponIconDataUrl(id, { active: u?.weapon === id, locked: false })}" alt="" width="40" height="40" draggable="false" />
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(w.name)}</div>
        <div class="shop-item-meta">DMG ${w.damage} · RNG ${w.range}</div>
        <div class="shop-item-desc">${escapeHtml(w.description)}</div>
      </div>
      <div class="shop-item-price">${owned ? "EQUIP" : `$${w.price}`}</div>
    `;
    shopWeapons.appendChild(b);
  }

  shopArmor.innerHTML = "";
  for (const id of SHOP_ARMOR_ORDER) {
    const a = ARMORS[id];
    const owned = u?.ownedArmors?.includes(id);
    const canAfford = snap.you.cash >= a.price;
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "shop-item" + (owned ? " owned" : "") + (!owned && !canAfford ? " broke" : "");
    b.dataset.shopAction = "armor";
    b.dataset.itemId = id;
    b.innerHTML = `
      <img class="shop-item-icon" src="${armorIconDataUrl(id, { active: u?.armor === id, locked: false })}" alt="" width="40" height="40" draggable="false" />
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(a.name)}</div>
        <div class="shop-item-meta">−${Math.round(a.damageReduce * 100)}% dmg</div>
        <div class="shop-item-desc">${escapeHtml(a.description)}</div>
      </div>
      <div class="shop-item-price">${owned ? "EQUIP" : a.price <= 0 ? "FREE" : `$${a.price}`}</div>
    `;
    shopArmor.appendChild(b);
  }

  shopUpgrades.innerHTML = "";
  for (const id of SHOP_UPGRADE_ORDER) {
    const up = UPGRADES[id];
    const canAfford = snap.you.cash >= up.price;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "shop-item upgrade" + (!canAfford ? " broke" : "");
    b.dataset.shopAction = "upgrade";
    b.dataset.itemId = id;
    b.innerHTML = `
      <div class="shop-upgrade-glyph">${id === "medkit" ? "+" : "▲"}</div>
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(up.name)}</div>
        <div class="shop-item-desc">${escapeHtml(up.description)}</div>
      </div>
      <div class="shop-item-price">$${up.price}</div>
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
  if (s.you.insideBuildingId) {
    const b = s.buildings.find((bb) => bb.id === s.you.insideBuildingId);
    objective.textContent = b
      ? `INSIDE: ${b.name.toUpperCase()} — E to exit near door`
      : "INSIDE";
    objective.classList.remove("zone-safe", "zone-war");
    objective.classList.add("zone-safe");
    return;
  }
  if (s.you.inSafeZone) {
    objective.textContent = "SAFE DOWNTOWN (PvE) — recruit · shop · no murders";
    objective.classList.remove("zone-war");
    objective.classList.add("zone-safe");
  } else {
    objective.textContent = "WAR ZONE (PvP) — rival gangs · RMB attack · survive";
    objective.classList.remove("zone-safe");
    objective.classList.add("zone-war");
  }
}

function onSnapshot(s: WorldSnapshot): void {
  snap = s;
  view.applySnapshot(s);
  // Combat VFX SFX (visuals applied inside WorldView.applySnapshot)
  if (s.fx?.length) playCombatFxAudio(s.fx);
  renderPosse();
  renderDialogue();
  renderShop();
  updateActionBanner(s);
  updateZoneObjective(s);
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
  if (snap.dialogue || snap.shop) return false;
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
    onClose: () => {
      pushEvent("Disconnected from server.");
    },
  });

  socket.connect(myName);
  bindInput();
}

function bindInput(): void {
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousemove", (e) => {
    if (!view || !snap) return;
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

  canvas.addEventListener("mousedown", (e) => {
    const s = snap;
    if (!s) return;
    if (s.you.respawnIn != null && s.you.respawnIn > 0) return;
    if (s.dialogue || s.shop) return;
    if (e.button === 0) {
      // LMB: select posse / talk NPC / enter building / search prop / move
      const unitId = view.pickUnit(e.clientX, e.clientY);
      if (unitId) {
        const u = s.units.find((x) => x.id === unitId);
        if (u && u.posseId === s.you.posseId) {
          pendingInteract = null;
          socket.send({ type: "intent.select", unitId });
          return;
        }
        if (u && u.kind === "npc") {
          // Click NPC → walk over and talk/recruit
          clickInteractAt(u.x, u.y);
          return;
        }
        // Click enemy: don't LMB-attack (RMB does that); just ignore or face them
        if (u && u.posseId !== s.you.posseId) {
          return;
        }
      }

      const building = view.pickBuilding(e.clientX, e.clientY);
      if (building) {
        clickInteractAt(building.doorX + 0.5, building.doorY + 0.5);
        return;
      }

      const prop = view.pickProp(e.clientX, e.clientY);
      if (prop) {
        clickInteractAt(prop.x, prop.y);
        return;
      }

      // Ground click-to-move: predict instantly + blue marker
      pendingInteract = null;
      keys.up = keys.down = keys.left = keys.right = false;
      if (keyMoving) {
        keyMoving = false;
        socket.send({ type: "intent.dir", dx: 0, dy: 0 });
      }
      const w = view.screenToWorld(e.clientX, e.clientY);
      view.predictClickMove(w.x, w.y);
      socket.send({ type: "intent.move", x: w.x, y: w.y });
    } else if (e.button === 2) {
      pendingInteract = null;
      // RMB: attack-move — pick enemy with generous radius, or fire at ground point
      const w = view.screenToWorld(e.clientX, e.clientY);
      let best: { id: string; d: number } | null = null;
      for (const u of s.units) {
        if (!u.alive || u.posseId === s.you.posseId) continue;
        const d = Math.hypot(u.x - w.x, u.y - w.y);
        if (d < 2.8 && (!best || d < best.d)) best = { id: u.id, d };
      }
      const shooter =
        s.units.find((u) => u.id === s.you.selectedUnitId) ??
        s.units.find((u) => u.posseId === s.you.posseId && u.alive);
      const from = view.leaderWorldPos();
      const weapon = (shooter?.weapon ?? "pistol") as WeaponId;
      // Instant local muzzle so combat reads immediately; server streams ongoing FX
      if (best) {
        const tgt = s.units.find((u) => u.id === best!.id);
        if (from && tgt) {
          view.playLocalShot(from.x, from.y, tgt.x, tgt.y, weapon);
          weaponFireSfx(weapon);
        }
        socket.send({ type: "intent.fire", targetId: best.id });
      } else if (from) {
        view.playLocalShot(from.x, from.y, w.x, w.y, weapon);
        weaponFireSfx(weapon);
        socket.send({ type: "intent.fire", x: w.x, y: w.y });
      } else {
        socket.send({ type: "intent.fire", x: w.x, y: w.y });
      }
    }
  });

  // Browsers block audio until a gesture — unlock often so combat SFX always work
  const unlockAudio = () => sfx.unlock();
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

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
    }
    // Syndicate-style: number row 5–0 / - for weapon slots when unit selected
    if (!crewEditorOpen && !snap?.dialogue && !snap?.shop) {
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

  // Event delegation — survives re-renders and only wires once
  shopWeapons.addEventListener("click", onShopClick);
  shopArmor.addEventListener("click", onShopClick);
  shopUpgrades.addEventListener("click", onShopClick);
  shopBuyerRow.addEventListener("click", onShopClick);
  shopModal.addEventListener("click", (e) => {
    if (e.target === shopModal) socket.send({ type: "shop.close" });
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

joinBtn.addEventListener("click", () => {
  myName = nameInput.value.trim() || "Thug";
  loginError.textContent = "";
  void startGame();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

nameInput.focus();
