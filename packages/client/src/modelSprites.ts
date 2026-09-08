/** Original GLB models baked in the same 2:1 projection as the game world.
 * Sources + local regeneration: scripts/art/generate-models.mjs.
 * Frames have true alpha, four idle poses and eight walking poses per direction.
 */
import { Assets, Rectangle, Texture } from "pixi.js";

export const MODEL_UNIT_SPRITE_H = 68;
export const MODEL_UNIT_ANCHOR_Y = 0.86;
export type ModelCrewSkin = "leather" | "bruiser" | "enforcer" | "runner";
export type ModelPropKind = "taxi" | "sedan" | "dumpster" | "motorcycle" | "phonebooth" | "mailbox" | "hydrant" | "cone";
const crew: readonly ModelCrewSkin[] = ["leather", "bruiser", "enforcer", "runner"];
const props: readonly ModelPropKind[] = ["taxi", "sedan", "dumpster", "motorcycle", "phonebooth", "mailbox", "hydrant", "cone"];
type Style = { width: number; height: number; anchorY: number; displayHeight: number };
const propStyles: Record<ModelPropKind, Style> = {
  taxi: { width: 256, height: 192, anchorY: .75, displayHeight: 110 },
  sedan: { width: 256, height: 192, anchorY: .75, displayHeight: 110 },
  dumpster: { width: 160, height: 160, anchorY: .79, displayHeight: 77 },
  motorcycle: { width: 160, height: 160, anchorY: .78, displayHeight: 82 },
  phonebooth: { width: 128, height: 192, anchorY: .86, displayHeight: 110 },
  mailbox: { width: 96, height: 128, anchorY: .84, displayHeight: 66 },
  hydrant: { width: 96, height: 128, anchorY: .82, displayHeight: 52 },
  cone: { width: 96, height: 96, anchorY: .81, displayHeight: 36 },
};
const frames = new Map<string, Texture[]>();
let loading: Promise<void> | undefined;
let ready = false;

/** One shared promise prevents duplicate loading when scene instances overlap. */
export function loadModelSprites(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      await Promise.all([...crew, ...props].map(async name => {
        const atlas = await Assets.load<Texture>(`/art/sprites/models/${name}.png`);
        atlas.source.scaleMode = "linear";
        const isCrew = crew.includes(name as ModelCrewSkin);
        const style = isCrew ? { width: 96, height: 128 } : propStyles[name as ModelPropKind];
        const count = isCrew ? 12 : 1;
        const textures: Texture[] = [];
        for (let direction = 0; direction < 8; direction++) {
          for (let frame = 0; frame < count; frame++) {
            textures.push(new Texture({ source: atlas.source, frame: new Rectangle(frame * style.width, direction * style.height, style.width, style.height) }));
          }
        }
        frames.set(name, textures);
      }));
      ready = true;
    } catch (error) {
      console.warn("[models] atlas loading failed; keeping existing sprite art", error);
      loading = undefined;
    }
  })();
  return loading;
}

export function modelSpritesReady(): boolean { return ready; }

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

/** Pick a stable appearance without changing gender or server gameplay state. */
export function modelCrewSkin(id: string, female = false, armor?: string): ModelCrewSkin {
  if (female) return "runner";
  if (armor === "plate" || armor === "kevlar") return "enforcer";
  return crew[hash(id) % 3]!;
}

/** `phase` uses existing walkCycle radians; direction is the server 0–7 octant. */
export function modelUnitTexture(skin: ModelCrewSkin, direction: number, phase = 0, walking = false): Texture | null {
  if (!ready) return null;
  const octant = ((Math.round(direction) % 8) + 8) % 8;
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const frame = walking ? 4 + Math.floor(cycle * 8) : Math.floor(cycle * 4);
  return frames.get(skin)?.[octant * 12 + frame] ?? null;
}

export function modelPropKind(kind: string, id = ""): ModelPropKind | null {
  if (kind === "car") return /taxi|cab/i.test(id) || hash(id) % 3 === 0 ? "taxi" : "sedan";
  return props.includes(kind as ModelPropKind) ? kind as ModelPropKind : null;
}

export function modelPropStyle(kind: string, id = ""): Style | null {
  const key = modelPropKind(kind, id);
  return key ? propStyles[key] : null;
}

export function modelPropTexture(kind: string, direction = 4, id = ""): Texture | null {
  if (!ready) return null;
  const key = modelPropKind(kind, id);
  return key ? frames.get(key)?.[((Math.round(direction) % 8) + 8) % 8] ?? null : null;
}
