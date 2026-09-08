import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
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
import { FixedStepClock } from "./fixedStepClock.js";

const PORT = Number(process.env.PORT ?? 3001);

/** One GameWorld per realm id (docs/realms.md). */
const realms = new Map<string, GameWorld>();

function getOrCreateRealm(realmId: string): GameWorld {
  let world = realms.get(realmId);
  if (!world) {
    world = new GameWorld(realmId);
    realms.set(realmId, world);
    console.log(`[realm] created "${realmId}"`);
  }
  return world;
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
  // Character IDs are only unique within one GameWorld. Bind the authenticated
  // world to this socket rather than indexing a global map by character ID.
  let sessionWorld: GameWorld | undefined;
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
      if (sessionWorld || conn.characterId) {
        conn.send({ type: "auth.fail", reason: "Already authenticated" });
        return;
      }
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
      sessionWorld = world;
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

    if (!sessionWorld || sessionWorld.sessions.get(conn.characterId)?.conn !== conn) {
      conn.send({ type: "reject", reason: "Unknown session realm" });
      return;
    }
    sessionWorld.handle(conn.characterId, msg);
  });

  ws.on("close", () => {
    if (conn.characterId) {
      console.log(`[ws] ${conn.characterId} disconnected`);
      const world = sessionWorld;
      if (world?.sessions.get(conn.characterId)?.conn === conn) {
        world.leave(conn.characterId);
        pruneRealmIfEmpty(world.realmId);
      }
      sessionWorld = undefined;
    }
  });
});

const simulationClock = new FixedStepClock(TICK_MS, performance.now());
setInterval(() => {
  simulationClock.advance(performance.now(), (dt) => {
    for (const world of realms.values()) {
      // Empty worlds remain paused; each populated realm advances the same fixed dt.
      if (world.sessions.size > 0) world.step(dt);
    }
  });
  // Timers can round up on Windows. Polling more often reduces input latency;
  // the accumulator alone decides when a 1/30s simulation step is due.
}, TICK_MS / 2);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Loose Cannon server on http://0.0.0.0:${PORT} (ws://localhost:${PORT})`);
  console.log("In-memory multi-realm — restart to reset. Default realm: public");
});
