import type { ServerMessage } from "@loose-cannon/shared";
import type WebSocket from "ws";

export interface ClientConn {
  ws: WebSocket;
  characterId: string | null;
  send(msg: ServerMessage): void;
}

export function createConn(ws: WebSocket): ClientConn {
  return {
    ws,
    characterId: null,
    send(msg) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
  };
}
