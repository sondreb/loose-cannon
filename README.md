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

- Walk Skidrow (isometric map)
- Enter bar, shop, safehouse, warehouse
- Talk to NPCs, hire goons, open shop
- Buy weapons, armor, upgrades; equip gear; view stats
- AI rival posses patrol; often turn hostile when close
- Proximity chat (players near each other hear messages)

## Docs

- [Game design](./docs/game-design.md)
- [Architecture](./docs/architecture.md)
- [PRD](./docs/prd.md)

## Inspiration

[`inspiration/`](./inspiration/)

