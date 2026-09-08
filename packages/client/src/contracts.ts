import type { MissionOffer, WorldSnapshot } from "@loose-cannon/shared";
import "./contracts.css";

function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** Call on each newly built job card. All rewards come from the server offer. */
export function decorateContractOffer(card: HTMLElement, offer: MissionOffer): void {
  // Vite can refresh the client while an older in-memory server is still running.
  if (Number.isFinite(offer.bonusCash) && Number.isFinite(offer.parSeconds)) {
    const details = document.createElement("p");
    details.className = "contract-offer-bonuses";
    details.textContent = `BONUSES · +$${offer.bonusCash} within ${duration(offer.parSeconds)} · +$${offer.bonusCash} no crew killed or downed`;
    card.querySelector(".job-offer-foot")?.before(details);
  }
  if (offer.replay) {
    const replay = document.createElement("span");
    replay.className = "contract-replay";
    replay.textContent = `REPEAT RAID · CASH ONLY${offer.bestRank ? ` · BEST ${offer.bestRank}` : ""}`;
    card.prepend(replay);
    const button = card.querySelector<HTMLButtonElement>(".job-accept");
    if (button) button.textContent = "RUN AGAIN";
  }
}

let bonusRoot: HTMLElement | null = null;
let receiptRoot: HTMLElement | null = null;
let lastBonusKey = "";
let lastReceiptId = "";

/** Call after the existing mission/job HUD renders on each snapshot. */
export function renderContractStatus(snapshot: WorldSnapshot): void {
  if (!bonusRoot) {
    const hud = document.getElementById("missionHud");
    if (hud) {
      bonusRoot = document.createElement("div");
      bonusRoot.className = "contract-live-bonuses";
      hud.append(bonusRoot);
    }
  }
  if (bonusRoot) {
    const mission = snapshot.mission;
    const key = JSON.stringify(mission?.bonuses ?? []);
    if (key !== lastBonusKey) {
      lastBonusKey = key;
      bonusRoot.replaceChildren();
      for (const bonus of mission?.bonuses ?? []) {
        const row = document.createElement("div");
        row.className = `contract-bonus ${bonus.eligible ? "eligible" : "missed"}`;
        row.title = bonus.id === "clean" ? "Keep your starting crew: nobody killed, dismissed, or downed. Healing cannot restore this bonus." : "Optional bonus deadline. The main job stays active when time runs out.";
        const name = document.createElement("span");
        name.textContent = `${bonus.eligible ? "+" : "×"} ${bonus.label}${bonus.timeLeft != null && bonus.eligible ? ` · ${duration(bonus.timeLeft)}` : ""}`;
        const value = document.createElement("strong");
        value.textContent = bonus.eligible ? `$${bonus.cash}` : "MISSED";
        row.append(name, value);
        bonusRoot.append(row);
      }
    }
  }
  if (!receiptRoot) {
    const offers = document.getElementById("jobBoardOffers");
    if (offers) {
      receiptRoot = document.createElement("section");
      receiptRoot.className = "contract-receipt hidden";
      receiptRoot.setAttribute("aria-label", "Last contract payday");
      offers.before(receiptRoot);
    }
  }
  const result = snapshot.missionDebrief;
  if (receiptRoot && result && result.id !== lastReceiptId) {
    lastReceiptId = result.id;
    receiptRoot.classList.remove("hidden");
    receiptRoot.replaceChildren();
    const rank = document.createElement("strong");
    rank.className = "contract-rank";
    rank.dataset.rank = result.rank;
    rank.textContent = result.rank;
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = `LAST PAYDAY · ${result.title}`;
    const money = document.createElement("p");
    money.textContent = `$${result.totalCash} paid · ${duration(result.elapsedSeconds)} · +${result.rewardRep} rep`;
    const breakdown = document.createElement("small");
    breakdown.textContent = `Base $${result.baseCash} + bonus $${result.bonusCash}. ${result.bonuses.map((b) => `${b.eligible ? "✓" : "×"} ${b.label}`).join(" · ")}`;
    copy.append(heading, money, breakdown);
    receiptRoot.append(rank, copy);
  } else if (receiptRoot && !result) {
    receiptRoot.classList.add("hidden");
    lastReceiptId = "";
  }
}
