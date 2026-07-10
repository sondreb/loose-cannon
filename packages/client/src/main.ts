import {
  ARMORS,
  combatPreviewLine,
  DAY_PHASE_LABEL,
  dayPhaseFromTick,
  DEFAULT_REALM_ID,
  heatBand,
  INTERACT_RANGE,
  realmLabel,
  SHOP_ARMOR_ORDER,
  SHOP_UPGRADE_ORDER,
  SHOP_WEAPON_ORDER,
  shopPrice,
  statEffectLines,
  streetRole,
  UPGRADES,
  WEAPONS,
  type ArmorId,
  type CombatFxEvent,
  type DayPhase,
  type ServerMessage,
  type UnitPublic,
  type UnitStats,
  type UpgradeId,
  type WeaponId,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { music, sfx } from "./audio.js";
import { goonBackstory } from "./backstory.js";
import { voice } from "./voice.js";
import { statBonus, upgradeTier } from "./avatar.js";
import { crewPortraitUrl, isFemaleUnit } from "./crewPortraits.js";
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
const realmInput = $("realmInput") as HTMLInputElement;
const joinBtn = $("joinBtn");
const loginError = $("loginError");
const realmHudLabel = $("realmHudLabel");
const realmInviteBtn = $("realmInviteBtn");
const settingsBtnDesktop = document.getElementById("settingsBtnDesktop") as HTMLButtonElement | null;
const mobSettings = document.getElementById("mobSettings") as HTMLButtonElement | null;
const settingsModal = $("settingsModal");
const settingsClose = $("settingsClose");
const settingsNameInput = $("settingsNameInput") as HTMLInputElement;
const settingsRenameBtn = $("settingsRenameBtn");
const settingsMusic = $("settingsMusic") as HTMLInputElement;
const settingsSfx = $("settingsSfx") as HTMLInputElement;
const settingsVoice = $("settingsVoice") as HTMLInputElement;
const settingsRealmLabel = $("settingsRealmLabel");
const settingsInviteBtn = $("settingsInviteBtn");
const settingsHowToBtn = $("settingsHowToBtn");
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
const goonProfileModal = $("goonProfileModal");
const goonProfileClose = $("goonProfileClose");
const goonProfileBody = $("goonProfileBody");
const goonProfileSelect = $("goonProfileSelect");
const goonProfileLoadout = $("goonProfileLoadout");
const eventLog = $("eventLog");
const chatLog = $("chatLog");
const chatForm = $("chatForm") as HTMLFormElement;
const chatInput = $("chatInput") as HTMLInputElement;
const objective = $("objective");
const actionBanner = $("actionBanner");
const actionStatus = $("actionStatus");
const actionDetail = $("actionDetail");
const interiorPlace = document.getElementById("interiorPlace") as HTMLElement | null;
const interiorPlaceName = document.getElementById("interiorPlaceName") as HTMLElement | null;
const dialogueModal = $("dialogueModal");
const dlgName = $("dlgName");
const dlgText = $("dlgText");
const dlgChoices = $("dlgChoices");
const dlgClose = $("dlgClose");
const dlgPortraitWrap = $("dlgPortraitWrap");
const dlgPortrait = $("dlgPortrait") as HTMLImageElement;
const dlgProfileMeta = $("dlgProfileMeta");
const dlgProfileRole = $("dlgProfileRole");
const dlgProfileStage = $("dlgProfileStage");
const dlgProfileHeader = $("dlgProfileHeader");

/** Static named-NPC art for dialogue (public/art). */
const DIALOGUE_PORTRAITS: Record<string, string> = {
  npc_bartender: "/art/bartender-male.jpg",
  npc_club: "/art/bartender-female.jpg",
  npc_fixer: "/art/club-female-2.jpg",
  npc_gun: "/art/bartender-female-2.jpg",
};

/** Unit / dialogue face: named NPC art, else stable crew portrait pool. */
function unitFaceUrl(
  key: string,
  opts?: { gender?: string | null; name?: string; leader?: boolean; dead?: boolean },
): string {
  const named = opts?.name ? DIALOGUE_PORTRAITS[key] : undefined;
  if (named) return named;
  // Named keys (npc_bartender etc.)
  if (DIALOGUE_PORTRAITS[key]) return DIALOGUE_PORTRAITS[key]!;
  const female = isFemaleUnit(opts?.gender, opts?.name);
  return crewPortraitUrl(key, female);
}

/** Realistic (clothed) profile photos for Titty Twister talent — stage 0..2 */
function dancerProfileUrl(key: string, stage: number): string {
  const k = ["a", "b", "c"].includes(key) ? key : "a";
  const s = Math.max(0, Math.min(2, Math.floor(stage)));
  return `/art/club/profiles/portrait-${k}-${s}.jpg`;
}

function dialoguePortraitUrl(
  npcId: string,
  npcName: string,
  gender?: string | null,
  opts?: { dancerKey?: string; revealStage?: number },
): string {
  if (opts?.dancerKey) {
    return dancerProfileUrl(opts.dancerKey, opts.revealStage ?? 0);
  }
  if (DIALOGUE_PORTRAITS[npcId]) return DIALOGUE_PORTRAITS[npcId]!;
  const n = npcName.toLowerCase();
  if (n.includes("vince") || n.includes("barman")) return "/art/bartender-male.jpg";
  if (n.includes("venus") || n.includes("static")) return "/art/bartender-female.jpg";
  if (n.includes("rita")) return "/art/club-female-2.jpg";
  if (n.includes("kate") || n.includes("caliber")) return "/art/bartender-female-2.jpg";
  if (n.includes("cherry")) return dancerProfileUrl("a", 0);
  if (n.includes("sable")) return dancerProfileUrl("b", 0);
  if (n.includes("lola")) return dancerProfileUrl("c", 0);
  // Hireable street meat / generic talkers — painted crew faces
  return crewPortraitUrl(npcId + npcName, isFemaleUnit(gender, npcName));
}

const DANCER_STAGE_LABELS = [
  "Stage look · full dress",
  "After tips · more skin",
  "Floor show · max stagewear",
] as const;
const shopModal = $("shopModal");
const shopTitle = $("shopTitle");
const shopUnitName = $("shopUnitName");
const shopCash = $("shopCash");
const shopWeapons = $("shopWeapons");
const shopArmor = $("shopArmor");
const shopUpgrades = $("shopUpgrades");
const shopBuyerRow = $("shopBuyerRow");
const shopClose = $("shopClose");
const stashModal = $("stashModal");
const stashPocketCash = $("stashPocketCash");
const stashCashAmt = $("stashCashAmt");
const stashUnitName = $("stashUnitName");
const stashCarried = $("stashCarried");
const stashStored = $("stashStored");
const stashClose = $("stashClose");
const stashDepositAllCash = $("stashDepositAllCash");
const stashWithdrawAllCash = $("stashWithdrawAllCash");
const stashDepositLoadout = $("stashDepositLoadout");
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
const confirmModal = $("confirmModal");
const confirmKicker = $("confirmKicker");
const confirmTitle = $("confirmTitle");
const confirmBody = $("confirmBody");
const confirmCancel = $("confirmCancel");
const confirmOk = $("confirmOk");
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
/** Realm string sent at auth (raw input; server normalizes) */
let myRealmInput = "";
/** Confirmed realm from auth.ok / snapshot */
let myRealmId = DEFAULT_REALM_ID;
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

/** After click-to-interact: walk here then send intent.interact (optional NPC target) */
let pendingInteract: { x: number; y: number; targetUnitId?: string } | null = null;

/** Mobile: next map tap is attack-move instead of walk */
let mobileAttackMode = false;
let touchStart: {
  x: number;
  y: number;
  t: number;
  id: number;
  cancelled: boolean;
  longFired: boolean;
} | null = null;
let longPressTimer: number | null = null;
let longPressRingTimer: number | null = null;
let longPressRing: HTMLDivElement | null = null;
const LONG_PRESS_MS = 380;
const LONG_PRESS_RING_DELAY_MS = 90;
/** Fat-finger tolerance — slightly larger than desktop click */
const TAP_SLOP_PX = 22;
/** Event log pinned open (tap on mobile / click desktop) */
let eventLogPinned = false;

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
  if (snap.dialogue || snap.shop || snap.stash || snap.jobBoard) return;
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
  // Shop stays modal; dialogue allows retargeting another NPC (Vince → Rita)
  if (s.shop) return;

  if (asAttack || mobileAttackMode) {
    if (s.dialogue) return;
    fireAttackAtClient(clientX, clientY);
    return;
  }

  // Indoors: check EXIT before units — posse tags/sprites were eating door clicks
  if (s.you.insideBuildingId && !s.dialogue) {
    const exitB = view.pickBuilding(clientX, clientY);
    if (exitB) {
      const ex = exitB.exitX ?? exitB.doorX;
      const ey = exitB.exitY ?? exitB.doorY;
      // No targetUnitId — server prefers leave when near the mat
      clickInteractAt(ex + 0.5, ey + 0.5);
      return;
    }
  }

  // Indoors: slightly larger pick so counters/bar NPCs are easy to talk to
  const pickR = s.you.insideBuildingId ? 2.15 : 1.75;
  const unitId = view.pickUnit(clientX, clientY, pickR);
  if (unitId) {
    const u = s.units.find((x) => x.id === unitId);
    if (u && u.posseId === s.you.posseId) {
      if (s.dialogue) return;
      pendingInteract = null;
      socket.send({ type: "intent.select", unitId });
      return;
    }
    if (u && u.kind === "npc") {
      // Closing an open chat first so click-to-Rita isn't swallowed by the modal
      if (s.dialogue) {
        socket.send({ type: "dialogue.close" });
      }
      // Walk up and open chat / profile (dancers include tip options).
      // Pass unit id so server talks to Rita even when Vince is slightly nearer.
      clickInteractAt(u.x, u.y, u.id);
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

  if (s.dialogue) return;

  const building = view.pickBuilding(clientX, clientY);
  if (building) {
    // Outdoor enter door
    clickInteractAt(building.doorX + 0.5, building.doorY + 0.5);
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

const EVENT_LINE_FADE_MS = 12000;
const EVENT_PANEL_IDLE_MS = 10000;
const EVENT_LOG_MAX_LINES = 10;
let eventPanelFadeTimer: number | null = null;

function classifyEventLine(text: string): string {
  const t = text.toLowerCase();
  if (
    t.includes("hit ") ||
    t.includes("miss") ||
    t.includes("kill") ||
    t.includes("down") ||
    t.includes("wipe") ||
    t.includes("shot") ||
    t.includes("brick") ||
    t.includes("blocked") ||
    t.includes("aggro") ||
    t.includes("attack mode")
  ) {
    return "combat";
  }
  if (
    t.includes("contract") ||
    t.includes("job ") ||
    t.includes("mission") ||
    t.includes("extract") ||
    t.includes("objective") ||
    t.includes("tutorial")
  ) {
    return "mission";
  }
  if (
    t.includes("$") ||
    t.includes("cash") ||
    t.includes("loot") ||
    t.includes("bought") ||
    t.includes("paid") ||
    t.includes("liberated") ||
    t.includes("shook") ||
    t.includes("rep")
  ) {
    return "cash";
  }
  if (t.includes("entered") || t.includes("left ") || t.includes("door") || t.includes("exit")) {
    return "door";
  }
  if (t.includes("disconnect") || t.includes("connect") || t.includes("realm") || t.includes("invite")) {
    return "system";
  }
  return "info";
}

function setEventLogPinned(pinned: boolean): void {
  eventLogPinned = pinned;
  eventLog.classList.toggle("pinned", pinned);
  if (pinned) {
    eventLog.classList.add("visible");
    eventLog.classList.remove("faded");
    if (eventPanelFadeTimer != null) {
      window.clearTimeout(eventPanelFadeTimer);
      eventPanelFadeTimer = null;
    }
  } else {
    bumpEventLogVisible();
  }
}

function bumpEventLogVisible(): void {
  if (eventLogPinned) {
    eventLog.classList.add("visible");
    eventLog.classList.remove("faded");
    return;
  }
  eventLog.classList.add("visible");
  eventLog.classList.remove("faded");
  if (eventPanelFadeTimer != null) window.clearTimeout(eventPanelFadeTimer);
  eventPanelFadeTimer = window.setTimeout(() => {
    if (eventLogPinned) return;
    if (!eventLog.matches(":hover")) {
      eventLog.classList.add("faded");
      eventLog.classList.remove("visible");
    }
  }, EVENT_PANEL_IDLE_MS);
}

function pushEvent(text: string): void {
  const d = document.createElement("div");
  d.textContent = text;
  const kind = classifyEventLine(text);
  d.className = `event-line kind-${kind}`;
  d.setAttribute("data-kind", kind);
  eventLog.appendChild(d);
  while (eventLog.children.length > EVENT_LOG_MAX_LINES) {
    eventLog.removeChild(eventLog.firstChild!);
  }
  // Keep newest lines in view when overflowing
  eventLog.scrollTop = eventLog.scrollHeight;
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

/** How long combat/loot toasts stay readable (ms). Long enough to read mid-fight. */
function notifyHoldMs(kind: string, upgrade = false): number {
  if (kind === "killed") return 11000;
  if (kind === "downed") return 8000;
  if (kind === "loot") return upgrade ? 9000 : 7000;
  if (kind === "mission") return 7500;
  return 4500;
}

function ensureLongPressRing(): HTMLDivElement {
  if (longPressRing) return longPressRing;
  const el = document.createElement("div");
  el.id = "longPressRing";
  el.className = "long-press-ring hidden";
  el.setAttribute("aria-hidden", "true");
  const game = document.getElementById("game");
  (game ?? document.body).appendChild(el);
  longPressRing = el;
  return el;
}

function showLongPressRing(clientX: number, clientY: number): void {
  const el = ensureLongPressRing();
  const game = document.getElementById("game");
  const rect = game?.getBoundingClientRect();
  const x = rect ? clientX - rect.left : clientX;
  const y = rect ? clientY - rect.top : clientY;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.classList.remove("hidden", "armed");
  // restart CSS animation
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  el.classList.add("charging");
}

function armLongPressRing(): void {
  longPressRing?.classList.add("armed");
  longPressRing?.classList.remove("charging");
}

function hideLongPressRing(): void {
  if (!longPressRing) return;
  longPressRing.classList.add("hidden");
  longPressRing.classList.remove("charging", "armed");
}

function clearLongPressTimer(): void {
  if (longPressTimer != null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (longPressRingTimer != null) {
    window.clearTimeout(longPressRingTimer);
    longPressRingTimer = null;
  }
  hideLongPressRing();
}

function showNotify(msg: Extract<ServerMessage, { type: "notify" }>): void {
  sfx.unlock();
  const el = document.createElement("div");
  el.className = "notify-toast";
  let holdMs = notifyHoldMs(msg.kind);

  if (msg.kind === "loot") {
    const hasUpgrade = msg.upgrades.some((u) => u.upgrade);
    holdMs = notifyHoldMs("loot", hasUpgrade);
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

  // CSS fade starts just before DOM removal (hold − fade duration)
  const fadeMs = 500;
  const fadeDelaySec = Math.max(0.5, (holdMs - fadeMs) / 1000);
  el.style.setProperty("--toast-hold", `${fadeDelaySec}s`);
  el.style.animation = `toast-in 0.35s ease-out, toast-out 0.5s ease-in ${fadeDelaySec}s forwards`;

  notifyToasts.appendChild(el);
  window.setTimeout(() => el.remove(), holdMs);
  // Keep more history so a wipe toast is not immediately pushed off by loot spam
  while (notifyToasts.children.length > 6) notifyToasts.firstChild?.remove();
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

function miniStat(
  label: string,
  value: number,
  baseline = 5,
  effectKey?: keyof UnitStats,
): string {
  const b = statBonus(value, baseline);
  const cls = b > 0 ? "up" : b < 0 ? "down" : "";
  const effect = effectKey ? statEffectLines(effectKey, value) : null;
  const tip = effect
    ? `${effect.title} ${value}\n${effect.lines.join("\n")}`
    : `${label} ${value} (${b >= 0 ? "+" : ""}${b} vs baseline)`;
  return `<div class="mini-stat ${cls}" title="${escapeAttr(tip)}"><span class="k">${label}</span><span class="v">${value}</span>${b > 0 ? `<span class="pip">▲${b}</span>` : ""}</div>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/\n/g, " · ");
}

/**
 * In-game confirm dialog. Never use window.confirm / alert / prompt —
 * they break immersion and look broken on fullscreen/mobile.
 */
type ConfirmOpts = {
  kicker?: string;
  title: string;
  body: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

let confirmResolve: ((ok: boolean) => void) | null = null;

function closeConfirm(result: boolean): void {
  confirmModal.classList.add("hidden");
  const r = confirmResolve;
  confirmResolve = null;
  r?.(result);
}

function showConfirm(opts: ConfirmOpts): Promise<boolean> {
  // Replace any pending confirm
  if (confirmResolve) closeConfirm(false);

  confirmKicker.textContent = opts.kicker ?? "CONFIRM";
  confirmTitle.textContent = opts.title;
  confirmBody.textContent = opts.body;
  confirmOk.textContent = opts.okLabel ?? "CONFIRM";
  confirmCancel.textContent = opts.cancelLabel ?? "CANCEL";
  confirmOk.classList.toggle("danger", !!opts.danger);
  confirmModal.classList.remove("hidden");
  sfx.play("ui");

  return new Promise<boolean>((resolve) => {
    confirmResolve = resolve;
  });
}

let lastPosseKey = "";

function renderPosse(): void {
  if (!snap) return;
  const h = snap.you.heat ?? 0;
  const band = heatBand(h);
  const stash = snap.you.stashCash ?? 0;
  const phase: DayPhase = snap.dayPhase ?? dayPhaseFromTick(snap.tick);
  const phaseLabel = DAY_PHASE_LABEL[phase] ?? phase.toUpperCase();
  cashRep.innerHTML = `<span class="cash" title="Pocket cash — lost on wipe">$${snap.you.cash}</span>${
    stash > 0
      ? ` <span class="stash-cash" title="Crash Pad stash — safe on wipe">⌂$${stash}</span>`
      : ""
  } <span class="rep">Rep ${snap.you.rep}</span> <span class="heat heat-${band}" title="Street heat — cool off at the bar">Heat ${h}</span> <span class="day-phase day-${phase}" title="City day/night cycle (~6 min) — neon brighter at night">${phaseLabel}</span>`;
  updateRealmHud(snap.you.realmId ?? myRealmId);
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
    const role = streetRole(u.stats);
    const isMelee = u.weapon === "pipe" || u.weapon === "switchblade";
    const preview = combatPreviewLine(u.stats, isMelee);
    const portrait = unitFaceUrl(u.id + u.name, {
      gender: u.gender,
      name: u.name,
      leader: boss,
      dead: !u.alive,
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
        <button type="button" class="portrait-wrap clickable tier-${tier}" data-profile-unit="${escapeAttr(u.id)}" title="Open profile" aria-label="Open profile for ${escapeAttr(u.name)}">
          <img class="portrait photo" src="${portrait}" alt="" width="48" height="48" draggable="false" />
          <span class="slot-num">${i + 1}</span>
        </button>
        <div class="card-main">
          <div class="name-row">
            <span class="name">${escapeHtml(u.name)}</span>
            ${boss ? '<span class="badge boss">BOSS</span>' : ""}
            ${u.incapacitated ? '<span class="badge downed">DOWNED</span>' : ""}
            <span class="badge role role-${role.id}" title="${escapeAttr(role.blurb)}">${escapeHtml(role.label)}</span>
            ${tier > 0 ? `<span class="badge up-tier t${tier}">${tierLabel(tier)}</span>` : ""}
          </div>
          <div class="stars" title="Upgrade tier">${tierStars(tier)}</div>
          <div class="meta gear-line">
            <span class="wep">🔫 ${escapeHtml(WEAPONS[u.weapon].name)}</span>
            <span class="arm">🛡 ${escapeHtml(ARMORS[u.armor].name)}</span>
          </div>
          <div class="combat-preview" title="${escapeAttr(preview)}">${escapeHtml(preview)}</div>
          ${!u.alive ? '<div class="status-dead">RESPAWNING…</div>' : ""}
          ${u.incapacitated && u.alive ? '<div class="status-dead">CAN\'T FIGHT — covered by crew</div>' : ""}
        </div>
      </div>
      <div class="mini-stats">
        ${miniStat("AIM", u.stats.aim, 5, "aim")}
        ${miniStat("GUT", u.stats.guts, 5, "guts")}
        ${miniStat("MUS", u.stats.muscle, 5, "muscle")}
        ${miniStat("SPD", u.stats.speed, 5, "speed")}
      </div>
      <div class="hp" title="HP ${Math.round(u.health)} / ${u.maxHealth}">
        <span style="width:${Math.max(0, (u.health / u.maxHealth) * 100)}%"></span>
      </div>
      <div class="hp-label">${Math.round(u.health)}/${u.maxHealth} HP</div>
    `;
    card.addEventListener("click", (ev) => {
      const profileBtn = (ev.target as HTMLElement | null)?.closest?.(
        "[data-profile-unit]",
      ) as HTMLElement | null;
      if (profileBtn?.dataset.profileUnit) {
        ev.preventDefault();
        ev.stopPropagation();
        openGoonProfile(profileBtn.dataset.profileUnit);
        return;
      }
      socket?.send({ type: "intent.select", unitId: u.id });
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

function statBarHtml(
  label: string,
  value: number,
  max = 20,
  baseline = 5,
  effectKey?: keyof UnitStats,
): string {
  const b = statBonus(value, baseline);
  const pct = Math.min(100, Math.round((value / max) * 100));
  const boostPct = Math.min(100, Math.round((Math.max(0, baseline) / max) * 100));
  const effect = effectKey ? statEffectLines(effectKey, value) : null;
  const tip = effect
    ? `${effect.title} ${value} · ${effect.lines.join(" · ")}`
    : `${value} (baseline ${baseline})`;
  return `
    <div class="stat-bar-row ${b > 0 ? "boosted" : ""}" title="${escapeAttr(tip)}">
      <span class="stat-bar-label">${label}</span>
      <div class="stat-bar-track">
        <div class="stat-bar-base" style="width:${boostPct}%"></div>
        <div class="stat-bar-fill" style="width:${pct}%"></div>
      </div>
      <b class="stat-bar-val">${value}</b>
      ${formatBonus(b)}
    </div>`;
}

let lastGearKey = "";
let crewEditorOpen = false;
/** Unit id for open posse profile dossier (null = closed) */
let goonProfileUnitId: string | null = null;

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

  const portrait = unitFaceUrl(u.id + u.name, {
    gender: u.gender,
    name: u.name,
    leader: !!(u.isPlayerLeader || u.kind === "player"),
    dead: !u.alive,
  });

  const role = streetRole(u.stats);
  const isMelee = u.weapon === "pipe" || u.weapon === "switchblade";
  const preview = combatPreviewLine(u.stats, isMelee);
  statsView.innerHTML = `
    <div class="gear-profile">
      <img class="portrait photo lg clickable" src="${portrait}" alt="" width="56" height="56" draggable="false" data-profile-unit="${escapeAttr(u.id)}" title="Open profile" />
      <div>
        <div class="gear-name">${escapeHtml(u.name)}</div>
        <div class="badge-row">
          <span class="badge role role-${role.id}" title="${escapeAttr(role.blurb)}">${escapeHtml(role.label)}</span>
          <span class="badge up-tier t${tier}">${tierLabel(tier)} ${tierStars(tier)}</span>
        </div>
        <div class="combat-preview gear" title="${escapeAttr(preview)}">${escapeHtml(preview)}</div>
        <div class="muted tiny">Click face for dossier · Train at Pawn-O-Matic / gym</div>
      </div>
    </div>
    <div class="stat-bars">
      ${statBarHtml("Aim", u.stats.aim, 20, 5, "aim")}
      ${statBarHtml("Guts", u.stats.guts, 20, 5, "guts")}
      ${statBarHtml("Muscle", u.stats.muscle, 20, 5, "muscle")}
      ${statBarHtml("Brains", u.stats.brains, 20, 5, "brains")}
      ${statBarHtml("Speed", u.stats.speed, 20, 5, "speed")}
      ${statBarHtml("Max HP", u.stats.maxHealth, 200, 100, "maxHealth")}
    </div>
  `;
  statsView.querySelector("[data-profile-unit]")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const id = (ev.currentTarget as HTMLElement).dataset.profileUnit;
    if (id) openGoonProfile(id);
  });

  fillWeaponBar(weaponBar, weaponDetail, u, false);
  fillArmorBar(armorBar, armorDetail, u, false);

  if (crewEditorOpen) renderCrewEditor();
  if (goonProfileUnitId) renderGoonProfile();
}

function openGoonProfile(unitId: string): void {
  goonProfileUnitId = unitId;
  goonProfileModal.classList.remove("hidden");
  sfx.play("ui");
  renderGoonProfile();
}

function closeGoonProfile(): void {
  goonProfileUnitId = null;
  goonProfileModal.classList.add("hidden");
}

function renderGoonProfile(): void {
  if (!snap || !goonProfileUnitId) return;
  const u =
    myUnits().find((x) => x.id === goonProfileUnitId) ??
    snap.units.find((x) => x.id === goonProfileUnitId);
  if (!u || u.posseId !== snap.you.posseId) {
    closeGoonProfile();
    return;
  }

  const boss = !!(u.isPlayerLeader || u.kind === "player");
  const tier = upgradeTier(u.stats);
  const role = streetRole(u.stats);
  const isMelee = u.weapon === "pipe" || u.weapon === "switchblade";
  const preview = combatPreviewLine(u.stats, isMelee);
  const portrait = unitFaceUrl(u.id + u.name, {
    gender: u.gender,
    name: u.name,
    leader: boss,
    dead: !u.alive,
  });
  const story = goonBackstory({
    id: u.id,
    name: u.name,
    gender: u.gender,
    stats: u.stats,
    boss,
  });
  const status = !u.alive
    ? "RESPAWNING"
    : u.incapacitated
      ? "DOWNED — covered by crew"
      : "ACTIVE ON THE STREETS";

  goonProfileBody.innerHTML = `
    <div class="goon-profile-hero">
      <img class="portrait photo xxl" src="${portrait}" alt="${escapeAttr(u.name)}" width="128" height="128" draggable="false" />
      <div class="goon-profile-id">
        <h3 id="goonProfileName">${escapeHtml(u.name)}</h3>
        <div class="goon-profile-meta badge-row">
          ${boss ? '<span class="badge boss">BOSS</span>' : '<span class="badge">GOON</span>'}
          <span class="badge role role-${role.id}">${escapeHtml(role.label)}</span>
          <span class="badge up-tier t${tier}">${tierLabel(tier)} ${tierStars(tier)}</span>
        </div>
        <p class="goon-profile-status muted">${escapeHtml(status)}</p>
        <p class="muted tiny">HP ${Math.round(u.health)}/${u.maxHealth}</p>
        <p class="combat-preview gear" title="${escapeAttr(preview)}">${escapeHtml(preview)}</p>
      </div>
    </div>

    <div class="goon-profile-section">
      <h4>Backstory</h4>
      <p class="goon-profile-backstory">${escapeHtml(story)}</p>
    </div>

    <div class="goon-profile-section">
      <h4>Loadout</h4>
      <div class="goon-profile-gear">
        <div class="g-item">
          <span class="g-label">WEAPON</span>
          ${escapeHtml(WEAPONS[u.weapon].name)}
        </div>
        <div class="g-item">
          <span class="g-label">ARMOR</span>
          ${escapeHtml(ARMORS[u.armor].name)}
        </div>
      </div>
    </div>

    <div class="goon-profile-section">
      <h4>Details · ${escapeHtml(role.label)}</h4>
      <p class="stat-role-blurb muted tiny">${escapeHtml(role.blurb)}</p>
      <div class="stat-bars wide">
        ${statBarHtml("Aim", u.stats.aim, 20, 5, "aim")}
        ${statBarHtml("Guts", u.stats.guts, 20, 5, "guts")}
        ${statBarHtml("Muscle", u.stats.muscle, 20, 5, "muscle")}
        ${statBarHtml("Brains", u.stats.brains, 20, 5, "brains")}
        ${statBarHtml("Speed", u.stats.speed, 20, 5, "speed")}
        ${statBarHtml("Max HP", u.stats.maxHealth, 200, 100, "maxHealth")}
      </div>
      <p class="muted tiny stat-legend">Aim=hit/crit · Guts=dodge+tough · Muscle=dmg/pierce · Speed=move+fire rate</p>
    </div>
  `;
}

function renderCrewEditor(): void {
  if (!snap || !crewEditorOpen) return;
  const u = selectedUnit();
  if (!u) return;
  const units = myUnits();
  const tier = upgradeTier(u.stats);
  const portrait = unitFaceUrl(u.id + u.name, {
    gender: u.gender,
    name: u.name,
    leader: !!(u.isPlayerLeader || u.kind === "player"),
    dead: !u.alive,
  });

  crewEditorRoster.innerHTML = "";
  units.forEach((member, i) => {
    const t = upgradeTier(member.stats);
    const mRole = streetRole(member.stats);
    const img = unitFaceUrl(member.id + member.name, {
      gender: member.gender,
      name: member.name,
      leader: !!(member.isPlayerLeader || member.kind === "player"),
      dead: !member.alive,
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "crew-roster-card" + (member.id === u.id ? " active" : "") + (!member.alive ? " dead" : "");
    btn.innerHTML = `
      <img class="photo" src="${img}" alt="" width="40" height="40" draggable="false" />
      <div>
        <div class="name">${i + 1}. ${escapeHtml(member.name)}</div>
        <div class="muted tiny">${escapeHtml(mRole.label)} · ${escapeHtml(WEAPONS[member.weapon].name)} · ${tierLabel(t)}</div>
      </div>
    `;
    btn.addEventListener("click", () => {
      socket.send({ type: "intent.select", unitId: member.id });
    });
    crewEditorRoster.appendChild(btn);
  });

  const profileRole = streetRole(u.stats);
  crewEditorProfile.innerHTML = `
    <div class="crew-profile-hero">
      <img class="portrait photo xl clickable" src="${portrait}" alt="" width="72" height="72" draggable="false" data-profile-unit="${escapeAttr(u.id)}" title="Open dossier" />
      <div>
        <h3>${escapeHtml(u.name)}</h3>
        <div class="badge-row">
          <span class="badge role role-${profileRole.id}" title="${escapeAttr(profileRole.blurb)}">${escapeHtml(profileRole.label)}</span>
          <span class="badge up-tier t${tier}">${tierLabel(tier)} ${tierStars(tier)}</span>
        </div>
        <p class="muted">HP ${Math.round(u.health)}/${u.maxHealth} · ${u.alive ? "Active" : "Respawning"}</p>
        <p class="muted tiny">${escapeHtml(profileRole.blurb)} · Click face for full dossier</p>
      </div>
    </div>
  `;
  crewEditorProfile.querySelector("[data-profile-unit]")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const id = (ev.currentTarget as HTMLElement).dataset.profileUnit;
    if (id) openGoonProfile(id);
  });

  fillWeaponBar(crewWeaponBar, crewWeaponDetail, u, true);
  fillArmorBar(crewArmorBar, crewArmorDetail, u, true);

  const role = streetRole(u.stats);
  const isMelee = u.weapon === "pipe" || u.weapon === "switchblade";
  const preview = combatPreviewLine(u.stats, isMelee);
  crewEditorStats.innerHTML = `
    <div class="equip-label">ATTRIBUTES · ${escapeHtml(role.label)}</div>
    <p class="stat-role-blurb muted tiny">${escapeHtml(role.blurb)}</p>
    <p class="combat-preview crew" title="${escapeAttr(preview)}">${escapeHtml(preview)}</p>
    <div class="stat-bars wide">
      ${statBarHtml("Aim", u.stats.aim, 20, 5, "aim")}
      ${statBarHtml("Guts", u.stats.guts, 20, 5, "guts")}
      ${statBarHtml("Muscle", u.stats.muscle, 20, 5, "muscle")}
      ${statBarHtml("Brains", u.stats.brains, 20, 5, "brains")}
      ${statBarHtml("Speed", u.stats.speed, 20, 5, "speed")}
      ${statBarHtml("Max HP", u.stats.maxHealth, 200, 100, "maxHealth")}
    </div>
    <p class="muted tiny stat-legend">Aim=hit/crit · Guts=dodge+tough · Muscle=dmg/pierce · Speed=move+fire rate</p>
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
    if (!dialogueModal.classList.contains("hidden")) voice.stop();
    dialogueModal.classList.add("hidden");
    dialogueModal.querySelector(".dialogue-card")?.classList.remove("is-dancer", "has-portrait");
    dlgProfileHeader?.classList.add("hidden");
    dlgProfileMeta?.classList.add("hidden");
    lastDialogueKey = "";
    return;
  }
  const d = snap.dialogue;
  const key = `${d.npcId}|${d.text}|${d.choices.map((c) => c.id + ":" + c.label).join(";")}|${d.voiceLineId ?? ""}`;
  dialogueModal.classList.remove("hidden");
  if (key === lastDialogueKey) return;
  lastDialogueKey = key;

  if (d.voiceLineId) {
    sfx.unlock();
    voice.play(d.voiceLineId, { force: true });
  }

  const portrait = dialoguePortraitUrl(d.npcId, d.npcName, d.gender, {
    dancerKey: d.dancerKey,
    revealStage: d.revealStage,
  });
  dlgPortraitWrap.classList.remove("hidden");
  if (dlgPortrait.getAttribute("src") !== portrait) {
    dlgPortrait.src = portrait;
  }
  dlgPortrait.alt = d.npcName;
  const card = dialogueModal.querySelector(".dialogue-card");
  card?.classList.add("has-portrait");
  const isDancer = !!d.dancerKey;
  card?.classList.toggle("is-dancer", isDancer);
  if (isDancer) {
    dlgProfileHeader.classList.remove("hidden");
    dlgProfileMeta.classList.remove("hidden");
    dlgProfileRole.textContent = "Featured talent";
    const st = Math.max(0, Math.min(2, Math.floor(d.revealStage ?? 0)));
    dlgProfileStage.textContent = DANCER_STAGE_LABELS[st] ?? DANCER_STAGE_LABELS[0]!;
  } else {
    dlgProfileHeader.classList.add("hidden");
    dlgProfileMeta.classList.add("hidden");
  }

  dlgName.textContent = d.npcName;
  dlgText.textContent = d.text;
  dlgChoices.innerHTML = "";
  for (const c of d.choices) {
    const b = document.createElement("button");
    b.type = "button";
    // Friendlier labels for club talent
    const toneTag = isDancer
      ? c.id === "tip_dancer"
        ? "💵"
        : c.id === "flirt_dancer"
          ? "💋"
          : "·"
      : `[${c.tone}]`;
    b.textContent = isDancer ? `${toneTag} ${c.label}` : `[${c.tone}] ${c.label}`;
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
    const face = unitFaceUrl(m.id + m.name, { gender: m.gender, name: m.name, dead: true });
    card.innerHTML = `
      <img class="photo memorial-face" src="${face}" alt="" width="48" height="48" draggable="false" />
      <div class="memorial-body">
        <div class="memorial-name">${escapeHtml(m.name)}</div>
        <p class="memorial-epitaph">"${escapeHtml(m.epitaph)}"</p>
        <p class="memorial-cause">${escapeHtml(m.cause)}</p>
        <p class="muted tiny">${who} will be remembered. Briefly.</p>
      </div>
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
        <span class="district-badge">${d.unlocked ? "OPEN" : `HOT · REP ${d.minRep}+`}</span>
      </div>
      <div class="district-name">${escapeHtml(d.name)}</div>
      <p class="district-blurb">${escapeHtml(d.blurb)}</p>
      ${d.landmark ? `<p class="muted tiny">${escapeHtml(d.landmark)}</p>` : ""}
    `;
    // Free roam: every district is walkable; badge is advisory danger only
    row.addEventListener("click", () => {
      const cx = (d.x0 + d.x1) / 2;
      const cy = (d.y0 + d.y1) / 2;
      socket.send({ type: "map.ping", x: cx, y: cy });
      closeDistrictMap();
    });
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
    // All districts walkable; dim only means "hot / recommended rep"
    ctx.fillStyle = colors[d.danger] ?? "#444";
    if (!d.unlocked) ctx.globalAlpha = 0.75;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = d.id === snap.you.districtId ? "#f0c040" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = d.id === snap.you.districtId ? 2 : 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#e8e0d4";
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

let lastStashKey = "";

function renderStash(): void {
  if (!snap?.stash) {
    stashModal.classList.add("hidden");
    lastStashKey = "";
    return;
  }
  stashModal.classList.remove("hidden");
  const st = snap.stash;
  const u = selectedUnit();
  stashPocketCash.textContent = `$${st.pocketCash}`;
  stashCashAmt.textContent = `$${st.cash}`;
  stashUnitName.textContent = u?.name ?? "—";

  const ownedW = (u?.ownedWeapons ?? []).slice().sort().join(",");
  const ownedA = (u?.ownedArmors ?? []).slice().sort().join(",");
  const key = `${st.cash}|${st.pocketCash}|${st.weapons.join(",")}|${st.armors.join(",")}|${u?.id}|${ownedW}|${ownedA}`;
  if (key === lastStashKey) return;
  lastStashKey = key;

  stashCarried.innerHTML = "";
  if (u) {
    for (const id of u.ownedWeapons ?? []) {
      if (id === "pipe") continue;
      const w = WEAPONS[id];
      if (!w) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "shop-item";
      b.dataset.stashAction = "depositWeapon";
      b.dataset.itemId = id;
      b.innerHTML = `
        <img class="shop-item-icon" src="${weaponIconDataUrl(id)}" alt="" width="40" height="40" draggable="false" />
        <div class="shop-item-body">
          <div class="shop-item-name">${escapeHtml(w.name)}</div>
          <div class="shop-item-meta">On ${escapeHtml(u.name)}</div>
        </div>
        <div class="shop-item-price">STASH →</div>`;
      stashCarried.appendChild(b);
    }
    for (const id of u.ownedArmors ?? []) {
      if (id === "none") continue;
      const a = ARMORS[id];
      if (!a) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "shop-item";
      b.dataset.stashAction = "depositArmor";
      b.dataset.itemId = id;
      b.innerHTML = `
        <img class="shop-item-icon" src="${armorIconDataUrl(id)}" alt="" width="40" height="40" draggable="false" />
        <div class="shop-item-body">
          <div class="shop-item-name">${escapeHtml(a.name)}</div>
          <div class="shop-item-meta">On ${escapeHtml(u.name)}</div>
        </div>
        <div class="shop-item-price">STASH →</div>`;
      stashCarried.appendChild(b);
    }
  }
  if (!stashCarried.children.length) {
    stashCarried.innerHTML = `<p class="muted tiny">Nothing worth stashing on this goon (pipe only).</p>`;
  }

  stashStored.innerHTML = "";
  // Collapse stacks for display
  const wCount = new Map<string, number>();
  for (const id of st.weapons) wCount.set(id, (wCount.get(id) ?? 0) + 1);
  const aCount = new Map<string, number>();
  for (const id of st.armors) aCount.set(id, (aCount.get(id) ?? 0) + 1);
  for (const [id, n] of wCount) {
    const w = WEAPONS[id as WeaponId];
    if (!w) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "shop-item";
    b.dataset.stashAction = "withdrawWeapon";
    b.dataset.itemId = id;
    b.innerHTML = `
      <img class="shop-item-icon" src="${weaponIconDataUrl(id as WeaponId)}" alt="" width="40" height="40" draggable="false" />
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(w.name)}${n > 1 ? ` ×${n}` : ""}</div>
        <div class="shop-item-meta">In the house</div>
      </div>
      <div class="shop-item-price">← TAKE</div>`;
    stashStored.appendChild(b);
  }
  for (const [id, n] of aCount) {
    const a = ARMORS[id as ArmorId];
    if (!a) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "shop-item";
    b.dataset.stashAction = "withdrawArmor";
    b.dataset.itemId = id;
    b.innerHTML = `
      <img class="shop-item-icon" src="${armorIconDataUrl(id as ArmorId)}" alt="" width="40" height="40" draggable="false" />
      <div class="shop-item-body">
        <div class="shop-item-name">${escapeHtml(a.name)}${n > 1 ? ` ×${n}` : ""}</div>
        <div class="shop-item-meta">In the house</div>
      </div>
      <div class="shop-item-price">← TAKE</div>`;
    stashStored.appendChild(b);
  }
  if (!stashStored.children.length) {
    stashStored.innerHTML = `<p class="muted tiny">Empty shelves. Dump gear before a war zone run.</p>`;
  }
}

function onStashClick(e: MouseEvent): void {
  const t = (e.target as HTMLElement).closest("button[data-stash-action]") as HTMLButtonElement | null;
  if (!t || !snap) return;
  const action = t.dataset.stashAction;
  const itemId = t.dataset.itemId;
  const unitId = selectedUnit()?.id ?? snap.you.selectedUnitId;
  if (!unitId || !action) return;
  e.preventDefault();
  if (action === "depositWeapon" && itemId) {
    socket.send({ type: "stash.depositWeapon", weaponId: itemId as WeaponId, unitId });
  } else if (action === "withdrawWeapon" && itemId) {
    socket.send({ type: "stash.withdrawWeapon", weaponId: itemId as WeaponId, unitId });
  } else if (action === "depositArmor" && itemId) {
    socket.send({ type: "stash.depositArmor", armorId: itemId as ArmorId, unitId });
  } else if (action === "withdrawArmor" && itemId) {
    socket.send({ type: "stash.withdrawArmor", armorId: itemId as ArmorId, unitId });
  }
}

let lastShopVoiceKey = "";

function renderShop(): void {
  if (!snap?.shop) {
    shopModal.classList.add("hidden");
    lastShopKey = "";
    lastShopVoiceKey = "";
    return;
  }
  shopModal.classList.remove("hidden");
  shopTitle.textContent = "PAWN-O-MATIC";
  shopCash.textContent = `$${snap.you.cash}`;
  const u = selectedUnit();
  shopUnitName.textContent = u?.name ?? "—";

  // Play open bark once per shop session
  const shopVoiceKey = `${snap.shop.buildingId}|${snap.shop.voiceLineId ?? ""}`;
  if (snap.shop.voiceLineId && shopVoiceKey !== lastShopVoiceKey) {
    lastShopVoiceKey = shopVoiceKey;
    sfx.unlock();
    voice.play(snap.shop.voiceLineId, { force: true });
  }

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
    const img = unitFaceUrl(m.id + m.name, {
      gender: m.gender,
      name: m.name,
      leader: !!(m.isPlayerLeader || m.kind === "player"),
      dead: !m.alive,
    });
    chip.innerHTML = `
      <img class="photo" src="${img}" alt="" width="32" height="32" draggable="false" />
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

/** Fixed top-of-HUD place name (not drawn in world space). */
function updateInteriorPlaceHud(s: WorldSnapshot): void {
  if (!interiorPlace || !interiorPlaceName) return;
  if (!s.you.insideBuildingId) {
    interiorPlace.classList.add("hidden");
    interiorPlace.classList.remove("club");
    return;
  }
  const b = s.buildings.find((bb) => bb.id === s.you.insideBuildingId);
  const name = (b?.name ?? "Interior").toUpperCase();
  interiorPlaceName.textContent = name;
  interiorPlace.classList.remove("hidden");
  const isClub = b?.id === "club_neon" || /titty|twister/i.test(b?.name ?? "");
  interiorPlace.classList.toggle("club", isClub);
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
    // Building name is on #interiorPlace; objective keeps a short exit tip
    objective.textContent = compact ? "E / EXIT · leave" : "Near the green EXIT · E or click door to leave";
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

/** Last layer we saw — clear pending interact when entering/leaving a building */
let lastInsideBuildingId: string | null | undefined = undefined;

function onSnapshot(s: WorldSnapshot): void {
  // Layer change: drop walk-then-interact so we don't auto-E at the wrong door/NPC
  if (lastInsideBuildingId !== undefined && lastInsideBuildingId !== s.you.insideBuildingId) {
    pendingInteract = null;
  }
  lastInsideBuildingId = s.you.insideBuildingId;

  snap = s;
  view.applySnapshot(s);
  // Combat VFX SFX (visuals applied inside WorldView.applySnapshot)
  if (s.fx?.length) playCombatFxAudio(s.fx);
  renderPosse();
  renderDialogue();
  renderShop();
  renderStash();
  renderJobBoard();
  renderMissionHud();
  renderTutorialHud();
  updateActionBanner(s);
  updateInteriorPlaceHud(s);
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
  // Auto-complete click-to-interact when in range (must stay within server NPC_TALK_RANGE)
  if (pendingInteract && view) {
    const d = view.distToLeader(pendingInteract.x, pendingInteract.y);
    // Slightly tighter than server (INTERACT_RANGE+0.55) so we don't fire one frame too early
    if (d <= INTERACT_RANGE + 0.4) {
      const target = pendingInteract.targetUnitId;
      pendingInteract = null;
      fireInteract(target);
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
    } else if (e.kind === "miss" || e.kind === "blocked") {
      sfx.play("miss");
    } else if (e.kind === "death") {
      sfx.play("death", { force: true });
    }
  }
}

function fireInteract(targetUnitId?: string): void {
  if (!socket) return;
  keys.up = keys.down = keys.left = keys.right = false;
  keyMoving = false;
  pendingInteract = null;
  view?.clearLocalPrediction();
  socket.send({ type: "intent.dir", dx: 0, dy: 0 });
  socket.send({ type: "intent.stop" });
  if (targetUnitId) {
    socket.send({ type: "intent.interact", targetUnitId });
  } else {
    socket.send({ type: "intent.interact" });
  }
  sfx.play("ui");
}

/** Walk toward a world point, then interact when close enough. */
function clickInteractAt(x: number, y: number, targetUnitId?: string): void {
  if (!socket || !view || !snap) return;
  keys.up = keys.down = keys.left = keys.right = false;
  if (keyMoving) {
    keyMoving = false;
    socket.send({ type: "intent.dir", dx: 0, dy: 0 });
  }
  const d = view.distToLeader(x, y);
  // Server NPC talk range is INTERACT_RANGE+0.55 — fire only when safely inside it
  if (d <= INTERACT_RANGE + 0.35) {
    pendingInteract = null;
    fireInteract(targetUnitId);
    return;
  }
  pendingInteract = { x, y, targetUnitId };
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
  if (snap.dialogue || snap.shop || snap.stash || snap.jobBoard) return false;
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

function updateRealmHud(realmId: string): void {
  myRealmId = realmId || DEFAULT_REALM_ID;
  if (realmHudLabel) {
    realmHudLabel.textContent = `REALM · ${realmLabel(myRealmId)}`;
  }
  if (settingsRealmLabel) {
    settingsRealmLabel.textContent = realmLabel(myRealmId);
  }
}

const SETTINGS_AUDIO_KEY = "lc_audio_v1";

function loadAudioPrefs(): void {
  try {
    const raw = localStorage.getItem(SETTINGS_AUDIO_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as { music?: boolean; sfx?: boolean; voice?: boolean };
    // Stored as "enabled" booleans
    if (typeof p.music === "boolean") music.setMuted(!p.music);
    if (typeof p.sfx === "boolean") sfx.setMuted(!p.sfx);
    if (typeof p.voice === "boolean") voice.setMuted(!p.voice);
  } catch {
    /* ignore */
  }
}

function saveAudioPrefs(): void {
  try {
    localStorage.setItem(
      SETTINGS_AUDIO_KEY,
      JSON.stringify({
        music: !music.isMuted(),
        sfx: !sfx.isMuted(),
        voice: !voice.isMuted(),
      }),
    );
  } catch {
    /* ignore */
  }
}

function syncSettingsForm(): void {
  const boss = selectedUnit() ?? myUnits().find((u) => u.isPlayerLeader || u.kind === "player");
  if (settingsNameInput) {
    settingsNameInput.value = boss?.name ?? myName ?? "";
  }
  if (settingsMusic) settingsMusic.checked = !music.isMuted();
  if (settingsSfx) settingsSfx.checked = !sfx.isMuted();
  if (settingsVoice) settingsVoice.checked = !voice.isMuted();
  if (settingsRealmLabel) settingsRealmLabel.textContent = realmLabel(myRealmId);
}

function openSettings(): void {
  settingsModal.classList.remove("hidden");
  syncSettingsForm();
  sfx.play("ui");
}

function closeSettings(): void {
  settingsModal.classList.add("hidden");
}

function applyAudioFromForm(): void {
  if (settingsMusic) {
    music.setMuted(!settingsMusic.checked);
    if (settingsMusic.checked) {
      music.unlock();
    }
  }
  if (settingsSfx) sfx.setMuted(!settingsSfx.checked);
  if (settingsVoice) voice.setMuted(!settingsVoice.checked);
  saveAudioPrefs();
}

function submitRename(): void {
  if (!socket || !settingsNameInput) return;
  const name = settingsNameInput.value.trim();
  if (name.length < 2) {
    pushEvent("Name too short.");
    return;
  }
  socket.send({ type: "settings.rename", name });
  myName = name;
  sfx.play("ui");
  pushEvent(`Rename requested: ${name}`);
}

function inviteLinkForRealm(realmId: string): string {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  if (realmId && realmId !== DEFAULT_REALM_ID) {
    url.searchParams.set("realm", realmId);
  }
  return url.toString();
}

async function copyInviteLink(fromSettings = false): Promise<void> {
  const link = inviteLinkForRealm(myRealmId);
  try {
    await navigator.clipboard.writeText(link);
    pushEvent(`Invite link copied (${realmLabel(myRealmId)}).`);
    if (realmInviteBtn && !fromSettings) {
      const prev = realmInviteBtn.textContent;
      realmInviteBtn.textContent = "COPIED";
      window.setTimeout(() => {
        if (realmInviteBtn) realmInviteBtn.textContent = prev || "INVITE";
      }, 1600);
    }
    if (fromSettings && settingsInviteBtn) {
      const prev = settingsInviteBtn.textContent;
      settingsInviteBtn.textContent = "COPIED";
      window.setTimeout(() => {
        if (settingsInviteBtn) settingsInviteBtn.textContent = prev || "COPY INVITE LINK";
      }, 1600);
    }
  } catch {
    pushEvent(`Invite: ${link}`);
  }
}

async function startGame(): Promise<void> {
  loginEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  sfx.unlock();
  // Fade out title track, then start the long in-game bed
  music.enterGame();
  view = new WorldView(canvas);
  await view.init();

  socket = new GameSocket({
    onAuthOk: (_characterId, _posseId, realmId) => {
      sfx.play("ui");
      updateRealmHud(realmId);
      const label = realmLabel(realmId);
      pushEvent(
        realmId === DEFAULT_REALM_ID
          ? "You're on the public streets. Dumpsters, corners, gyms — crime is a lifestyle."
          : `You're on the streets in realm "${label}". Share INVITE so friends land here.`,
      );
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
    onVoicePlay: (lineId) => {
      sfx.unlock();
      voice.play(lineId, { force: true });
    },
    onClose: () => {
      pushEvent("Disconnected from server.");
    },
  });

  socket.connect(myName, myRealmInput || undefined);
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
      clearLongPressTimer();
      if (e.touches.length !== 1) {
        touchStart = null;
        return;
      }
      const t = e.touches[0]!;
      touchStart = {
        x: t.clientX,
        y: t.clientY,
        t: performance.now(),
        id: t.identifier,
        cancelled: false,
        longFired: false,
      };
      if (view) view.updateHover(t.clientX, t.clientY);
      // Delay ring so quick taps don't flash; fire attack when hold completes
      longPressRingTimer = window.setTimeout(() => {
        if (!touchStart || touchStart.cancelled || touchStart.longFired) return;
        showLongPressRing(touchStart.x, touchStart.y);
      }, LONG_PRESS_RING_DELAY_MS);
      longPressTimer = window.setTimeout(() => {
        if (!touchStart || touchStart.cancelled || touchStart.longFired) return;
        touchStart.longFired = true;
        armLongPressRing();
        handlePrimaryPointer(touchStart.x, touchStart.y, true);
        window.setTimeout(() => hideLongPressRing(), 140);
      }, LONG_PRESS_MS);
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
      const dist = Math.hypot(dx, dy);
      // Drag cancels long-press attack; still allow release as move if short drag
      if (dist > TAP_SLOP_PX) {
        touchStart.cancelled = true;
        clearLongPressTimer();
      }
    },
    { passive: true },
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const start = touchStart;
      const t =
        Array.from(e.changedTouches).find((c) => c.identifier === start.id) ??
        e.changedTouches[0];
      clearLongPressTimer();
      if (!t) {
        touchStart = null;
        return;
      }
      e.preventDefault();
      const dist = Math.hypot(t.clientX - start.x, t.clientY - start.y);
      // Long-press already fired on timer — don't also walk/move on release
      if (start.longFired) {
        touchStart = null;
        return;
      }
      // Short tap or slight drag still counts as move / interact
      if (!start.cancelled && dist < TAP_SLOP_PX * 2.5) {
        handlePrimaryPointer(t.clientX, t.clientY, false);
      } else if (dist < TAP_SLOP_PX * 1.2) {
        // Cancelled mid-hold with tiny motion — still treat as tap
        handlePrimaryPointer(t.clientX, t.clientY, false);
      }
      touchStart = null;
    },
    { passive: false },
  );

  canvas.addEventListener("touchcancel", () => {
    clearLongPressTimer();
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
  mobSettings?.addEventListener("click", (e) => {
    e.preventDefault();
    openSettings();
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

  // Browsers block audio until a gesture — unlock SFX; resume game bed if needed
  const unlockAudio = () => {
    sfx.unlock();
    music.unlock();
  };
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
    // Typing in settings / confirm / any form field — never steal keys or close UI
    const ae = document.activeElement as HTMLElement | null;
    const typingInField =
      !!ae &&
      (ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.isContentEditable);
    const settingsOpen = settingsModal && !settingsModal.classList.contains("hidden");
    if (typingInField || (settingsOpen && e.key !== "Escape")) {
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
      if (settingsOpen) {
        closeSettings();
        return;
      }
      if (crewEditorOpen) {
        closeCrewEditor();
        return;
      }
      if (snap?.dialogue) socket.send({ type: "dialogue.close" });
      if (snap?.shop) socket.send({ type: "shop.close" });
      if (snap?.stash) socket.send({ type: "stash.close" });
      if (snap?.jobBoard) socket.send({ type: "jobBoard.close" });
      if (!districtMapModal.classList.contains("hidden")) closeDistrictMap();
      if (!memorialModal.classList.contains("hidden")) closeMemorialWall();
    }
    if (e.key === "m" || e.key === "M") {
      if (!chatFocused && !snap?.dialogue && !snap?.shop && !snap?.stash && !snap?.jobBoard) {
        e.preventDefault();
        if (districtMapModal.classList.contains("hidden")) openDistrictMap();
        else closeDistrictMap();
      }
    }
    if (e.key === "v" || e.key === "V") {
      if (!chatFocused && !snap?.dialogue && !snap?.shop && !snap?.stash && !snap?.jobBoard) {
        e.preventDefault();
        if (memorialModal.classList.contains("hidden")) openMemorialWall();
        else closeMemorialWall();
      }
    }
    // Syndicate-style: number row 5–0 / - for weapon slots when unit selected
    if (!crewEditorOpen && !snap?.dialogue && !snap?.shop && !snap?.stash && !snap?.jobBoard) {
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
  stashClose.addEventListener("click", () => socket.send({ type: "stash.close" }));
  stashDepositAllCash.addEventListener("click", () =>
    socket.send({ type: "stash.depositCash", amount: 0 }),
  );
  stashWithdrawAllCash.addEventListener("click", () =>
    socket.send({ type: "stash.withdrawCash", amount: 0 }),
  );
  stashDepositLoadout.addEventListener("click", () => {
    const unitId = selectedUnit()?.id ?? snap?.you.selectedUnitId;
    if (unitId) socket.send({ type: "stash.depositAll", unitId });
  });
  stashCarried.addEventListener("click", onStashClick);
  stashStored.addEventListener("click", onStashClick);
  stashModal.addEventListener("click", (e) => {
    if (e.target === stashModal) socket.send({ type: "stash.close" });
  });
  jobBoardClose.addEventListener("click", () => socket.send({ type: "jobBoard.close" }));
  missionAbandon.addEventListener("click", () => {
    void showConfirm({
      kicker: "JOB",
      title: "Abandon this job?",
      body: "No pay, no glory. Rita will remember. Briefly.",
      okLabel: "ABANDON",
      cancelLabel: "KEEP WORKING",
      danger: true,
    }).then((ok) => {
      if (ok) socket?.send({ type: "mission.abandon" });
    });
  });
  tutorialSkip.addEventListener("click", () => {
    void showConfirm({
      kicker: "TUTORIAL",
      title: "Skip the first-session guide?",
      body: "You can still find Rita in the bar. The streets won't hold your hand.",
      okLabel: "SKIP GUIDE",
      cancelLabel: "KEEP LEARNING",
      danger: true,
    }).then((ok) => {
      if (ok) socket?.send({ type: "tutorial.skip" });
    });
  });
  confirmCancel.addEventListener("click", () => closeConfirm(false));
  confirmOk.addEventListener("click", () => closeConfirm(true));
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeConfirm(false);
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

  goonProfileClose.addEventListener("click", () => closeGoonProfile());
  goonProfileModal.addEventListener("click", (e) => {
    if (e.target === goonProfileModal) closeGoonProfile();
  });
  goonProfileSelect.addEventListener("click", () => {
    if (!goonProfileUnitId || !socket) return;
    socket.send({ type: "intent.select", unitId: goonProfileUnitId });
    sfx.play("ui");
    closeGoonProfile();
  });
  goonProfileLoadout.addEventListener("click", () => {
    if (!goonProfileUnitId || !socket) return;
    socket.send({ type: "intent.select", unitId: goonProfileUnitId });
    closeGoonProfile();
    openCrewEditor();
  });

  settingsBtnDesktop?.addEventListener("click", (e) => {
    e.preventDefault();
    openSettings();
  });
  settingsClose?.addEventListener("click", () => closeSettings());
  settingsModal?.addEventListener("click", (e) => {
    // Only backdrop — not clicks on the card / inputs
    if (e.target === settingsModal) closeSettings();
  });
  settingsModal?.querySelector(".settings-card")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  settingsMusic?.addEventListener("change", () => applyAudioFromForm());
  settingsSfx?.addEventListener("change", () => applyAudioFromForm());
  settingsVoice?.addEventListener("change", () => applyAudioFromForm());
  settingsRenameBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    submitRename();
  });
  settingsNameInput?.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      submitRename();
    }
  });
  settingsNameInput?.addEventListener("keyup", (e) => e.stopPropagation());
  settingsNameInput?.addEventListener("keypress", (e) => e.stopPropagation());
  settingsInviteBtn?.addEventListener("click", () => {
    void copyInviteLink(true);
  });
  settingsHowToBtn?.addEventListener("click", () => {
    closeSettings();
    openOnboard(false);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Don't fight the game keydown handler for Escape when typing
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
      // Still allow Esc to close settings while focused in rename field
      if (settingsModal && !settingsModal.classList.contains("hidden")) {
        e.preventDefault();
        (ae as HTMLElement).blur();
        closeSettings();
      }
      return;
    }
    if (confirmResolve) {
      e.preventDefault();
      closeConfirm(false);
      return;
    }
    if (goonProfileUnitId) {
      e.preventDefault();
      closeGoonProfile();
      return;
    }
    if (settingsModal && !settingsModal.classList.contains("hidden")) {
      e.preventDefault();
      closeSettings();
    }
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
    art: "/art/splash.jpg?v=3",
  },
  {
    title: "Build your posse",
    text: "Talk to street NPCs and bar muscle. Hire them, equip better iron, and keep the boss in the middle of the pack.",
    bullets: [
      "E / Use — doors, shops, talk, recruit.",
      "Street meat is ~40% women / 60% men — both can join the crew.",
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
      "Street gear and pocket cash go to the killers on wipe — stash the rest at the Crash Pad.",
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
      "Crash Pad stash (north-west green roof) keeps gear safe when you die.",
      "Proximity chat for nearby players. Good luck, boss.",
    ],
    art: "/art/splash.jpg",
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
  myRealmInput = realmInput?.value.trim() ?? "";
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
realmInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});
realmInviteBtn?.addEventListener("click", () => {
  void copyInviteLink(false);
});

// Audio prefs before first play
loadAudioPrefs();

// Title music on splash: start as soon as the browser allows (first click/key/tap on login)
const unlockTitleMusic = () => {
  sfx.unlock();
  music.unlock(); // idle → rain-city-ledger
};
window.addEventListener("pointerdown", unlockTitleMusic, { passive: true });
window.addEventListener("keydown", unlockTitleMusic);
window.addEventListener("touchstart", unlockTitleMusic, { passive: true });

// Prefill login from ?realm= / ?name= (shareable invite links)
try {
  const params = new URLSearchParams(location.search);
  const qName = params.get("name");
  const qRealm = params.get("realm");
  if (qName && nameInput) nameInput.value = qName.slice(0, 20);
  if (qRealm && realmInput) realmInput.value = qRealm.slice(0, 32);
} catch {
  /* ignore */
}

// Event log: show on hover, fade when idle; click/tap toggles pin (readable mid-fight)
let lastEventLogToggleAt = 0;
function toggleEventLogPin(): void {
  const now = performance.now();
  if (now - lastEventLogToggleAt < 450) return; // ignore synthetic click after touch
  lastEventLogToggleAt = now;
  setEventLogPinned(!eventLogPinned);
}
eventLog.addEventListener("mouseenter", () => {
  eventLog.classList.add("visible");
  eventLog.classList.remove("faded");
  if (eventPanelFadeTimer != null) window.clearTimeout(eventPanelFadeTimer);
});
eventLog.addEventListener("mouseleave", () => {
  if (!eventLogPinned) bumpEventLogVisible();
});
eventLog.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleEventLogPin();
});
// Touch: pin open so the log stays readable without hover
eventLog.addEventListener(
  "touchend",
  (e) => {
    e.stopPropagation();
    toggleEventLogPin();
  },
  { passive: true },
);

nameInput.focus();
