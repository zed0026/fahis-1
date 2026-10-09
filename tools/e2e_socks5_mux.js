/**
 * Smoke test: SOCKS5 handshake + mux OPEN/OK/DATA without a real implant.
 * Frames written to the "agent" side are answered via SocksManager.onAgentMessage.
 */
const net = require('net');
const { SocksManager } = require('../socks5');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function duplexPair() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      const a = net.connect(port, '127.0.0.1');
      srv.once('connection', (b) => {
        srv.close();
        resolve({ a, b });
      });
      a.on('error', reject);
    });
    srv.on('error', reject);
  });
}

function onceConnect(sock) {
  return new Promise((resolve, reject) => {
    sock.once('connect', resolve);
    sock.once('error', reject);
  });
}

function readExact(sock, n) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let got = 0;
    const onData = (c) => {
      chunks.push(c);
      got += c.length;
      if (got >= n) {
        sock.removeListener('data', onData);
        sock.removeListener('error', onErr);
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).subarray(0, n));
      }
    };
    const onErr = (e) => reject(e);
    sock.on('data', onData);
    sock.on('error', onErr);
    const timer = setTimeout(() => reject(new Error('read timeout')), 5000);
  });
}

async function main() {
  const mgr = new SocksManager();
  const pair = await duplexPair();
  const clientId = 'e2e-socks-test';

  let abuf = '';
  pair.b.on('data', (chunk) => {
    abuf += chunk.toString('utf8');
    let idx;
    while ((idx = abuf.indexOf('\n')) >= 0) {
      const line = abuf.slice(0, idx);
      abuf = abuf.slice(idx + 1);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const typ = String(msg.type || '').toLowerCase();
      if (typ === 'socks_open') {
        mgr.onAgentMessage(clientId, { type: 'socks_ok', id: msg.id });
      } else if (typ === 'socks_data') {
        mgr.onAgentMessage(clientId, {
          type: 'socks_data',
          id: msg.id,
          data: msg.data,
        });
      }
    }
  });

  const info = await mgr.start(clientId, pair.a, { host: '127.0.0.1', port: 0 });
  assert(info.port > 0, 'listen port');

  const socks = net.connect(info.port, '127.0.0.1');
  await onceConnect(socks);

  socks.write(Buffer.from([0x05, 0x01, 0x00]));
  const greet = await readExact(socks, 2);
  assert(greet[0] === 0x05 && greet[1] === 0x00, 'auth reply');

  const req = Buffer.alloc(10);
  req[0] = 0x05;
  req[1] = 0x01;
  req[2] = 0x00;
  req[3] = 0x01;
  req[4] = 127;
  req[5] = 0;
  req[6] = 0;
  req[7] = 1;
  req.writeUInt16BE(9, 8);
  socks.write(req);

  const reply = await readExact(socks, 10);
  assert(reply[0] === 0x05 && reply[1] === 0x00, 'connect success');

  const payload = Buffer.from('hello-socks-pivot');
  socks.write(payload);
  const echoed = await readExact(socks, payload.length);
  assert(echoed.toString() === payload.toString(), 'data echo');

  socks.destroy();
  mgr.stop(clientId);
  pair.a.destroy();
  pair.b.destroy();

  console.log('SOCKS5_MUX_OK', `${info.host}:${info.port}`);
}

main().catch((e) => {
  console.error('SOCKS5_MUX_FAIL', e);
  process.exit(1);
});
