**Syndicate (1993)** is a landmark isometric real-time tactics game developed by Bullfrog Productions and published by Electronic Arts. It pioneered a gritty cyberpunk aesthetic and squad-based gameplay that influenced later titles like the X-COM series and modern tactical games.

### Setting and Story
The game is set in a dystopian 2096 where megacorporations (syndicates) have replaced governments. They control populations via the "CHIP" implant in people's necks, which manipulates perception and enforces obedience. You play as an executive of your own syndicate (starting as EuroCorp or similar), building a global empire by conquering territories through a series of 50+ missions. Objectives include assassinating rival executives, persuading (brainwashing) civilians/scientists to join your cause, rescuing allies, eliminating enemy agents, or destroying targets. Failure risks territory revolts or losing agents permanently. The ultimate goal is dominating the world map and surviving a final assault at the Atlantic Accelerator.

### Graphics and Visual Style
The game uses a **fixed isometric (axonometric) projection** for missions, giving a 3D-like city view without rotation. Maps are urban environments: streets, sidewalks, multi-level buildings (some with doors you can open), vehicles, and destructible elements like exploding cars.

- **Pixel art sprites**: Agents are small (numbered 1-4 floating above heads), with smooth 8-direction animations for walking, shooting, running, dying (with blood splatter and bodies flying back on heavy hits). Civilians, police, and rival cyborgs have distinct sprites. Weapons have muzzle flashes, explosions, and fire effects.
- **Color and atmosphere**: DOS version runs missions in 640×480 at 16 colors (with heavy dithering for finer detail) and menus in 320×200 at 256 colors. The look is dark, gritty, and cyberpunk—muted browns/grays for decaying city tiles, metallic cyborgs, neon-ish highlights on some structures, and a bleak, oppressive mood. Textures on walls/floors add depth; violence is visceral but era-appropriate.
- **UI elements**: Left-side panel shows agent portraits, health bars, and selectable weapons/items. Bottom-left has a real-time "scanner" minimap (aerial view showing agents as yellow dots, enemies red, targets flashing). Agents have on-screen meters for health, perception, intelligence, and adrenaline.

Here are authentic in-game examples of the isometric style and UI:










Equipment/research screens use a more stylized cyberpunk UI with glowing purple/blue tones and a 3D cyborg model for mods.




### Core Mechanics
- **Squad control**: Up to 4 cyborg agents per mission (chosen from a cryo chamber pool of 8+). Control them individually or as a group. Real-time action—no turns. Agents move, shoot, use items, enter vehicles, or pick up enemy weapons.
- **Combat and tools**: Point-and-click targeting. Weapons escalate from basic pistols/Uzis to miniguns, flamethrowers, sniper rifles, time bombs, lasers, and the devastating Gauss gun. Limited ammo (reload manually between missions). Key item: **Persuadertron** (brainwashes civilians/enemies into allies or recruits). Medikits heal; scanners reveal hidden units. Agents can panic and auto-fight.
- **Agent customization**: Cybernetic mods (legs for speed/mobility, arms for accuracy/strength, body for armor/resilience, brain for better AI/perception). In-mission sliders boost intelligence/perception/adrenaline with drugs (adrenaline triggers "panic" mode for aggressive auto-fire but drains fast).
- **Mission variety**: Short-to-medium urban levels. Common types: assassination (reach and kill a target), persuasion (tag someone with Persuadertron and escort), sweep/eliminate all rivals, rescue, or destruction. Civilians wander; police/enemies patrol or respond. Pathfinding can be finicky around corners/buildings.
- **Strategic layer**: Between missions, manage a world map (color-coded territories). Set tax rates for income (too high = revolt). Research new weapons/mods (time- and money-based queue/tech tree). Buy/equip agents and mods. Persuaded recruits expand your agent pool.

Controls are mouse-driven (click to move/select, right-click or icons to target/shoot/use items) with some keyboard shortcuts (e.g., group select, detonate explosives).

### Instructions to Replicate the Style, Graphics, and Mechanics
To recreate a similar game (e.g., in Unity, Godot, or a custom engine), aim for retro fidelity or a modernized homage. Here's a practical step-by-step guide:

1. **Engine and Camera Setup**:
   - Use a 2D isometric system (not true 3D). In Godot/Unity: Set up an isometric tilemap with a 2:1 pixel ratio or diamond-shaped tiles for fixed camera (no free rotation—keep the classic overhead angle).
   - Fixed viewpoint with scrollable map. Implement depth sorting so sprites layer correctly (e.g., agents behind buildings use Y-sorting).

2. **Graphics and Art Pipeline** (Pixel Art Retro Style):
   - **Tiles and maps**: Create modular tile sets for roads, buildings, sidewalks (multi-height levels). Use tools like Aseprite or Photoshop. Dark cyberpunk palette: desaturated grays/browns, metallic accents, subtle neon glows. Add details like puddles, signage, and destructible props (cars that explode).
   - **Sprites and animations**: 16–32 pixel tall character sprites with 8-directional walk cycles, idle, shoot, death, and hit reactions (blood particles). Use frame-by-frame pixel art. Agents get numbered overlays and floating health/ stat meters.
   - **Effects**: Muzzle flashes, projectile trails, explosions, fire (flamethrower). Dithering shaders if emulating 16-color VGA.
   - **UI**: Side panels for agent portraits/weapons (clickable icons). Mini-scanner map as a separate orthographic view. Glowing cyberpunk fonts and borders for menus.
   - **Tools**: LibreSprite/Aseprite for art; Tiled for maps. Reference the original screenshots for scale and detail—keep characters small relative to the environment for that "ant-like" squad feel.

3. **Mechanics Implementation**:
   - **Squad AI/Pathfinding**: Use A* or navmesh for movement (click-to-move). Support group selection (drag box or hotkeys) and individual commands. Agents follow leader or move independently. Handle vehicle entry (simple possession).
   - **Real-time combat**: Projectile physics (hitscan for some guns). Weapon selection via UI/hotbar. Targeting: mouse over enemy + fire button. Persuadertron as a special "use on target" raycast that converts NPCs.
   - **Stats and mods**: Agent class with variables (speed, accuracy, health, perception). Cyber mods as equippable buffs (e.g., legs += move speed). In-mission drug sliders that temporarily boost stats but have cooldowns/drains.
   - **Mission objectives**: Scripted triggers (reach point, kill specific NPC, escort tagged unit to extraction). Add civilian AI (wander/random) and enemy patrols (line-of-sight detection).
   - **Scanner minimap**: Real-time radar overlay showing dots for agents (yellow), enemies (red), targets (white/flashing).
   - **Economy/Research**: World map as a grid or graph. Tax slider per territory with revolt risk timer. Research as a queue: each tech has cost/time; unlock weapons/mods progressively.

4. **Additional Polish for Authenticity**:
   - **Between-mission hub**: Cryo chamber screen (list agents + 3D-ish model for mod preview). Equip screen with drag-and-drop weapons. Research lab with progress bars.
   - **Audio**: Moody synth soundtrack, gun sounds, explosion booms, civilian screams. Retro MIDI or sampled effects.
   - **Difficulty progression**: Early missions simple (pistols vs. civilians); later ones feature heavy rivals, larger maps, and advanced weapons.
   - **Modern tweaks (optional)**: Add save-anytime, better pathfinding, or controller support—but keep core mouse-driven point-and-click feel.
   - **Open-source reference**: Study FreeSynd (a fan recreation of the original engine) for exact mechanics if you want pixel-perfect fidelity.

This setup captures the addictive loop of mission prep → tactical chaos → strategic empire-building. The original's charm comes from its tight, violent real-time squad control in a lived-in cyberpunk world—focus on responsive controls and satisfying explosions, and you'll nail the vibe. If you're building in a specific engine, start with an isometric prototype and iterate on the Persuadertron and mod system first—they're what make it unique.