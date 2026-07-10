/** Realm id rules for segregated in-memory worlds (see docs/realms.md). */

/** Canonical default when login realm is empty / whitespace. */
export const DEFAULT_REALM_ID = "public";

export const REALM_ID_MIN = 1;
export const REALM_ID_MAX = 32;

/** Allowed after normalize: lowercase a-z, digits, hyphen, underscore. */
const REALM_ID_RE = /^[a-z0-9_-]+$/;

export type NormalizeRealmResult =
  | { ok: true; realmId: string }
  | { ok: false; reason: string };

/**
 * Normalize a client-supplied realm string.
 * Empty / whitespace → `public`.
 */
export function normalizeRealmId(raw: string | null | undefined): NormalizeRealmResult {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, realmId: DEFAULT_REALM_ID };
  }
  const id = String(raw).trim().toLowerCase();
  if (id.length < REALM_ID_MIN || id.length > REALM_ID_MAX) {
    return {
      ok: false,
      reason: `Realm code: ${REALM_ID_MIN}–${REALM_ID_MAX} characters (letters, numbers, - or _)`,
    };
  }
  if (!REALM_ID_RE.test(id)) {
    return {
      ok: false,
      reason: "Realm code: use letters, numbers, - or _ only",
    };
  }
  return { ok: true, realmId: id };
}

/** Short HUD / login label */
export function realmLabel(realmId: string): string {
  return realmId === DEFAULT_REALM_ID ? "public" : realmId;
}
