import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  type WorldSnapshot,
} from "@loose-cannon/shared";

export type NetHandlers = {
  onAuthOk: (characterId: string, posseId: string) => void;
  onAuthFail: (reason: string) => void;
  onSnapshot: (snap: WorldSnapshot) => void;
  onEvent: (text: string) => void;
  onChat: (from: string, text: string, system?: boolean) => void;
  onNotify: (msg: Extract<ServerMessage, { type: "notify" }>) => void;
  onClose: () => void;
};

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers: NetHandlers;

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
  }

  connect(name: string): void {
    const url =
      (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_WS_URL ||
      `ws://${location.hostname}:3001`;
    this.ws = new WebSocket(url);
    this.ws.addEventListener("open", () => {
      this.send({ type: "auth", name, protocolVersion: PROTOCOL_VERSION });
    });
    this.ws.addEventListener("message", (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "auth.ok":
          this.handlers.onAuthOk(msg.characterId, msg.posseId);
          break;
        case "auth.fail":
          this.handlers.onAuthFail(msg.reason);
          break;
        case "snapshot":
          this.handlers.onSnapshot(msg.data);
          break;
        case "event":
          this.handlers.onEvent(msg.text);
          break;
        case "chat":
          this.handlers.onChat(msg.line.from, msg.line.text, msg.line.system);
          break;
        case "notify":
          this.handlers.onNotify(msg);
          break;
        case "reject":
          this.handlers.onEvent(`Rejected: ${msg.reason}`);
          break;
        default:
          break;
      }
    });
    this.ws.addEventListener("close", () => this.handlers.onClose());
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
