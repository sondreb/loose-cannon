import { createServer } from "node:http";
import {
  DEFAULT_REALM_ID,
  normalizeRealmId,
  PROTOCOL_VERSION,
  TICK_MS,
  type ClientMessage,
} from "@loose-cannon/shared";
import { WebSocketServer } from "ws";
import { GameWorld } from "./game.js";
import { createConn } from "./net.js";

const PORT = Number(process.env.PORT ?? 3001);

/** One GameWorld per realm id (docs/realms.md). */
const realms = new Map<string, GameWorld>();
/** characterId → realmId for routing after auth */
const charRealm = new Map<string, string>();

function getOrCreateRealm(realmId: string): GameWorld {
  let world = realms.get(realmId);
  if (!world) {
    world = new GameWorld(realmId);
    realms.set(realmId, world);
    console.log(`[realm] created "${realmId}"`);
  }
  return world;
}

function worldForChar(characterId: string): GameWorld | undefined {
  const rid = charRealm.get(characterId);
  return rid ? realms.get(rid) : undefined;
}

/** Drop empty named realms to free memory; always keep `public` seeded. */
function pruneRealmIfEmpty(realmId: string): void {
  if (realmId === DEFAULT_REALM_ID) return;
  const world = realms.get(realmId);
  if (!world || world.sessions.size > 0) return;
  realms.delete(realmId);
  console.log(`[realm] destroyed empty "${realmId}"`);
}

function healthPayload(): object {
  const byRealm: Record<string, number> = {};
  let players = 0;
  for (const [id, w] of realms) {
    const n = w.sessions.size;
    byRealm[id] = n;
    players += n;
  }
  // Ensure public appears even if never joined this process
  if (!(DEFAULT_REALM_ID in byRealm) && realms.size === 0) {
    byRealm[DEFAULT_REALM_ID] = 0;
  }
  return {
    ok: true,
    realms: Math.max(realms.size, 0),
    players,
    byRealm,
  };
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(healthPayload()));
    return;
  }
  if (req.url === "/dev/reset" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, note: "Restart the process to fully reset all realms." }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Loose Cannon game server. Connect via WebSocket.\n");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const conn = createConn(ws);
  console.log("[ws] connection open");

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      conn.send({ type: "reject", reason: "Invalid JSON" });
      return;
    }

    if (msg.type === "auth") {
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        conn.send({
          type: "auth.fail",
          reason: `Protocol mismatch (client ${msg.protocolVersion}, server ${PROTOCOL_VERSION})`,
        });
        return;
      }
      const norm = normalizeRealmId(msg.realm);
      if (!norm.ok) {
        conn.send({ type: "auth.fail", reason: norm.reason });
        return;
      }
      const world = getOrCreateRealm(norm.realmId);
      const result = world.join(msg.name, conn);
      if (!result.ok) {
        conn.send({ type: "auth.fail", reason: result.reason });
        return;
      }
      charRealm.set(result.characterId, result.realmId);
      conn.send({
        type: "auth.ok",
        characterId: result.characterId,
        posseId: result.posseId,
        token: result.token,
        realmId: result.realmId,
      });
      console.log(
        `[ws] ${msg.name} joined as ${result.characterId} realm=${result.realmId}`,
      );
      return;
    }

    if (msg.type === "ping") {
      conn.send({ type: "pong", t: msg.t });
      return;
    }

    if (!conn.characterId) {
      conn.send({ type: "reject", reason: "Not authenticated" });
      return;
    }

    const world = worldForChar(conn.characterId);
    if (!world) {
      conn.send({ type: "reject", reason: "Unknown session realm" });
      return;
    }
    world.handle(conn.characterId, msg);
  });

  ws.on("close", () => {
    if (conn.characterId) {
      console.log(`[ws] ${conn.characterId} disconnected`);
      const rid = charRealm.get(conn.characterId);
      const world = worldForChar(conn.characterId);
      if (world) world.leave(conn.characterId);
      charRealm.delete(conn.characterId);
      if (rid) pruneRealmIfEmpty(rid);
    }
  });
});

setInterval(() => {
  for (const world of realms.values()) {
    if (world.sessions.size === 0 && world.realmId !== DEFAULT_REALM_ID) {
      // Named empty realms are pruned on leave; skip tick if somehow empty
      continue;
    }
    // Always tick if anyone is connected; also tick public when present
    if (world.sessions.size > 0) {
      world.step(TICK_MS / 1000);
    }
  }
}, TICK_MS);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Loose Cannon server on http://0.0.0.0:${PORT} (ws://localhost:${PORT})`);
  console.log("In-memory multi-realm — restart to reset. Default realm: public");
});
