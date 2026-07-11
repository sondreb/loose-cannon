/**
 * Day/night cycle + weather + district atmospheric lighting (Mode A presentation).
 * Server exposes `dayPhase` + `weather` from tick; client paints sky / overlay / neon / rain.
 */

import { TICK_HZ } from "./constants.js";

export type DayPhase = "dawn" | "day" | "dusk" | "night";

/** Outdoor precipitation. Clear is the default; rain/storm are episodic. */
export type WeatherKind = "clear" | "rain" | "storm";

/** Full outdoor cycle ≈ 6 real minutes — short enough to notice in a session. */
export const DAY_CYCLE_TICKS = TICK_HZ * 60 * 6;

/** Weather slots last ~75s so storms feel like events, not permanent drizzle. */
export const WEATHER_SLOT_TICKS = TICK_HZ * 75;

export const DAY_PHASES: readonly DayPhase[] = ["dawn", "day", "dusk", "night"] as const;

export const DAY_PHASE_LABEL: Record<DayPhase, string> = {
  dawn: "DAWN",
  day: "DAY",
  dusk: "DUSK",
  night: "NIGHT",
};

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "CLEAR",
  rain: "RAIN",
  storm: "STORM",
};

/** 0–1 progress through the current cycle. */
export function dayProgress01(tick: number): number {
  const t = ((tick % DAY_CYCLE_TICKS) + DAY_CYCLE_TICKS) % DAY_CYCLE_TICKS;
  return t / DAY_CYCLE_TICKS;
}

/**
 * Crime-city phase map — longer nights, short dusk/dawn.
 * Ranges of dayProgress01:
 *   0.00–0.12 dawn · 0.12–0.42 day · 0.42–0.55 dusk · 0.55–1.00 night
 */
export function dayPhaseFromTick(tick: number): DayPhase {
  const p = dayProgress01(tick);
  if (p < 0.12) return "dawn";
  if (p < 0.42) return "day";
  if (p < 0.55) return "dusk";
  return "night";
}

export function isDayPhase(v: unknown): v is DayPhase {
  return v === "dawn" || v === "day" || v === "dusk" || v === "night";
}

/**
 * Deterministic weather from server tick.
 * Most slots are clear (~78%). Rain ~17%. Storm ~5%.
 * City default is dry streets — rain is an occasional event.
 */
export function weatherFromTick(tick: number): WeatherKind {
  const slot = Math.floor(((tick % (WEATHER_SLOT_TICKS * 64)) + WEATHER_SLOT_TICKS * 64) / WEATHER_SLOT_TICKS);
  // Stable hash per slot (not pure random — same for all clients)
  let h = (slot * 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519) >>> 0;
  const r = h % 100;
  if (r < 5) return "storm";
  if (r < 22) return "rain";
  return "clear";
}

/** 0 = dry, 1 = rain, ~1.25 = storm (for FX scale). */
export function weatherRainScale(weather: WeatherKind): number {
  if (weather === "storm") return 1.25;
  if (weather === "rain") return 0.9;
  return 0;
}

/** How wet the ground should look (puddles / sheen) even at rain edges. */
export function weatherWetScale(weather: WeatherKind): number {
  if (weather === "storm") return 1;
  if (weather === "rain") return 0.85;
  return 0.08; // faint residual damp, not neon puddle city
}

export function isWeatherKind(v: unknown): v is WeatherKind {
  return v === "clear" || v === "rain" || v === "storm";
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export interface LightingLook {
  phase: DayPhase;
  label: string;
  weather: WeatherKind;
  weatherLabel: string;
  /** App / void background */
  sky: number;
  /** Screen-space overlay tint */
  overlay: number;
  overlayAlpha: number;
  /** Outdoor ground brightness scale vs base combat-scene art (~0.75–1.15) */
  groundBright: number;
  /** 0–1+ neon intensity (windows / signs) */
  neon: number;
  /** Rain streak intensity scale (0 = dry) */
  rain: number;
  /** Ground wetness for puddles / sheen (0–1) */
  wet: number;
  /** Map clear / horizon fill under tiles */
  horizon: number;
  /** Soft unit/prop multiply tint (white = no change) */
  entityTint: number;
}

const PHASE_BASE: Record<
  DayPhase,
  Omit<LightingLook, "phase" | "label" | "weather" | "weatherLabel" | "rain" | "wet">
> = {
  dawn: {
    sky: 0x1a1428,
    overlay: 0xff8866,
    overlayAlpha: 0.11,
    groundBright: 0.96,
    neon: 0.5,
    horizon: 0x22182e,
    entityTint: 0xffe8d8,
  },
  day: {
    sky: 0x2a3048,
    overlay: 0xb8c8e8,
    overlayAlpha: 0.06,
    groundBright: 1.14,
    neon: 0.15,
    horizon: 0x343a52,
    entityTint: 0xffffff,
  },
  dusk: {
    sky: 0x18101c,
    overlay: 0xff5038,
    overlayAlpha: 0.13,
    groundBright: 0.9,
    neon: 0.75,
    horizon: 0x241018,
    entityTint: 0xffd0c0,
  },
  night: {
    sky: 0x0e0c18,
    overlay: 0x1828a0,
    overlayAlpha: 0.14,
    groundBright: 0.82,
    neon: 1,
    horizon: 0x100e1c,
    entityTint: 0xd0d8ff,
  },
};

/**
 * Resolve palette for current phase + district (or interior id) + weather.
 * Indoor rooms dim the outdoor cycle and keep club/bar warmth. Rain never indoors.
 */
export function lightingLook(
  phase: DayPhase,
  districtOrInteriorId: string,
  indoor: boolean,
  weather: WeatherKind = "clear",
): LightingLook {
  const base = PHASE_BASE[phase];
  const rain = indoor ? 0 : weatherRainScale(weather);
  const wet = indoor ? 0 : weatherWetScale(weather);

  let look: LightingLook = {
    phase,
    label: DAY_PHASE_LABEL[phase],
    weather,
    weatherLabel: WEATHER_LABEL[weather],
    ...base,
    rain,
    wet,
  };

  // Storm darkens sky slightly outdoors
  if (!indoor && weather === "storm") {
    look = {
      ...look,
      sky: lerpColor(look.sky, 0x0a0c14, 0.35),
      horizon: lerpColor(look.horizon, 0x0c1018, 0.3),
      overlay: lerpColor(look.overlay, 0x304060, 0.25),
      overlayAlpha: Math.min(0.28, look.overlayAlpha + 0.04),
      groundBright: look.groundBright * 0.92,
    };
  } else if (!indoor && weather === "rain") {
    look = {
      ...look,
      sky: lerpColor(look.sky, 0x10141c, 0.18),
      horizon: lerpColor(look.horizon, 0x12161e, 0.15),
      groundBright: look.groundBright * 0.96,
    };
  }

  if (indoor) {
    const id = districtOrInteriorId;
    const isClub = id === "club_neon" || /club|titty|twister|neon/i.test(id);
    const isBar = id === "bar_rusty" || /bar|nail/i.test(id);
    if (isClub) {
      return {
        ...look,
        sky: 0x1a0818,
        overlay: 0xff40aa,
        overlayAlpha: 0.1,
        groundBright: 1,
        neon: 1.25,
        rain: 0,
        wet: 0,
        horizon: 0x1a0818,
        entityTint: 0xffe0f0,
      };
    }
    if (isBar) {
      return {
        ...look,
        sky: 0x140c10,
        overlay: 0xffa060,
        overlayAlpha: 0.07,
        groundBright: 1,
        neon: 0.45,
        rain: 0,
        wet: 0,
        horizon: 0x1a1214,
        entityTint: 0xfff0e0,
      };
    }
    const isCold = id === "coldstore" || /cold|freezer|frost|ice.?box/i.test(id);
    if (isCold) {
      return {
        ...look,
        sky: 0x0c141c,
        overlay: 0x60c8ff,
        overlayAlpha: 0.08,
        groundBright: 0.95,
        neon: 0.55,
        rain: 0,
        wet: 0,
        horizon: 0x101820,
        entityTint: 0xd8f0ff,
      };
    }
    const isChapel = id === "church" || /church|chapel|choir|lady|hymn/i.test(id);
    if (isChapel) {
      return {
        ...look,
        sky: 0x141018,
        overlay: 0xc9a227,
        overlayAlpha: 0.07,
        groundBright: 0.92,
        neon: 0.4,
        rain: 0,
        wet: 0,
        horizon: 0x1a1410,
        entityTint: 0xffe8c8,
      };
    }
    const isGym = id === "gym" || /gym|temple|iron|sweat|coach|mat/i.test(id);
    if (isGym) {
      return {
        ...look,
        sky: 0x14120c,
        overlay: 0xffb040,
        overlayAlpha: 0.08,
        groundBright: 0.98,
        neon: 0.42,
        rain: 0,
        wet: 0,
        horizon: 0x1c160c,
        entityTint: 0xffe8c0,
      };
    }
    // Generic interior / mission instance — warm tungsten
    return {
      ...look,
      sky: 0x121018,
      overlay: 0xffc080,
      overlayAlpha: 0.05,
      groundBright: 1,
      neon: 0.35,
      rain: 0,
      wet: 0,
      horizon: 0x18141a,
      entityTint: 0xfff4e8,
    };
  }

  switch (districtOrInteriorId) {
    case "neon_edge":
      look = {
        ...look,
        overlay: lerpColor(look.overlay, 0xff40c8, 0.5),
        overlayAlpha: Math.min(0.28, look.overlayAlpha + 0.06),
        neon: Math.max(look.neon, 0.9),
        sky: lerpColor(look.sky, 0x18081c, 0.35),
        horizon: lerpColor(look.horizon, 0x1c0a1a, 0.3),
        entityTint: lerpColor(look.entityTint, 0xffd0f0, 0.25),
      };
      break;
    case "war_deep":
      look = {
        ...look,
        overlay: lerpColor(look.overlay, 0x801010, 0.45),
        overlayAlpha: Math.min(0.3, look.overlayAlpha + 0.06),
        groundBright: look.groundBright * 0.88,
        sky: lerpColor(look.sky, 0x120808, 0.45),
        horizon: lerpColor(look.horizon, 0x160a0c, 0.4),
        neon: look.neon * 0.85,
        entityTint: lerpColor(look.entityTint, 0xffc0b0, 0.3),
      };
      break;
    case "war_fringe":
      look = {
        ...look,
        overlay: lerpColor(look.overlay, 0x602018, 0.3),
        sky: lerpColor(look.sky, 0x140c10, 0.25),
        horizon: lerpColor(look.horizon, 0x181014, 0.2),
        entityTint: lerpColor(look.entityTint, 0xffd8c8, 0.15),
      };
      break;
    case "docks":
      look = {
        ...look,
        overlay: lerpColor(look.overlay, 0x186868, 0.45),
        overlayAlpha: Math.min(0.28, look.overlayAlpha + 0.05),
        sky: lerpColor(look.sky, 0x0c1418, 0.4),
        horizon: lerpColor(look.horizon, 0x0e181c, 0.35),
        // Docks slightly more likely to feel damp when already raining
        wet: Math.min(1, look.wet * 1.15 + (look.rain > 0 ? 0.05 : 0)),
        entityTint: lerpColor(look.entityTint, 0xc0e8e8, 0.25),
      };
      break;
    case "downtown":
      look = {
        ...look,
        overlay: lerpColor(look.overlay, 0xffc070, 0.18),
        groundBright: look.groundBright * 1.04,
        sky: lerpColor(look.sky, 0x1a1624, 0.1),
      };
      break;
    default:
      break;
  }

  return look;
}
