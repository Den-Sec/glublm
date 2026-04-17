// companion/server/ws-server.js
import { WebSocketServer } from 'ws';
import { pack, unpack } from '../shared/protocol.js';

// Accept only connections from local PWA frontends (no origin = native client OK).
function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

const HEARTBEAT_INTERVAL_MS = 30_000;

export class WsServer {
  constructor(httpServer) {
    this._wss = new WebSocketServer({
      server: httpServer,
      verifyClient: (info) => isLocalOrigin(info.req.headers.origin),
    });
    this._clients = new Set();
    this._handler = null;

    this._wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      this._clients.add(ws);
      ws.on('message', (raw) => {
        const msg = unpack(raw.toString());
        if (msg && this._handler) this._handler(msg, ws);
      });
      ws.on('close', () => this._clients.delete(ws));
      ws.on('error', () => this._clients.delete(ws));

      // Notify handler of new connection
      if (this._handler) this._handler({ type: '_connect' }, ws);
    });

    // Heartbeat: terminate clients that didn't answer the previous ping.
    this._heartbeat = setInterval(() => {
      for (const ws of this._clients) {
        if (ws.isAlive === false) {
          try { ws.terminate(); } catch { /* already dead */ }
          this._clients.delete(ws);
          continue;
        }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* ignore; will be reaped next tick */ }
      }
    }, HEARTBEAT_INTERVAL_MS);

    this._wss.on('close', () => clearInterval(this._heartbeat));
  }

  onMessage(fn) {
    this._handler = fn;
  }

  broadcast(type, data = {}) {
    const msg = pack(type, data);
    for (const ws of this._clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  send(ws, type, data = {}) {
    if (ws.readyState === 1) ws.send(pack(type, data));
  }

  get clientCount() {
    return this._clients.size;
  }
}
