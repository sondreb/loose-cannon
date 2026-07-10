import { createServer } from "node:http";
import { PROTOCOL_VERSION, TICK_MS, type ClientMessage } from "@loose-cannon/shared";
import { WebSocketServer } from "ws";
import { GameWorld } from "./game.js";
import { createConn } from "./net.js";

const PORT = Number(process.env.PORT ?? 3001);
const world = new GameWorld();

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tick: world.tick, players: world.sessions.size }));
    return;
  }
  if (req.url === "/dev/reset" && req.method === "POST") {
    // soft reset not full re-bind — document only
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, note: "Restart the process to fully reset world." }));
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
      const result = world.join(msg.name, conn);
      if (!result.ok) {
        conn.send({ type: "auth.fail", reason: result.reason });
        return;
      }
      conn.send({
        type: "auth.ok",
        characterId: result.characterId,
        posseId: result.posseId,
        token: result.token,
      });
      console.log(`[ws] ${msg.name} joined as ${result.characterId}`);
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

    world.handle(conn.characterId, msg);
  });

  ws.on("close", () => {
    if (conn.characterId) {
      console.log(`[ws] ${conn.characterId} disconnected`);
      world.leave(conn.characterId);
    }
  });
});

setInterval(() => {
  world.step(TICK_MS / 1000);
}, TICK_MS);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Loose Cannon server on http://0.0.0.0:${PORT} (ws://localhost:${PORT})`);
  console.log("In-memory world — restart to reset.");
});
