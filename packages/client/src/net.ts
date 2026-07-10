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
    const url = resolveWsUrl();
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

/** Local dev → :3001; production → VITE_WS_URL or sibling Azure host. */
function resolveWsUrl(): string {
  const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
  if (env.VITE_WS_URL) return env.VITE_WS_URL;

  const host = location.hostname;
  // Azure beta client → dedicated server web app
  if (host === "loose-cannon-beta.azurewebsites.net") {
    return "wss://loose-cannon-beta-server.azurewebsites.net";
  }
  // Generic azurewebsites client hostname pattern: foo → foo-server
  if (host.endsWith(".azurewebsites.net") && !host.includes("-server.")) {
    const base = host.replace(".azurewebsites.net", "");
    return `wss://${base}-server.azurewebsites.net`;
  }

  const proto = location.protocol === "https:" ? "wss" : "ws";
  // Local Vite (5173) or same-host
  if (host === "localhost" || host === "127.0.0.1") {
    return `${proto}://${host}:3001`;
  }
  return `${proto}://${host}`;
}
