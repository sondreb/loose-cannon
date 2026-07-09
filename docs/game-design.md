# Loose Cannon — Game Design Document

## 1. Elevator Pitch

**Loose Cannon** is a browser-based MMO crime game that mixes the isometric squad tactics of *Syndicate* (1993), the chaotic disposable-crew humor of *Cannon Fodder* (1993), and the foul-mouthed gangster fantasy of *Kingpin: Life of Crime* (1999).

You are a small-time gangster who builds a posse by talking people into joining you—in bars, alleys, flophouses, and back rooms—then takes them on jobs, turf wars, and hits across a shared city. The camera and mission presentation are pure *Syndicate*-style fixed isometric pixel art (modernized, not HD). The attitude, dialogue, and recruitment fantasy are pure *Kingpin*. The sense that every goon has a name, a death scream, and a gravestone energy is pure *Cannon Fodder*.

> **Tagline ideas:** “Crime has never been so much fun.” · “Build a posse. Lose a posse. Build a bigger one.” · “Talk shit. Hire muscle. Take the block.”

---

## 2. Design Pillars

| Pillar | Source | What it means in Loose Cannon |
|--------|--------|-------------------------------|
| **Isometric street tactics** | Syndicate | Fixed isometric view, click-to-move squad control, urban maps, scanner minimap, multi-agent combat |
| **Named meatbags** | Cannon Fodder | Goons have names, personalities, and permanent (or long-cooldown) death. Losing people hurts and is funny |
| **Life of crime** | Kingpin | Bars, dialogue trees, hire goons with cash/reputation, crude humor, rise from dumpster to kingpin |
| **Server-truth MMO** | Original | All combat, economy, recruitment, and progression are authoritative on the backend; clients are dumb terminals with pretty pixels. **Dev default:** one local Node.js process with in-memory state (wiped on restart)—see [architecture.md](./architecture.md) Mode A |
| **Readable retro pixels** | Syndicate screenshots | Higher definition than 1993 VGA, but deliberately pixelated—never photoreal, never Quake-style 3D |

---

## 3. Fantasy & Tone

### 3.1 Setting

A nameless retro-futuristic city that blends:

- **Syndicate’s** corporate decay and rain-slick industrial blocks (but re-skinned as **crime**, not cyber-corporations)
- **Kingpin’s** dieselpunk / 1930s–90s crime-movie grit: neon, trash, pawn shops, chemical plants, shipyards, skid row, Radio City–style endgame districts
- A satirical underworld where every bartender has an opinion and every thug has a catchphrase

The world is **not** cyberpunk mind-control *Syndicate*. There is no CHIP implant fantasy as the core hook. The hook is **being a gangster** who runs jobs, owns turf, and builds a crew. Visual language can still borrow Syndicate’s metallic blacks, ochre streets, hazard striping, and oppressive architecture—reinterpreted as gangland infrastructure rather than mega-corp ops.

### 3.2 Tone of Humor

- **Kingpin-primary:** profanity, macho posturing, movie-gangster clichés that undercut themselves, “I will fucking bury you” energy, safe-zone bar conversations that escalate into brawls
- **Cannon Fodder-secondary:** darkly comic permanence of death, roster names on a memorial wall, mission briefings that are cheerfully wrong about how easy the job will be
- **Syndicate-secondary:** cold professional framing for briefing/UI, then the street chaos demolishes the professionalism

The game should make players laugh while their favorite goon face-plants into a dumpster fire.

### 3.3 Player Fantasy Arc

1. **Nobody** — wake up broke on Skidrow with a pipe and a bad attitude  
2. **Crew chief** — hire 1–4 goons, run small jobs (protection, smash-and-grab, debt collection)  
3. **Block boss** — hold a street/district, defend it, expand  
4. **Capo** — multi-district influence, specialty goons, bigger weapons, other players as rivals  
5. **Kingpin aspirant** — late-game political crime, major heists, city-wide events  

---

## 4. Core Gameplay Loop

```
[Hub / Safe Zone]
   talk, recruit, shop, equip, plan
        ↓
[Select Job / Turf Action / Instant Conflict]
        ↓
[Isometric Mission Instance]
   command posse, fight, loot, extract
        ↓
[Aftermath]
   cash, rep, injuries/deaths, loot, memorials
        ↓
[Empire Layer]
   invest in turf, upgrade safehouse, unlock districts
        ↓
back to Hub
```

### 4.1 Session Length Targets

| Session type | Duration | Content |
|--------------|----------|---------|
| Quick job | 5–12 min | Single small mission |
| Standard night | 30–60 min | 2–4 jobs + hub social |
| Turf war night | 45–90 min | Contest + defense + aftermath |
| Deep session | 2+ hours | Progression, recruiting, multi-district play |

---

## 5. Camera, Presentation & Controls

### 5.1 Viewpoint (from Syndicate screenshots)

- **Fixed isometric (axonometric) projection** — classic 2:1 pixel ratio feel  
- **No free camera rotation** during combat (preserve Syndicate readability)  
- **Scrollable map** that follows the active squad or player cursor  
- Optional **light zoom** (modern quality-of-life), clamped so sprites stay readable  
- **Depth sorting** so characters walk behind/in front of buildings correctly  
- Characters remain **small relative to architecture** (the “ants on a city block” feel)

### 5.2 What We Take Visually from Syndicate

From the provided screenshots and reference notes:

- Left **agent/posse panel**: portraits or silhouette slots, numbered units (1–4+), health bars, weapon selection grid  
- Bottom-left **scanner/minimap**: blue schematic with dots (friendly / hostile / objective)  
- **Dark urban palette**: black rooftops, brick ochres, asphalt greys, yellow road markings, hazard stripes  
- **Destructible chaos**: burning cars, fire sprites, blood on pavement, bodies that stay as debris  
- **Multi-level architecture**: steps, elevated walkways, industrial scaffolding, neon-lit interiors peeking through  
- **Status banners**: mission objective strip (“ASSASSINATE”, “ELIMINATE AGENTS”, “GOING”) modernized as crime objectives (“COLLECT”, “HIT”, “HOLD THE CORNER”)

### 5.3 What We Do *Not* Copy

- **Not** Kingpin first-person Quake-style 3D  
- **Not** pure Cannon Fodder top-down overhead (though we steal its humor and fragile-squad feel)  
- **Not** photoreal / high-definition modern AAA  
- Target look: **“1993 Syndicate if it shipped in ~2026 with more colors and cleaner pixels, but still proudly pixelated”**

### 5.4 Control Model

**Desktop (primary):**

| Input | Action |
|-------|--------|
| Left click | Move selected unit(s) / interact |
| Right click | Fire / use equipped weapon at cursor (Cannon Fodder DNA) |
| Drag box / shift-click | Multi-select |
| 1–0 keys | Select goon by slot |
| G | Group all |
| Q/E or mouse wheel | Switch weapon |
| Space | Interact / talk (hub) or special action |
| Tab | Scanner full-screen toggle |
| Hold LMB+RMB (or dedicated key) | Throw grenade / use explosive |

**Mobile / phone:**

- Virtual stick or tap-to-move for selected unit  
- Tap enemy to fire (auto-aim assist optional, server-validated)  
- Bottom radial weapon wheel  
- Pinch zoom, two-finger pan  
- Long-press for context actions (talk, loot, order hold)  
- Portrait UI reflow of the Syndicate side panel into a collapsible bottom sheet  

Design **mouse-first, touch-second**; do not cripple desktop precision for mobile, but ship a usable phone layout for hub + simplified combat.

---

## 6. Posse System (Heart of the Game)

### 6.1 Your Crew

- You (the player character) are always present on jobs unless spectating a specialized crew  
- Recruit **goons** (AI companions under your command) with names, voice lines, stats, quirks, and preferred weapons  
- Typical active squad size: **1 player + up to 3–5 goons** (tunable; Syndicate was 4, Cannon Fodder up to 6)  
- Bench / roster size larger than active squad (safehouse roster)

### 6.2 Recruitment (Kingpin DNA)

Recruitment happens **in the world**, not only via menus:

| Location | Typical recruit types |
|----------|----------------------|
| Bars / clubs | Street muscle, talkers, debt collectors |
| Flophouses | Cheap cannon fodder, addicts with surprising skills |
| Gyms / dojos | Brawlers, enforcers |
| Chop shops | Drivers, demolitions |
| Churches / soup kitchens | Unlikely toughs, informants |
| Prisons (late) | Hard cases with baggage |
| Player-owned safehouses | Referred talent via reputation |

**Flow:**

1. Approach NPC (gun holstered in safe zones)  
2. Dialogue tree — positive / neutral / insulting branches  
3. Check requirements: cash, reputation, territory control, prior quests, gang heat  
4. Offer / counter-offer (pay up front, cut of jobs, promise of status)  
5. On accept: NPC joins roster, gains name plate in your crew UI, unique voice bank  

Insulting enough people should still be able to start a **bar brawl**—comedy gold, with consequences.

### 6.3 Goon Attributes

| Attribute | Effect |
|-----------|--------|
| Guts | Panic resistance, hold ground |
| Aim | Accuracy with firearms |
| Muscle | Melee, carry weight, door kicks |
| Brains | Hacking, lockpicking, persuasion assist |
| Speed | Move rate, reaction |
| Loyalty | Less likely to flee / betray under heat |
| Heat | How much cops/rivals notice them |

**Quirks (examples):** “Blocks doorways,” “steals extra loot,” “refuses to shoot unarmed,” “always insults the target,” “sings after kills,” “panics at fire.”

### 6.4 Death & Memorials (Cannon Fodder DNA)

- Goons can **die permanently** on hardcore rulesets, or enter **“critical injury”** with long recovery / expensive hospital on standard PvE  
- Memorial wall in the safehouse: names, dates, dumb last words  
- New recruits keep flowing so the comedy of endless fresh meat never dies  
- Optional “Legacy” mode: fallen goon traits can slightly influence the next recruit from the same neighborhood  

Player character death: **not permanent**—respawn with penalties (cash loss, heat spike, temporary goon demoralization). Permanent player death does not fit an MMO.

---

## 7. Combat (Syndicate + Cannon Fodder)

### 7.1 Real-Time Tactics

- Real-time, pause **not** available in multiplayer instances (optional soft-pause in solo PvE practice)  
- Point-and-click movement with pathfinding  
- Group or individual orders: follow, hold, attack-move, suppress, extract  
- Line-of-sight, cover (low walls, cars, corners), vertical levels  

### 7.2 Weapons Fantasy

Progress from scrap to ridiculous:

| Tier | Examples |
|------|----------|
| Street | Pipe, switchblade, cheap pistol |
| Gang | Uzi, shotgun, Tommy gun, molotov |
| Heavy | M60-style LMG, grenade launcher, flamethrower |
| Absurd late | Experimental crime-tech, vehicle-mounted toys |

Ammo economy matters for special weapons; basic pistols can be generous so new players aren’t stuck reloading menus constantly.

### 7.3 Violence Presentation

- Pixel blood, ragdoll-ish death frames, burning vehicles (as in Syndicate screenshots)  
- Stylized, readable, **not** photoreal gore  
- Cannon Fodder bounce-and-splat energy over modern military sim  

### 7.4 Mission Types

| Type | Description |
|------|-------------|
| Collection | Extract cash / package |
| Hit | Eliminate a marked target |
| Persuade / recruit field | Escort a recruitable VIP out |
| Protection | Defend a corner / shop for a timer |
| Smash | Destroy a rival asset (car, stash, lab) |
| Sweep | Clear a building of hostiles |
| Heist | Multi-stage: breach, loot, extract |
| Turf war | Timed control of capture points vs AI or players |
| Escape | Survive pursuit to extraction |

---

## 8. World Structure

### 8.1 Shared City Model

The city is divided into **districts**:

1. **Skidrow** — starter, flophouses, cheap bars  
2. **Docks / Shipyard** — smuggling, heavy weapons  
3. **Industrial / Chemical** — mid-game chaos, toxic hazards  
4. **Downtown Neon** — clubs, high-value targets  
5. **Steel & Rails** — logistics, armored jobs  
6. **Uptown / Radio City** — endgame kingpin politics  

Each district has:

- **Safe hubs** (bars, shops, safehouses) — social, non-lethal by default  
- **Open street layers** — ambient crime, optional PvE skirmishes  
- **Instanced jobs** — private or small-group mission maps  
- **Turf nodes** — claimable control points that generate passive income and spawn events  

### 8.2 MMO Social Layers

| Layer | Description |
|-------|-------------|
| Solo | Run jobs with AI posse |
| Crew | Temporary party with other players (shared instance) |
| Gang (persistent) | Named player organization, shared bank, colors, turf claims |
| City events | Scheduled wars, blackouts, police crackdowns, kingpin auctions |

### 8.3 Empire / Meta Layer (Syndicate DNA, crime-skinned)

Between jobs:

- **Turf map** of the city (color-coded control)  
- **Protection rackets** instead of taxes (too greedy → revolt / cop heat)  
- **Safehouse upgrades** (armory, medical bay, garage, memorial wall, lounge)  
- **Research / black market unlocks** (weapons, armor, goon training programs)  
- **Heat & wanted level** that affects spawn tables and shop prices  

---

## 9. Dialogue, Voice & Personality

### 9.1 Dialogue System

- Branching trees with tone buttons: **Smooth / Business / Threaten / Insult**  
- Memory: NPCs remember prior interactions (helped, robbed, insulted, recruited friend)  
- Safe-zone rules: drawn weapons change available options and can turn the room hostile  
- Quests tracked in a notepad-style journal (Kingpin homage)

### 9.2 Voice Acting Strategy

All character speech uses **xAI Grok Text-to-Speech APIs**:

- Pre-generate high-value lines (recruitment, mission briefings, iconic barks) offline into CDN audio assets  
- Optionally generate long-tail barks / dynamic one-liners via a content pipeline (cached, moderated)  
- Voice banks per archetype: gravel enforcer, nervous snitch, smooth bartender, manic pyromaniac, deadpan driver  
- Custom / cloned voices only if/when product and legal allow; default to roster of expressive stock voices  

**Content rules:** adult crime comedy language is in-scope; still needs moderation filters for hate speech, real-world extremism, and anything outside age-rating policy.

### 9.3 Music & SFX

- Gritty instrumental hip-hop / industrial / 90s crime-movie energy (original score; no licensed Cypress Hill unless rights obtained)  
- Juicy gunshots, car explosions, bar ambience, distant sirens  
- UI beeps with a cold Syndicate-adjacent panel feel  

---

## 10. Art Direction Summary

### 10.1 Target Aesthetic

**“Modernized Syndicate isometric pixel art in a Kingpin crime city.”**

| Aspect | Direction |
|--------|-----------|
| Resolution | Higher than 1993 DOS (e.g. sprites ~32–64px tall characters, HD tile density) but **pixel-snapped**, not smooth HD |
| Palette | Expanded from 16-color VGA: deeper blacks, dirty ochres, neon accents (magenta/cyan sparingly), blood reds, fire oranges |
| Characters | Small readable silhouettes, numbered markers above heads, 8-direction walk/shoot/death cycles |
| Environments | Modular isometric tilesets: roads, sidewalks, multi-height buildings, interiors for bars/clubs |
| VFX | Pixel fire, muzzle flashes, smoke plumes, car explosions, blood decals that persist briefly |
| UI | Left posse panel + scanner (Syndicate DNA); greys, oranges, cyan highlights; chunky clickable icons |

### 10.2 Generation Pipeline (Grok Imagine)

Use **Grok Imagine API** for:

- Concept art boards per district  
- Reference sheets for buildings, props, character archetypes  
- Marketing key art  

Then **down-res / pixel-constrain** in an art pipeline (Aseprite-style manual cleanup or automated pixelation + artist pass). Imagine is a **production accelerator**, not a ship-raw-to-client pipeline. Final game assets must be consistent atlas packs with animation frames.

### 10.3 Reference Screenshots (inspiration folder)

Key visual takeaways from analyzed frames:

- **syndicate-1 / 5 / 8:** Road markings, brick complexes, left HUD, tiny agents, grass/dirt patches  
- **syndicate-2 / 3 / 7 / 10:** Fire and vehicle destruction as spectacle  
- **syndicate-4 / 11:** Building entrances as combat focal points, multi-agent clustering  
- **syndicate-6 / 9:** Industrial black architecture, scaffolding, elevated platforms  
- **cannon-fodder-*:** Squad names in UI, chaotic multi-unit combat, environmental variety (jungle/snow) as inspiration for **mission variety**, not camera style  

---

## 11. Progression & Economy

### 11.1 Currencies

| Currency | Use |
|----------|-----|
| Cash | Hire, buy weapons, bribes, hospital, upgrades |
| Rep | Unlock districts, better NPCs, gang rank |
| Influence | Turf claim strength, passive income multipliers |
| Heat | Soft currency reverse—too much locks content or spawns raids |

### 11.2 Player Progression Axes

1. **Personal combat skill unlocks** (abilities, not raw DPS inflation)  
2. **Posse quality & size**  
3. **Gear & black market tier**  
4. **Turf ownership**  
5. **Gang rank / city notoriety**  
6. **Social reputation with factions** (union thugs, dirty cops, rival crews, street preachers)

### 11.3 Monetization Principles (design constraints)

If free-to-play:

- **No pay-to-win combat stats**  
- Cosmetics, safehouse decorations, emotes, nameplates, optional convenience (extra inventory slots within caps)  
- Battle pass style weekly crime contracts OK if pure cosmetic + account fluff  

If premium / buy-to-play:

- Full content unlock; optional cosmetic DLC  

Exact model is a product decision; combat integrity is non-negotiable for MMO trust.

---

## 12. Multiplayer Rules of Engagement

### 12.1 PvE vs PvP

| Mode | Default |
|------|---------|
| Story / tutorial jobs | PvE only |
| Standard street jobs | PvE, optional grief flags off |
| Turf nodes | Contestable on schedule (PvP windows) |
| Full open-world PvP | Opt-in “War Flag” or high-tier districts only |
| Safe hubs | Always non-PvP (except consensual brawls) |

### 12.2 Fairness

- Matchmaking by power band for instanced PvP  
- Anti-gank tools for new players in starter districts  
- Gang size caps on contested nodes  

---

## 13. Accessibility & Platforms

- **Platforms:** Modern desktop browsers (Chrome, Firefox, Edge, Safari) and mobile browsers (iOS Safari, Android Chrome)  
- **No native install required** for v1 (PWA install optional)  
- Colorblind-friendly scanner dots  
- Subtitles for all voiced lines  
- Remappable keys  
- Reduced-flash mode for explosions  
- “Clean language” toggle if ratings require (Kingpin had a safe mode precedent)—default can be uncensored for mature rating  

---

## 14. Content Rating Target

**Mature / 18+** — violence, strong language, crime themes, dark humor. No sexual content involving minors; adult NPC roles must stay within platform and store policies.

---

## 15. Success Criteria (Design)

Players should regularly say things like:

- “I hired this idiot at the bar and he saved the run.”  
- “I lost three guys holding that corner and it was hilarious / tragic.”  
- “That hit felt like old-school Syndicate but dirtier.”  
- “I’m not logging off until we take the docks.”  

---

## 16. Non-Goals (v1)

- Full open free-camera 3D  
- Realistic military sim ballistics  
- Full player housing city builder  
- Voice chat moderation as a core feature (optional later)  
- Cross-title lore fidelity to the three originals (homage, not remake)  
- Supporting ancient browsers (IE, pre-2022 Safari)  

---

## 17. Document Map

| Doc | Purpose |
|-----|---------|
| [game-design.md](./game-design.md) | This file — vision, systems, fantasy |
| [architecture.md](./architecture.md) | Technical implementation & anti-cheat |
| [prd.md](./prd.md) | Exhaustive feature & task backlog |

---

*Working title: Loose Cannon. Genre mash-up of Syndicate (view + tactics), Cannon Fodder (squad mortality + humor), Kingpin (crime theme + recruitment + attitude).*
