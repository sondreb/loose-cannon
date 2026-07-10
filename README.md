# Loose Cannon

Browser-based crime game — isometric squad tactics (*Syndicate*), crew comedy (*Cannon Fodder*), gangster recruitment (*Kingpin*).

## Play (local)

```bash
npm install
npm run dev
```

- Client: http://localhost:5173  
- Server: ws://localhost:3001 (in-memory, reset on restart)

### Controls

| Input | Action |
|-------|--------|
| **WASD / arrow keys** | Free movement (screen-aligned; diagonals work) |
| Left click | Click-to-move / select your unit |
| Right click | **Attack-move** — chase target if out of range, then fire |
| E | Interact (doors, NPCs, shop counter) |
| 1–4 | Select posse member |
| 5–0 / - | Quick-equip weapons (Syndicate-style slots) |
| FULL (panel) | Open full crew loadout editor |
| Enter | Focus proximity chat |
| Esc | Close dialogue / shop / editor |

Death: **3 second** respawn delay, then a random outdoor spot with few other players.

### What works

- Large isometric city (multi-avenue Skidrow)
- Free WASD + click move; RMB **attack-move** (chase + fire)
- Bars, pawn shop, gun shop, liquor, hospital, gym, club, church, garage, warehouse
- Dumpsters, protection corners, cars, crates (street hustles)
- Hire / recruit, shop with icons, crew loadout editor
- Combat scales with Aim / Muscle / weapons; wipe loot
- Enemy **gear visible** on the street (armor bulk, weapon shape, threat pips)
- Action banner (GOING / ASSASSINATE / ENGAGING…)
- Basic Web Audio SFX
- Proximity chat

## Beta (Azure)

| | URL |
|--|-----|
| **Play** | https://loose-cannon-beta.azurewebsites.net |
| **Game server** | wss://loose-cannon-beta-server.azurewebsites.net |

Deploy: push to **`main`** → GitHub Actions builds and deploys both Web Apps.  
Setup (publish profiles + WebSockets): [`.github/DEPLOY.md`](./.github/DEPLOY.md)

```bash
npm run build:azure   # produces deploy/client + deploy/server
```

## Docs

- [Game design](./docs/game-design.md)
- [Architecture](./docs/architecture.md)
- [PRD](./docs/prd.md)
- [Azure deploy](./.github/DEPLOY.md)

## Inspiration

[`inspiration/`](./inspiration/)

