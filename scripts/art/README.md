# Original model studio

The game uses real, exportable glTF 2.0 models rendered into transparent directional atlases. Street gameplay uses the PNG atlases in Pixi. Opening the crew editor lazy-loads Three.js and the selected character GLB for an interactive, animated model preview. The GLBs can also be imported into Blender or any glTF viewer for further modeling.

```bash
npm install
node scripts/art/generate-models.mjs
node scripts/art/verify-models.mjs
# With npm run dev already running:
node scripts/art/test-preview.mjs
node scripts/art/test-preview-game.mjs
```

The generator uses local Microsoft Edge on Windows. Elsewhere install Chromium once with `npx playwright install chromium`. Everything is modeled and rendered locally. No external model service, account, or API key is required.

- `model-studio.js`: original profile-authored character clothing, animated articulated limbs, authored face/hair details, detailed assembled street props, deterministic material grain, glTF export, lights and atlas baking.
- `packages/client/public/art/models/`: 12 reusable GLBs, including named walk and idle clips on each of the four crew looks, and `studio-preview.png` for visual review.
- `packages/client/public/art/sprites/models/`: transparent PNG atlases and `manifest.json` with frame dimensions, display scale and foot anchor.
- `packages/client/src/modelSprites.ts`: cached Pixi atlas loading, stable crew appearance, direction/frame selection and prop metrics.
- `packages/client/src/crewModelPreview.ts`: lazy 3D preview with drag/keyboard orbit, zoom, walk/idle controls, responsive layout and explicit GPU/resource cleanup. Call `syncCrewModelPreview(host, unit, open)` from the editor lifecycle; false closes and disposes. Hidden panels and background tabs stop drawing.

All models use meters, Y-up, positive Z forward. The camera elevation is 30 degrees, matching the world's 2:1 dimetric projection. Atlas rows match server facing octants `0=W, 1=NW, 2=N, 3=NE, 4=E, 5=SE, 6=S, 7=SW`. Crew columns 0–3 are a breathing idle and 4–11 are one walking cycle. Props have one column. Preserve anchors when changing display size.

Current limits: these are original stylized mid-poly models with procedural material variation, not scanned or sculpted cinematic assets. The crew currently carries a generic pistol silhouette; equipment UI and applicable runtime weapon overlays communicate the equipped weapon. Animation uses named articulated nodes rather than a skin-weighted skeleton. The source recipes are the editable source of truth: regenerate assets after making changes.
